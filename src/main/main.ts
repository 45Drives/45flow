function initLogging(resolvedLogDir: string) {
  const getEventName = (info: any): string => {
    if (typeof info?.event === 'string') return info.event;
    if (typeof info?.message?.event === 'string') return info.message.event;
    return '';
  };

  const getLevel = (info: any): string => {
    if (typeof info?.level === 'string') return String(info.level).toLowerCase();
    return 'info';
  };

  const getPayload = (info: any): Record<string, any> => {
    const msg = info?.message;

    if (msg && typeof msg === 'object') {
      if (msg.data && typeof msg.data === 'object') return msg.data;
      const clone = { ...msg };
      delete (clone as any).event;
      return clone;
    }

    // fallback: use root object fields (common with jl('info', event, extra))
    if (info && typeof info === 'object') {
      const clone = { ...info };
      delete (clone as any).event;
      delete (clone as any).level;
      delete (clone as any).timestamp;
      delete (clone as any).message;
      return clone;
    }

    return {};
  };


  const policy = createLogPolicy();

  const applyPolicy = format((info) => {
    const event = getEventName(info);
    const level = getLevel(info);
    const payload = getPayload(info);

    // If no event name, treat as normal
    if (!event) return info;

    const d = policy.decide(event, level, payload);
    if (d.drop) return false;

    if (d.forceLevel) {
      info.level = d.forceLevel;
    }

    return info;
  });


  const scrubFormat = format((info) => {
    // scrub the main message
    if (typeof info.message === 'string') {
      info.message = scrubSecrets(info.message);
    }

    // scrub some common payload fields
    for (const key of ['error', 'stack', 'details']) {
      if (typeof (info as any)[key] === 'string') {
        (info as any)[key] = scrubSecrets((info as any)[key]);
      }
    }

    // scrub any string fields in the object
    for (const [k, v] of Object.entries(info)) {
      if (typeof v === 'string') {
        (info as any)[k] = scrubSecrets(v);
      }
    }

    return info;
  });

  jsonLogger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp(),
      scrubFormat(),
      applyPolicy(),
      format((info) => {
        if (
          typeof info.message === 'string' &&
          info.message.includes('Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED')
        ) return false;
        return info;
      })(),
      format.json()
    ),
    transports: [
      new DailyRotateFile({
        dirname: resolvedLogDir,
        filename: '45flow-logs-%DATE%.json',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        zippedArchive: true,
        level: 'info',
        format: format.combine(
          scrubFormat(),
          applyPolicy(),
          format.json()
        )
      })
    ]
  });

 const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

const dual = (lvl: 'info' | 'warn' | 'error' | 'debug') =>
  (...args: any[]) => {
    const msgRaw = args.map(String).join(' ');
    const msg = scrubSecrets(msgRaw);
    (jsonLogger as any)[lvl]({ message: msg });
    (originalConsole as any)[lvl](msg);
  };

  console.log = dual('info');
  console.info = dual('info');
  console.warn = dual('warn');
  console.error = dual('error');
  console.debug = dual('debug');

  process.on('uncaughtException', (err) => {
    // log.error('Uncaught Exception:', err);
    jsonLogger.error({ event: 'uncaughtException', error: err.stack || err.message });
  });
  process.on('unhandledRejection', (reason, promise) => {
    // log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    jsonLogger.error({ event: 'unhandledRejection', reason: String(reason) });
  });
}

type PolicyDecision = { drop?: boolean; forceLevel?: 'debug' | 'info' | 'warn' | 'error' };

function createLogPolicy() {
  // Rate limit store: key -> { windowStart, count }
  const rl = new Map<string, { t0: number; n: number }>();
  // State-change store: key -> lastValue
  const last = new Map<string, string>();
  // Simple counters for sampling (deterministic per process)
  const ctr = new Map<string, number>();

  const now = () => Date.now();

  function rateLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
    const t = now();
    const cur = rl.get(key);
    if (!cur || (t - cur.t0) > windowMs) {
      rl.set(key, { t0: t, n: 1 });
      return true;
    }
    cur.n += 1;
    return cur.n <= maxPerWindow;
  }

  function onlyOnChange(key: string, value: string): boolean {
    const prev = last.get(key);
    if (prev === value) return false;
    last.set(key, value);
    return true;
  }

  function sample(key: string, keepEvery: number): boolean {
    const n = (ctr.get(key) || 0) + 1;
    ctr.set(key, n);
    return (n % keepEvery) === 1;
  }

  function isTruthy(v: any) {
    return v === true || v === 1 || v === '1' || v === 'true';
  }

  function decide(event: string, level: string, payload: Record<string, any>): PolicyDecision {
    const e = String(event || '');

    // 0) Always keep warn/error, but avoid floods of identical lines
    if (level === 'warn' || level === 'error') {
      const errSig = String(
        payload?.error ||
        payload?.err ||
        payload?.reason ||
        payload?.code ||
        payload?.status ||
        payload?.message ||
        ''
      ).slice(0, 140);

      // include ip/host when present so different targets don’t suppress each other
      const target = String(payload?.ip || payload?.host || payload?.hostname || '');
      const sig = `${e}|${level}|${target}|${errSig}`;

      // allow a handful per minute per signature
      return rateLimit(`we:${sig}`, 8, 60_000) ? {} : { drop: true };
    }

    // 1) Hard-drop extremely spammy progress streams
    if (e === 'rsync.out.stdout') return { drop: true };

    // 2) mDNS policy
    if (e === 'mdns.interval.query') return { drop: true };

    if (e === 'mdns.client.created') {
      // log once per run; if it somehow repeats, keep at most 1/hour
      return rateLimit('mdns.client.created', 1, 60 * 60_000) ? { forceLevel: 'info' } : { drop: true };
    }

    if (e === 'mdns.response') {
      // keep 1/25 responses as breadcrumb (debug)
      return sample('mdns.response', 25) ? { forceLevel: 'debug' } : { drop: true };
    }

    if (e === 'mdns.upsert') {
      const ip = String(payload?.ip || '');
      const changed = payload?.changed === true || isTruthy(payload?.changed);

      if (changed) {
        // keep changes, but don’t let one device flap spam you
        return rateLimit(`mdns.upsert.changed:${ip}`, 10, 60_000) ? { forceLevel: 'info' } : { drop: true };
      }

      // unchanged: allow 1/min per ip at debug
      return rateLimit(`mdns.upsert.unchanged:${ip}`, 1, 60_000) ? { forceLevel: 'debug' } : { drop: true };
    }

    // 3) SSE policy
    if (e === 'sse.status') {
      const ip = String(payload?.ip || '');
      const status = String(payload?.status || 'unknown');
      // only keep when status changes per ip
      return onlyOnChange(`sse.status:${ip}`, status) ? { forceLevel: 'debug' } : { drop: true };
    }

    if (e === 'sse.attach.attempt' || e === 'sse.attach.url') {
      const ip = String(payload?.ip || '');
      // breadcrumbs only: 1 per 30s per ip
      return rateLimit(`${e}:${ip}`, 1, 30_000) ? { forceLevel: 'debug' } : { drop: true };
    }

    if (e === 'sse.open') {
      const ip = String(payload?.ip || '');
      // important transition: keep but don’t spam if called repeatedly
      return rateLimit(`sse.open:${ip}`, 3, 60_000) ? { forceLevel: 'info' } : { drop: true };
    }

    if (e === 'sse.detach' || e === 'sse.detach.all') {
      // transitions: keep at info, but rate-limit per target
      const ip = String(payload?.ip || '');
      const key = ip ? `${e}:${ip}` : e;
      return rateLimit(key, 6, 60_000) ? { forceLevel: 'info' } : { drop: true };
    }

    if (e === 'sse.reconnect.schedule') {
      const ip = String(payload?.ip || '');
      // keep 1 per 30s per ip at info
      return rateLimit(`sse.reconnect:${ip}`, 1, 30_000) ? { forceLevel: 'info' } : { drop: true };
    }

    // 4) IPC patterns (your file has a lot of start/ok/done)
    // For start/ok/done: sample and downgrade to debug. Errors are already warn/error above.
    if (e.startsWith('ipc.')) {
      if (e.endsWith('.start') || e.endsWith('.ok') || e.endsWith('.done') || e.endsWith('.result')) {
        // keep 1 in 10 per event name
        return sample(`ipc:${e}`, 10) ? { forceLevel: 'debug' } : { drop: true };
      }
      return {}; // keep other ipc.* at their given levels
    }

    // 5) Fallback scan / cleanup ticks
    if (e.startsWith('fallback.scan.')) {
      if (e === 'fallback.scan.start') return { forceLevel: 'info' };
      if (e === 'fallback.scan.done') return { forceLevel: 'info' };
      // port-open/https-ok are very spammy: keep 1/50 as breadcrumb
      if (e === 'fallback.scan.port-open' || e === 'fallback.scan.https-ok') {
        return sample(`fallback:${e}`, 50) ? { forceLevel: 'debug' } : { drop: true };
      }
    }

    if (e === 'servers.cleanup.tick') {
      // keep 1/60 ticks (about once every ~5 minutes at 5s interval)
      return sample('servers.cleanup.tick', 60) ? { forceLevel: 'debug' } : { drop: true };
    }

    // 6) SSH readiness – keep important transitions, sample noisy ones
    if (e.startsWith('ensure-ssh-ready.')) {
      // These are useful when troubleshooting, but noisy during normal runs
      if (e.endsWith('.start')) return sample(`ssh:${e}`, 5) ? { forceLevel: 'debug' } : { drop: true };
      if (e.includes('.agent.try')) return sample(`ssh:${e}`, 10) ? { forceLevel: 'debug' } : { drop: true };
      if (e.includes('.agent.ok')) return { forceLevel: 'info' };
      if (e.includes('.plant.') || e.includes('.verify.ok')) return { forceLevel: 'info' };
      // verify failures are warn/error already handled above
      return {};
    }

    if (e === 'ssh.ensureKeyPair.exists') {
      // keep rarely; it’s a routine check
      return sample('ssh.ensureKeyPair.exists', 50) ? { forceLevel: 'debug' } : { drop: true };
    }

    // 7) Upload + ingest
    if (e.startsWith('upload.')) {
      // Keep start/done/cancel at info, sample progress-ish
      if (e === 'upload.start' || e === 'upload.done' || e.startsWith('upload.cancel')) return { forceLevel: 'info' };
      if (e.endsWith('.denied')) return { forceLevel: 'warn' }; // though your code logs warn already
      return {};
    }

    if (e.startsWith('ingest.')) {
      if (e === 'ingest.dest.normalize') return sample('ingest.dest.normalize', 5) ? { forceLevel: 'debug' } : { drop: true };
      if (e === 'ingest.register') {
        // this can be noisy if you do retries; keep 1/5 at debug
        return sample('ingest.register', 5) ? { forceLevel: 'debug' } : { drop: true };
      }
      return {};
    }

    if (e === 'rsync.close') return { forceLevel: 'info' };

    // 8) API request/response from renderer (you already drop GET/HEAD/OPTIONS earlier)
    if (e === 'api.request' || e === 'api.response') {
      const url = String(payload?.url || '');
      // Keep most at debug sampled, but allow non-noisy ones through when useful
      if (url.includes('/api/expand-paths') || url.includes('/api/jobs/status')) {
        return sample(`api:${e}:${url}`, 50) ? { forceLevel: 'debug' } : { drop: true };
      }
      // other api.*: keep 1/10 at debug (unless renderer already filtered)
      return sample(`api:${e}`, 10) ? { forceLevel: 'debug' } : { drop: true };
    }

    // 9) UI lifecycle
    if (e === 'window.created' || e === 'renderer.ready' || e === 'app.ready' || e === 'app.activate') {
      // keep these, but only occasionally if they repeat
      return rateLimit(`lifecycle:${e}`, 5, 60_000) ? { forceLevel: 'info' } : { drop: true };
    }

    // 10) Certificate verification
    if (e === 'cert.verify.start') {
      // can spam on lots of internal requests; keep 1/30 per host
      const host = String(payload?.hostname || '');
      return rateLimit(`cert.verify.start:${host}`, 1, 30_000) ? { forceLevel: 'info' } : { drop: true };
    }

    // 11) Notifications (these can leak user content into logs; keep but rate-limit)
    if (e === 'notify.push') {
      return rateLimit('notify.push', 10, 60_000) ? { forceLevel: 'info' } : { drop: true };
    }

    // Default: keep
    return {};
  }

  return { decide };
}


