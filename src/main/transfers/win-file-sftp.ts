// src/main/transfers/win-file-sftp.ts
import fs from 'fs';
import path from 'path';
import SftpClient from 'ssh2-sftp-client';
import { jl } from '../main';

/**
 * Quick probe to check if the SSH user can write to the destination directory.
 * Attempts to create and remove a temp directory via SFTP.
 * Returns true if writable, false if permission denied.
 */
export async function probeSftpWriteAccess(opts: {
  host: string;
  user: string;
  destDir: string;
  port?: number;
  keyPath?: string;
  id: string;
}): Promise<boolean> {
  const sftp = new SftpClient();
  const privateKey = opts.keyPath ? fs.readFileSync(opts.keyPath) : undefined;
  const probeDir = `${opts.destDir.replace(/\/+$/, '')}/.45flow-probe-${Date.now()}`;

  try {
    await sftp.connect({
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.user,
      privateKey,
      readyTimeout: 15000,
      retries: 0,
    });

    // Try to create a probe directory
    await sftp.mkdir(probeDir);
    // Clean up immediately
    await sftp.rmdir(probeDir);
    jl('info', 'sftp.probe.writable', { id: opts.id, destDir: opts.destDir });
    return true;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Permission denied') || msg.includes('EACCES') || msg.includes('permission denied')) {
      jl('info', 'sftp.probe.denied', { id: opts.id, destDir: opts.destDir, error: msg });
      return false;
    }
    // If the directory doesn't exist, try to create it
    if (msg.includes('No such file')) {
      jl('info', 'sftp.probe.nodir', { id: opts.id, destDir: opts.destDir });
      // Can't write if directory doesn't exist and we can't create it — staging will handle it
      return false;
    }
    // Other errors (network, auth) — don't treat as permission issue, re-throw
    jl('warn', 'sftp.probe.error', { id: opts.id, destDir: opts.destDir, error: msg });
    throw err;
  } finally {
    try { await sftp.end(); } catch { /* ok */ }
  }
}

// Match the rsync progress object shape your UI expects
export type TransferProgress = {
  percent?: number;
  rate?: string;              // "69.59MB/s"
  eta?: string;               // "0:00:14"
  bytesTransferred?: number;
  raw?: string;
};

export type WinSftpOpts = {
  id: string;
  src: string;
  host: string;
  user: string;
  destDir: string;
  port?: number;
  keyPath?: string;
  // Same logical shape as rsync's RunOpts.onProgress
  onProgress?: (p: TransferProgress) => void;
};

