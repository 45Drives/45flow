/**
 * FFmpeg Hardware Detection with Probe Testing
 * 
 * Detects available hardware encoders by actually testing them (encoding 1 frame).
 * This is the only reliable way to determine if a codec truly works on a system,
 * since FFmpeg may list codecs that aren't functional due to missing drivers/hardware.
 * 
 * Fallback chain per platform:
 *   Windows: NVENC → QSV → libx264/libx265
 *   macOS:   VideoToolbox → libx264/libx265
 *   Linux:   NVENC → VAAPI → libx264/libx265
 */

import { execSync, spawnSync } from 'child_process';
import { getFfmpegPath, getFfmpegSource } from './ffmpeg-paths';

export interface HardwareCapabilities {
  hasNvenc: boolean;
  hasVideoToolbox: boolean;
  hasQsv: boolean;
  hasVaapi: boolean;
  bestCodecH264: string;
  bestCodecHevc: string;
  hasSoftwareFallback: boolean;
  ffmpegSource: 'system' | 'bundled';
  ffmpegVersion: string;
  probeResults: Record<string, boolean>; // codec → worked?
}

let cachedCapabilities: HardwareCapabilities | null = null;

/**
 * Probe a specific encoder by attempting to encode a single black frame.
 * This is the ONLY reliable way to know if a codec actually works.
 * 
 * Returns true if the encoder produced valid output.
 */