import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import { createLogger, format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path, { join } from 'path';
import mdns from 'multicast-dns';
import os from 'os';
import fs from 'fs';
import net from 'net';
import { Server } from './types';
import { IPCRouter } from '../../houston-common/houston-common-lib/lib/electronIPC/IPCRouter';
import { getOS } from './utils';
import { v4 as uuidv4 } from 'uuid';
import { getAgentSocket, getKeyDir, ensureKeyPair, regeneratePemKeyPair } from './crossPlatformSsh';
import { connectWithKey, connectWithPassword, setupSshKey } from './setupSsh'; 
import { server, unwrap } from '@45drives/houston-common-lib';
import { installServerDepsRemotely } from './installServerDeps';
import { checkSSH } from './setupSsh';
import { getPin, rememberPin } from './certPins'
import { ChildProcessWithoutNullStreams } from 'node:child_process'
import { NodeSSH } from 'node-ssh';
import { buildRsyncCmdAndArgs } from './transfers/rsync-path';
import { registerSensitiveToken, scrubSecrets } from './scrubSecrets';
import { runRsyncDetached, reattachTailer, type LogTailer } from './transfers/rsync-runner';
import { runWinSftp } from './transfers/win-file-sftp';
import {
  upsertTransfer, getRunningTransfers, getQueuedTransfers,
  markTransfer, markTransferRunning, removeTransfer, removeQueuedMatch,
  pruneOldTransfers, isPidAlive, removeLogFile, makeLogPath, getAllTransfers,
  type PersistedTransfer,
} from './transfers/transfer-store';

let discoveredServers: Server[] = [];
export let jsonLogger: ReturnType<typeof createLogger>;
export function jl(level: 'info' | 'warn' | 'error' | 'debug', event: string, extra: Record<string, any> = {}) {
  try { (jsonLogger as any)[level]({ event, ...extra }); } catch {}
}

// ===== EventSource + SSE (Electron main) =====================================
// Requires: yarn add eventsource@^2
import EventSource from 'eventsource';

// Minimal event typings for our usage
type ESMessageEvent = { data: string };
type ESLike = {
  addEventListener(type: string, listener: (ev: ESMessageEvent) => void): void;
  close(): void;
  onerror?: (err: any) => void;
  onopen?: () => void;
  onmessage?: (ev: ESMessageEvent) => void;
};

// Track live SSE connections per IP
const setupStreams = new Map<string, ESLike>();

type SseState = {
  inFlight: boolean;      // we're currently attempting an attach
  nextAt: number;         // do not attempt before this timestamp
  backoffMs: number;      // current backoff window
  mutedUntil404: number;  // if a 404 was seen, mute + skip until this time
  lastErr?: string;       // last error label for diagnostics
};
const sseState = new Map<string, SseState>();

// Base backoff for reconnects
let sseBackoffMs = 2000;

function st(ip: string): SseState {
  const now = Date.now();
  const s = sseState.get(ip) || {
    inFlight: false,
    nextAt: 0,
    backoffMs: sseBackoffMs,
    mutedUntil404: 0,
    lastErr: undefined,
  };
  // ensure structure and store
  sseState.set(ip, s);
  return s;
}

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) || Promise.resolve();

  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  locks.set(key, prev.then(() => next));

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

function normalizeDestRel(destDir: string, shareRoot?: string): string {
  let d = String(destDir || '').trim();
  if (!d) return '';

  // normalize slashes and remove trailing slash
  d = d.replace(/\\/g, '/').replace(/\/+$/, '');

  // If shareRoot is provided and destDir is absolute under it, strip it.
  if (shareRoot) {
    let root = String(shareRoot).trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!root) root = '/';

    // Ensure root is absolute-like
    if (!root.startsWith('/')) root = '/' + root;

    // If d starts with root, strip it.
    if (root === '/') {
      // For root, just remove leading slashes
      d = d.replace(/^\/+/, '');
    } else if (d === root) {
      d = '';
    } else if (d.startsWith(root + '/')) {
      d = d.slice(root.length + 1);
    }
  } else {
    // No shareRoot knowledge: best-effort fallback
    d = d.replace(/^\/+/, '');
  }

  // Final cleanup
  d = d.replace(/^\/+/, '');
  return d;
}

// Cache shareRoot per host so we don't fetch it every upload
const shareRootByHost = new Map<string, string>();

async function getShareRootForHost(host: string, port = 9095): Promise<string | undefined> {
  const cached = shareRootByHost.get(host);
  if (cached) return cached;

  const url = `http://${host}:${port}/.well-known/houston`;
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(2500) });
    const j: any = await r.json().catch(() => ({}));

    const sr = typeof j?.shareRoot === 'string' ? j.shareRoot : undefined;
    if (sr) {
      shareRootByHost.set(host, sr);
      jl('info', 'wellknown.houston.ok', { host, port, shareRoot: sr });
      return sr;
    }

    jl('info', 'wellknown.houston.missing-shareRoot', { host, port, keys: Object.keys(j || {}) });
    return undefined;
  } catch (e: any) {
    jl('warn', 'wellknown.houston.fail', { host, port, error: e?.message || String(e) });
    return undefined;
  }
}


export function attachSetupSSE(ip: string, seedDelayMs = 0) {
  // Schedule an attempt (optionally delayed); actual attach happens in tryAttach()
  const s = st(ip);
  const now = Date.now();
  s.nextAt = Math.max(s.nextAt, now + seedDelayMs);
  tryAttach(ip);
}

async function tryAttach(ip: string) {
  const s = st(ip);
  const now = Date.now();

  // Already connected?
  if (setupStreams.has(ip)) return;

  // Currently trying?
  if (s.inFlight) return;

  // Respect cooldown
  if (now < s.nextAt) return;

  // Respect 404 mute period
  if (now < s.mutedUntil404) {
    // muted; don't log every time
    return;
  }

  s.inFlight = true;
  jl('debug', 'sse.attach.attempt', { ip });

  // Preflight to avoid EventSource 404 floods
  const pf = await preflightSetupStatus(ip);
  if (pf.code === 404) {
    // Mute repeated 404s for a while, and push next attempt out
    const muteMs = 10 * 60 * 1000; // 10 minutes
    s.mutedUntil404 = now + muteMs;
    s.backoffMs = Math.min(Math.max(s.backoffMs * 2, 5000), 30000);
    s.nextAt = now + s.backoffMs;

    // Log once per mute window
    jl('warn', 'sse.preflight.404', { ip, muteMs, nextIn: s.backoffMs });
    s.inFlight = false;
    return;
  }

  if (pf.ok === false && pf.code !== 200) {
    // Network or non-200/404—use backoff but no mute
    s.backoffMs = Math.min(s.backoffMs * 2, 30000);
    s.nextAt = now + s.backoffMs;
    jl('warn', 'sse.preflight.fail', { ip, code: pf.code, nextIn: s.backoffMs });
    s.inFlight = false;
    return;
  }

  // Passed preflight → open EventSource
  const url = `http://${ip}:9095/setup-status/stream`;
  jl('debug', 'sse.attach.url', { ip, url });

  let es: ESLike | undefined;
  try {
    es = new (EventSource as any)(url) as ESLike;
  } catch (e: any) {
    s.lastErr = normalizeErrorText(e);
    jl('warn', 'sse.construct.error', { ip, error: s.lastErr });

    s.backoffMs = Math.min(s.backoffMs * 2, 30000);
    s.nextAt = Date.now() + s.backoffMs;
    s.inFlight = false;
    // schedule a later retry
    setTimeout(() => tryAttach(ip), s.backoffMs);
    return;
  }

  es.onopen = () => {
    s.backoffMs = 2000;      // reset backoff on healthy traffic
    s.inFlight = false;
    setupStreams.set(ip, es!);
    jl('debug', 'sse.open', { ip, url });
  };

  es.addEventListener('status', (ev: ESMessageEvent) => {
    try {
      s.backoffMs = 2000; // healthy traffic resets backoff
      const payload = JSON.parse(String(ev.data) || '{}');
      const status = payload?.status ?? 'unknown';
      BrowserWindow.getAllWindows()[0]?.webContents.send('discovered-servers-status', {
        ip, status, ts: Date.now(),
      });
      jl('debug', 'sse.status', { ip, status });
    } catch (e: any) {
      jl('warn', 'sse.status.parse-error', { ip, error: e?.message || String(e) });
    }
  });

  es.onerror = (err: any) => {
    // Tear down stream and schedule a backoff’ed retry
    try { es?.close(); } catch {}
    setupStreams.delete(ip);

    // We cannot reliably get HTTP status from EventSource errors.
    // We rely on preflight to catch 404s before we open.
    s.lastErr = normalizeErrorText(err) || 'EventSource connection error';
    jl('warn', 'sse.error', {
      ip,
      error: s.lastErr,
      errorType: err?.type || err?.name || err?.constructor?.name || undefined,
    });

    s.backoffMs = Math.min(s.backoffMs * 2, 30000);
    s.nextAt = Date.now() + s.backoffMs;
    s.inFlight = false;

    // schedule a retry
    setTimeout(() => tryAttach(ip), s.backoffMs);
    jl('info', 'sse.reconnect.schedule', { ip, delay: s.backoffMs });
  };
}


export function detachSetupSSE(ip: string) {
  jl('info', 'sse.detach', { ip });
  const es = setupStreams.get(ip);
  if (es) {
    try { es.close(); } catch {}
    setupStreams.delete(ip);
  }
  // Optional: also clear inFlight to allow immediate reattach if caller wants
  const s = sseState.get(ip);
  if (s) s.inFlight = false;
}


// Stop and clear all streams (e.g., during app shutdown or rescan)
export function detachAllSetupSSE() {
  jl('info', 'sse.detach.all');

  for (const es of setupStreams.values()) {
    try { es.close(); } catch { }
  }
  setupStreams.clear();
}

async function preflightSetupStatus(ip: string): Promise<{ ok: boolean; code?: number }> {
  const url = `http://${ip}:9095/setup-status`;
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(2500) });
    return { ok: r.ok, code: r.status };
  } catch (e: any) {
    return { ok: false };
  }
}

const mdnsLastSigByIp = new Map<string, string>();
const mdnsLastLogAt = new Map<string, number>();
const MDNS_MIN_INTERVAL_MS = 60_000; // at most once/min per IP when nothing changes
function mdnsSignature(txt: Record<string,string>, ip: string, displayName: string) {
  // stable signature of what we care about
  const keys = Object.keys(txt).sort();
  const body = keys.map(k => `${k}=${txt[k]}`).join('&');
  return `${ip}|${displayName}|${body}`;
}

// Helper to connect via agent or password-planted key
async function connectForPreflight(host: string, username: string, password: string, port = 22) {
  const agentSock = getAgentSocket();
  // Try agent
  if (agentSock) {
    const trial = new NodeSSH();
    try {
      await trial.connect({ host, username, agent: agentSock, port, tryKeyboard: false, readyTimeout: 20000 });
      return trial;
    } catch { trial.dispose(); }
  }

  return await withLock('client-ssh-keys', async () => {
    // Try password → plant key → reconnect with key
    const planted = await connectWithPassword({ host, username, password, port });
    try { planted.dispose(); } catch { }

    const keyDir = getKeyDir();
    const priv = path.join(keyDir, 'id_ed25519');
    await ensureKeyPair(priv, `${priv}.pub`);
    try {
      return await connectWithKey({ host, username, privateKey: priv, agent: agentSock || undefined, port });
    } catch (e: any) {
      const m = String(e?.message || e);
      if (/unsupported key format/i.test(m)) {
        await regeneratePemKeyPair(priv);
        return await connectWithKey({ host, username, privateKey: priv, agent: agentSock || undefined, port });
      }
      throw e;
    }
  }
)}

function isOwnedByCurrentUser(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);

    // On Unix / macOS, enforce ownership
    if (typeof process.getuid === 'function') {
      const uid = process.getuid();
      if (st.uid !== uid) {
        return false;
      }
    }

    // Also ensure we can read it (defensive)
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    // stat/access failed, treat as not allowed
    return false;
  }
}

function defaultClientKey(): string | undefined {
  try {
    const dir = getKeyDir();
    const ed = path.join(dir, 'id_ed25519');
    const rs = path.join(dir, 'id_rsa');
    if (fs.existsSync(ed)) return ed;
    if (fs.existsSync(rs)) return rs;
    return undefined;
  } catch { return undefined; }
}


