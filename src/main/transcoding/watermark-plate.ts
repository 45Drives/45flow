/**
 * Watermark plate renderer (desktop). Mirrors houston-broadcaster
 * server/utils/watermarkPlate.js: a text layer (optionally over an image layer)
 * is rendered into a transparent, full-frame PNG at the source's display size,
 * which the existing image-watermark paths then overlay with FULL_FRAME_SETTINGS.
 *
 * The text goes through a file (drawtext textfile= + expansion=none) and ffmpeg
 * runs with cwd set to a private temp dir, so no user text or path is ever
 * interpolated into a filter string (this also sidesteps Windows path escaping).
 */
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { app } from 'electron'
import type { DesktopTextWatermark, WatermarkSettings } from '../preload'
import { computeOverlayPosition } from './watermark-filter'

export const FULL_FRAME_SETTINGS: WatermarkSettings = {
  position: { x: 0, y: 0, xUnit: '%', yUnit: '%', anchor: 'center' },
  scale: 100,
  opacity: 100,
  rotation: 0,
}

const FONT_FILES: Record<string, string> = { sans: 'DejaVuSans.ttf', 'sans-bold': 'DejaVuSans-Bold.ttf' }
const MAX_PLATE_SIDE = 4096
const MAX_CANVAS_W = 16000
const MAX_TEXT_LEN = 200

function fontDirs(): string[] {
  const dirs: string[] = []
  if (process.resourcesPath) dirs.push(path.join(process.resourcesPath, 'static', 'fonts'))
  try {
    dirs.push(path.join(app.getAppPath(), 'src', 'main', 'static', 'fonts'))
  } catch { /* app not ready in tests */ }
  for (let up = 1; up <= 5; up++) {
    dirs.push(path.join(__dirname, ...Array(up).fill('..'), 'src', 'main', 'static', 'fonts'))
  }
  dirs.push('/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu-sans-fonts', '/usr/share/fonts/dejavu')
  return dirs
}

export function resolveFontPath(font: string): string {
  const name = FONT_FILES[font] || FONT_FILES['sans-bold']
  for (const dir of fontDirs()) {
    const p = path.join(dir, name)
    try {
      if (fs.statSync(p).isFile()) return p
    } catch { /* keep looking */ }
  }
  throw new Error(`watermark font not found: ${name}`)
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LEN)
}

