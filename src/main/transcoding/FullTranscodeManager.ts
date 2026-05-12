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

  async transcode(
    jobId: string,
    options: FullTranscodeOptions,
    onProgress: (progress: FullTranscodeProgress) => void,
  ): Promise<FullTranscodeResult> {
    this.canceled = false;

    const ffmpegPath = getFfmpegPath();
    const caps = detectHardwareCapabilities();

    // Select best H.264 codec — HW for proxies, always libx264 for HLS
    const proxyCodec = options.useHardwareAccel ? caps.bestCodecH264 : 'libx264';

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
    const totalQualities = options.proxyQualities.length;
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

      // Build HLS rendition ladder from proxy qualities (exclude 'original')
      const renditions = options.proxyQualities
        .map((q) => heightForQuality(q))
        .filter((h): h is number => h !== null)
        .sort((a, b) => a - b);
      // If only 'original' quality, use source height
      if (renditions.length === 0 && probe.height > 0) {
        renditions.push(probe.height);
      }
      if (renditions.length === 0) renditions.push(720);

      // Create variant directories
      for (let v = 0; v < renditions.length; v++) {
        fs.mkdirSync(path.join(hlsOutDir, `v${v}`), { recursive: true });
      }

      const hlsArgs = this.buildHlsArgs(options.inputPath, hlsOutDir, {
        renditions,
        watermarkPath: options.watermarkPath || null,
        gopSize,
        canCopyAudio,
        audioChannels: probe.audioChannels,
        hasAudio: probe.hasAudio,
        preset: options.preset,
      });

      console.log(`[full-transcode] ${jobId}: HLS → ${hlsOutDir}`);
      console.log(`[full-transcode] ${jobId}: HLS renditions=${renditions.join(',')}, watermark=${options.watermarkPath || 'none'}`);
      console.log(`[full-transcode] ${jobId}: HLS args =`, hlsArgs.join(' '));

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
        });
      });

      phaseIndex++;
      hlsDir = hlsOutDir;
      hlsMaster = path.join(hlsOutDir, 'master.m3u8');

      // FFmpeg 4.x generates an incomplete master.m3u8 for single-rendition
      // var_stream_map (just the header, no #EXT-X-STREAM-INF).  Rewrite it
      // with proper entries derived from the variant index playlists.
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
          console.log(`[full-transcode] ${jobId}: rewrote master.m3u8 (${lines.length} lines, ${renditions.length} renditions)`);
        }
      } catch (e: any) {
        console.warn(`[full-transcode] ${jobId}: master.m3u8 fixup failed:`, e?.message);
      }

      console.log(`[full-transcode] ${jobId}: HLS DONE → ${hlsMaster}`);
    }

    // ── Phase 2: Proxy MP4s (sequential, original → 1080p → 720p) ───────────

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
        });
      });

      phaseIndex++;
      perQualityProgress[quality] = 100;
      proxyFiles[quality] = outAbs;
      console.log(`[full-transcode] ${jobId}: proxy ${quality} DONE → ${outAbs}`);
    }

    // Final progress
    onProgress({
      phase: 'proxy',
      perQualityProgress: { ...perQualityProgress },
      overallPercent: 100,
      fps: 0,
      speed: '0x',
      eta: '00:00:00',
      message: 'Complete',
    });

    console.log(`[full-transcode] ${jobId}: ALL DONE — outputDir=${outputDir} proxies=${Object.keys(proxyFiles).join(',')} hlsMaster=${hlsMaster || 'none'}`);
    return {
      ok: true,
      outputDir,
      proxyFiles,
      hlsDir,
      hlsMaster,
    };
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
    return ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath];
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

    args.push('-i', inputPath);

    if (opts.watermarkPath) {
      // Watermark filter_complex path
      const scaleExpr = opts.height ? `scale=-2:${opts.height}:flags=lanczos,` : '';
      const wmW = Math.round((opts.height || opts.sourceHeight) / 2);
      let filterComplex: string;

      if (opts.codec.includes('vaapi')) {
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,format=nv12,hwupload[outv]`;
      } else if (opts.codec.includes('qsv')) {
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,hwupload=extra_hw_frames=64[outv]`;
      } else {
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24[outv]`;
      }

      args.push('-i', opts.watermarkPath);
      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]');
      args.push('-map', '0:a?');
    } else if (opts.height) {
      // Scale without watermark
      if (opts.codec.includes('vaapi')) {
        args.push('-vf', `format=nv12,hwupload,scale_vaapi=w=-2:h=${opts.height}`);
      } else if (opts.codec.includes('qsv')) {
        args.push('-vf', `hwupload=extra_hw_frames=64,scale_qsv=w=-2:h=${opts.height}`);
      } else {
        args.push('-vf', `scale=-2:${opts.height}:flags=lanczos,format=yuv420p`);
      }
    } else {
      // Original quality, no watermark — HW codecs still need upload
      if (opts.codec.includes('vaapi')) {
        args.push('-vf', 'format=nv12,hwupload');
      } else if (opts.codec.includes('qsv')) {
        args.push('-vf', 'hwupload=extra_hw_frames=64');
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
    args.push(outputPath);

    return args;
  }

  private buildHlsArgs(
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
    },
  ): string[] {
    const args: string[] = ['-y', '-i', inputPath];

    const n = opts.renditions.length;
    const useWatermark = !!opts.watermarkPath;

    if (useWatermark) {
      args.push('-i', opts.watermarkPath!);
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
        const wmW = Math.round(h / 2);
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

    // HLS always uses libx264
    args.push('-c:v', 'libx264');
    const crf = opts.preset === 'quality' ? '18' : opts.preset === 'fast' ? '28' : '20';
    const preset = opts.preset === 'quality' ? 'slow' : opts.preset === 'fast' ? 'faster' : 'fast';
    args.push('-preset', preset, '-crf', crf);
    args.push('-profile:v', 'high', '-level', '4.1');

    args.push('-g', String(opts.gopSize));
    args.push('-keyint_min', String(opts.gopSize));
    args.push('-sc_threshold', '0');
    args.push('-pix_fmt', 'yuv420p');

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
      '-hls_segment_filename', path.join(hlsOutDir, 'v%v', 'seg_%05d.m4s'),
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', opts.hasAudio
        ? Array.from({ length: n }, (_, i) => `v:${i},a:${i}`).join(' ')
        : Array.from({ length: n }, (_, i) => `v:${i}`).join(' '),
      path.join(hlsOutDir, 'v%v', 'index.m3u8'),
    );

    return args;
  }

  /** Add codec-specific quality/preset params. */
  private addCodecParams(args: string[], codec: string, preset?: string): void {
    const p = preset || 'balanced';

    switch (codec) {
      case 'h264_nvenc':
      case 'hevc_nvenc': {
        const nvPreset = p === 'fast' ? 'p2' : p === 'quality' ? 'p6' : 'p4';
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
          onProgress(100, 0, '1.0x', '00:00:00');
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