ipcMain.handle('remote-check-broadcaster', async (_event, { host, username, password, sshPort }) => {
  registerSensitiveToken(password);
  const port = sshPort ?? 22;
  jl('info', 'ipc.remote-check-broadcaster.start', { host, username: !!username ? 'provided' : 'empty', port });

  let ssh: NodeSSH | null = null;
  try {
    ssh = await connectForPreflight(host, username, password, port);

    // Single portable script: checks pkg presence, unit presence/active, legacy presence/active, API health
    const script = `
set -euo pipefail

bool() { [ "$1" -eq 0 ] && echo true || echo false; }

is_rpm(){ command -v rpm >/dev/null 2>&1; }
is_dpkg(){ command -v dpkg >/dev/null 2>&1; }

pkg_installed=1
if is_rpm; then
  if rpm -q houston-broadcaster >/dev/null 2>&1; then
    pkg_installed=0
  fi
elif is_dpkg; then
  if dpkg -s houston-broadcaster >/dev/null 2>&1; then
    pkg_installed=0
  fi
fi

systemctl --version >/dev/null 2>&1 || {
  echo '{"hasPackage":false,"servicePresent":false,"serviceActive":false,"legacyPresent":false,"legacyActive":false,"apiHealthy":false}'
  exit 0
}

# Guard each systemctl but still capture real exit code
svc_present=3
if systemctl status houston-broadcaster >/dev/null 2>&1; then
  svc_present=0
else
  svc_present=$?
fi

svc_active=3
if systemctl is-active --quiet houston-broadcaster >/dev/null 2>&1; then
  svc_active=0
else
  svc_active=$?
fi

legacy_present=3
if systemctl status houston-broadcaster-legacy >/dev/null 2>&1; then
  legacy_present=0
else
  legacy_present=$?
fi

legacy_active=3
if systemctl is-active --quiet houston-broadcaster-legacy >/dev/null 2>&1; then
  legacy_active=0
else
  legacy_active=$?
fi

apiHealthy=1
for i in {1..2}; do
  if curl -fsS --max-time 2 http://127.0.0.1:9095/healthz >/dev/null 2>&1; then
    apiHealthy=0
    break
  fi
  sleep 1
done

printf '{"hasPackage":%s,"servicePresent":%s,"serviceActive":%s,' \
       '"legacyPresent":%s,"legacyActive":%s,"apiHealthy":%s}\n' \
  "$(bool $pkg_installed)" \
  "$(bool $svc_present)" \
  "$(bool $svc_active)" \
  "$(bool $legacy_present)" \
  "$(bool $legacy_active)" \
  "$(bool $apiHealthy)"
`.trim();

    const res = await ssh.execCommand(`bash -lc '${script.replace(/'/g, `'\"'\"'`)}'`);
    if ((res.code ?? 0) !== 0) throw new Error(res.stderr || res.stdout || 'preflight failed');
    // JSON parse in main so renderer doesn’t need to trust shell text
    let parsed: any = {};
    try { parsed = JSON.parse(res.stdout.trim()); } catch { }
    jl('info', 'ipc.remote-check-broadcaster.ok', { host, result: parsed });

    return parsed;
  } catch (e: any) {
    jsonLogger.warn({ event: 'remote-check-broadcaster.error', host, error: e?.message || String(e) });
    jl('error', 'ipc.remote-check-broadcaster.error', { host, error: e?.message || String(e) });

    throw e;
  } finally {
    try { ssh?.dispose(); } catch { }
  }
});

ipcMain.handle('probe-health', async (_e, { ip, port }) => {
  jl('info', 'ipc.probe-health.start', { ip, port });

  try {
    const r = await fetch(`http://${ip}:${port}/healthz`, { signal: AbortSignal.timeout(3000) });
    jl('info', 'ipc.probe-health.ok', { ip, port, status: r.status, ok: r.ok });

    return { ok: r.ok, status: r.status };
  } catch (err: any) {
    jl('warn', 'ipc.probe-health.error', { ip, port, error: err?.message || String(err) });

    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('ensure-ssh-ready', async (_e, { host, username, password, sshPort }) => {
  return await withLock('client-ssh-keys', async () => {
    registerSensitiveToken(password);
    const port = sshPort ?? 22;
    const keyDir = getKeyDir();
    const edPriv = path.join(keyDir, 'id_ed25519');
    const edPub = `${edPriv}.pub`;
    const rsaPriv = path.join(keyDir, 'id_rsa');
    const rsaPub = `${rsaPriv}.pub`;

    jl('info', 'ensure-ssh-ready.start', {
      host, username, hasPassword: !!password, keyDir, port,
    });

    try {
      // 0) ensure we have an ed25519 pair on disk
      await ensureKeyPair(edPriv, edPub);

      const agentSock = getAgentSocket();

      // 1) Try agent first
      if (agentSock) {
        jl('info', 'ensure-ssh-ready.agent.try', { agentSock, port });
        const trial = new NodeSSH();
        try {
          await trial.connect({ host, username, agent: agentSock, port, tryKeyboard: false, readyTimeout: 20_000 });
          jl('info', 'ensure-ssh-ready.agent.ok', { host, username });

          // Even if agent works, plant our app key idempotently so future non-agent ops work
          if (password) {
            await setupSshKey(host, username, password, edPub, undefined, port);
            jl('info', 'ensure-ssh-ready.plant.after-agent', { pub: edPub });
          }

          try { trial.dispose(); } catch { }
          return { ok: true, keyPath: edPriv, via: 'agent(+planted-ed25519)' };
        } catch (e: any) {
          // Agent auth failing is expected on many hosts; password fallback runs immediately after.
          jl(password ? 'debug' : 'warn', 'ensure-ssh-ready.agent.fail', { error: e?.message || String(e) });
          try { trial.dispose(); } catch { }
        }
      }

      // 2) No agent or agent failed → plant ed25519 using password
      if (!password) {
        const msg = 'No SSH agent and no password provided for initial key install.';
        jl('warn', 'ensure-ssh-ready.no-creds', { host, username });
        return { ok: false, error: msg };
      }

      await setupSshKey(host, username, password, edPub, undefined, port);
      jl('info', 'ensure-ssh-ready.plant.ed25519.ok', { pub: edPub });

      // 3) Verify with ed25519 file key
      const verify = new NodeSSH();
      try {
        await verify.connect({
          host, username,
          privateKey: fs.readFileSync(edPriv, 'utf8'),
          port,
          tryKeyboard: false,
          readyTimeout: 20_000,
        });
        jl('info', 'ensure-ssh-ready.verify.ok', { algo: 'ed25519' });
        try { verify.dispose(); } catch { }
        return { ok: true, keyPath: edPriv, via: 'password+ed25519' };
      } catch (e: any) {
        const msg = String(e?.message || e);
        jl('warn', 'ensure-ssh-ready.verify.ed25519.fail', { error: msg });

        // 4) Fallback once: generate RSA at the *RSA* filename
        jl('info', 'ensure-ssh-ready.rsa.fallback.begin', { rsaPriv });
        await regeneratePemKeyPair(rsaPriv);          // writes rsaPriv and rsaPriv.pub
        await setupSshKey(host, username, password, rsaPub, undefined, port);
        jl('info', 'ensure-ssh-ready.rsa.plant.ok', { pub: rsaPub });

        // Retry with RSA
        try {
          await verify.connect({
            host, username,
            privateKey: fs.readFileSync(rsaPriv, 'utf8'),
            port,
            tryKeyboard: false,
            readyTimeout: 20_000,
          });
          jl('info', 'ensure-ssh-ready.verify.ok', { algo: 'rsa-4096-pem' });
          try { verify.dispose(); } catch { }
          return { ok: true, keyPath: rsaPriv, via: 'password+rsa' };
        } catch (e2: any) {
          const msg2 = String(e2?.message || e2);
          jl('error', 'ensure-ssh-ready.verify.rsa.fail', { error: msg2 });
          try { verify.dispose(); } catch { }
          return { ok: false, error: msg2 };
        }
      }
    } catch (err: any) {
      const error = err?.message || String(err);
      jl('warn', 'ensure-ssh-ready.failed', { host, username, error });
      return { ok: false, error };
    }
  })
});

const idFile = path.join(app.getPath('userData'), 'client-id.txt');
let installId = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf-8').trim() : '';
if (!installId) { installId = uuidv4(); fs.writeFileSync(idFile, installId, 'utf-8'); }

const clientIdent = { installId };

ipcMain.on('renderer-ready', (e) => {
  e.sender.send('client-ident', clientIdent);
    jl('info', 'renderer.ready');

});

ipcMain.handle('get-client-ident', async () => ({ installId }))

function checkLogDir(logSuccess = true): string {
  // LINUX: /home/<username>/.config/45flow/logs       (IN DEV MODE: /home/<username>/config/Electron/logs/)
  // MAC:   /Users/<username>/Library/Application Support/45flow/logs
  // WIN:   C:\Users\<username>\AppData\Roaming\45flow\logs
  const baseLogDir = path.join(app.getPath('userData'), 'logs');
  try {
    if (!fs.existsSync(baseLogDir)) {
      fs.mkdirSync(baseLogDir, { recursive: true });
    }
    console.debug(` Log directory ensured: ${baseLogDir}`);
    if (logSuccess) {
      jl('info', 'logs.dir.ensure.ok', { dir: baseLogDir });
    }

  } catch (e: any) {
    console.error(` Failed to create log directory (${baseLogDir}):`, e.message);
    jl('error', 'logs.dir.ensure.error', { dir: baseLogDir, error: e?.message || String(e) });
  }
  return baseLogDir;
}

function previewValue(value: any, maxLen = 240): string {
  if (value === undefined || value === null) return '';
  let str = '';
  try {
    if (typeof value === 'string') {
      str = value;
    } else {
      const seen = new WeakSet<object>();
      str = JSON.stringify(value, (_k, v) => {
        if (typeof v === 'bigint') return String(v);
        if (v && typeof v === 'object') {
          if (seen.has(v as object)) return '[Circular]';
          seen.add(v as object);
        }
        return v;
      });
    }
  } catch {
    if (value instanceof Error) str = value.stack || value.message || value.name;
    else str = String(value);
  }
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
}

function normalizeErrorText(input: any): string {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return '';
    if (/^\[object\s+[^\]]+\]$/i.test(s)) return '';
    return s;
  }
  if (input instanceof Error) return input.stack || input.message || input.name || 'Error';

  const candidates = [input?.message, input?.error, input?.reason, input?.statusText];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }

  const code = input?.code;
  const status = input?.status;
  const type = input?.type || input?.name || input?.constructor?.name;
  if ((typeof code === 'string' && code) || Number.isFinite(Number(status))) {
    const bits: string[] = [];
    if (type) bits.push(String(type));
    if (code) bits.push(`code=${String(code)}`);
    if (Number.isFinite(Number(status))) bits.push(`status=${String(status)}`);
    return bits.join(' ');
  }

  const serialized = previewValue(input, 220);
  if (serialized && serialized !== '{}' && !/^\[object\b/i.test(serialized)) return serialized;
  if (type) return `Unspecified ${String(type)} error`;
  return 'Unspecified error';
}

function summarizeEvent(event: string, payload: Record<string, any> | undefined): string {
  if (!payload || typeof payload !== 'object') return event || 'log.entry';

  const method = payload.method ? String(payload.method).toUpperCase() : '';
  const status = payload.status !== undefined ? String(payload.status) : '';
  const url = payload.url ? String(payload.url) : '';
  const error = normalizeErrorText(payload.error ?? payload.err ?? payload.reason);
  const host = payload.host ? String(payload.host) : '';
  const ip = payload.ip ? String(payload.ip) : '';

  if (method && url) {
    return `${method} ${url}${status ? ` -> ${status}` : ''}`;
  }
  if (error) return error;
  if (host || ip) {
    const target = host || ip;
    return `${event} (${target})`;
  }

  const keys = Object.keys(payload).slice(0, 4);
  if (keys.length) {
    return keys.map((k) => `${k}=${previewValue(payload[k], 48)}`).join(' ');
  }
  return event || 'log.entry';
}

function parseLogLine(line: string, id: string) {
  try {
    const parsed = JSON.parse(line);
    const level = String(parsed?.level || 'info').toLowerCase();
    const timestamp = String(parsed?.timestamp || new Date().toISOString());
    const message = parsed?.message;

    let event = 'log.entry';
    let payload: Record<string, any> | undefined;
    let summary = '';
    let details = '';

    if (typeof message === 'string') {
      summary = message;
    } else if (message && typeof message === 'object') {
      event = String(message.event || parsed?.event || 'log.entry');
      if (message.data && typeof message.data === 'object') {
        payload = message.data;
      } else {
        payload = { ...message };
        delete (payload as any).event;
      }

      summary = summarizeEvent(event, payload);
      if (payload && Object.keys(payload).length > 0) {
        details = JSON.stringify(payload, null, 2);
      }
    } else {
      event = String(parsed?.event || 'log.entry');
      summary = event;
    }

    return {
      id,
      timestamp,
      level,
      event,
      summary: summary || event,
      details: details ? previewValue(details, 4000) : undefined,
      data: payload,
    };
  } catch {
    return {
      id,
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'log.parse.error',
      summary: previewValue(line, 220),
      details: undefined,
      data: undefined,
    };
  }
}

function readClientLogs(limit = 600) {
  const logDir = checkLogDir(false);
  const files = fs.readdirSync(logDir)
    .filter((name) => name.startsWith('45flow-logs-') && name.endsWith('.json'))
    .sort();

  if (!files.length) {
    return { ok: true, entries: [], file: '', logDir };
  }

  const file = files[files.length - 1];
  const fullPath = path.join(logDir, file);
  const text = fs.readFileSync(fullPath, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);

  const parsedLimit = Math.max(1, Math.min(Number(limit) || 600, 2000));
  const working = lines.slice(-Math.min(lines.length, parsedLimit * 3));
  const entries: Array<ReturnType<typeof parseLogLine>> = [];

  for (let i = working.length - 1; i >= 0 && entries.length < parsedLimit; i -= 1) {
    entries.push(parseLogLine(working[i], `${file}:${i}`));
  }

  return { ok: true, entries, file, logDir };
}

function isPortOpen(ip: string, port: number, timeout = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

// Timeout duration in milliseconds (e.g., 30 seconds)
const TIMEOUT_DURATION = 30000;
const serviceType = '_houstonserver._tcp.local';

const isPrivateV4 = (addr: string): boolean => {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4) return false;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
};

/** All private IPv4 addresses on this machine, with CIDR prefix length */
type LocalNic = { address: string; prefixLength: number };

const getAllLocalIPs = (): LocalNic[] => {
  const out: LocalNic[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const ifaces = nets[name];
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal && isPrivateV4(iface.address)) {
        out.push({ address: iface.address, prefixLength: netmaskToCidr(iface.netmask) });
      }
    }
  }
  return out;
};

