/**
 * Watermark Filter Builder (Client-Side)
 * Mirrors the server-side buildWatermarkFilter logic for client-side transcoding
 */

import type { WatermarkSettings } from '../preload'

/**
 * Build FFmpeg watermark overlay filter with custom positioning
 * Falls back to legacy fixed position if settings not provided
 * 
 * @param settings - Custom watermark settings (null = legacy mode)
 * @param videoHeight - Target video height (or null for original)
 * @param sourceHeight - Source video height for legacy calculations
 * @param hwUpload - Hardware upload filter string (e.g., 'format=nv12,hwupload' for VAAPI)
 * @returns FFmpeg filter_complex string
 */
export function buildWatermarkFilter(
  settings: WatermarkSettings | null | undefined,
  videoHeight: number | null,
  sourceHeight: number,
  hwUpload: string | null,
): string {
  console.log('[watermark-filter] called with settings:', JSON.stringify(settings), 'videoHeight:', videoHeight, 'sourceHeight:', sourceHeight)
  const height = videoHeight || sourceHeight

  // Legacy: No custom settings (free version or no customization)
  if (!settings) {
    console.log('[watermark-filter] NO settings — using legacy fixed position')
    const wmW = Math.round(height / 5)
    const scaleExpr = videoHeight ? `scale=-2:${videoHeight}:flags=lanczos,` : ''
    const base = videoHeight ? `[0:v]${scaleExpr}format=yuv420p[base];` : '[0:v]format=yuv420p[base];'
    const tail = hwUpload
      ? `[base][wm]overlay=W-w-24:H-h-24,${hwUpload}[outv]`
      : '[base][wm]overlay=W-w-24:H-h-24[outv]'

    return base + `[1:v]scale=${wmW}:-1:flags=lanczos,colorchannelmixer=aa=1[wm];` + tail
  }

  // Premium: Custom settings (position, scale, opacity, rotation)
  console.log('[watermark-filter] CUSTOM settings — using premium positioning')
  const scale = settings.scale || 35
  const opacity = (settings.opacity !== undefined ? settings.opacity : 70) / 100
  const rotation = settings.rotation || 0
  const pos = settings.position || { x: 3, y: 3, xUnit: '%', yUnit: '%', anchor: 'bottom-right' }
  console.log('[watermark-filter] scale:', scale, 'opacity:', opacity, 'rotation:', rotation, 'pos:', JSON.stringify(pos))

  // Calculate watermark dimensions
  const wmSize = Math.round((height * scale) / 100)

  // Calculate overlay position based on anchor and offset
  let overlayX = 'W-w-24' // default bottom-right X
  let overlayY = 'H-h-24' // default bottom-right Y

  if (pos.xUnit === '%') {
    switch (pos.anchor) {
      case 'top-left':
      case 'bottom-left':
        overlayX = `W*${pos.x / 100}`
        break
      case 'top-right':
      case 'bottom-right':
        overlayX = `W-w-W*${pos.x / 100}`
        break
      case 'center':
        overlayX = `(W-w)/2+W*${pos.x / 100}`
        break
    }
  } else {
    // px unit
    switch (pos.anchor) {
      case 'top-left':
      case 'bottom-left':
        overlayX = String(pos.x)
        break
      case 'top-right':
      case 'bottom-right':
        overlayX = `W-w-${pos.x}`
        break
      case 'center':
        overlayX = `(W-w)/2+${pos.x}`
        break
    }
  }

  if (pos.yUnit === '%') {
    switch (pos.anchor) {
      case 'top-left':
      case 'top-right':
        overlayY = `H*${pos.y / 100}`
        break
      case 'bottom-left':
      case 'bottom-right':
        overlayY = `H-h-H*${pos.y / 100}`
        break
      case 'center':
        overlayY = `(H-h)/2+H*${pos.y / 100}`
        break
    }
  } else {
    // px unit
    switch (pos.anchor) {
      case 'top-left':
      case 'top-right':
        overlayY = String(pos.y)
        break
      case 'bottom-left':
      case 'bottom-right':
        overlayY = `H-h-${pos.y}`
        break
      case 'center':
        overlayY = `(H-h)/2+${pos.y}`
        break
    }
  }

  // Build filter chain
  const scaleExpr = videoHeight ? `scale=-2:${videoHeight}:flags=lanczos,` : ''
  const base = videoHeight ? `[0:v]${scaleExpr}format=yuv420p[base];` : '[0:v]format=yuv420p[base];'

  let watermarkChain = `[1:v]scale=${wmSize}:-1:flags=lanczos[scaled];`

  // Apply opacity if not fully opaque
  if (opacity < 1.0) {
    watermarkChain += `[scaled]format=yuva420p,colorchannelmixer=aa=${opacity}[transparent];`
  } else {
    watermarkChain += `[scaled]format=yuva420p,colorchannelmixer=aa=1[transparent];`
  }

  // Apply rotation if needed
  if (rotation > 0 && rotation !== 360) {
    const rotRad = (rotation * Math.PI) / 180
    watermarkChain += `[transparent]rotate=${rotRad}:ow='hypot(iw,ih)':oh=ow:c=none[rotated];`
  } else {
    watermarkChain += `[transparent]null[rotated];`
  }

  const overlay = `[base][rotated]overlay=${overlayX}:${overlayY}`
  const tail = hwUpload ? `${overlay},${hwUpload}[outv]` : `${overlay}[outv]`

  return base + watermarkChain + tail
}
