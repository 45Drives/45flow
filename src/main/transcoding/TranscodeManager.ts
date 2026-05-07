// src/main/transcoding/TranscodeManager.ts
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getFfmpegPath } from './ffmpeg-paths';
import { detectHardwareCapabilities, hasHardwareAcceleration } from './hardware-detect';

export interface TranscodeOptions {
  inputPath: string;
  quality: 'original' | '1080p' | '720p';
  outputFormat: 'mp4' | 'hevc';
  useHardwareAccel: boolean;
  preset?: 'fast' | 'balanced' | 'quality';
  watermarkPath?: string; // Absolute path to watermark image (PNG with alpha)
}

export interface TranscodeProgress {
  percent: number;
  fps: number;
  speed: string; // "1.2x"
  eta: string;   // "00:02:15"
  message: string;
}

interface ActiveJob {
  process: ChildProcess;
  outputPath: string;
}

export class TranscodeManager {
  private activeJobs = new Map<string, ActiveJob>();

  async transcode(
    jobId: string,
    options: TranscodeOptions,
    onProgress: (progress: TranscodeProgress) => void
  ): Promise<string> {
    // Use a job-specific temp directory but preserve the original filename
    // so that rsync uploads it to the server with the correct name.
    const outputDir = path.join(app.getPath('temp'), `45flow-transcode-${jobId}`);
    fs.mkdirSync(outputDir, { recursive: true });
    const outputName = path.basename(options.inputPath).replace(/\.[^.]+$/, '.mp4');
    const outputPath = path.join(outputDir, outputName);

    // Build FFmpeg args
    const args = this.buildFfmpegArgs(options, outputPath);
    
    const ffmpegPath = getFfmpegPath();
    console.log(`[transcode] Job ${jobId}: spawning ${ffmpegPath}`);
    console.log(`[transcode] Job ${jobId}: args =`, args.join(' '));

    try {
      await this.runFfmpeg(jobId, ffmpegPath, args, outputPath, onProgress);
      return outputPath;
    } catch (err: any) {
      // If hardware encoding failed, automatically retry with software
      const caps = detectHardwareCapabilities();
      const isHardware = options.useHardwareAccel &&
        (caps.bestCodecH264 !== 'libx264' || caps.bestCodecHevc !== 'libx265');
      
      if (isHardware) {
        console.warn(`[transcode] Job ${jobId}: Hardware encode failed, retrying with software...`);
        onProgress({ percent: 0, fps: 0, speed: '0x', eta: '--:--:--', message: 'Hardware failed, retrying with CPU…' });
        
        const softwareOptions = { ...options, useHardwareAccel: false };
        const softwareArgs = this.buildFfmpegArgs(softwareOptions, outputPath);
        console.log(`[transcode] Job ${jobId}: software fallback args =`, softwareArgs.join(' '));
        
        await this.runFfmpeg(jobId, ffmpegPath, softwareArgs, outputPath, onProgress);
        return outputPath;
      }
      
      throw err;
    }
  }

  private runFfmpeg(
    jobId: string,
    ffmpegPath: string,
    args: string[],
    outputPath: string,
    onProgress: (progress: TranscodeProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.activeJobs.set(jobId, { process: child, outputPath });

      let stderr = ''; // FFmpeg writes progress to stderr!
      let duration = 0;
      let stderrBuffer = ''; // Buffer for incomplete lines

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Parse duration (first occurrence)
        if (duration === 0) {
          const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          if (durationMatch) {
            const [, h, m, s] = durationMatch;
            duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
          }
        }

        // FFmpeg uses \r to overwrite progress line in-place.
        // Split on both \r and \n to get each progress update.
        stderrBuffer += chunk;
        const lines = stderrBuffer.split(/[\r\n]+/);
        stderrBuffer = lines.pop() || ''; // Keep incomplete last segment

        for (const line of lines) {
          // Match: time=00:01:23.45 and speed=1.54x (fps is optional/may be decimal)
          const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          const speedMatch = line.match(/speed=\s*([\d.]+)x/);
          const fpsMatch = line.match(/fps=\s*([\d.]+)/);

          if (timeMatch && speedMatch && duration > 0) {
            const [, h, m, s] = timeMatch;
            const fps = fpsMatch ? fpsMatch[1] : '0';
            const speed = speedMatch[1];
            const currentTime = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
            const percent = Math.min(99, (currentTime / duration) * 100);

            const remaining = duration - currentTime;
            const speedNum = parseFloat(speed);
            const etaSeconds = speedNum > 0 ? remaining / speedNum : 0;
            const etaHours = Math.floor(etaSeconds / 3600);
            const etaMins = Math.floor((etaSeconds % 3600) / 60);
            const etaSecs = Math.floor(etaSeconds % 60);
            const eta = `${etaHours.toString().padStart(2, '0')}:${etaMins.toString().padStart(2, '0')}:${etaSecs.toString().padStart(2, '0')}`;

            onProgress({
              percent,
              fps: Math.round(parseFloat(fps)),
              speed: `${speed}x`,
              eta,
              message: `Transcoding at ${Math.round(parseFloat(fps))} fps (${speed}x realtime)`
            });
          }
        }
      });