const getLocalIP = () => {
  const all = getAllLocalIPs();
  return all.length > 0 ? all[0].address : '127.0.0.1';
};

/** Convert dotted netmask (e.g. "255.255.0.0") to CIDR prefix (e.g. 16) */
function netmaskToCidr(mask: string): number {
  const parts = mask.split('.').map(Number);
  let bits = 0;
  for (const p of parts) {
    bits += (p >>> 0).toString(2).split('').filter(b => b === '1').length;
  }
  return bits;
}

/**
 * Generate candidate IPs to scan for a given NIC.
 * For /24: scans the full 254 hosts.
 * For /16 or wider: scans a set of representative /24 subnets (every .1 across
 * the range) to stay fast. Max ~1024 candidates per interface.
 */
function scanCandidatesForNic(nic: LocalNic): string[] {
  const parts = nic.address.split('.').map(Number);
  const ip32 = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
  const mask32 = (0xFFFFFFFF << (32 - nic.prefixLength)) >>> 0;
  const network = (ip32 & mask32) >>> 0;
  const hostBits = 32 - nic.prefixLength;
  const totalHosts = (1 << hostBits) >>> 0;

  const candidates: string[] = [];

  if (hostBits <= 8) {
    // /24 or smaller: scan every host
    for (let h = 1; h < totalHosts - 1 && h < 255; h++) {
      const candidate = (network + h) >>> 0;
      if (candidate === ip32) continue;
      candidates.push(`${(candidate >>> 24) & 0xFF}.${(candidate >>> 16) & 0xFF}.${(candidate >>> 8) & 0xFF}.${candidate & 0xFF}`);
    }
  } else {
    // /16 or wider: scan .1 and .254 of each /24 in the range (common server addresses),
    // plus the full local /24 around our own IP
    const localSubnetBase = (ip32 & 0xFFFFFF00) >>> 0;

    // Full scan of our own /24
    for (let h = 1; h < 255; h++) {
      const candidate = (localSubnetBase + h) >>> 0;
      if (candidate === ip32) continue;
      candidates.push(`${(candidate >>> 24) & 0xFF}.${(candidate >>> 16) & 0xFF}.${(candidate >>> 8) & 0xFF}.${candidate & 0xFF}`);
    }

    // Probe .1 and .254 of other /24s in the range (gateway and high addresses where servers often live)
    const numSubnets = totalHosts >>> 8;
    for (let s = 0; s < numSubnets && candidates.length < 1024; s++) {
      const subnetBase = (network + (s << 8)) >>> 0;
      if (subnetBase === localSubnetBase) continue; // already scanned above
      for (const offset of [1, 2, 10, 20, 30, 31, 50, 100, 200, 240, 254]) {
        const candidate = (subnetBase + offset) >>> 0;
        if (candidate === ip32) continue;
        candidates.push(`${(candidate >>> 24) & 0xFF}.${(candidate >>> 16) & 0xFF}.${(candidate >>> 8) & 0xFF}.${candidate & 0xFF}`);
      }
    }
  }

  return candidates;
}


