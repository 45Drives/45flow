// src/main/transcoding/ffmpeg-semaphore.ts
// Shared semaphore that limits total concurrent ffmpeg processes across
// both TranscodeManager (QuickShare) and FullTranscodeManager (LocalUpload).
// This prevents CPU/RAM exhaustion when multiple transcodes are triggered.

const MAX_CONCURRENT = 2;

let active = 0;
const waiting: Array<() => void> = [];

/**
 * Acquire a slot. Resolves immediately if a slot is free,
 * otherwise queues until one becomes available.
 */
export function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      active++;
      resolve();
    });
  });
}

/**
 * Release a slot, allowing the next queued job to proceed.
 */
export function release(): void {
  active--;
  if (active < 0) active = 0;
  if (waiting.length > 0 && active < MAX_CONCURRENT) {
    const next = waiting.shift()!;
    next();
  }
}

/**
 * Current number of active ffmpeg slots in use.
 */
export function getActiveCount(): number {
  return active;
}

/**
 * Number of jobs waiting for a slot.
 */
export function getQueueLength(): number {
  return waiting.length;
}
