// src/main/transcoding/ffmpeg-paths.ts
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

let resolvedPath: string | null = null;
let resolvedSource: 'system' | 'bundled' | null = null;

/**
 * Try to find a working system FFmpeg.
 * System FFmpeg typically has better hardware acceleration support
 * (NVENC, VAAPI, QSV) since it's linked against system drivers.
 */
function findSystemFfmpeg(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
          'C:\\ffmpeg\\bin\\ffmpeg.exe',
        ]
      : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'];

  // Try `which`/`where` first
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const result = execSync(cmd, { timeout: 3000, encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result.split('\n')[0])) {
      return result.split('\n')[0];
    }
  } catch {}

  // Check known paths
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Get the bundled FFmpeg path from @ffmpeg-installer/ffmpeg.
 * Works on all platforms (linux-x64, darwin-arm64, win32-x64, etc.)
 * but may lack GPU encoder support (no NVENC in static Linux builds).
 */
function getBundledFfmpegPath(): string {
  if (app.isPackaged) {
    const appPath = app.getAppPath();
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegPath = path.join(
      unpackedPath,
      'node_modules',
      '@ffmpeg-installer',
      `${process.platform}-${process.arch}`,
      binary
    );

    if (fs.existsSync(ffmpegPath)) {
      return ffmpegPath;
    }

    // Legacy path layout (older versions of the package)
    const legacyPath = path.join(
      unpackedPath,
      'node_modules',
      '@ffmpeg-installer',
      'ffmpeg',
      binary
    );
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }

    console.warn('[ffmpeg] Unpacked binary not found, falling back to package path');
  }

  return ffmpegInstaller.path;
}

/**
 * Verify an FFmpeg binary actually runs.
 */
function verifyFfmpeg(ffmpegPath: string): boolean {
  try {
    execSync(`"${ffmpegPath}" -version`, { timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the best available FFmpeg path.
 * 
 * Strategy:
 * 1. Try system FFmpeg first (better hardware acceleration via system drivers)
 * 2. Fall back to bundled @ffmpeg-installer binary (guaranteed software encoding)
 * 
 * Result is cached after first call.
 */
export function getFfmpegPath(): string {
  if (resolvedPath) {
    return resolvedPath;
  }

  // Try system FFmpeg (usually has NVENC/VAAPI/QSV linked against real drivers)
  const systemPath = findSystemFfmpeg();
  if (systemPath && verifyFfmpeg(systemPath)) {
    resolvedPath = systemPath;
    resolvedSource = 'system';
    console.log(`[ffmpeg] Using system FFmpeg: ${resolvedPath}`);
    return resolvedPath;
  }

  // Fall back to bundled (always has libx264/libx265, cross-platform)
  const bundledPath = getBundledFfmpegPath();
  if (verifyFfmpeg(bundledPath)) {
    resolvedPath = bundledPath;
    resolvedSource = 'bundled';
    console.log(`[ffmpeg] Using bundled FFmpeg: ${resolvedPath}`);
    return resolvedPath;
  }

  // Last resort: return bundled path even if verify failed (let caller handle errors)
  resolvedPath = bundledPath;
  resolvedSource = 'bundled';
  console.warn(`[ffmpeg] Could not verify FFmpeg, using bundled path: ${resolvedPath}`);
  return resolvedPath;
}

/**
 * Returns whether we're using system or bundled FFmpeg.
 */
export function getFfmpegSource(): 'system' | 'bundled' {
  getFfmpegPath(); // ensure resolved
  return resolvedSource ?? 'bundled';
}

/**
 * Force re-detection (useful if user installs FFmpeg after app launch).
 */
export function resetFfmpegPath(): void {
  resolvedPath = null;
  resolvedSource = null;
}
