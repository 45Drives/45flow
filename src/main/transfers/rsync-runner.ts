// src/main/rsync/rsync-runner.ts
import fs from 'fs';
import { spawn, ChildProcessWithoutNullStreams, ChildProcess } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { jl } from '../main';

export type RunOpts = {
  id: string;
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  win?: BrowserWindow; // to send IPC events
  onLine?: (line: string) => void;
  onProgress?: (parsed: any) => void;
};

export type RunHandle = {
  child: ChildProcessWithoutNullStreams;
  done: Promise<number>;
};

// ── Detached rsync (survives app exit) ──────────────────────────────────────

export type DetachedRunOpts = {
  id: string;
  cmd: string;
  args: string[];
  logFile: string;         // path to write combined stdout+stderr
  env?: NodeJS.ProcessEnv;
  win?: BrowserWindow;
};

export type DetachedRunHandle = {
  pid: number;
  tailer: LogTailer;
};

export type LogTailer = {
  /** Stop tailing (idempotent) */
  stop: () => void;
  /**
   * Promise that resolves when the process exits.
   * Resolves to { ok: true } if rsync succeeded, { ok: false, error?: string } otherwise.
   */
  done: Promise<{ ok: boolean; error?: string }>;
};

// Parse rsync progress lines like:
// "73.01M   6%   69.59MB/s    0:00:14"
export function parseProgress(line: string) {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const rateMatch = line.match(/([0-9.]+)\s*([KMG]i?)B\/s/i);
  const etaMatch = line.match(/\b(\d+:\d{2}:\d{2})\b/);
  const bytesMatch = line.trim().match(/^(\d[\d,]*)\s+/);

  return {
    percent: percentMatch ? Number(percentMatch[1]) : undefined,
    // Format as "69.59 MB/s", "70.0 kB/s", etc
    rate: rateMatch ? `${rateMatch[1]} ${rateMatch[2]}B/s` : undefined,
    eta: etaMatch ? etaMatch[1] : undefined,
    bytesTransferred: bytesMatch ? Number(bytesMatch[1].replace(/,/g, '')) : undefined,
    raw: line,
  };
}

export function runRsync(opts: RunOpts): RunHandle {
  const { id, cmd, args, env, win, onLine, onProgress } = opts;

  jl('info', 'rsync.exec', { id, cmd, args });

  const child: ChildProcessWithoutNullStreams = spawn(cmd, args, {
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', COLUMNS: '200', ...env },
    windowsHide: true,
  });

  let bufErr = '';

  const emit = (parsed: any) => {
    onProgress?.(parsed);
    win?.webContents?.send(`upload:progress:${id}`, parsed);
  };

  child.stderr.on('data', (chunk) => {
    bufErr += chunk.toString().replace(/\r/g, '\n');
    const lines = bufErr.split('\n');
    bufErr = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      onLine?.(t);
      jl('info', 'rsync.out', { id, line: t });
      emit(parseProgress(t));
    }
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString().replace(/\r/g, '\n');
    const lines = text.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      onLine?.(t);
      jl('info', 'rsync.out.stdout', { id, line: t });
      emit(parseProgress(t));
    }
  });

  const done = new Promise<number>((resolve, reject) => {
    child.on('error', (err) => {
      jl('error', 'rsync.spawn.error', { id, error: err?.message || String(err) });
      reject(err);
    });
    child.on('close', (code) => {
      jl('info', 'rsync.exit', { id, code });
      resolve(code ?? -1);
    });
  });

  return { child, done };
}

// ── Detached rsync (survives app closure) ───────────────────────────────────

/**
 * Spawn rsync fully detached – it keeps running even if the Electron app
 * quits.  Progress is written to `logFile` and polled from there.
 */
export function runRsyncDetached(opts: DetachedRunOpts): DetachedRunHandle {
  const { id, cmd, args, logFile, env, win } = opts;

  jl('info', 'rsync.exec.detached', { id, cmd, args, logFile });

  // Open a file descriptor for the log so the child writes directly to disk
  const logFd = fs.openSync(logFile, 'a');

  const child: ChildProcess = spawn(cmd, args, {
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', COLUMNS: '200', ...env },
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });

  const pid = child.pid!;
  jl('info', 'rsync.detached.spawned', { id, pid });

  // Allow the parent process to exit while the child keeps running.
  child.unref();
  // Parent no longer needs the fd – the child has its own copy.
  fs.closeSync(logFd);

  const tailer = tailLogFile({ id, logFile, pid, win });

  return { pid, tailer };
}

// ── Log-file tailer ─────────────────────────────────────────────────────────

type TailOpts = {
  id: string;
  logFile: string;
  pid: number;
  win?: BrowserWindow;
  /** How often to read new bytes + check PID (ms). Default 500. */
  intervalMs?: number;
};

/**
 * Periodically reads new bytes appended to `logFile`, parses rsync progress
 * lines, emits IPC events, and checks PID liveness.  Returns when the
 * process has exited (PID gone) **and** all bytes have been read.
 */