export async function runWinSftp(o: WinSftpOpts): Promise<number> {
  jl('info', 'sftp.start', {
    id: o.id,
    src: o.src,
    destDir: o.destDir,
    host: o.host,
    user: o.user,
    port: o.port ?? 22,
    keyPath: o.keyPath,
    keyExists: o.keyPath ? fs.existsSync(o.keyPath) : false,
  });

  const st = fs.statSync(o.src);
  const isDir = st.isDirectory();

  const destDir = o.destDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const privateKey = o.keyPath ? fs.readFileSync(o.keyPath) : undefined;
  
  // Log key details for debugging
  if (o.keyPath && privateKey) {
    jl('info', 'sftp.key-loaded', {
      id: o.id,
      keyPath: o.keyPath,
      keySize: privateKey.length,
    });
  } else if (!o.keyPath) {
    jl('warn', 'sftp.no-keypath', {
      id: o.id,
      host: o.host,
      user: o.user,
      message: 'No keyPath provided - SFTP will fail without authentication',
    });
  }

  const sftp = new SftpClient();

  try {
    jl('info', 'sftp.connecting', { id: o.id, host: o.host, port: o.port ?? 22, hasKey: !!privateKey });

    // Wrap connect in a race with a 30-second timeout so it doesn't hang forever
    const connectPromise = sftp.connect({
      host: o.host,
      port: o.port ?? 22,
      username: o.user,
      privateKey,
      readyTimeout: 30000,
      retries: 1,
      retry_minTimeout: 2000,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(
        `SFTP connection timed out after 30s (host=${o.host}, port=${o.port ?? 22}). ` +
        `Check: 1) SSH port is reachable, 2) SSH key is deployed to server, 3) firewall allows port ${o.port ?? 22}.`
      )), 30000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    jl('info', 'sftp.connected', { id: o.id });

    if (isDir) {
      jl('info', 'sftp.dir.upload.start', { id: o.id, src: o.src });
      await uploadDirSftp(sftp, o.src, destDir, o.onProgress, o.id);
    } else {
      jl('info', 'sftp.file.upload.start', { id: o.id, src: o.src });
      await uploadSingleFileSftp(sftp, o.src, destDir, o.onProgress, o.id);
    }

    jl('info', 'sftp.complete', { id: o.id });
    return 0;
  } catch (err: any) {
    const msg = err?.message || String(err);
    let detailedError = `SFTP upload failed for ${o.user}@${o.host}:${o.port ?? 22}.`;
    
    if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('timed out')) {
      detailedError += ` Connection timed out - server may be unreachable or SSH port blocked by firewall.`;
    } else if (msg.includes('ECONNREFUSED')) {
      detailedError += ` Connection refused - SSH server not running on port ${o.port ?? 22}.`;
    } else if (msg.includes('EHOSTUNREACH') || msg.includes('ENETUNREACH')) {
      detailedError += ` Network unreachable - check server IP and network settings.`;
    } else if (msg.includes('All configured authentication methods failed')) {
      detailedError += ` Authentication failed - SSH key not deployed on server. Reconnect from the Connections page to set up authentication.`;
    } else if (msg.includes('No such file')) {
      detailedError += ` Destination directory does not exist or is not accessible.`;
    } else if (msg.includes('Permission denied')) {
      detailedError += ` Permission denied - check file/directory permissions on server.`;
    } else {
      detailedError += ` Error: ${msg}`;
    }
    
    jl('error', 'sftp.error', { 
      id: o.id, 
      host: o.host, 
      user: o.user, 
      port: o.port ?? 22,
      hasKey: !!privateKey,
      error: detailedError,
      originalError: msg
    });
    
    const enhancedError = new Error(detailedError);
    (enhancedError as any).originalError = err;
    throw enhancedError;
  } finally {
    try {
      await sftp.end();
      jl('info', 'sftp.closed', { id: o.id });
    } catch {
      jl('warn', 'sftp.close.error', { id: o.id });
    }
  }
}

// Build a rsync-style progress object from bytes + time
function makeSftpProgressEmitter(
  id: string,
  totalBytes: number,
  onProgress?: (p: TransferProgress) => void
) {
  const startTime = Date.now();
  let lastPercent = -1;

  return (bytesTransferred: number) => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000 || 0.001; // seconds

    let rate: string | undefined;
    let eta: string | undefined;

    if (elapsed > 0 && bytesTransferred >= 0) {
      const bps = bytesTransferred / elapsed;
      const kbps = bps / 1024;
      const mbps = kbps / 1024;

      if (mbps >= 1) {
        rate = `${mbps.toFixed(2)}MB/s`;
      } else if (kbps >= 1) {
        rate = `${kbps.toFixed(1)}kB/s`;
      } else {
        rate = `${bps.toFixed(0)}B/s`;
      }

      if (totalBytes > 0 && bytesTransferred > 0 && bytesTransferred <= totalBytes && bps > 0) {
        const remaining = totalBytes - bytesTransferred;
        const sec = remaining / bps;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        eta = `${h}:${m.toString().padStart(2, '0')}:${s
          .toString()
          .padStart(2, '0')}`;
      }
    }

    const percent =
      totalBytes > 0
        ? clampPct((bytesTransferred / totalBytes) * 100)
        : undefined;

    const progress: TransferProgress = {
      percent,
      rate,
      eta,
      bytesTransferred,
      raw: `sftp ${bytesTransferred}/${totalBytes}`,
    };

    if (percent != null && percent !== lastPercent) {
      lastPercent = percent;
      jl('debug', 'sftp.progress', { id, ...progress });
    }

    onProgress?.(progress);
  };
}