let mainWindowRef: BrowserWindow | null = null

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: false,
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      javascript: true,
      backgroundThrottling: false,  // Disable throttling
      webSecurity: true,                  // Enforces origin security
      allowRunningInsecureContent: false, // Prevents HTTP inside HTTPS
    }
  });
  mainWindowRef = mainWindow

  function safeSend(channel: string, payload?: any) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const wc = mainWindow.webContents;
    if (!wc || wc.isDestroyed()) return;
    try {
      wc.send(channel, payload);
    } catch (e: any) {
      jl('debug', 'renderer.send.skipped', {
        channel,
        error: e?.message || String(e),
      });
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url); // Opens in the user's default browser
    }

    return { action: 'deny' }; // Prevent Electron from opening a new window
  });

  async function doFallbackScan(): Promise<Server[]> {
    
    const nics = getAllLocalIPs();
    const localAddrs = new Set(nics.map(n => n.address));
    jl('info', 'fallback.scan.start', { nics: nics.map(n => `${n.address}/${n.prefixLength}`), count: nics.length });

    if (!nics.length) {
      jl('warn', 'fallback.scan.no-nics');
      return [];
    }

    // Collect unique candidate IPs across all interfaces
    const allCandidates = new Set<string>();
    for (const nic of nics) {
      for (const ip of scanCandidatesForNic(nic)) {
        if (!localAddrs.has(ip)) allCandidates.add(ip);
      }
    }

    jl('info', 'fallback.scan.candidates', { total: allCandidates.size });

    const ips = [...allCandidates];

    const scanned = await Promise.allSettled(
      ips.map(async candidateIp => {

        // console.debug("checking for server at ", candidateIp);

        // Check broadcaster API port (9095) first, fall back to Cockpit (9090)
        const bcastOpen = await isPortOpen(candidateIp, 9095);
        const cockpitOpen = !bcastOpen ? await isPortOpen(candidateIp, 9090) : false;
        if (!bcastOpen && !cockpitOpen) return null;
        jl('debug', 'fallback.scan.port-open', { ip: candidateIp, bcast: bcastOpen, cockpit: cockpitOpen });

        try {
          // Prefer broadcaster healthz; fall back to Cockpit HTTPS probe
          if (bcastOpen) {
            const hRes = await fetch(`http://${candidateIp}:9095/healthz`, {
              method: 'GET',
              cache: 'no-store',
              signal: AbortSignal.timeout(3000),
            });
            if (!hRes.ok) return null;
          } else {
            const res = await fetch(`https://${candidateIp}:9090/`, {
              method: 'GET',
              cache: 'no-store',
              signal: AbortSignal.timeout(3000),
            });
            if (!res.ok) return null;
          }

          jl('debug', 'fallback.scan.probe-ok', { ip: candidateIp, bcast: bcastOpen });

          // Try to fetch server identity from broadcaster API
          let serverName = candidateIp;
          let displayName = candidateIp;
          let setupComplete = false;
          let shareName = '';
          let setupTime = '';
          const serverInfo: any = { moboMake: '', moboModel: '', serverModel: '', aliasStyle: '', chassisSize: '' };

          if (bcastOpen) {
            try {
              const infoRes = await fetch(`http://${candidateIp}:9095/.well-known/houston`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(3000),
              });
              if (infoRes.ok) {
                const info = await infoRes.json();
                // Prefer mdnsName (sanitized, e.g. "tank2-0") over raw hostname ("tank2.0")
                const rawName = info.mdnsName || (info.name ? info.name.replace(/\./g, '-') : '');
                if (rawName) {
                  displayName = rawName.endsWith('.local') ? rawName : `${rawName}.local`;
                }
                const setup = info.setup || {};
                if (setup.serverName) serverName = setup.serverName;
                else if (info.name) serverName = info.name;
                setupComplete = !!setup.setupComplete;
                shareName = setup.shareName || '';
                setupTime = setup.setupTime || '';
                if (setup.moboMake) serverInfo.moboMake = setup.moboMake;
                if (setup.moboModel) serverInfo.moboModel = setup.moboModel;
                if (setup.serverModel) serverInfo.serverModel = setup.serverModel;
                if (setup.aliasStyle) serverInfo.aliasStyle = setup.aliasStyle;
                if (setup.chassisSize) serverInfo.chassisSize = setup.chassisSize;
              }
            } catch { /* best-effort */ }
          }

          jl('info', 'fallback.scan.done', { ip: candidateIp, serverName });

          return {
            ip: candidateIp,
            name: displayName,
            status: 'unknown',
            setupComplete,
            serverName,
            shareName,
            setupTime,
            serverInfo,
            lastSeen: Date.now(),
            fallbackAdded: true
          } as Server;

        } catch {
          return null;
        }
      })
    );

    const fallbackServers = scanned
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter((s): s is Server => s !== null);

    if (fallbackServers.length) {
      // Merge fallback results into existing discovered servers (don't replace!)
      for (const fb of fallbackServers) {
        const existing = discoveredServers.find(x => x.ip === fb.ip);
        if (existing) {
          // Preserve mDNS-resolved name if we already have one
          existing.lastSeen = Date.now();
          if (!existing.fallbackAdded) continue; // mDNS already knows this server
          Object.assign(existing, fb);
        } else {
          discoveredServers.push(fb);
        }
      }
      safeSend('discovered-servers', discoveredServers);
    }

    return fallbackServers;
  }

  IPCRouter.initBackend(mainWindow.webContents, ipcMain);

  let rendererIsReady = false;
  let bufferedNotifications: string[] = [];

  ipcMain.on('renderer-ready', (e) => {
    if (rendererIsReady) return;          // guard
    rendererIsReady = true;
    bufferedNotifications.forEach(msg => e.sender.send('notification', msg));
    bufferedNotifications = [];
  });


  ipcMain.on('log:info', (_e, payload) => {
    const evt = String(payload?.event || '');
    const method = String(payload?.data?.method || '').toUpperCase();
    if (['api.request', 'api.response'].includes(evt) && ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return;
    }
    jsonLogger.info(payload);
    // log.info(payload.event, payload.data);
  });
  ipcMain.on('log:warn', (_e, payload) => {
    jsonLogger.warn(payload);
    // log.warn(payload.event, payload.data);
  });
  ipcMain.on('log:error', (_e, payload) => {
    jsonLogger.error(payload);
    // log.error(payload.event, payload.data);
  });

  ipcMain.handle('run-remote-bootstrap', async (event, { host, username, password, id, sshPort, bcastPort, httpsPort }) => {
    const port = sshPort ?? 22;
    registerSensitiveToken(password);
    jl('info', 'ipc.run-remote-bootstrap.start', { host, username, id, port, bcastPort, httpsPort });

    const send = (label: string, step?: string) =>
      event.sender.send('bootstrap-progress', { id, ts: Date.now(), step, label });

    try {
      const res = await installServerDepsRemotely({
        host,
        username,
        password,
        sshPort: port,
        bcastPort,
        httpsPort,
        onProgress: ({ step, label }: any) => send(label, step),
      });

      send(res.success ? 'Bootstrap complete.' : 'Bootstrap failed.', res.success ? 'done' : 'error');
      jl('info', 'ipc.run-remote-bootstrap.done', { host, id, success: !!res?.success });

      return res;
    } catch (err: any) {
      send('Bootstrap failed.', 'error');
      jl('error', 'ipc.run-remote-bootstrap.error', { host, id, error: err?.message || String(err) });

      return { success: false, error: err?.message || String(err) };
    }
  });

  
  ipcMain.handle('get-os', () => {
    const os = getOS();
    jl('debug', `ipc.get-os: ${os}`);
    return os;
  });
  
  ipcMain.handle('scan-network-fallback', async () => {
    jl('info', 'ipc.scan-network-fallback.start');

    const res = await doFallbackScan();
    jl('info', 'ipc.scan-network-fallback.done', { count: (res || []).length });
    return res;
  });

  ipcMain.handle('logs:read-client', async (_e, opts?: { limit?: number }) => {
    try {
      return readClientLogs(opts?.limit ?? 600);
    } catch (e: any) {
      return {
        ok: false,
        entries: [],
        file: '',
        logDir: path.join(app.getPath('userData'), 'logs'),
        error: e?.message || String(e),
      };
    }
  });


  function notify(message: string) {
    if (!mainWindow || mainWindow.webContents?.isDestroyed()) return;

    mainWindow.webContents.send("notification", message);

    try {
      IPCRouter.getInstance().send(
        'renderer', 'action',
        JSON.stringify({ type: 'notification', message })
        
      );
    } catch { }
    jl('info', 'notify.push', { message, buffered: !rendererIsReady });

    if (!rendererIsReady) bufferedNotifications.push(message);
  }


  IPCRouter.getInstance().addEventListener('action', async (data) => {
  jl('debug', 'ipcrouter.action.received', { data: String(data).slice(0, 200) });

    if (data === "requestHostname") {
          jl('debug', 'ipcrouter.action.requestHostname');

      IPCRouter.getInstance().send('renderer', 'action', JSON.stringify({
        type: "sendHostname",
        hostname: await unwrap(server.getHostname())
      }));
    } else if (data === "show_dashboard") {
          jl('debug', 'ipcrouter.action.show_dashboard');

      IPCRouter.getInstance().send('renderer', 'action', 'show_dashboard');
    }
    else {
      try {
        const message = JSON.parse(data);
              jl('debug', 'ipcrouter.action.parsed', { type: message?.type });

        if (message.type === 'addManualIP') {
                  
          const { ip, manuallyAdded } = message as { ip: string; manuallyAdded?: boolean };
          jl('info', 'ipcrouter.addManualIP.start', { ip });

          // 1) Try Cockpit’s HTTPS on 9090, but DON’T let a throw skip the SSH probe
          let httpsReachable = false;
          try {
            const res = await fetch(`https://${ip}:9090/`, {
              method: 'GET',
              cache: 'no-store',
              signal: AbortSignal.timeout(3000),
            });
            httpsReachable = res.ok;
            // console.debug('HTTPS check:', res.ok ? 'OK' : `status ${res.status}`);
          } catch (err) {
            console.warn('HTTPS check failed:', err);
          }

          // 2) If no HTTPS, fall back to SSH
          let reachable = httpsReachable;
          if (!reachable) {
            // console.debug('Falling back to SSH probe on port 22…');
            reachable = await checkSSH(ip, 3000, 22);
            // console.debug(`SSH probe ${reachable ? 'succeeded' : 'failed'}`);
          }

          // 3) If still unreachable, bail
          if (!reachable) {
            return notify(`Error: Unable to reach ${ip} via HTTPS (9090) or SSH (22)`);
          }

          // 4) success! add to discoveredServers
          const server: Server = {
            ip,
            name: ip,
            status: 'unknown',
            setupComplete: false,
            lastSeen: Date.now(),
            serverName: ip,
            shareName: '',
            setupTime: '',
            serverInfo: {
              moboMake: '',
              moboModel: '',
              serverModel: '',
              aliasStyle: '',
              chassisSize: '',
            },
            manuallyAdded: true,
            fallbackAdded: false,
          };

          let existingServer = discoveredServers.find(eServer => eServer.ip === server.ip);

          try {
            if (!existingServer) {
              discoveredServers.push(server);
            } else {
              existingServer.lastSeen = Date.now();
              existingServer.status = server.status;
              existingServer.setupComplete = server.status == 'complete' ? true : false;
              existingServer.serverName = server.serverName;
              existingServer.shareName = server.shareName;
              existingServer.setupTime = server.setupTime;
              existingServer.serverInfo = server.serverInfo;
            }

          } catch (error) {
            console.error('Add Manual Server-> Fetch error:', error);
          }
          
          attachSetupSSE(ip);

          safeSend('discovered-servers', discoveredServers);
        jl('info', 'ipcrouter.addManualIP.result', { ip, reachable, httpsReachable });

        } else if (message.type === 'rescanServers') {
          jl('info', 'ipcrouter.rescanServers.start', { countBefore: discoveredServers.length });

          // close any live SSE streams first
          for (const s of discoveredServers) detachSetupSSE(s.ip);
          // clear & notify
          discoveredServers = [];
          safeSend('discovered-servers', discoveredServers);

          // kick mDNS
          mDNSClient.query({ questions: [{ name: serviceType, type: 'PTR' }] });

          // after timeout: if still empty, call the same fallback fn
          setTimeout(async () => {
            if (discoveredServers.length === 0) {
              const fallback = await doFallbackScan();
              if (fallback.length) {
                safeSend('discovered-servers', fallback);
              }
            }
          }, TIMEOUT_DURATION);
            jl('info', 'ipcrouter.rescanServers.done', { countAfter: discoveredServers.length });

        } 
      } catch (error) {
        console.error("Failed to handle IPC action:", data, error);
        jl('error', 'ipcrouter.action.parse-error', { data: String(data).slice(0, 200), error: String(error) });

      }
    }
  });

  mainWindow.maximize();

  mainWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  );

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    const rendererPort = process.argv[2];

    mainWindow.loadURL(`http://localhost:${rendererPort}`);
  } else {
    mainWindow.setMenu(null);

    mainWindow.loadFile(join(app.getAppPath(), 'renderer', 'index.html'));
  }

  safeSend('client-ip', getLocalIP());

  // Set up mDNS for service discovery
  const mDNSClient = mdns();
  jl('info', 'mdns.client.created');

  mDNSClient.query({ questions: [{ name: serviceType, type: 'PTR' }] });
  jl('debug', 'mdns.query.ptr', { serviceType });

  const SERVICE_TYPE = '_houstonserver._tcp.local'; 

  const norm = (s?: string) =>
    (s || '').toLowerCase().replace(/\.$/, ''); // strip trailing dot

  const isGoodV4 = (ip: string) =>
    /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ip.startsWith('169.254.');

  type SrvRec = { target: string, port: number };
  type TxtMap = Record<string, string>;

  const srvByInstance = new Map<string, SrvRec>();   // key: instance (SRV.name)
  const txtByInstance = new Map<string, TxtMap>();   // key: instance (SRV.name)
  const aByHost = new Map<string, string>();         // key: A.name (host) → IPv4

  function parseTxt(answer: any): TxtMap {
    const out: TxtMap = {};
    if (answer && Array.isArray(answer.data)) {
      for (const buf of answer.data) {
        const [k, v] = String(buf).split('=');
        if (k) out[k] = v ?? '';
      }
    }
    return out;
  }

  function upsertServerFrom(instanceRaw: string) {
    const instance = norm(instanceRaw);
    const srv = srvByInstance.get(instance);
    if (!srv) return;

    const txt = txtByInstance.get(instance) || {};
    let ip = txt.ip && isGoodV4(txt.ip) ? txt.ip : null;

    if (!ip) {
      const target = norm(srv.target);
      const a = aByHost.get(target);
      if (a && isGoodV4(a)) ip = a;
    }

    if (!ip) return;
    // Nice display name from the SRV instance
    const [bare] = instance.split('._');
    const displayName = bare.endsWith('.local') ? bare : `${bare}.local`;

    const s: Server = {
      ip,
      name: displayName,
      status: 'unknown',
      lastSeen: Date.now(),
      setupComplete: txt.setupComplete === 'true',
      serverName: txt.serverName || displayName,
      shareName: txt.shareName,
      setupTime: txt.setupTime,
      serverInfo: {
        moboMake: txt.moboMake,
        moboModel: txt.moboModel,
        serverModel: txt.serverModel,
        aliasStyle: txt.aliasStyle,
        chassisSize: txt.chassisSize,
      },
      manuallyAdded: false,
      fallbackAdded: false,
    };

    (async () => {
      try {
        // const r = await fetch(`http://${s.ip}:9095/setup-status`);
        // if (r.ok) {
        //   const j = await r.json();
        //   s.status = j.status ?? 'unknown';
        // }
      } catch { }
      // upsert and notify after probe too
      const existing = discoveredServers.find(x => x.ip === s.ip);
      if (!existing) discoveredServers.push(s);
      else Object.assign(existing, s, { lastSeen: Date.now(), fallbackAdded: false });

      safeSend('discovered-servers', discoveredServers);
      safeSend('client-ip', getLocalIP());
    })();

    const existing = discoveredServers.find(x => x.ip === s.ip);
    if (!existing) discoveredServers.push(s);
    else Object.assign(existing, s, { lastSeen: Date.now(), fallbackAdded: false });
    safeSend('discovered-servers', discoveredServers);
    safeSend('client-ip', getLocalIP());
    attachSetupSSE(s.ip);   // initial status comes via SSE immediately
    const sig = mdnsSignature(txt, ip, displayName);
    const prev = mdnsLastSigByIp.get(ip);
    const now  = Date.now();
    const last = mdnsLastLogAt.get(ip) || 0;

    const changed = sig !== prev;
    const frequent = now - last < MDNS_MIN_INTERVAL_MS;

    if (changed || !frequent) {
      jl(changed ? 'info' : 'debug', 'mdns.upsert', {
        instance: instanceRaw,
        ip,
        displayName,
        // log just what changed is fine; avoid huge TXT payloads
        keys: Object.keys(txt),
        changed
      });
      mdnsLastSigByIp.set(ip, sig);
      mdnsLastLogAt.set(ip, now);
    }
  }

  mDNSClient.on('response', (response) => {
    const items = [...(response.answers || []), ...(response.additionals || [])];

    // 1) Cache what we got in this frame
    for (const r of items) {
      if (r.type === 'SRV' && r.name && r.name.toLowerCase().includes(SERVICE_TYPE)) {
        const inst = norm(r.name);
        const data = r.data as any;
        const target = norm(data?.target);
        srvByInstance.set(inst, { target, port: Number(data?.port || 0) });
        mDNSClient.query([
          { name: target, type: 'A' },
          { name: target, type: 'AAAA' },
        ]);
      } else if (r.type === 'TXT' && r.name && r.name.toLowerCase().includes(SERVICE_TYPE)) {
        txtByInstance.set(norm(r.name), parseTxt(r));
      } else if (r.type === 'A' && r.name && typeof r.data === 'string') {
        const host = norm(r.name);
        const ip = r.data;
        if (isGoodV4(ip)) aByHost.set(host, ip);
      }
    }
    jl('debug', 'mdns.response', {
      answers: (response.answers || []).length,
      additionals: (response.additionals || []).length
    });
    // 2) Try to build/refresh any instances we know about
    for (const instance of srvByInstance.keys()) {
      upsertServerFrom(instance);
    }
  });


  const mdnsInterval = setInterval(() => {
    mDNSClient.query({
      questions: [{ name: '_houstonserver._tcp.local', type: 'PTR' }],
    })
    jl('debug', 'mdns.interval.query');

  }, 5000);


  const clearInactiveServerInterval = setInterval(() => {
    const now = Date.now()
    const stale = discoveredServers.filter(
      srv => (now - srv.lastSeen > TIMEOUT_DURATION) && !(srv as any).manuallyAdded
    );

    // close streams for those we’re about to remove
    for (const s of stale) detachSetupSSE(s.ip);
    // keep the rest
    discoveredServers = discoveredServers.filter(
      srv => (now - srv.lastSeen <= TIMEOUT_DURATION) || (srv as any).manuallyAdded === true
    );

    // push the updated list back to the renderer
    safeSend('discovered-servers', discoveredServers)
    jl('debug', 'servers.cleanup.tick', {
      current: discoveredServers.length,
      stale: stale.length
    });

  }, 5000)


  app.on('window-all-closed', function () {
    ipcMain.removeAllListeners('message');
    clearInterval(clearInactiveServerInterval);
    clearInterval(mdnsInterval);
    detachAllSetupSSE();
    mDNSClient.destroy();

    for (const es of setupStreams.values()) {
      try { es.close(); } catch { }
    }
    setupStreams.clear();

    jl('info', 'app.window-all-closed', { platform: process.platform });

    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  return mainWindow
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (_wawevent, webPreferences, _params) => {
    webPreferences.preload = `${__dirname}/webview-preload.js`;
  });
});


