// src/main/transfers/transfer-store.ts
//
// Persists detached-rsync metadata to a JSON file in the user-data dir
// so uploads can survive app restarts.

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export type PersistedTransfer = {
  id: string;
  pid?: number;            // undefined for queued items
  logFile?: string;        // undefined for queued items
  src: string;             // local source path
  host: string;
  user: string;
  destDir: string;
  port?: number;
  keyPath?: string;
  bwlimitKb?: number;
  extraArgs?: string[];
  shareRoot?: string;
  knownHostsPath?: string;
  transcodeProxy?: boolean;
  proxyQualities?: string[];
  watermark?: boolean;
  watermarkFileName?: string;
  watermarkProxyQualities?: string[];
  noIngest?: boolean;
  apiToken?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  startedAt: number;       // epoch ms
  completedAt?: number;
  fileName: string;        // basename for display
  fileSize?: number;       // bytes, when known
};

const STORE_FILENAME = 'detached-transfers.json';

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILENAME);
}

function logDir(): string {
  const d = path.join(app.getPath('userData'), 'transfer-logs');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* exists */ }
  return d;
}

/** Generate a unique log-file path for a given transfer id */
export function makeLogPath(id: string): string {
  return path.join(logDir(), `${id}.log`);
}

// ── Read / write helpers ────────────────────────────────────────────────────

function readAll(): PersistedTransfer[] {
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list: PersistedTransfer[]): void {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(list, null, 2), 'utf-8');
  } catch { /* best-effort */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Save or update a single transfer record */
export function upsertTransfer(t: PersistedTransfer): void {
  const list = readAll();
  const idx = list.findIndex(x => x.id === t.id);
  if (idx >= 0) list[idx] = t;
  else list.push(t);
  writeAll(list);
}

/** Get all persisted transfers */
export function getAllTransfers(): PersistedTransfer[] {
  return readAll();
}

/** Get transfers that are still marked as 'running' */
export function getRunningTransfers(): PersistedTransfer[] {
  return readAll().filter(t => t.status === 'running');
}

/** Get a single transfer by id */
export function getTransfer(id: string): PersistedTransfer | undefined {
  return readAll().find(t => t.id === id);
}

/** Mark a transfer as completed / failed / canceled */
export function markTransfer(id: string, status: 'completed' | 'failed' | 'canceled'): void {
  const list = readAll();
  const t = list.find(x => x.id === id);
  if (!t) return;
  t.status = status;
  t.completedAt = Date.now();
  writeAll(list);
}

/** Remove a transfer from the store (e.g. after it's been ingested) */
export function removeTransfer(id: string): void {
  const list = readAll().filter(x => x.id !== id);
  writeAll(list);
}

/** Remove transfers older than `maxAgeMs` that are in a terminal state */
export function pruneOldTransfers(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  const list = readAll().filter(t => {
    if (t.status === 'running' || t.status === 'queued') return true; // never prune active/queued
    const age = now - (t.completedAt ?? t.startedAt);
    return age < maxAgeMs;
  });
  writeAll(list);
}

/** Check whether a PID is still alive */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

/** Get transfers that are still queued (not yet started) */
export function getQueuedTransfers(): PersistedTransfer[] {
  return readAll().filter(t => t.status === 'queued');
}

/** Clean up orphaned 'running' transfers on app startup - mark as failed if process is dead */
export function cleanupOrphanedRunning(): void {
  const list = readAll();
  let changed = false;
  
  for (const t of list) {
    if (t.status === 'running') {
      // If no PID or PID is dead, mark as failed
      if (!t.pid || !isPidAlive(t.pid)) {
        t.status = 'failed';
        t.completedAt = Date.now();
        changed = true;
      }
    }
  }
  
  if (changed) {
    writeAll(list);
  }
}

/** Transition a queued transfer to running, setting its PID and log file */
export function markTransferRunning(id: string, pid: number, logFile: string): void {
  const list = readAll();
  const t = list.find(x => x.id === id);
  if (!t) return;
  t.status = 'running';
  t.pid = pid;
  t.logFile = logFile;
  t.startedAt = Date.now();
  writeAll(list);
}

/** Remove any queued transfer that matches the given src+host+destDir */
export function removeQueuedMatch(src: string, host: string, destDir: string): void {
  const list = readAll().filter(
    t => !(t.status === 'queued' && t.src === src && t.host === host && t.destDir === destDir)
  );
  writeAll(list);
}

/** Clean up a log file (best-effort) */
export function removeLogFile(logFile: string): void {
  try { fs.unlinkSync(logFile); } catch { /* ok */ }
}