      child.on('close', (code) => {
        this.activeJobs.delete(jobId);

        if (code === 0) {
          console.log(`[transcode] Job ${jobId}: completed successfully → ${outputPath}`);
          onProgress({ percent: 100, fps: 0, speed: '1.0x', eta: '00:00:00', message: 'Complete' });
          resolve();
        } else {
          console.error(`[transcode] Job ${jobId}: FFmpeg exited with code ${code}`);
          console.error(`[transcode] Job ${jobId}: stderr (last 1000 chars):`, stderr.slice(-1000));
          // Clean up failed output
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          } catch {}
          reject(new Error(`FFmpeg exited with code ${code}:\n${stderr.slice(-1000)}`));
        }
      });

      child.on('error', (err) => {
        this.activeJobs.delete(jobId);
        reject(err);
      });
    });
  }

  private buildFfmpegArgs(options: TranscodeOptions, outputPath: string): string[] {
    const args: string[] = [];

    // Detect available hardware
    const caps = detectHardwareCapabilities();
    const isHevc = options.outputFormat === 'hevc';
    let codec: string;

    // Select codec intelligently
    if (options.useHardwareAccel) {
      codec = isHevc ? caps.bestCodecHevc : caps.bestCodecH264;
    } else {
      codec = isHevc ? 'libx265' : 'libx264';
    }

    // VAAPI requires hardware device init BEFORE -i
    if (codec.includes('vaapi')) {
      args.push('-vaapi_device', '/dev/dri/renderD128');
    }

    // QSV requires hardware init BEFORE -i
    if (codec.includes('qsv')) {
      args.push('-init_hw_device', 'qsv=hw', '-filter_hw_device', 'hw');
    }

    args.push('-i', options.inputPath);

    // If watermark is provided, add as second input
    const hasWatermark = !!options.watermarkPath;
    if (hasWatermark) {
      args.push('-i', options.watermarkPath!);
    }

    // Determine target height for scaling
    const targetHeight = options.quality === '1080p' ? 1080
      : options.quality === '720p' ? 720
      : 0; // 0 = no scale (original)

    if (hasWatermark) {
      // --- Watermark path: use -filter_complex for overlay ---
      // Build filter: scale source → overlay watermark → [hwupload if needed]
      const scaleExpr = targetHeight > 0 ? `scale=-2:${targetHeight}:flags=lanczos,` : '';
      let filterComplex: string;

      if (codec.includes('vaapi')) {
        // VAAPI: overlay in system memory, then hwupload for encoding
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=iw*0.2:-1,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,format=nv12,hwupload[outv]`;
      } else if (codec.includes('qsv')) {
        // QSV: overlay in system memory, then hwupload for encoding
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=iw*0.2:-1,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24,hwupload=extra_hw_frames=64[outv]`;
      } else {
        // Software / NVENC / VideoToolbox / AMF: overlay in system memory, encoder reads it directly
        filterComplex =
          `[0:v]${scaleExpr}format=yuv420p[base];` +
          `[1:v]scale=iw*0.2:-1,colorchannelmixer=aa=1[wm];` +
          `[base][wm]overlay=W-w-24:H-h-24[outv]`;
      }

      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]');
      args.push('-map', '0:a?');
    } else {
      // --- No watermark: original simple filter path ---
      if (codec.includes('vaapi')) {
        const scaleFilter = targetHeight > 0
          ? `format=nv12,hwupload,scale_vaapi=w=-2:h=${targetHeight}`
          : 'format=nv12,hwupload';
        args.push('-vf', scaleFilter);
      } else if (codec.includes('qsv')) {
        const scaleFilter = targetHeight > 0
          ? `hwupload=extra_hw_frames=64,scale_qsv=w=-2:h=${targetHeight}`
          : 'hwupload=extra_hw_frames=64';
        args.push('-vf', scaleFilter);
      }
    }

    args.push('-c:v', codec);

    // Map user preset to codec-specific parameters
    const userPreset = options.preset || 'balanced';

    // Add codec-specific arguments
    switch (codec) {
      case 'h264_nvenc':
      case 'hevc_nvenc': {
        // NVENC presets: p1(fastest) to p7(best quality)
        const nvPreset = userPreset === 'fast' ? 'p2' : userPreset === 'quality' ? 'p6' : 'p4';
        const nvCq = userPreset === 'fast' ? '28' : userPreset === 'quality' ? '18' : '23';
        args.push('-preset', nvPreset);
        args.push('-rc', 'vbr');
        args.push('-cq', nvCq);
        args.push('-b:v', '0');
        break;
      }

      case 'h264_videotoolbox':
      case 'hevc_videotoolbox': {
        const vtQ = userPreset === 'fast' ? '50' : userPreset === 'quality' ? '80' : '65';
        args.push('-allow_sw', '1');
        args.push('-q:v', vtQ);
        break;
      }

      case 'h264_qsv':
      case 'hevc_qsv': {
        const qsvPreset = userPreset === 'fast' ? 'faster' : userPreset === 'quality' ? 'slow' : 'fast';
        const qsvQ = userPreset === 'fast' ? '28' : userPreset === 'quality' ? '18' : '23';
        args.push('-preset', qsvPreset);
        args.push('-global_quality', qsvQ);
        break;
      }

      case 'h264_vaapi':
      case 'hevc_vaapi': {
        // VAAPI: lower qp = better quality (18-28 typical range)
        const vaapiQp = userPreset === 'fast' ? '28' : userPreset === 'quality' ? '18' : '23';
        args.push('-qp', vaapiQp);
        break;
      }

      case 'libx264':
      case 'libx265': {
        const swPreset = userPreset === 'fast' ? 'faster' : userPreset === 'quality' ? 'slow' : 'fast';
        const swCrf = userPreset === 'fast' ? '28' : userPreset === 'quality' ? '18' : '23';
        args.push('-preset', swPreset);
        args.push('-crf', isHevc ? String(Number(swCrf) + 5) : swCrf);
        break;
      }
    }

    // Scaling (only for non-VAAPI/QSV which handle it in -vf above, and only when no watermark
    // since the watermark filter_complex already handles scaling)
    if (!hasWatermark && !codec.includes('vaapi') && !codec.includes('qsv')) {
      if (options.quality === '1080p') {
        args.push('-vf', 'scale=-2:1080');
      } else if (options.quality === '720p') {
        args.push('-vf', 'scale=-2:720');
      }
    }

    // Audio
    args.push('-c:a', 'aac');
    args.push('-b:a', '320k');

    // Browser compatibility (not needed when filter_complex already sets pix_fmt,
    // and VAAPI handles it in the filter chain)
    if (!codec.includes('vaapi') && !hasWatermark) {
      args.push('-pix_fmt', 'yuv420p');
    }
    
    // Container and output format
    if (isHevc) {
      args.push('-tag:v', 'hvc1');
    }
    args.push('-movflags', '+faststart');

    // Output
    args.push('-y');
    args.push(outputPath);

    return args;
  }

  cancel(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.process.kill('SIGTERM');
      this.activeJobs.delete(jobId);
      
      // Clean up partial output
      try {
        if (fs.existsSync(job.outputPath)) {
          fs.unlinkSync(job.outputPath);
        }
      } catch {}
      
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const [jobId, job] of this.activeJobs.entries()) {
      job.process.kill('SIGTERM');
      try {
        if (fs.existsSync(job.outputPath)) {
          fs.unlinkSync(job.outputPath);
        }
      } catch {}
    }
    this.activeJobs.clear();
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }
}