app.whenReady().then(() => {
  const resolvedLogDir = checkLogDir();
  initLogging(resolvedLogDir);
  jl('info', 'app.ready', {
    userData: app.getPath('userData'),
    logsDir: resolvedLogDir,
    env: process.env.NODE_ENV || 'production'
  });

  console.debug('userData is here:', app.getPath('userData'))
  console.debug('log dir:', resolvedLogDir);

  // log.info("Logging initialized.");
  // log.info("Log file path:", // log.transports.file.getFile().path);

  const isInternalHost = (hostname: string) => {
    // plain IPv4 or .local – adjust for environment
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
    if (hostname.endsWith('.local')) return true;
    // if (hostname.endsWith('.45drives.internal')) return true;
    return false;
  };

  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    // Let Chromium handle all non-internal hosts (gvt1.com, GitHub, etc.)
    if (!isInternalHost(req.hostname)) {
      return cb(-3); // “use default verification”
    }

    jl('info', 'cert.verify.start', { hostname: req.hostname, pid: process.pid });

    const presented = req.certificate.fingerprint;
    const pinned = getPin(req.hostname);

    // known & matches → allow
    if (pinned && pinned.fingerprint === presented) return cb(0);

    // known & changed → ask to update or block
    if (pinned && pinned.fingerprint !== presented) {
      dialog.showMessageBox({
        type: 'warning',
        message: `Certificate changed for ${req.hostname}`,
        detail: `Pinned: ${pinned.fingerprint}\nPresented: ${presented}\n\nBlock unless you know the cert rotated.`,
        buttons: ['Block', 'Trust & Update Pin'],
        cancelId: 0, defaultId: 0, noLink: true
      }).then(({ response }) => {
        if (response === 1) { rememberPin(req.hostname, presented); cb(0); }
        else cb(-2);
      });
      return;
    }

    // first seen internal host → TOFU prompt
    dialog.showMessageBox({
      type: 'question',
      message: `Trust this server?`,
      detail: `Host: ${req.hostname}\nFingerprint: ${presented}`,
      buttons: ['Cancel', 'Trust'],
      cancelId: 0, defaultId: 1, noLink: true
    }).then(({ response }) => {
      if (response === 1) { rememberPin(req.hostname, presented); cb(0); }
      else cb(-2);
    });
  });

  ipcMain.handle("is-dev", async () => process.env.NODE_ENV === 'development');

  ipcMain.handle('dialog:openFolder', async () => {
    const parent = (mainWindowRef && !mainWindowRef.isDestroyed()) ? mainWindowRef : undefined;
    const result = await (parent
      ? dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
      : dialog.showOpenDialog({ properties: ['openDirectory'] })
    );

    return result.canceled ? null : result.filePaths[0]; // Return full folder path
  });

  createWindow();
  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
    jl('info', 'app.activate', { openWindows: BrowserWindow.getAllWindows().length });
  });
  jl('info', 'window.created');

  // ── Resume detached transfers from previous session ──────────────────────
  pruneOldTransfers()       // remove old completed/failed entries (>7 days)
  resumeDetachedTransfers() // reattach to any still-running rsync processes
});

ipcMain.handle('dialog:pickFiles', async () => {
  jl('debug', 'dialog.pickFiles.open');

  const parent = (mainWindowRef && !mainWindowRef.isDestroyed()) ? mainWindowRef : undefined;
  const { canceled, filePaths } = await (parent
    ? dialog.showOpenDialog(parent, { properties: ['openFile', 'multiSelections'] })
    : dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  );
  if (canceled) return [];

  const allowed: { path: string; name: string; size: number }[] = [];
  let skipped = 0;

  for (const p of filePaths) {
    if (!isOwnedByCurrentUser(p)) {
      skipped++;
      continue;
    }

    const st = fs.statSync(p);
    allowed.push({
      path: p,
      name: path.basename(p),
      size: st.size,
    });
  }

  jl('info', 'dialog.pickFiles.done', {
    requested: filePaths.length,
    allowed: allowed.length,
    skipped,
  });

  // Optional: surface a one-shot notification if items were skipped
  if (skipped > 0) {
    const msg = `Skipped ${skipped} item(s) you don't own or can't read.`;
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send('notification', msg);
    jl('warn', 'dialog.pickFiles.skipped', { skipped });
  }

  return allowed;
});

ipcMain.handle('dialog:pickWatermark', async () => {
  jl('debug', 'dialog.pickWatermark.open');

  const parent = (mainWindowRef && !mainWindowRef.isDestroyed()) ? mainWindowRef : undefined;
  const opts = {
    properties: ['openFile' as const],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
    ],
  };
  const { canceled, filePaths } = await (parent
    ? dialog.showOpenDialog(parent, opts)
    : dialog.showOpenDialog(opts)
  );
  if (canceled || !filePaths.length) return null;

  const p = filePaths[0];
  if (!isOwnedByCurrentUser(p)) {
    jl('warn', 'dialog.pickWatermark.denied', { path: p });
    return null;
  }

  const st = fs.statSync(p);
  let dataUrl: string | null = null;
  try {
    const ext = path.extname(p).toLowerCase().replace('.', '');
    const mime =
      ext === 'png' ? 'image/png' :
      (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
      ext === 'webp' ? 'image/webp' :
      'application/octet-stream';
    const buf = fs.readFileSync(p);
    dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    dataUrl = null;
  }
  return {
    path: p,
    name: path.basename(p),
    size: st.size,
    dataUrl,
  };
});

ipcMain.handle('dialog:pickFolder', async () => {
  const parent = (mainWindowRef && !mainWindowRef.isDestroyed()) ? mainWindowRef : undefined;
  const { canceled, filePaths } = await (parent
    ? dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
    : dialog.showOpenDialog({ properties: ['openDirectory'] })
  );
  if (canceled || !filePaths.length) return [];

  const dir = filePaths[0];
  const entries = fs.readdirSync(dir);

  const allowed: { path: string; name: string; size: number }[] = [];
  let skipped = 0;

  for (const name of entries) {
    const fp = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(fp);
    } catch {
      skipped++;
      continue;
    }

    if (!st.isFile()) continue;

    if (!isOwnedByCurrentUser(fp)) {
      skipped++;
      continue;
    }

    allowed.push({ path: fp, name, size: st.size });
  }

  jl('info', 'dialog.pickFolder.done', {
    dir,
    requested: entries.length,
    allowed: allowed.length,
    skipped,
  });

  if (skipped > 0) {
    const msg = `Skipped ${skipped} item(s) in ${dir} you don't own or can't read.`;
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send('notification', msg);
    jl('warn', 'dialog.pickFolder.skipped', { dir, skipped });
  }

  return allowed;
});

export type RsyncStartOpts = {
  id: string
  src: string           // local path (file or folder)
  host: string
  user: string
  destDir: string       // remote directory (no filename)
  port?: number         // API port for ingest + also ssh port if your runner uses it (see runWinSftp below)
  keyPath?: string      // ~/.ssh/id_ed25519 etc (optional if using agent)
  bwlimitKb?: number    // optional bandwidth limit (KB/s)
  extraArgs?: string[]  // any other rsync flags
  shareRoot?: string
  knownHostsPath?: string;
  transcodeProxy?: boolean
  proxyQualities?: string[]
  watermark?: boolean
  watermarkFileName?: string
  watermarkProxyQualities?: string[]
  noIngest?: boolean
  apiToken?: string
}

const inflightRsync = new Map<string, ChildProcessWithoutNullStreams | null>()
const inflightTailers = new Map<string, LogTailer>()
const inflightPids = new Map<string, number>()
const pendingRsyncCancel = new Set<string>()
const MAX_CONCURRENT_MAIN = 3

// ── Local copy for same-machine (localhost) transfers ─────────────────────────

function isLocalHost(host: string): boolean {
  const h = String(host || '').trim().toLowerCase()
  return h === '127.0.0.1' || h === 'localhost' || h === '::1'
}

/**
 * Copy a file locally by calling the houston-broadcaster API.
 * The server runs as root and can write to any directory under SHARE_ROOT.
 * For directory transfers, each file is copied individually via the API.
 */
async function runLocalCopy(opts: {
  id: string
  src: string
  destDir: string
  host: string
  shareRoot?: string
  win?: BrowserWindow | null
}): Promise<boolean> {
  const { id, src, destDir, host, win } = opts
  const apiPort = 9095

  const emit = (parsed: any) => {
    try { win?.webContents?.send(`upload:progress:${id}`, parsed) } catch {}
  }

  emit({ percent: 0, raw: 'copying locally…' })

  // Resolve share root so we can send a relative dest to the API
  const shareRoot = opts.shareRoot || await getShareRootForHost(host, apiPort)
  const destRel = normalizeDestRel(destDir, shareRoot)

  if (!destRel) {
    jl('error', 'localcopy.bad-dest', { id, destDir, shareRoot })
    emit({ raw: 'local copy failed: could not determine relative destination' })
    return false
  }

  const base = `http://127.0.0.1:${apiPort}`

  const srcIsDir = (() => { try { return fs.statSync(src).isDirectory() } catch { return false } })()

  if (srcIsDir) {
    // Collect all files in the directory tree
    const allFiles: { abs: string; rel: string }[] = []
    const walkDir = (dir: string, relBase: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name)
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walkDir(abs, rel)
        } else if (entry.isFile()) {
          allFiles.push({ abs, rel })
        }
      }
    }
    walkDir(src, '')

    if (allFiles.length === 0) {
      jl('warn', 'localcopy.empty-dir', { id, src })
      emit({ percent: 100, raw: 'done (empty directory)' })
      return true
    }

    const dirName = path.basename(src)
    for (let i = 0; i < allFiles.length; i++) {
      const f = allFiles[i]
      const fileDest = `${destRel}/${dirName}/${path.dirname(f.rel)}`.replace(/\/\.$/, '')
      const pct = Math.round(((i + 1) / allFiles.length) * 100)

      const params = new URLSearchParams()
      params.set('src', f.abs)
      params.set('dest', fileDest)
      params.set('name', path.basename(f.rel))

      try {
        const r = await fetch(`${base}/api/files/local-copy?${params}`, { method: 'POST' })
        const j: any = await r.json().catch(() => ({}))
        if (!r.ok || !j?.ok) {
          jl('error', 'localcopy.api.failed', { id, file: f.abs, status: r.status, resp: j })
          emit({ raw: `local copy failed: ${j?.error || r.statusText}` })
          return false
        }
      } catch (e: any) {
        jl('error', 'localcopy.api.error', { id, file: f.abs, error: e?.message || String(e) })
        emit({ raw: `local copy failed: ${e?.message || 'API error'}` })
        return false
      }
      emit({ percent: pct, raw: `${f.rel} (${i + 1}/${allFiles.length})` })
    }
  } else {
    // Single file copy
    const params = new URLSearchParams()
    params.set('src', src)
    params.set('dest', destRel)

    try {
      const r = await fetch(`${base}/api/files/local-copy?${params}`, { method: 'POST' })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok || !j?.ok) {
        jl('error', 'localcopy.api.failed', { id, src, dest: destRel, status: r.status, resp: j })
        emit({ raw: `local copy failed: ${j?.error || r.statusText}` })
        return false
      }
      jl('info', 'localcopy.api.ok', { id, src, dest: j.dest, size: j.size })
    } catch (e: any) {
      jl('error', 'localcopy.api.error', { id, src, error: e?.message || String(e) })
      emit({ raw: `local copy failed: ${e?.message || 'API error'}` })
      return false
    }
  }

  emit({ percent: 100, raw: 'done' })
  jl('info', 'localcopy.done', { id, src, destDir })
  return true
}

// ── Resume detached transfers from a previous session ─────────────────────────

/**
 * On app start, inspect the persisted transfer store.
 * For each "running" entry:
 *   • PID still alive → reattach a log tailer so the renderer gets progress.
 *   • PID dead → check if rsync finished (100% in log).
 *     – If yes → run ingest and mark completed.
 *     – If no  → re-spawn rsync (--partial makes it a fast delta) and track.
 */
function resumeDetachedTransfers() {
  const running = getRunningTransfers()
  if (running.length) {
    jl('info', 'resume.detached.found', { count: running.length })
  }

  for (const t of running) {
    if (t.pid && isPidAlive(t.pid)) {
      // Still going — just reattach tailer for live progress
      jl('info', 'resume.detached.reattach', { id: t.id, pid: t.pid })
      const win = BrowserWindow.getAllWindows()[0] ?? undefined
      const tailer = reattachTailer({ id: t.id, logFile: t.logFile!, pid: t.pid, win })
      inflightPids.set(t.id, t.pid)
      inflightTailers.set(t.id, tailer)

      // When tailer resolves (PID dies), handle completion
      tailer.done.then(ok => handleDetachedCompletion(t, ok))
    } else {
      // PID is gone. Check log to see if it completed successfully.
      jl('info', 'resume.detached.pid_dead', { id: t.id, pid: t.pid })
      const ok = t.logFile ? lastLogReached100(t.logFile) : false

      if (ok) {
        jl('info', 'resume.detached.completed', { id: t.id })
        handleDetachedCompletion(t, true)
      } else {
        // Transfer was interrupted — re-spawn rsync (--partial resumes)
        jl('info', 'resume.detached.respawn', { id: t.id, src: t.src })
        respawnTransfer(t)
      }
    }
  }

  // Also start any queued items (from a previous session)
  drainPersistedQueue()
}

/** Read the last chunk of a log file and check if rsync reached 100% */
function lastLogReached100(logFile: string): boolean {
  try {
    const tail = fs.readFileSync(logFile, 'utf-8').slice(-4096)
    const matches = [...tail.matchAll(/(\d+(?:\.\d+)?)%/g)]
    if (!matches.length) return false
    return Number(matches[matches.length - 1][1]) >= 100
  } catch { return false }
}

