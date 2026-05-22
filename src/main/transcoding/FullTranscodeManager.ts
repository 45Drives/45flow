// src/main/transcoding/FullTranscodeManager.ts
// Client-side full transcoding: generates all proxy MP4s + HLS in one shot,
// mirroring the server-side transcodeWorker output structure.

import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getFfmpegPath, getFfprobePath } from './ffmpeg-paths';
import { detectHardwareCapabilities } from './hardware-detect';
import type { FullTranscodeOptions, FullTranscodeProgress, FullTranscodeResult } from '../preload';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize a file path for FFmpeg CLI arguments.
 * On Windows, path.join() produces backslashes which confuse FFmpeg's
 * relative path resolution (e.g. init.mp4 ends up in CWD instead of
 * alongside the playlist). FFmpeg handles forward slashes fine on all platforms.
 */
function ffp(p: string): string {
  return process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
}

function heightForQuality(q: string): number | null {
  if (q === 'original') return null;
  if (q.endsWith('p')) {
    const n = Number(q.slice(0, -1));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

interface ProbeInfo {
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  audioChannels: number;
  format: string;
  hasAudio: boolean;
}

function probeSource(ffmpegPath: string, inputPath: string): ProbeInfo {
  const probeCmd = getFfprobePath();

  const raw = execSync(
    `"${probeCmd}" -v quiet -print_format json -show_format -show_streams "${inputPath}"`,
    { timeout: 30000, encoding: 'utf-8' }
  );
  const info = JSON.parse(raw);

  const videoStream = (info.streams || []).find((s: any) => s.codec_type === 'video');
  const audioStream = (info.streams || []).find((s: any) => s.codec_type === 'audio');

  const durationSeconds =
    Number(videoStream?.duration) ||
    Number(info.format?.duration) ||
    0;

  const fpsRaw = videoStream?.r_frame_rate || videoStream?.avg_frame_rate || '24/1';
  const [num, den] = fpsRaw.split('/').map(Number);
  const fps = den > 0 ? num / den : 24;

  return {
    durationSeconds,
    fps,
    width: Number(videoStream?.width) || 0,
    height: Number(videoStream?.height) || 0,
    videoCodec: String(videoStream?.codec_name || '').toLowerCase(),
    audioCodec: String(audioStream?.codec_name || '').toLowerCase(),
    audioChannels: Number(audioStream?.channels) || 2,
    format: String(info.format?.format_name || '').toLowerCase(),
    hasAudio: !!audioStream,
  };
}

// ── Main class ───────────────────────────────────────────────────────────────

export class FullTranscodeManager {
  private activeProcess: ChildProcess | null = null;
  private canceled = false;
  private currentJobId: string | null = null;

  /** Check if a transcode job is currently running */
  hasActiveJob(): boolean {
    return this.activeProcess !== null && this.currentJobId !== null;
  }

  /** Get current job ID if one is running */
  getCurrentJobId(): string | null {
    return this.currentJobId;
  }

  async transcode(
    jobId: string,
    options: FullTranscodeOptions,
    onProgress: (progress: FullTranscodeProgress) => void,
  ): Promise<FullTranscodeResult> {
    this.canceled = false;
    this.currentJobId = jobId;

    try {
    const ffmpegPath = getFfmpegPath();
    const caps = detectHardwareCapabilities();

    // Select best H.264 codec for HW-accelerated phases
    const hwCodec = options.useHardwareAccel ? caps.bestCodecH264 : 'libx264';
    const proxyCodec = hwCodec;
    // HLS now uses separate passes per rendition, allowing hardware acceleration for all codecs
    const hlsCodec = hwCodec;
    console.log(`[full-transcode] ${jobId}: hardware detection:`, {
      platform: process.platform,
      ffmpegSource: caps.ffmpegSource,
      ffmpegVersion: caps.ffmpegVersion,
      hasNvenc: caps.hasNvenc,
      hasVideoToolbox: caps.hasVideoToolbox,
      hasQsv: caps.hasQsv,
      hasVaapi: caps.hasVaapi,
      bestCodecH264: caps.bestCodecH264,
      bestCodecHevc: caps.bestCodecHevc,
      useHardwareAccel: options.useHardwareAccel,
      selectedProxyCodec: proxyCodec,
      selectedHlsCodec: hlsCodec,
      probeResults: caps.probeResults,
    });

    // Output directory: temp/<jobId>/
    const outputDir = path.join(app.getPath('temp'), `45flow-full-transcode-${jobId}`);
    fs.mkdirSync(outputDir, { recursive: true });

    // Probe source
    onProgress({
      phase: 'probe',
      perQualityProgress: {},
      overallPercent: 0,
      fps: 0,
      speed: '0x',
      eta: '',
      message: 'Probing source…',
    });

    const probe = probeSource(ffmpegPath, options.inputPath);
    console.log(`[full-transcode] ${jobId}: probe result:`, {
      duration: probe.durationSeconds,
      fps: probe.fps,
      resolution: `${probe.width}x${probe.height}`,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      audioChannels: probe.audioChannels,
      format: probe.format,
      hasAudio: probe.hasAudio,
    });
    if (probe.durationSeconds <= 0) {
      throw new Error('Could not determine source duration');
    }

    const gopSize = Math.round(probe.fps * 2);
    const canCopyAudio = probe.audioCodec === 'aac';
    const shouldGenerateProxy = options.generateProxy !== false;
    const totalQualities = shouldGenerateProxy ? options.proxyQualities.length : 0;
    
    // HLS counts as 1 phase regardless of rendition count (unified progress bar)
    const totalPhases = (options.generateHls ? 1 : 0) + totalQualities;
    let phaseIndex = 0;
    console.log(`[full-transcode] ${jobId}: codec=${proxyCodec} gopSize=${gopSize} canCopyAudio=${canCopyAudio} watermark=${options.watermarkPath || 'none'} totalPhases=${totalPhases}`);

    const proxyFiles: Record<string, string> = {};
    const perQualityProgress: Record<string, number> = {};
    for (const q of options.proxyQualities) perQualityProgress[q] = 0;

    // ── Phase 1: HLS (fMP4 CMAF) — prioritized ─────────────────────────────

    let hlsDir: string | null = null;
    let hlsMaster: string | null = null;

    if (options.generateHls) {
      if (this.canceled) throw new Error('Canceled');

      const hlsOutDir = path.join(outputDir, 'hls');
      fs.mkdirSync(hlsOutDir, { recursive: true });

      // Build HLS rendition ladder from source height (adaptive bitrate)
      // Always include standard rungs below source + source itself
      const standardHeights = [720, 1080];
      const renditions: number[] = [];
      for (const h of standardHeights) {
        // Only include if meaningfully below source (at least 10% smaller)
        if (h < probe.height * 0.9) renditions.push(h);
      }
      // Always include source height as top rendition
      if (probe.height > 0) renditions.push(probe.height);
      // Fallback
      if (renditions.length === 0) renditions.push(720);

      console.log(`[full-transcode] ${jobId}: HLS → ${hlsOutDir}`);
      console.log(`[full-transcode] ${jobId}: HLS renditions=${renditions.join(',')}, watermark=${options.watermarkPath || 'none'}, codec=${hlsCodec}`);

      hlsMaster = path.join(hlsOutDir, 'master.m3u8');

      // QSV needs separate passes per rendition to enable hardware acceleration
      // (filter_complex with split doesn't work with QSV hwupload requirements).
      // VAAPI has complex surface requirements, so use multi-rendition for now.
      // NVENC/VideoToolbox/libx264 use single-pass multi-rendition (more efficient).
      const needsSeparatePasses = hlsCodec.includes('qsv');

      if (needsSeparatePasses) {
        console.log(`[full-transcode] ${jobId}: Using separate passes for ${hlsCodec} (enables hardware acceleration)`);
        // Generate each rendition in a separate pass
        for (let v = 0; v < renditions.length; v++) {
          if (this.canceled) throw new Error('Canceled');

          const height = renditions[v];
          const variantDir = path.join(hlsOutDir, `v${v}`);
          fs.mkdirSync(variantDir, { recursive: true });

          const hlsArgs = this.buildSingleHlsRenditionArgs(options.inputPath, variantDir, {
            height,
            sourceHeight: probe.height,
            watermarkPath: options.watermarkPath || null,
            gopSize,
            canCopyAudio,
            audioChannels: probe.audioChannels,
            hasAudio: probe.hasAudio,
            preset: options.preset,
            codec: hlsCodec,
          });

          console.log(`[full-transcode] ${jobId}: HLS rendition ${v + 1}/${renditions.length} (${height}p) → ${variantDir}`);

          await this.runFfmpeg(ffmpegPath, hlsArgs, probe.durationSeconds, (pct, fps, speed, eta) => {
            // Unified progress: all renditions together = 1 phase
            const renditionProgress = (v + pct / 100) / renditions.length;
            const overallPercent = (phaseIndex + renditionProgress) / totalPhases * 100;
            onProgress({
              phase: 'hls',
              perQualityProgress: { ...perQualityProgress },
              overallPercent,
              fps,
              speed,
              eta,
              message: `HLS streaming — ${Math.round(renditionProgress * 100)}%`,
              encoder: hlsCodec,
            });
          });

          // Emit progress after this rendition completes
          const renditionProgress = (v + 1) / renditions.length;
          const overallPercent = (phaseIndex + renditionProgress) / totalPhases * 100;
          onProgress({
            phase: 'hls',
            perQualityProgress: { ...perQualityProgress },
            overallPercent,
            fps: 0,
            speed: '1.0x',
            eta: '00:00:00',
            message: `HLS streaming — ${Math.round(renditionProgress * 100)}%`,
            encoder: hlsCodec,
          });

          console.log(`[full-transcode] ${jobId}: HLS rendition ${v + 1}/${renditions.length} (${height}p) DONE`);
        }

        // Create master.m3u8 manually (since we generated renditions separately)
        const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:7'];
        for (let v = 0; v < renditions.length; v++) {
          const idx = path.join(hlsOutDir, `v${v}`, 'index.m3u8');
          if (!fs.existsSync(idx)) continue;
          const h = renditions[v];
          const bw = h <= 480 ? 800000 : h <= 720 ? 2800000 : h <= 1080 ? 5000000 : 8000000;
          lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${Math.round(h * 16 / 9 / 2) * 2}x${h}`);
          lines.push(`v${v}/index.m3u8`);
        }
        fs.writeFileSync(hlsMaster, lines.join('\n') + '\n');
        console.log(`[full-transcode] ${jobId}: created master.m3u8 (${renditions.length} renditions)`);
      } else {
        console.log(`[full-transcode] ${jobId}: Using single-pass multi-rendition for ${hlsCodec}`);
        
        // Create variant directories
        for (let v = 0; v < renditions.length; v++) {
          fs.mkdirSync(path.join(hlsOutDir, `v${v}`), { recursive: true });
        }
        
        // Single-pass multi-rendition (NVENC/VideoToolbox/libx264)
        const hlsArgs = this.buildMultiRenditionHlsArgs(options.inputPath, hlsOutDir, {
          renditions,
          watermarkPath: options.watermarkPath || null,
          gopSize,
          canCopyAudio,
          audioChannels: probe.audioChannels,
          hasAudio: probe.hasAudio,
          preset: options.preset,
          codec: hlsCodec,
        });

        await this.runFfmpeg(ffmpegPath, hlsArgs, probe.durationSeconds, (pct, fps, speed, eta) => {
          const overallPercent = (phaseIndex + pct / 100) / totalPhases * 100;
          onProgress({
            phase: 'hls',
            perQualityProgress: { ...perQualityProgress },
            overallPercent,
            fps,
            speed,
            eta,
            message: `HLS streaming — ${Math.round(pct)}%`,
            encoder: hlsCodec,
          });
        });

        // Emit final HLS progress
        const finalOverallPercent = (phaseIndex + 1) / totalPhases * 100;
        onProgress({
          phase: 'hls',
          perQualityProgress: { ...perQualityProgress },
          overallPercent: finalOverallPercent,
          fps: 0,
          speed: '1.0x',
          eta: '00:00:00',
          message: 'HLS streaming — 100%',
          encoder: hlsCodec,
        });

        // FFmpeg may generate incomplete master.m3u8 for single-rendition, so fix it
        try {
          const masterRaw = fs.readFileSync(hlsMaster, 'utf-8');
          if (!masterRaw.includes('#EXT-X-STREAM-INF')) {
            const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:7'];
            for (let v = 0; v < renditions.length; v++) {
              const idx = path.join(hlsOutDir, `v${v}`, 'index.m3u8');
              if (!fs.existsSync(idx)) continue;
              const h = renditions[v];
              const bw = h <= 480 ? 800000 : h <= 720 ? 2800000 : h <= 1080 ? 5000000 : 8000000;
              lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${Math.round(h * 16 / 9 / 2) * 2}x${h}`);
              lines.push(`v${v}/index.m3u8`);
            }
            fs.writeFileSync(hlsMaster, lines.join('\n') + '\n');
            console.log(`[full-transcode] ${jobId}: rewrote master.m3u8 (${renditions.length} renditions)`);
          }
        } catch (e: any) {
          console.warn(`[full-transcode] ${jobId}: master.m3u8 fixup failed:`, e?.message);
        }
      }

      phaseIndex++;
      hlsDir = hlsOutDir;
      console.log(`[full-transcode] ${jobId}: HLS DONE → ${hlsMaster}`);
    }

    // ── Phase 2: Proxy MP4s (sequential, original → 1080p → 720p) ───────────

    if (shouldGenerateProxy) {
    for (let i = 0; i < options.proxyQualities.length; i++) {
      if (this.canceled) throw new Error('Canceled');

      const quality = options.proxyQualities[i];
      const height = heightForQuality(quality);
      const outName = quality === 'original' ? 'proxy_original.mp4' : `proxy_${quality}.mp4`;
      const outAbs = path.join(outputDir, outName);

      // Fast remux: H.264 MP4 at original quality, no watermark → stream copy
      const isH264 = probe.videoCodec === 'h264';
      const isMp4 = probe.format.includes('mp4');
      const isOriginal = quality === 'original';
      const useWatermark = !!options.watermarkPath;
      const canFastRemux = isH264 && isMp4 && isOriginal && !useWatermark;
      console.log(`[full-transcode] ${jobId}: proxy ${quality} — isH264=${isH264} isMp4=${isMp4} isOriginal=${isOriginal} watermark=${useWatermark} fastRemux=${canFastRemux}`);

      const args = canFastRemux
        ? this.buildFastRemuxArgs(options.inputPath, outAbs)
        : this.buildProxyArgs(options.inputPath, outAbs, {
            height,
            sourceHeight: probe.height,
            codec: proxyCodec,
            watermarkPath: useWatermark ? options.watermarkPath! : null,
            gopSize,
            canCopyAudio,
            audioChannels: probe.audioChannels,
            preset: options.preset,
          });

      console.log(`[full-transcode] ${jobId}: proxy ${quality} → ${outAbs}`);
      console.log(`[full-transcode] ${jobId}: proxy args =`, args.join(' '));

      await this.runFfmpeg(ffmpegPath, args, probe.durationSeconds, (pct, fps, speed, eta) => {
        perQualityProgress[quality] = pct;
        const overallPercent = (phaseIndex + pct / 100) / totalPhases * 100;
        onProgress({
          phase: 'proxy',
          activeQuality: quality,
          perQualityProgress: { ...perQualityProgress },
          overallPercent,
          fps,
          speed,
          eta,
          message: `Review copy ${quality}${canFastRemux ? ' (remux)' : ''} — ${Math.round(pct)}%`,
          encoder: canFastRemux ? 'copy' : proxyCodec,
        });
      });

      // Mark quality complete and emit final progress for this quality
      perQualityProgress[quality] = 100;
      const finalOverallPercent = (phaseIndex + 1) / totalPhases * 100;
      onProgress({
        phase: 'proxy',
        activeQuality: quality,
        perQualityProgress: { ...perQualityProgress },
        overallPercent: finalOverallPercent,
        fps: 0,
        speed: '1.0x',
        eta: '00:00:00',
        message: `Review copy ${quality} — 100%`,
        encoder: canFastRemux ? 'copy' : proxyCodec,
      });

      phaseIndex++;
      proxyFiles[quality] = outAbs;
      console.log(`[full-transcode] ${jobId}: proxy ${quality} DONE → ${outAbs}`);
    }
    } // end shouldGenerateProxy

    console.log(`[full-transcode] ${jobId}: ALL DONE — outputDir=${outputDir} proxies=${Object.keys(proxyFiles).join(',')} hlsMaster=${hlsMaster || 'none'}`);
    return {
      ok: true,
      outputDir,
      proxyFiles,
      hlsDir,
      hlsMaster,
    };
  } finally {
    this.currentJobId = null;
    this.activeProcess = null;
  }
  }

  cancel(): void {
    this.canceled = true;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch {}
      this.activeProcess = null;
    }
  }

  // ── FFmpeg arg builders ────────────────────────────────────────────────────

  private buildFastRemuxArgs(inputPath: string, outputPath: string): string[] {
    return ['-y', '-i', ffp(inputPath), '-c', 'copy', '-movflags', '+faststart', ffp(outputPath)];
  }

  private buildProxyArgs(
    inputPath: string,
    outputPath: string,
    opts: {
      height: number | null;
      sourceHeight: number;
      codec: string;
      watermarkPath: string | null;
      gopSize: number;
      canCopyAudio: boolean;
      audioChannels: number;
      preset?: string;
    },
  ): string[] {
    const args: string[] = ['-y'];

    // HW device init (before -i)
    if (opts.codec.includes('vaapi')) {
      args.push('-vaapi_device', '/dev/dri/renderD128');
    }
    if (opts.codec.includes('qsv') && process.platform === 'linux') {
      // Linux QSV needs explicit hw device; Windows auto-inits via D3D11VA
      args.push('-init_hw_device', 'qsv=hw', '-filter_hw_device', 'hw');
    }

    args.push('-i', ffp(inputPath));

    if (opts.watermarkPath) {
      // Watermark filter_complex path
      const scaleExpr = opts.height ? `scale=-2:${opts.height}:flags=lanczos,` : '';
      const wmW = Math.round((opts.height || opts.sourceHeight) / 5);
      let filterComplex: string;

      if (opts.codec.includes('vaapi')) {
        filterComplex =
          `[0:v]${scaleExpr}format=nv12[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,format=nv12,hwupload[outv]`;
      } else if (opts.codec.includes('qsv')) {
        filterComplex =
          `[0:v]${scaleExpr}format=nv12[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,format=nv12,hwupload=extra_hw_frames=64[outv]`;
      } else {
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24[outv]`;
      }

      args.push('-i', ffp(opts.watermarkPath));
      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]');
      args.push('-map', '0:a?');
    } else if (opts.height) {
      // Scale without watermark
      if (opts.codec.includes('vaapi')) {
        args.push('-vf', `format=nv12,hwupload,scale_vaapi=w=-2:h=${opts.height}`);
      } else if (opts.codec.includes('qsv')) {
        // QSV scale_qsv doesn't support -2, calculate width explicitly (round to even)
        // QSV filter order: format convert → hwupload → scale on GPU
        const width = Math.round(opts.height * 16 / 9 / 2) * 2;
        args.push('-vf', `format=nv12,hwupload=extra_hw_frames=64,scale_qsv=w=${width}:h=${opts.height}`);
      } else {
        args.push('-vf', `scale=-2:${opts.height}:flags=lanczos,format=yuv420p`);
      }
    } else {
      // Original quality, no watermark — HW codecs still need upload
      if (opts.codec.includes('vaapi')) {
        args.push('-vf', 'format=nv12,hwupload');
      } else if (opts.codec.includes('qsv')) {
        // QSV requires NV12 format
        args.push('-vf', 'format=nv12,hwupload=extra_hw_frames=64');
      }
    }

    // Codec + encoding params
    args.push('-c:v', opts.codec);
    this.addCodecParams(args, opts.codec, opts.preset);

    // GOP / keyframe alignment
    args.push('-g', String(opts.gopSize));
    args.push('-keyint_min', String(opts.gopSize));
    args.push('-sc_threshold', '0');
    const isHwCodec = opts.codec.includes('vaapi') || opts.codec.includes('qsv')
      || opts.codec.includes('nvenc') || opts.codec.includes('videotoolbox');
    if (!isHwCodec) {
      args.push('-pix_fmt', 'yuv420p');
      args.push('-profile:v', 'high', '-level', '4.1');
    }

    // BT.709 SDR color metadata for consistent web playback
    args.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');

    // Audio
    if (opts.canCopyAudio) {
      args.push('-c:a', 'copy');
    } else {
      args.push('-c:a', 'aac', '-b:a', '320k');
      if (opts.audioChannels > 2) args.push('-ac', String(opts.audioChannels));
    }

    args.push('-movflags', '+faststart');
    args.push(ffp(outputPath));

    return args;
  }

  /** Build FFmpeg args for a single HLS rendition (enables QSV/VAAPI hardware acceleration) */
  private buildSingleHlsRenditionArgs(
    inputPath: string,
    variantDir: string,
    opts: {
      height: number;
      sourceHeight: number;
      watermarkPath: string | null;
      gopSize: number;
      canCopyAudio: boolean;
      audioChannels: number;
      hasAudio: boolean;
      preset?: string;
      codec?: string;
    },
  ): string[] {
    const args: string[] = ['-y'];
    const codec = opts.codec || 'libx264';

    // HW device init (before -i)
    if (codec.includes('vaapi')) {
      args.push('-vaapi_device', '/dev/dri/renderD128');
    }
    if (codec.includes('qsv') && process.platform === 'linux') {
      args.push('-init_hw_device', 'qsv=hw', '-filter_hw_device', 'hw');
    }

    args.push('-i', ffp(inputPath));

    // Build filter chain for scaling and optional watermark
    if (opts.watermarkPath) {
      const wmW = Math.round(opts.height / 5);
      let filterComplex: string;

      if (codec.includes('vaapi')) {
        // VAAPI: scale in software, then hwupload
        filterComplex =
          `[0:v]scale=-2:${opts.height}:flags=lanczos,format=nv12[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,format=nv12,hwupload[outv]`;
      } else if (codec.includes('qsv')) {
        // QSV: scale in software, then hwupload (requires NV12)
        filterComplex =
          `[0:v]scale=-2:${opts.height}:flags=lanczos,format=nv12[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,format=nv12,hwupload=extra_hw_frames=64[outv]`;
      } else {
        // Software or NVENC/VideoToolbox: simple software filter
        filterComplex =
          `[0:v]scale=-2:${opts.height}:flags=lanczos,format=yuv420p[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24[outv]`;
      }

      args.push('-i', ffp(opts.watermarkPath));
      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]');
      args.push('-map', '0:a?');
    } else {
      // Scale without watermark
      if (codec.includes('vaapi')) {
        args.push('-vf', `format=nv12,hwupload,scale_vaapi=w=-2:h=${opts.height}`);
      } else if (codec.includes('qsv')) {
        // QSV scale_qsv doesn't support -2, calculate width explicitly (round to even)
        // QSV filter order: format convert → hwupload → scale on GPU
        const width = Math.round(opts.height * 16 / 9 / 2) * 2;
        args.push('-vf', `format=nv12,hwupload=extra_hw_frames=64,scale_qsv=w=${width}:h=${opts.height}`);
      } else {
        args.push('-vf', `scale=-2:${opts.height}:flags=lanczos,format=yuv420p`);
      }
    }

    // Codec + encoding params
    args.push('-c:v', codec);
    this.addCodecParams(args, codec, opts.preset);

    // GOP / keyframe alignment
    args.push('-g', String(opts.gopSize));
    args.push('-keyint_min', String(opts.gopSize));
    args.push('-sc_threshold', '0');

    const isHwCodec = codec.includes('vaapi') || codec.includes('qsv')
      || codec.includes('nvenc') || codec.includes('videotoolbox');
    if (!isHwCodec) {
      args.push('-pix_fmt', 'yuv420p');
      args.push('-profile:v', 'high', '-level', '4.1');
    }

    // BT.709 SDR color metadata for consistent web playback
    args.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');

    // Audio
    if (opts.hasAudio) {
      if (opts.canCopyAudio) {
        args.push('-c:a', 'copy');
      } else {
        args.push('-c:a', 'aac', '-b:a', '320k');
        if (opts.audioChannels > 2) args.push('-ac', String(opts.audioChannels));
      }
    }

    // HLS packaging (fMP4 CMAF) for single rendition
    args.push(
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', ffp(path.join(variantDir, 'seg_%05d.m4s')),
      ffp(path.join(variantDir, 'index.m3u8')),
    );

    return args;
  }

  /** Build FFmpeg args for multi-rendition HLS in a single pass (NVENC/VideoToolbox/libx264) */
  private buildMultiRenditionHlsArgs(
    inputPath: string,
    hlsOutDir: string,
    opts: {
      renditions: number[];
      watermarkPath: string | null;
      gopSize: number;
      canCopyAudio: boolean;
      audioChannels: number;
      hasAudio: boolean;
      preset?: string;
      codec?: string;
    },
  ): string[] {
    const args: string[] = ['-y', '-i', ffp(inputPath)];

    const n = opts.renditions.length;
    const useWatermark = !!opts.watermarkPath;

    if (useWatermark) {
      args.push('-i', ffp(opts.watermarkPath!));
    }

    // Build filter_complex: split → scale per rendition → optional watermark overlay
    const vLabels = Array.from({ length: n }, (_, i) => `v${i + 1}`);
    const oLabels = Array.from({ length: n }, (_, i) => `v${i}o`);
    const filterParts: string[] = [];

    filterParts.push(`[0:v]split=${n}${vLabels.map((l) => `[${l}]`).join('')};`);

    if (useWatermark) {
      filterParts.push(
        `[1:v]split=${n}${vLabels.map((_, i) => `[wm_raw${i}]`).join('')};`,
      );
    }

    opts.renditions.forEach((h, i) => {
      const v = vLabels[i];
      const out = oLabels[i];
      if (useWatermark) {
        const wmW = Math.round(h / 5);
        filterParts.push(`[${v}]scale=-2:${h}:flags=lanczos,format=yuv420p[${v}s];`);
        filterParts.push(`[wm_raw${i}]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm${i}];`);
        filterParts.push(`[${v}s][wm${i}]overlay=W-w-24:H-h-24[${out}];`);
      } else {
        filterParts.push(`[${v}]scale=-2:${h}:flags=lanczos,format=yuv420p[${out}];`);
      }
    });

    const filterGraph = filterParts.join('').replace(/;+$/, '');
    args.push('-filter_complex', filterGraph);

    // Map video (+audio) per variant
    for (const l of oLabels) {
      args.push('-map', `[${l}]`);
      if (opts.hasAudio) args.push('-map', '0:a');
    }

    // Codec + encoding params
    const hlsCodec = opts.codec || 'libx264';
    args.push('-c:v', hlsCodec);
    this.addCodecParams(args, hlsCodec, opts.preset);
    const isHwHls = hlsCodec.includes('nvenc') || hlsCodec.includes('videotoolbox');
    if (!isHwHls) {
      args.push('-profile:v', 'high', '-level', '4.1');
    }

    args.push('-g', String(opts.gopSize));
    args.push('-keyint_min', String(opts.gopSize));
    args.push('-sc_threshold', '0');
    // HW codecs get pix_fmt from filter output; only set explicitly for software
    if (!isHwHls) {
      args.push('-pix_fmt', 'yuv420p');
    }

    // BT.709 SDR color metadata for consistent web playback
    args.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');

    // Audio
    if (opts.hasAudio) {
      if (opts.canCopyAudio) {
        args.push('-c:a', 'copy');
      } else {
        args.push('-c:a', 'aac', '-b:a', '320k');
        if (opts.audioChannels > 2) args.push('-ac', String(opts.audioChannels));
      }
    }

    // HLS packaging (fMP4 CMAF)
    args.push(
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', ffp(path.join(hlsOutDir, 'v%v', 'seg_%05d.m4s')),
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', opts.hasAudio
        ? Array.from({ length: n }, (_, i) => `v:${i},a:${i}`).join(' ')
        : Array.from({ length: n }, (_, i) => `v:${i}`).join(' '),
      ffp(path.join(hlsOutDir, 'v%v', 'index.m3u8')),
    );

    return args;
  }

  /** Add codec-specific quality/preset params. */
  private addCodecParams(args: string[], codec: string, preset?: string): void {
    const p = preset || 'balanced';

    switch (codec) {
      case 'h264_nvenc':
      case 'hevc_nvenc': {
        // Use legacy preset names (fast/medium/slow) for broad FFmpeg compatibility.
        // Newer FFmpeg (5.0+) maps these internally to p1-p7; older builds only know these names.
        const nvPreset = p === 'fast' ? 'fast' : p === 'quality' ? 'slow' : 'medium';
        const cq = p === 'fast' ? '28' : p === 'quality' ? '18' : '23';
        args.push('-preset', nvPreset, '-rc', 'vbr', '-cq', cq, '-b:v', '0');
        break;
      }
      case 'h264_videotoolbox':
      case 'hevc_videotoolbox': {
        const vtQ = p === 'fast' ? '50' : p === 'quality' ? '80' : '65';
        args.push('-allow_sw', '1', '-q:v', vtQ);
        break;
      }
      case 'h264_qsv':
      case 'hevc_qsv': {
        const qsvPreset = p === 'fast' ? 'faster' : p === 'quality' ? 'slow' : 'fast';
        const gq = p === 'fast' ? '28' : p === 'quality' ? '18' : '23';
        args.push('-preset', qsvPreset, '-global_quality', gq);
        break;
      }
      case 'h264_vaapi':
      case 'hevc_vaapi': {
        const qp = p === 'fast' ? '28' : p === 'quality' ? '18' : '23';
        args.push('-qp', qp);
        break;
      }
      default: {
        // libx264 / libx265
        const swPreset = p === 'fast' ? 'faster' : p === 'quality' ? 'slow' : 'fast';
        const crf = p === 'fast' ? '28' : p === 'quality' ? '18' : '23';
        args.push('-preset', swPreset, '-crf', crf);
        break;
      }
    }
  }

  // ── FFmpeg runner with progress parsing ────────────────────────────────────

  private runFfmpeg(
    ffmpegPath: string,
    args: string[],
    durationSeconds: number,
    onProgress: (pct: number, fps: number, speed: string, eta: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcess = child;

      let stderr = '';
      let stderrBuffer = '';
      let duration = durationSeconds;

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Parse duration from FFmpeg output if we don't have it
        if (duration <= 0) {
          const dMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          if (dMatch) {
            const [, h, m, s] = dMatch;
            duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
          }
        }

        stderrBuffer += chunk;
        const lines = stderrBuffer.split(/[\r\n]+/);
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          const fpsMatch = line.match(/fps=\s*([\d.]+)/);

          if (timeMatch && duration > 0) {
            const [, h, m, s] = timeMatch;
            const currentTime = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
            const pct = Math.min(99, (currentTime / duration) * 100);
            const fps = fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : 0;
            const speedMatch = line.match(/speed=\s*([\d.]+)x/);
            const speed = speedMatch ? `${speedMatch[1]}x` : 'N/A';

            const remaining = duration - currentTime;
            const speedNum = speedMatch ? parseFloat(speedMatch[1]) : 0;
            const etaSec = speedNum > 0 ? remaining / speedNum : 0;
            const etaH = Math.floor(etaSec / 3600);
            const etaM = Math.floor((etaSec % 3600) / 60);
            const etaS = Math.floor(etaSec % 60);
            const eta = `${String(etaH).padStart(2, '0')}:${String(etaM).padStart(2, '0')}:${String(etaS).padStart(2, '0')}`;

            onProgress(pct, fps, speed, eta);
          }
        }
      });

      child.on('close', (code) => {
        if (this.activeProcess === child) this.activeProcess = null;

        if (code === 0) {
          // Don't emit 100% here - let the outer loop handle final progress
          // to avoid progress bar flashing
          resolve();
        } else {
          const lastLines = stderr.slice(-1500);
          reject(new Error(`FFmpeg exited with code ${code}:\n${lastLines}`));
        }
      });

      child.on('error', (err) => {
        if (this.activeProcess === child) this.activeProcess = null;
        reject(err);
      });
    });
  }
}