function probeEncoder(ffmpegPath: string, codec: string, extraArgs: string[] = []): boolean {
  try {
    // Generate 1 frame of black video, encode it, discard output
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'color=black:s=64x64:d=0.1',
      ...extraArgs,
      '-c:v', codec,
      '-frames:v', '1',
      '-f', 'null',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
    ];

    const result = spawnSync(ffmpegPath, args, {
      timeout: 10000, // 10s max — some GPU init is slow
      stdio: 'pipe',
      env: process.env,
    });

    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Get FFmpeg version string for diagnostics.
 */
function getVersion(ffmpegPath: string): string {
  try {
    const output = execSync(`"${ffmpegPath}" -version`, {
      timeout: 5000,
      encoding: 'utf-8',
    });
    const match = output.match(/ffmpeg version (\S+)/);
    return match?.[1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Detect available hardware video encoders via probe testing.
 * 
 * Tests each encoder by doing a real 1-frame encode. Caches results.
 * Takes ~1-3 seconds on first call (probing), instant after that.
 */
export function detectHardwareCapabilities(): HardwareCapabilities {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const ffmpegPath = getFfmpegPath();
  const ffmpegSource = getFfmpegSource();
  const ffmpegVersion = getVersion(ffmpegPath);
  const probeResults: Record<string, boolean> = {};

  console.log(`[hardware-detect] Probing encoders with ${ffmpegSource} FFmpeg (${ffmpegVersion})...`);

  // --- NVENC (NVIDIA GPU, Windows + Linux) ---
  let hasNvenc = false;
  if (process.platform !== 'darwin') {
    probeResults['h264_nvenc'] = probeEncoder(ffmpegPath, 'h264_nvenc');
    probeResults['hevc_nvenc'] = probeEncoder(ffmpegPath, 'hevc_nvenc');
    hasNvenc = probeResults['h264_nvenc'] || probeResults['hevc_nvenc'];
    if (hasNvenc) console.log('[hardware-detect] ✓ NVIDIA NVENC available');
  }

  // --- VideoToolbox (macOS only) ---
  let hasVideoToolbox = false;
  if (process.platform === 'darwin') {
    probeResults['h264_videotoolbox'] = probeEncoder(ffmpegPath, 'h264_videotoolbox');
    probeResults['hevc_videotoolbox'] = probeEncoder(ffmpegPath, 'hevc_videotoolbox');
    hasVideoToolbox = probeResults['h264_videotoolbox'] || probeResults['hevc_videotoolbox'];
    if (hasVideoToolbox) console.log('[hardware-detect] ✓ Apple VideoToolbox available');
  }

  // --- QSV (Intel Quick Sync, Windows + Linux with Intel iGPU) ---
  let hasQsv = false;
  if (process.platform !== 'darwin') {
    probeResults['h264_qsv'] = probeEncoder(ffmpegPath, 'h264_qsv');
    probeResults['hevc_qsv'] = probeEncoder(ffmpegPath, 'hevc_qsv');
    hasQsv = probeResults['h264_qsv'] || probeResults['hevc_qsv'];
    if (hasQsv) console.log('[hardware-detect] ✓ Intel Quick Sync (QSV) available');
  }

  // --- VAAPI (Linux AMD/Intel, requires /dev/dri/renderD128) ---
  let hasVaapi = false;
  if (process.platform === 'linux') {
    // VAAPI needs a render device; pass it explicitly
    const vaapiArgs = ['-vaapi_device', '/dev/dri/renderD128'];
    const vaapiFilterArgs = [
      '-vaapi_device', '/dev/dri/renderD128',
      '-vf', 'format=nv12,hwupload',
    ];
    probeResults['h264_vaapi'] = probeEncoder(ffmpegPath, 'h264_vaapi', vaapiFilterArgs);
    probeResults['hevc_vaapi'] = probeEncoder(ffmpegPath, 'hevc_vaapi', vaapiFilterArgs);
    hasVaapi = probeResults['h264_vaapi'] || probeResults['hevc_vaapi'];
    if (hasVaapi) console.log('[hardware-detect] ✓ VAAPI available');
  }

  // --- Software (always available) ---
  probeResults['libx264'] = probeEncoder(ffmpegPath, 'libx264');
  probeResults['libx265'] = probeEncoder(ffmpegPath, 'libx265');
  const hasSoftwareFallback = probeResults['libx264'] === true;

  if (!hasSoftwareFallback) {
    console.error('[hardware-detect] ✗ WARNING: libx264 not working! FFmpeg may be broken.');
  }

  // --- Select best codec (priority: NVENC > VideoToolbox > QSV > VAAPI > software) ---
  let bestCodecH264: string;
  if (probeResults['h264_nvenc']) bestCodecH264 = 'h264_nvenc';
  else if (probeResults['h264_videotoolbox']) bestCodecH264 = 'h264_videotoolbox';
  else if (probeResults['h264_qsv']) bestCodecH264 = 'h264_qsv';
  else if (probeResults['h264_vaapi']) bestCodecH264 = 'h264_vaapi';
  else bestCodecH264 = 'libx264';

  let bestCodecHevc: string;
  if (probeResults['hevc_nvenc']) bestCodecHevc = 'hevc_nvenc';
  else if (probeResults['hevc_videotoolbox']) bestCodecHevc = 'hevc_videotoolbox';
  else if (probeResults['hevc_qsv']) bestCodecHevc = 'hevc_qsv';
  else if (probeResults['hevc_vaapi']) bestCodecHevc = 'hevc_vaapi';
  else bestCodecHevc = 'libx265';

  console.log(`[hardware-detect] Best H.264 encoder: ${bestCodecH264}`);
  console.log(`[hardware-detect] Best HEVC encoder: ${bestCodecHevc}`);

  cachedCapabilities = {
    hasNvenc,
    hasVideoToolbox,
    hasQsv,
    hasVaapi,
    bestCodecH264,
    bestCodecHevc,
    hasSoftwareFallback,
    ffmpegSource,
    ffmpegVersion,
    probeResults,
  };

  return cachedCapabilities;
}

/**
 * Check if hardware acceleration is actually available
 */
export function hasHardwareAcceleration(): boolean {
  const caps = detectHardwareCapabilities();
  return caps.hasNvenc || caps.hasVideoToolbox || caps.hasQsv || caps.hasVaapi;
}

/**
 * Get human-readable description of available hardware
 */
export function describeHardware(): string {
  const caps = detectHardwareCapabilities();
  const available: string[] = [];

  if (caps.hasNvenc) available.push('NVIDIA NVENC');
  if (caps.hasVideoToolbox) available.push('Apple VideoToolbox');
  if (caps.hasQsv) available.push('Intel Quick Sync');
  if (caps.hasVaapi) available.push('VAAPI');

  const source = caps.ffmpegSource === 'system' ? 'System' : 'Bundled';
  const base = available.length === 0
    ? `Software encoding only (CPU) — ${source} FFmpeg ${caps.ffmpegVersion}`
    : `Hardware: ${available.join(', ')} — ${source} FFmpeg ${caps.ffmpegVersion}`;

  return base;
}

/**
 * Clear cache (for testing or re-detection)
 */
export function clearCapabilitiesCache(): void {
  cachedCapabilities = null;
}