/** Handle a detached transfer that has finished (PID died) */
async function handleDetachedCompletion(t: PersistedTransfer, ok: boolean) {
  inflightPids.delete(t.id)
  inflightTailers.delete(t.id)

  const win = BrowserWindow.getAllWindows()[0]

  if (!ok) {
    markTransfer(t.id, 'failed')
    win?.webContents?.send(`upload:done:${t.id}`, { error: 'rsync failed (detached)' })
    jl('info', 'resume.detached.failed', { id: t.id })
    return
  }

  markTransfer(t.id, 'completed')
  win?.webContents?.send(`upload:done:${t.id}`, { ok: true })

  // Run ingest if applicable
  let isDir = false
  try { isDir = fs.statSync(t.src).isDirectory() } catch { /* src may be gone after restart */ }

  if (!isDir && !t.noIngest) {
    await runIngestForTransfer(t, win)
  }

  jl('info', 'resume.detached.done', { id: t.id })

  // Try to start next queued item now that a slot is free
  drainPersistedQueue()
}

// ── Drain persisted queue (start queued items respecting concurrency) ─────────

function drainPersistedQueue() {
  const queued = getQueuedTransfers()
  if (!queued.length) return

  const runningCount = inflightPids.size
  let available = MAX_CONCURRENT_MAIN - runningCount

  jl('info', 'queue.drain', { queued: queued.length, running: runningCount, available })

  for (const t of queued) {
    if (available <= 0) break
    startQueuedTransfer(t)
    available--
  }
}

/** Start a queued transfer (fresh rsync spawn, not a respawn) */
function startQueuedTransfer(t: PersistedTransfer) {
  const knownHostsPath = t.knownHostsPath || path.join(app.getPath('userData'), 'known_hosts')
  const keyPath = t.keyPath || defaultClientKey()

  // Source file may have been removed — skip if so
  if (!fs.existsSync(t.src)) {
    jl('warn', 'queue.src_gone', { id: t.id, src: t.src })
    markTransfer(t.id, 'failed')
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents?.send(`upload:done:${t.id}`, { error: 'Source file no longer exists' })
    drainPersistedQueue()
    return
  }

  // ── Same-machine: local copy instead of rsync ──────────────────────
  if (isLocalHost(t.host)) {
    const win = BrowserWindow.getAllWindows()[0] ?? undefined
    jl('info', 'queue.local', { id: t.id, src: t.src, destDir: t.destDir })
    markTransferRunning(t.id, 0, '')
    runLocalCopy({ id: t.id, src: t.src, destDir: t.destDir, host: t.host, shareRoot: t.shareRoot, win })
      .then(ok => handleDetachedCompletion({ ...t, pid: 0, logFile: '', status: 'running' }, ok))
    return
  }

  try { if (!fs.existsSync(knownHostsPath)) fs.writeFileSync(knownHostsPath, '') } catch { }

  const picked = buildRsyncCmdAndArgs({
    id: t.id, src: t.src, host: t.host, user: t.user, destDir: t.destDir,
    port: t.port, keyPath, bwlimitKb: t.bwlimitKb, extraArgs: t.extraArgs,
    shareRoot: t.shareRoot, knownHostsPath,
    transcodeProxy: t.transcodeProxy, proxyQualities: t.proxyQualities,
    watermark: t.watermark, watermarkFileName: t.watermarkFileName,
    watermarkProxyQualities: t.watermarkProxyQualities, noIngest: t.noIngest,
  })

  const logFile = makeLogPath(t.id)
  const win = BrowserWindow.getAllWindows()[0] ?? undefined

  const { pid, tailer } = runRsyncDetached({
    id: t.id, cmd: picked.cmd, args: picked.args, logFile, win,
  })

  // Update persisted record: queued → running
  markTransferRunning(t.id, pid, logFile)
  inflightPids.set(t.id, pid)
  inflightTailers.set(t.id, tailer)

  jl('info', 'queue.started', { id: t.id, pid, src: t.src })

  tailer.done.then(ok => handleDetachedCompletion({ ...t, pid, logFile, status: 'running' }, ok))
}

/** Re-spawn an interrupted rsync transfer */
function respawnTransfer(t: PersistedTransfer) {
  const knownHostsPath = t.knownHostsPath || path.join(app.getPath('userData'), 'known_hosts')
  const keyPath = t.keyPath || defaultClientKey()

  // Source file may have been removed — skip if so
  if (!fs.existsSync(t.src)) {
    jl('warn', 'resume.detached.src_gone', { id: t.id, src: t.src })
    markTransfer(t.id, 'failed')
    return
  }

  // ── Same-machine: local copy instead of rsync ──────────────────────
  if (isLocalHost(t.host)) {
    const win = BrowserWindow.getAllWindows()[0] ?? undefined
    jl('info', 'resume.local', { id: t.id, src: t.src, destDir: t.destDir })
    runLocalCopy({ id: t.id, src: t.src, destDir: t.destDir, host: t.host, shareRoot: t.shareRoot, win })
      .then(ok => handleDetachedCompletion(t, ok))
    return
  }

  try { if (!fs.existsSync(knownHostsPath)) fs.writeFileSync(knownHostsPath, '') } catch { }

  const picked = buildRsyncCmdAndArgs({
    id: t.id, src: t.src, host: t.host, user: t.user, destDir: t.destDir,
    port: t.port, keyPath, bwlimitKb: t.bwlimitKb, extraArgs: t.extraArgs,
    shareRoot: t.shareRoot, knownHostsPath,
    transcodeProxy: t.transcodeProxy, proxyQualities: t.proxyQualities,
    watermark: t.watermark, watermarkFileName: t.watermarkFileName,
    watermarkProxyQualities: t.watermarkProxyQualities, noIngest: t.noIngest,
  })

  const logFile = t.logFile ?? makeLogPath(t.id)  // reuse the same log file (append mode)
  const win = BrowserWindow.getAllWindows()[0] ?? undefined

  const { pid, tailer } = runRsyncDetached({
    id: t.id, cmd: picked.cmd, args: picked.args, logFile, win,
  })

  // Update persisted record with new PID
  t.pid = pid
  upsertTransfer(t)
  inflightPids.set(t.id, pid)
  inflightTailers.set(t.id, tailer)

  jl('info', 'resume.detached.respawned', { id: t.id, pid })

  tailer.done.then(ok => handleDetachedCompletion(t, ok))
}

/** Run the ingest step for a completed transfer (mirrors the logic in upload:start) */
async function runIngestForTransfer(t: PersistedTransfer, win?: BrowserWindow | null) {
  const fileName = t.fileName || path.basename(t.src)
  const apiPort = 9095
  const base = `http://${t.host}:${apiPort}`
  const shareRoot = t.shareRoot || await getShareRootForHost(t.host, apiPort)
  const destRel = normalizeDestRel(t.destDir, shareRoot)

  jl('info', 'ingest.dest.normalize.resumed', {
    id: t.id, host: t.host, destDir: t.destDir,
    shareRoot: shareRoot || null, destRel,
  })

  const wantsProxy = t.transcodeProxy === true
  const proxyQualities = Array.isArray(t.proxyQualities)
    ? t.proxyQualities.filter(q => typeof q === 'string' && q.length)
    : []
  const watermarkProxyQualities = Array.isArray(t.watermarkProxyQualities)
    ? t.watermarkProxyQualities.filter(q => typeof q === 'string' && q.length)
    : []
  const rawWatermarkFileName = typeof t.watermarkFileName === 'string'
    ? String(t.watermarkFileName).trim() : ''
  const wantsWatermark = t.watermark === true && rawWatermarkFileName.length > 0
  const isVideo = (() => {
    const ext = path.extname(fileName).toLowerCase().replace('.', '')
    const videoExts = new Set([
      'mp4','mov','m4v','mkv','webm','avi','wmv','flv',
      'mpg','mpeg','m2v','3gp','3g2','mxf','ts','m2ts','mts',
      'ogv','vob','divx','f4v','asf','rm','rmvb','m4s',
      'r3d','braw','ari','cine','dav',
    ])
    return videoExts.has(ext)
  })()
  const wantsProxyForFile = wantsProxy && isVideo
  const wantsWatermarkForFile = wantsWatermark && isVideo
  const wantsHlsForFile = wantsProxy && isVideo

  // simplified: use only the raw watermark path (skip multi-candidate logic for resumed)
  const params = new URLSearchParams()
  params.set('dest', destRel)
  params.set('name', fileName)
  params.set('uploader', os.userInfo().username)
  if (wantsHlsForFile) params.set('hls', '1')
  if (wantsProxyForFile) params.set('proxy', '1')
  if (wantsProxyForFile && proxyQualities.length) params.set('proxyQualities', proxyQualities.join(','))
  if (wantsWatermarkForFile && rawWatermarkFileName) {
    params.set('watermark', '1')
    params.set('watermarkFile', rawWatermarkFileName)
    if (watermarkProxyQualities.length) params.set('watermarkProxyQualities', watermarkProxyQualities.join(','))
  }

  const url = `${base}/api/ingest/register?${params.toString()}`
  const resumeHeaders: Record<string, string> = {}
  if (t.apiToken) resumeHeaders['Authorization'] = `Bearer ${t.apiToken}`
  try {
    const r = await fetch(url, { method: 'POST', headers: resumeHeaders })
    const text = await r.text()
    let j: any = {}
    try { j = JSON.parse(text) } catch { j = { raw: text } }
    jl('info', 'ingest.register.resumed', { id: t.id, ok: r.ok, status: r.status, resp: j })

    if (j?.ok) {
      const fileId = Number(j.fileId ?? j.file_id ?? j?.file?.id)
      const assetVersionId = Number(j.assetVersionId ?? j.asset_version_id ?? j?.assetVersion?.id)
      const jobs = j.jobs || { queuedKinds: [], skippedKinds: [] }

      if (Number.isFinite(fileId) && fileId > 0) {
        win?.webContents?.send(`upload:ingest:${t.id}`, {
          ok: true, fileId,
          assetVersionId: Number.isFinite(assetVersionId) ? assetVersionId : null,
          host: t.host, apiPort,
          transcodes: Number.isFinite(assetVersionId) ? [{ assetVersionId, jobs }] : [],
        })
      }
    }
  } catch (e: any) {
    jl('warn', 'ingest.register.resumed.failed', { id: t.id, error: e?.message || String(e), url })
  }
}

// ── IPC: list persisted transfers for the renderer ────────────────────────────

ipcMain.handle('upload:list-persisted', async () => {
  const running = getRunningTransfers()
  const alive = running.filter(t => (t.pid && isPidAlive(t.pid)) || inflightPids.has(t.id))
  const queued = getQueuedTransfers()
  return [...alive, ...queued].map(t => ({
    id: t.id,
    fileName: t.fileName,
    fileSize: t.fileSize,
    host: t.host,
    destDir: t.destDir,
    startedAt: t.startedAt,
    status: t.status,
  }))
})

// ── IPC: persist a batch of queued uploads ────────────────────────────────────

export type QueuedUploadItem = {
  src: string
  fileName: string
  fileSize?: number
  host: string
  user: string
  destDir: string
  port?: number
  keyPath?: string
  shareRoot?: string
  knownHostsPath?: string
  transcodeProxy?: boolean
  proxyQualities?: string[]
  watermark?: boolean
  watermarkFileName?: string
  watermarkProxyQualities?: string[]
  noIngest?: boolean
  apiToken?: string
}

ipcMain.handle('upload:persist-queue', async (_event, items: QueuedUploadItem[]) => {
  if (!Array.isArray(items)) return
  for (const item of items) {
    const id = uuidv4()
    upsertTransfer({
      id,
      src: item.src,
      host: item.host,
      user: item.user,
      destDir: item.destDir,
      port: item.port,
      keyPath: item.keyPath,
      shareRoot: item.shareRoot,
      knownHostsPath: item.knownHostsPath,
      transcodeProxy: item.transcodeProxy,
      proxyQualities: item.proxyQualities,
      watermark: item.watermark,
      watermarkFileName: item.watermarkFileName,
      watermarkProxyQualities: item.watermarkProxyQualities,
      noIngest: item.noIngest,
      apiToken: item.apiToken,
      status: 'queued',
      startedAt: Date.now(),
      fileName: item.fileName,
      fileSize: item.fileSize,
    })
  }
  jl('info', 'upload.persist-queue', { count: items.length })
})