async function uploadSingleFileSftp(
  sftp: SftpClient,
  localPath: string,
  destDir: string,
  onProgress: ((p: TransferProgress) => void) | undefined,
  id: string
) {
  const st = fs.statSync(localPath);
  if (!st.isFile()) {
    jl('error', 'sftp.single.invalid', { id, localPath });
    throw new Error(`uploadSingleFileSftp expected a file, got: ${localPath}`);
  }

  const totalBytes = st.size;
  const remotePath = `${destDir}/${path.basename(localPath)}`;

  jl('info', 'sftp.single.ensureDir', { id, destDir });
  await ensureRemoteDir(sftp, destDir, id);

  jl('info', 'sftp.single.put.start', { id, localPath, remotePath, totalBytes });

  const emit = makeSftpProgressEmitter(id, totalBytes, onProgress);

  await sftp.fastPut(localPath, remotePath, {
    step(transferred: number, _chunk: number, total: number) {
      // 'total' from ssh2-sftp-client should be equal to totalBytes, but we trust our own
      emit(transferred);
    },
  });

  jl('info', 'sftp.single.put.done', { id, localPath });

  emit(totalBytes);
}

// ── Directory upload with global progress ─────────────────────────────

type FileInfo = { local: string; remote: string; size: number };

function walkLocalDir(root: string, remoteRoot: string): FileInfo[] {
  const out: FileInfo[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const localPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(localPath);
      } else if (e.isFile()) {
        const st = fs.statSync(localPath);
        const rel = path
          .relative(root, localPath)
          .split(path.sep)
          .join('/');
        const remotePath = `${remoteRoot}/${rel}`;
        out.push({ local: localPath, remote: remotePath, size: st.size });
      }
    }
  }

  walk(root);
  return out;
}

async function uploadDirSftp(
  sftp: SftpClient,
  localRoot: string,
  remoteRoot: string,
  onProgress: ((p: TransferProgress) => void) | undefined,
  id: string
) {
  const files = walkLocalDir(localRoot, remoteRoot);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let globalTransferred = 0;

  jl('info', 'sftp.dir.ensureRoot', { id, remoteRoot });
  await ensureRemoteDir(sftp, remoteRoot, id);

  jl('info', 'sftp.dir.upload.count', { id, files: files.length, totalBytes });

  const emit = makeSftpProgressEmitter(id, totalBytes, onProgress);

  for (const file of files) {
    const remoteDir = path.posix.dirname(file.remote);
    jl('debug', 'sftp.dir.ensureSubdir', { id, remoteDir });
    await ensureRemoteDir(sftp, remoteDir, id);

    jl('info', 'sftp.dir.file.start', {
      id,
      local: file.local,
      remote: file.remote,
      size: file.size,
    });

    let lastFileTransferred = 0;

    await sftp.fastPut(file.local, file.remote, {
      step(transferred: number, _chunk: number, _total: number) {
        const delta = transferred - lastFileTransferred;
        lastFileTransferred = transferred;

        globalTransferred += delta;
        emit(globalTransferred);
      },
    });

    jl('info', 'sftp.dir.file.done', { id, remote: file.remote });
  }

  jl('info', 'sftp.dir.complete', { id });
  emit(totalBytes);
}

function clampPct(p: number) {
  return Math.max(0, Math.min(100, Math.round(p)));
}

async function ensureRemoteDir(sftp: SftpClient, dir: string, id: string) {
  if (!dir || dir === '.' || dir === '/') return;

  const parts = dir.split('/').filter(Boolean);
  let current = '';

  for (const part of parts) {
    current += '/' + part;
    try {
      const st = await sftp.stat(current);
      if (!st.isDirectory) {
        jl('error', 'sftp.ensureDir.notDir', { id, path: current });
        throw new Error(`Remote path ${current} exists and is not a directory`);
      }
    } catch {
      try {
        jl('debug', 'sftp.ensureDir.mkdir', { id, path: current });
        await sftp.mkdir(current);
      } catch {
        jl('warn', 'sftp.ensureDir.mkdir.race', { id, path: current });
      }
    }
  }
}