export function tailLogFile(opts: TailOpts): LogTailer {
  const { id, logFile, pid, win, intervalMs = 500 } = opts;

  let stopped = false;
  let offset = 0;
  let partial = '';         // leftover bytes that don't end with \n
  let timer: ReturnType<typeof setInterval> | null = null;
  let _resolve: ((result: { ok: boolean; error?: string }) => void) | null = null;

  const done = new Promise<{ ok: boolean; error?: string }>((resolve) => { _resolve = resolve; });

  const emit = (parsed: any) => {
    try { win?.webContents?.send(`upload:progress:${id}`, parsed); } catch { /* window may be gone */ }
  };

  function tick() {
    if (stopped) return;

    // 1. Read new bytes from log
    let chunk = '';
    try {
      const fd = fs.openSync(logFile, 'r');
      const stat = fs.fstatSync(fd);
      const bytesToRead = stat.size - offset;
      if (bytesToRead > 0) {
        const buf = Buffer.alloc(bytesToRead);
        fs.readSync(fd, buf, 0, bytesToRead, offset);
        offset += bytesToRead;
        chunk = buf.toString('utf-8');
      }
      fs.closeSync(fd);
    } catch {
      // file not ready yet or disappeared
    }

    // 2. Parse lines
    if (chunk) {
      partial += chunk.replace(/\r/g, '\n');
      const lines = partial.split('\n');
      partial = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        jl('info', 'rsync.tail', { id, line: t });
        emit(parseProgress(t));
      }
    }

    // 3. Check PID
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { /* gone */ }

    if (!alive) {
      // Process is gone – do one final read
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }

      // Read any remaining bytes
      try {
        const fd = fs.openSync(logFile, 'r');
        const stat = fs.fstatSync(fd);
        const bytesToRead = stat.size - offset;
        if (bytesToRead > 0) {
          const buf = Buffer.alloc(bytesToRead);
          fs.readSync(fd, buf, 0, bytesToRead, offset);
          const rest = (partial + buf.toString('utf-8')).replace(/\r/g, '\n');
          for (const line of rest.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            jl('info', 'rsync.tail.final', { id, line: t });
            emit(parseProgress(t));
          }
        }
        fs.closeSync(fd);
      } catch { /* ok */ }

      // Heuristic: check the last progress line for 100% to decide success
      let ok = lastProgressWas100(logFile);
      
      // Even if progress reached 100%, check for receiver-side write errors
      // (rsync sender reports 100% but remote can't write to destination)
      let errorMsg: string | null = null;
      if (ok) {
        errorMsg = extractRsyncError(logFile);
        if (errorMsg) {
          ok = false;
          jl('warn', 'rsync.detached.progress-ok-but-error', { id, pid, error: errorMsg });
        }
      }

      if (!ok) {
        // Extract error message from log file for better diagnostics
        if (!errorMsg) errorMsg = extractRsyncError(logFile);
        jl('info', 'rsync.detached.exit', { id, pid, ok, error: errorMsg });
        _resolve?.({ ok: false, error: errorMsg || 'Transfer did not complete' });
      } else {
        jl('info', 'rsync.detached.exit', { id, pid, ok });
        _resolve?.({ ok: true });
      }
    }
  }

  timer = setInterval(tick, intervalMs);
  // Run first tick immediately
  tick();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
    },
    done,
  };
}

/**
 * Re-attach a tailer to a still-running detached rsync.
 * Useful after the app restarts while a transfer was in progress.
 */
export function reattachTailer(opts: TailOpts): LogTailer {
  return tailLogFile(opts);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read the last chunk of a log file and check if rsync completed successfully */
function lastProgressWas100(logFile: string): boolean {
  try {
    const tail = fs.readFileSync(logFile, 'utf-8').slice(-4096);

    // When the file is already up-to-date on the remote, rsync outputs
    //   0   0%  0.00kB/s  0:00:00 (xfr#0, to-chk=0/N)
    // and exits 0 (success).  Detect this: xfr#0 + to-chk=0/ means
    // "nothing to transfer, all files checked" → success.
    if (/\(xfr#0,\s*to-chk=0\/\d+\)/.test(tail)) return true;

    // Look for the *last* percentage in the log
    const matches = [...tail.matchAll(/(\d+(?:\.\d+)?)%/g)];
    if (!matches.length) return false;
    const lastPct = Number(matches[matches.length - 1][1]);
    return lastPct >= 100;
  } catch {
    return false;
  }
}

/** Extract error message from rsync log file for better user feedback */
function extractRsyncError(logFile: string): string | null {
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Look for common rsync error patterns
    for (const line of lines) {
      // SSH connection errors
      if (/ssh:.*Connection.*timed out/i.test(line)) {
        return 'Connection timed out - server may be unreachable';
      }
      if (/ssh:.*Connection refused/i.test(line)) {
        return 'Connection refused - check if SSH server is running';
      }
      if (/ssh:.*No route to host/i.test(line)) {
        return 'No route to host - check network connectivity';
      }
      if (/Host key verification failed/i.test(line)) {
        return 'Host key verification failed - server identity changed';
      }
      if (/Permission denied.*publickey/i.test(line) || /ssh.*Permission denied/i.test(line)) {
        return 'SSH authentication failed - check SSH key and credentials';
      }
      if (/Permission denied/i.test(line)) {
        return `Remote permission denied - cannot write to destination directory. (${line.trim().substring(0, 120)})`;
      }
      // Receiver-side write failure (ZFS/permission issues often report this instead of "Permission denied")
      if (/open ".*" failed: No such file or directory/i.test(line) || /failed: No such file or directory \(\d+\)/i.test(line)) {
        return `Remote write failed - SSH user cannot write to destination directory. (${line.trim().substring(0, 120)})`;
      }
      // Generic rsync errors
      if (/rsync error:/i.test(line)) {
        return line.trim().substring(0, 200); // Limit length
      }
    }
    
    // If we find any error-like content, return the last few lines
    const errorLines = lines.filter(l => 
      /error|failed|timeout|refused|denied/i.test(l)
    );
    if (errorLines.length > 0) {
      return errorLines[errorLines.length - 1].substring(0, 200);
    }
    
    return null;
  } catch {
    return null;
  }
}