ipcMain.on('upload:start', async (event, opts: RsyncStartOpts) => {
  const { id } = opts
  if (opts.apiToken) registerSensitiveToken(opts.apiToken)
  const knownHostsPath = opts.knownHostsPath || path.join(app.getPath('userData'), 'known_hosts')
  const keyPath = opts.keyPath || defaultClientKey()
  const src = opts.src

  if (!isOwnedByCurrentUser(src)) {
    const msg = 'Source is not owned by this user or is not readable.'
    jl('warn', 'upload.src.denied', { id, src })
    event.sender.send(`upload:done:${id}`, { error: msg })
    return
  }

  try { if (!fs.existsSync(knownHostsPath)) fs.writeFileSync(knownHostsPath, '') } catch { }

  if (inflightRsync.has(id) || inflightPids.has(id)) {
    event.sender.send(`upload:done:${id}`, { error: 'duplicate id' })
    return
  }

  jl('info', 'upload.start', { id, host: opts.host, user: opts.user, src: opts.src, destDir: opts.destDir })
  inflightRsync.set(id, null)
  if (pendingRsyncCancel.delete(id)) {
    event.sender.send(`upload:done:${id}`, { error: 'canceled' })
    inflightRsync.delete(id)
    jl('info', 'upload.start.canceled-before-run', { id })
    return
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1) TRANSFER
    // ─────────────────────────────────────────────────────────────────────────
    if (isLocalHost(opts.host)) {
      // ── Same-machine: direct file copy, no SSH/rsync needed ──────────
      jl('info', 'upload.local', { id, src, destDir: opts.destDir })
      inflightRsync.delete(id)
      removeQueuedMatch(src, opts.host, opts.destDir)

      const ok = await runLocalCopy({
        id,
        src,
        destDir: opts.destDir,
        host: opts.host,
        shareRoot: opts.shareRoot,
        win: BrowserWindow.getAllWindows()[0],
      })

      if (!ok) {
        event.sender.send(`upload:done:${id}`, { error: 'local copy failed' })
        jl('info', 'upload.local.failed', { id })
        return
      }
    } else if (process.platform === 'win32') {
      event.sender.send(`upload:progress:${id}`, { percent: 0, raw: 'starting' })

      // NOTE: runWinSftp expects SSH port (22) normally.
      // If  opts.port is the API port (9095), do not reuse it for SSH.
      // If separate sshPort, pass that instead. For now default to 22.
      const sshPort = 22

      await runWinSftp({
        id,
        src: opts.src,
        host: opts.host,
        user: opts.user,
        destDir: opts.destDir,
        port: sshPort,
        keyPath,
        onProgress: (p) => {
          event.sender.send(`upload:progress:${id}`, p)
        },
      })

      event.sender.send(`upload:progress:${id}`, { percent: 100, raw: 'done' })
      // Do NOT return; ingest below must run for Windows too.
    } else {
      const picked = buildRsyncCmdAndArgs({ ...opts, keyPath, knownHostsPath })

      // ── Detached spawn: survives app closure ─────────────────────────
      const logFile = makeLogPath(id)
      const { pid, tailer } = runRsyncDetached({
        id,
        cmd: picked.cmd,
        args: picked.args,
        logFile,
        win: BrowserWindow.getAllWindows()[0],
      })

      // Track PID so cancel handler can kill it
      inflightPids.set(id, pid)
      inflightTailers.set(id, tailer)
      inflightRsync.delete(id) // no longer using the ChildProcess map slot

      // Remove matching queued record (this upload is now running with its own ID)
      removeQueuedMatch(src, opts.host, opts.destDir)

      // Persist to disk so a restart can reattach
      let fileSize: number | undefined
      try { fileSize = fs.statSync(src).size } catch { /* ok */ }

      upsertTransfer({
        id, pid, logFile, src,
        host: opts.host, user: opts.user, destDir: opts.destDir,
        port: opts.port, keyPath, bwlimitKb: opts.bwlimitKb,
        extraArgs: opts.extraArgs, shareRoot: opts.shareRoot,
        knownHostsPath, transcodeProxy: opts.transcodeProxy,
        proxyQualities: opts.proxyQualities, watermark: opts.watermark,
        watermarkFileName: opts.watermarkFileName,
        watermarkProxyQualities: opts.watermarkProxyQualities,
        noIngest: opts.noIngest,
        apiToken: opts.apiToken,
        status: 'running', startedAt: Date.now(),
        fileName: path.basename(src), fileSize,
      })

      if (pendingRsyncCancel.delete(id)) {
        try { process.kill(pid, 'SIGINT') } catch { }
        jl('info', 'upload.cancel.kill-after-spawn', { id })
      }

      // Wait for rsync to finish (detected by PID death + log parsing)
      const ok = await tailer.done

      inflightPids.delete(id)
      inflightTailers.delete(id)

      if (!ok) {
        markTransfer(id, 'failed')
        event.sender.send(`upload:done:${id}`, { error: 'rsync failed (detached)' })
        jl('info', 'rsync.detached.failed', { id, pid })
        return
      }

      markTransfer(id, 'completed')
    }

    // Transfer success
    event.sender.send(`upload:done:${id}`, { ok: true })

    // ─────────────────────────────────────────────────────────────────────────
    // 2) INGEST (single files only)
    // ─────────────────────────────────────────────────────────────────────────
    let isDir = false
    try { isDir = fs.statSync(src).isDirectory() } catch { }

    if (!isDir && !opts.noIngest) {
      const fileName = path.basename(src)

      const apiPort = 9095
      const base = `http://${opts.host}:${apiPort}`

      const shareRoot = opts.shareRoot || await getShareRootForHost(opts.host, apiPort)
      const destRel = normalizeDestRel(opts.destDir, shareRoot)

      jl('info', 'ingest.dest.normalize', {
        id,
        host: opts.host,
        destDir: opts.destDir,
        shareRoot: shareRoot || null,
        destRel,
      })

      const wantsProxy = (opts as any).transcodeProxy === true
      const proxyQualities = Array.isArray((opts as any).proxyQualities)
        ? (opts as any).proxyQualities.filter((q: any) => typeof q === 'string' && q.length)
        : []
      const watermarkProxyQualities = Array.isArray((opts as any).watermarkProxyQualities)
        ? (opts as any).watermarkProxyQualities.filter((q: any) => typeof q === 'string' && q.length)
        : []
      const rawWatermarkFileName =
        typeof (opts as any).watermarkFileName === 'string'
          ? String((opts as any).watermarkFileName).trim()
          : ''
      const wantsWatermark =
        (opts as any).watermark === true &&
        rawWatermarkFileName.length > 0
      const isVideo = (() => {
        const ext = path.extname(fileName || '').toLowerCase().replace('.', '');
        const videoExts = new Set([
          'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
          'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
          'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
          'r3d', 'braw', 'ari', 'cine', 'dav',
        ]);
        return videoExts.has(ext);
      })();
      const wantsProxyForFile = wantsProxy && isVideo
      const wantsWatermarkForFile = wantsWatermark && isVideo
      const wantsHlsForFile = wantsProxy && isVideo

      const watermarkCandidates: string[] = (() => {
        if (!wantsWatermarkForFile) return ['']
        const out: string[] = []
        const seen = new Set<string>()
        const add = (v: string) => {
          const s = String(v || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
          if (!s || seen.has(s)) return
          seen.add(s)
          out.push(s)
        }

        const normalizedRaw = rawWatermarkFileName.replace(/\\/g, '/').replace(/^\/+/, '').trim()
        const baseName = path.posix.basename(normalizedRaw || rawWatermarkFileName).trim()
        const destRootSeg = String(destRel || '').replace(/^\/+/, '').split('/').filter(Boolean)[0] || ''

        add(normalizedRaw)
        if (baseName) add(baseName)
        if (baseName) add(`.45flow/watermarks/${baseName}`)
        if (destRootSeg && baseName) add(`${destRootSeg}/.45flow/watermarks/${baseName}`)
        if (destRootSeg && normalizedRaw && !normalizedRaw.startsWith(destRootSeg + '/')) {
          add(`${destRootSeg}/${normalizedRaw}`)
        }
        return out.length ? out : ['']
      })()

      for (let i = 0; i < watermarkCandidates.length; i++) {
        const watermarkFileCandidate = watermarkCandidates[i]
        const params = new URLSearchParams()
        params.set('dest', destRel)
        params.set('name', fileName)
        params.set('uploader', os.userInfo().username)
        if (wantsHlsForFile) params.set('hls', '1')
        if (wantsProxyForFile) params.set('proxy', '1')
        if (wantsProxyForFile && proxyQualities.length) params.set('proxyQualities', proxyQualities.join(','))
        if (wantsWatermarkForFile && watermarkFileCandidate) {
          params.set('watermark', '1')
          params.set('watermarkFile', watermarkFileCandidate)
          if (watermarkProxyQualities.length) {
            params.set('watermarkProxyQualities', watermarkProxyQualities.join(','))
          }
        }

        const url = `${base}/api/ingest/register?${params.toString()}`
        const ingestHeaders: Record<string, string> = {}
        if (opts.apiToken) ingestHeaders['Authorization'] = `Bearer ${opts.apiToken}`
        try {
          const r = await fetch(url, { method: 'POST', headers: ingestHeaders })
          const text = await r.text()
          let j: any = {}
          try { j = JSON.parse(text) } catch { j = { raw: text } }
          const requestId = String(
            r.headers.get('x-request-id') ||
            (typeof j?.requestId === 'string' ? j.requestId : '')
          ).trim()

          jl('info', 'ingest.register', { id, ok: r.ok, status: r.status, requestId: requestId || undefined, resp: j, watermarkFileCandidate })

          if (!r.ok || !j?.ok) {
            jl('warn', 'ingest.register.not_ok', { id, status: r.status, requestId: requestId || undefined, resp: j, url, watermarkFileCandidate })
          }

          if (j?.ok) {
            const fileId = Number(j.fileId ?? j.file_id ?? j?.file?.id)
            const assetVersionId = Number(j.assetVersionId ?? j.asset_version_id ?? j?.assetVersion?.id)
            const jobs = j.jobs || { queuedKinds: [], skippedKinds: [] }

            if (Number.isFinite(fileId) && fileId > 0) {
              if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) {
                jl('warn', 'ingest.register.missing_asset_version', { id, fileId, resp: j })
              }
              event.sender.send(`upload:ingest:${id}`, {
                ok: true,
                fileId,
                assetVersionId: Number.isFinite(assetVersionId) ? assetVersionId : null,
                host: opts.host,
                apiPort,
                transcodes: Number.isFinite(assetVersionId) ? [{
                  assetVersionId,
                  jobs,
                }] : [],
              })
            }
            break
          } else {
            const errText = String(j?.error || '').toLowerCase()
            const watermarkMissing = /watermark.*not found/.test(errText)
            const canRetryWatermark =
              wantsWatermarkForFile &&
              watermarkMissing &&
              i < watermarkCandidates.length - 1

            if (canRetryWatermark) {
              jl('warn', 'ingest.register.watermark_retry', {
                id,
                attempt: i + 1,
                watermarkFileCandidate,
                nextWatermarkFileCandidate: watermarkCandidates[i + 1],
              })
              continue
            }

            event.sender.send(`upload:ingest:${id}`, {
              ok: false,
              error: j?.error || 'ingest not ok',
              status: r.status,
              requestId: requestId || null,
              destRel,
              name: fileName,
              existing: j?.existing || null,
              assetVersionId: j?.assetVersionId || j?.asset_version_id || null,
            })
            break
          }
        } catch (e: any) {
          jl('warn', 'ingest.register.failed', { id, error: e?.message || String(e), url, watermarkFileCandidate })
          break
        }
      }
    }

    jl('info', 'upload.done', { id, ok: true })
  } catch (err: any) {
    event.sender.send(`upload:done:${id}`, { error: err?.message || 'spawn error' })
    jl('error', 'upload.error', { id, error: err?.message || String(err) })
  } finally {
    inflightRsync.delete(id)
    inflightPids.delete(id)
    inflightTailers.delete(id)
    pendingRsyncCancel.delete(id)
  }
})

// One cancel handler only.
// Handles four states:
// - detached PID tracked (kill by PID)
// - active child process (kill immediately)
// - upload id registered but child not attached yet (mark pending)
// - cancel sent before upload:start processed (queue by id)
ipcMain.on('upload:cancel', (_event, { id }) => {
  // Check detached PID first
  const pid = inflightPids.get(id)
  if (pid) {
    try { process.kill(pid, 'SIGINT') } catch { }
    const tailer = inflightTailers.get(id)
    tailer?.stop()
    markTransfer(id, 'canceled')
    jl('info', 'upload.cancel.detached', { id, pid })
    return
  }

  const p = inflightRsync.get(id)
  if (p) {
    try { p.kill('SIGINT') } catch { }
    jl('info', 'upload.cancel', { id })
  } else if (inflightRsync.has(id)) {
    pendingRsyncCancel.add(id)
    jl('info', 'upload.cancel.pending', { id })
  } else {
    pendingRsyncCancel.add(id)
    jl('info', 'upload.cancel.queued', { id })
  }
})