/** Resolve a text layer for a desktop render. Recipient variables have no value here. */
export function resolveDesktopText(layer: DesktopTextWatermark, linkTitle = '', now = new Date()): string {
  if (layer.text) return cleanText(layer.text)
  const values: Record<string, string> = {
    '{recipient}': '',
    '{email}': '',
    '{company}': '',
    '{date}': now.toISOString().slice(0, 10),
    '{link}': cleanText(linkTitle),
  }
  return cleanText(String(layer.template || '').replace(/\{(recipient|email|company|date|link)\}/g, (m) => values[m] ?? ''))
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error(`${path.basename(cmd)} timed out`))
    }, 60_000)
    p.stdout.on('data', (d) => { stdout += d.toString('utf8') })
    p.stderr.on('data', (d) => {
      stderr += d.toString('utf8')
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000)
    })
    p.on('error', (e) => { clearTimeout(timer); reject(e) })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-600)}`))
    })
  })
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

function parseLastBbox(stderr: string) {
  const re = /x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g
  let m: RegExpExecArray | null
  let last: RegExpExecArray | null = null
  while ((m = re.exec(stderr))) last = m
  if (!last) return null
  const [x1, x2, y1, y2] = last.slice(1).map(Number)
  return { x1, x2, y1, y2 }
}

async function imageDims(ffprobePath: string, absPath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await run(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', absPath])
  const st = JSON.parse(stdout || '{}')?.streams?.[0] || {}
  const width = Number(st.width)
  const height = Number(st.height)
  if (!(width > 0 && height > 0)) throw new Error(`could not read watermark image size: ${absPath}`)
  return { width, height }
}

function layerChain(input: string, w: number, h: number, s: WatermarkSettings, label: string): string {
  let chain = `[${input}]format=rgba,scale=${w}:${h}:flags=lanczos,colorchannelmixer=aa=${(s.opacity / 100).toFixed(4)}`
  if (s.rotation > 0 && s.rotation !== 360) {
    const rad = ((s.rotation * Math.PI) / 180).toFixed(6)
    chain += `,rotate=${rad}:ow=rotw(${rad}):oh=roth(${rad}):c=none`
  }
  return `${chain}[${label}]`
}

const canvasInput = (W: number, H: number, plate: string | null) =>
  plate ? ['-i', plate] : ['-f', 'lavfi', '-i', `color=c=black@0.0:s=${W}x${H},format=rgba`]

export async function renderDesktopWatermarkPlate(opts: {
  ffmpegPath: string
  ffprobePath: string
  sourceWidth: number
  sourceHeight: number
  text: DesktopTextWatermark
  linkTitle?: string
  imagePath?: string | null
  imageSettings?: WatermarkSettings | null
  outPath: string
}): Promise<string> {
  const { ffmpegPath } = opts
  const k = Math.min(1, MAX_PLATE_SIDE / Math.max(opts.sourceWidth, opts.sourceHeight))
  const W = even(opts.sourceWidth * k)
  const H = even(opts.sourceHeight * k)
  const textValue = resolveDesktopText(opts.text, opts.linkTitle)
  const work = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-wm-'))
  try {
    let plate: string | null = null

    if (opts.imagePath && opts.imageSettings) {
      const dims = await imageDims(opts.ffprobePath, opts.imagePath)
      const s = opts.imageSettings
      const lh = Math.max(2, Math.round((H * s.scale) / 100))
      const lw = Math.max(2, Math.round(lh * (dims.width / dims.height)))
      const { overlayX, overlayY } = computeOverlayPosition(s.position, lw, lh)
      await run(ffmpegPath, [
        '-hide_banner', '-nostdin', '-y', ...canvasInput(W, H, null), '-i', opts.imagePath,
        '-filter_complex', `${layerChain('1:v', lw, lh, s, 'l')};[0:v]format=rgba[b];[b][l]overlay=${overlayX}:${overlayY}:format=rgb,format=rgba[o]`,
        '-map', '[o]', '-frames:v', '1', 'plate-1.png',
      ], work)
      plate = 'plate-1.png'
    }

    if (textValue) {
      const s = opts.text.settings
      const fontSize = Math.max(8, Math.round((H * s.scale) / 100))
      fs.copyFileSync(resolveFontPath(opts.text.font), path.join(work, 'font.ttf'))
      fs.writeFileSync(path.join(work, 'text.txt'), textValue, 'utf8')
      const color = /^#[0-9a-fA-F]{6}$/.test(opts.text.color) ? opts.text.color.slice(1) : 'FFFFFF'
      const border = opts.text.outline ? `:borderw=${Math.max(1, Math.round(fontSize * 0.05))}:bordercolor=0x000000@0.65` : ''
      const draw = `drawtext=fontfile=font.ttf:textfile=text.txt:expansion=none:fontsize=${fontSize}:fontcolor=0x${color}${border}:x=${Math.ceil(fontSize * 0.3)}:y=(h-text_h)/2`
      const canvasH = even(fontSize * 1.8)
      let canvasW = even(Math.min(MAX_CANVAS_W, textValue.length * fontSize * 0.75 + fontSize * 2))
      let crop: { w: number; h: number; x: number; y: number } | null = null
      for (let attempt = 0; attempt < 3 && !crop; attempt++) {
        const canvas = `color=c=black@0.0:s=${canvasW}x${canvasH},format=rgba`
        const { stderr } = await run(ffmpegPath, ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', canvas,
          '-vf', `${draw},alphaextract,bbox=min_val=24`, '-frames:v', '1', '-f', 'null', '-'], work)
        const box = parseLastBbox(stderr)
        if (!box) throw new Error('watermark text rendered empty')
        if (box.x2 >= canvasW - 2 && canvasW < MAX_CANVAS_W) {
          canvasW = even(Math.min(MAX_CANVAS_W, canvasW * 2))
          continue
        }
        const x = Math.max(0, box.x1 - 1)
        const y = Math.max(0, box.y1 - 1)
        crop = { x, y, w: even(Math.min(canvasW - x, box.x2 - box.x1 + 3)), h: even(Math.min(canvasH - y, box.y2 - box.y1 + 3)) }
        await run(ffmpegPath, ['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', canvas,
          '-vf', `${draw},crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, '-frames:v', '1', 'text.png'], work)
      }
      if (!crop) throw new Error('watermark text is too long to render')

      if (opts.text.layout === 'tiled') {
        const rad = ((s.rotation || 0) * Math.PI) / 180
        const rotW = Math.abs(crop.w * Math.cos(rad)) + Math.abs(crop.h * Math.sin(rad))
        const rotH = Math.abs(crop.w * Math.sin(rad)) + Math.abs(crop.h * Math.cos(rad))
        const cellW = even(rotW + Math.max(crop.h * 2, Math.round(W * 0.04)))
        const cellH = even(rotH + Math.max(crop.h * 2, Math.round(H * 0.06)))
        const cols = Math.min(64, Math.ceil(W / cellW) + 1)
        const rows = Math.min(64, Math.ceil(H / cellH) + 1)
        const offX = Math.max(0, Math.round((cols * cellW - W) / 2))
        const offY = Math.max(0, Math.round((rows * cellH - H) / 2))
        await run(ffmpegPath, [
          '-hide_banner', '-nostdin', '-y', ...canvasInput(W, H, plate), '-loop', '1', '-i', 'text.png',
          '-filter_complex', [
            layerChain('1:v', crop.w, crop.h, s, 'r'),
            `[r]pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black@0.0,tile=${cols}x${rows},crop=${W}:${H}:${offX}:${offY}[t]`,
            '[0:v]format=rgba[b]',
            '[b][t]overlay=0:0:format=rgb,format=rgba[o]',
          ].join(';'),
          '-map', '[o]', '-frames:v', '1', 'plate-2.png',
        ], work)
      } else {
        const { overlayX, overlayY } = computeOverlayPosition(s.position, crop.w, crop.h)
        await run(ffmpegPath, [
          '-hide_banner', '-nostdin', '-y', ...canvasInput(W, H, plate), '-i', 'text.png',
          '-filter_complex', `${layerChain('1:v', crop.w, crop.h, s, 'l')};[0:v]format=rgba[b];[b][l]overlay=${overlayX}:${overlayY}:format=rgb,format=rgba[o]`,
          '-map', '[o]', '-frames:v', '1', 'plate-2.png',
        ], work)
      }
      plate = 'plate-2.png'
    }

    if (!plate) throw new Error('empty watermark')
    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true })
    fs.copyFileSync(path.join(work, plate), opts.outPath)
    return opts.outPath
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
