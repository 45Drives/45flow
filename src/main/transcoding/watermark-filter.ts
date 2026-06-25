/**
 * Watermark Filter Builder (Client-Side)
 * Mirrors the server-side buildWatermarkFilter logic for client-side transcoding
 */

import type { WatermarkSettings } from '../preload'

/**
 * Compute FFmpeg overlay X:Y expressions that match the CSS preview positioning.
 *
 * CSS positions the watermark's UNROTATED bounding box, then rotates visually
 * around center (transform-origin: center). The center stays in place.
 *
 * In FFmpeg, the watermark is first rotated (expanding canvas via rotw/roth),
 * then positioned via overlay=X:Y. To match CSS, we compute where the CENTER
 * of the unrotated watermark should be, then position the rotated overlay so
 * its center is at that point: overlayX = center_x - w/2.
 */
export function computeOverlayPosition(
  pos: { x: number; y: number; xUnit: string; yUnit: string; anchor: string },
  origW: number,
  origH: number,
): { overlayX: string; overlayY: string } {
  const halfW = Math.round(origW / 2)
  const halfH = Math.round(origH / 2)

  let overlayX: string
  let overlayY: string

  // X positioning
  if (pos.xUnit === '%') {
    switch (pos.anchor) {
      case 'top-left':
      case 'bottom-left':
        overlayX = `W*${pos.x / 100}+${halfW}-w/2`
        break
      case 'top-right':
      case 'bottom-right':
        overlayX = `W*${(100 - pos.x) / 100}-${halfW}-w/2`
        break
      case 'center':
      default:
        overlayX = '(W-w)/2'
        break
    }
  } else {
    switch (pos.anchor) {
      case 'top-left':
      case 'bottom-left':
        overlayX = `${pos.x}+${halfW}-w/2`
        break
      case 'top-right':
      case 'bottom-right':
        overlayX = `W-${pos.x}-${halfW}-w/2`
        break
      case 'center':
      default:
        overlayX = '(W-w)/2'
        break
    }
  }

  // Y positioning
  if (pos.yUnit === '%') {
    switch (pos.anchor) {
      case 'top-left':
      case 'top-right':
        overlayY = `H*${pos.y / 100}+${halfH}-h/2`
        break
      case 'bottom-left':
      case 'bottom-right':
        overlayY = `H*${(100 - pos.y) / 100}-${halfH}-h/2`
        break
      case 'center':
      default:
        overlayY = '(H-h)/2'
        break
    }
  } else {
    switch (pos.anchor) {
      case 'top-left':
      case 'top-right':
        overlayY = `${pos.y}+${halfH}-h/2`
        break
      case 'bottom-left':
      case 'bottom-right':
        overlayY = `H-${pos.y}-${halfH}-h/2`
        break
      case 'center':
      default:
        overlayY = '(H-h)/2'
        break
    }
  }

  return { overlayX, overlayY }
}

/**
 * Build FFmpeg watermark overlay filter with custom positioning
 * Falls back to legacy fixed position if settings not provided
 * 
 * @param settings - Custom watermark settings (null = legacy mode)
 * @param videoHeight - Target video height (or null for original)
 * @param sourceHeight - Source video height for legacy calculations
 * @param hwUpload - Hardware upload filter string (e.g., 'format=nv12,hwupload' for VAAPI)
 * @param wmDims - Optional probed watermark dimensions { width, height }
 * @returns FFmpeg filter_complex string
 */
export function buildWatermarkFilter(
  settings: WatermarkSettings | null | undefined,
  videoHeight: number | null,
  sourceHeight: number,
  hwUpload: string | null,
  wmDims?: { width: number; height: number } | null,
): string {
  console.log('[watermark-filter] called with settings:', JSON.stringify(settings), 'videoHeight:', videoHeight, 'sourceHeight:', sourceHeight, 'wmDims:', wmDims)
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

  // wmSize = target watermark height (scale% of video height, matching CSS preview)
  const wmSize = Math.round((height * scale) / 100)
  const wmAspect = (wmDims?.width && wmDims?.height) ? wmDims.width / wmDims.height : null
  const wmW = wmAspect ? Math.round(wmSize * wmAspect) : wmSize // fallback: assume square

  // Compute overlay position using center-based model (matches CSS transform-origin: center)
  const { overlayX, overlayY } = computeOverlayPosition(pos, wmW, wmSize)

  // Build filter chain — scale by height to match CSS preview
  const scaleExpr = videoHeight ? `scale=-2:${videoHeight}:flags=lanczos,` : ''
  const base = videoHeight ? `[0:v]${scaleExpr}format=yuv420p[base];` : '[0:v]format=yuv420p[base];'

  let watermarkChain = wmAspect
    ? `[1:v]scale=${wmW}:${wmSize}:flags=lanczos[scaled];`
    : `[1:v]scale=-1:${wmSize}:flags=lanczos[scaled];`

  // Apply opacity if not fully opaque
  if (opacity < 1.0) {
    watermarkChain += `[scaled]format=yuva420p,colorchannelmixer=aa=${opacity}[transparent];`
  } else {
    watermarkChain += `[scaled]format=yuva420p,colorchannelmixer=aa=1[transparent];`
  }

  // Apply rotation if needed (positive radians = clockwise, same as CSS)
  // Use ow=rotw(a):oh=roth(a) to expand output to the rotated bounding box
  // so the watermark is not clipped at the original image bounds.
  if (rotation > 0 && rotation !== 360) {
    const rotRad = (rotation * Math.PI) / 180
    watermarkChain += `[transparent]rotate=${rotRad}:ow=rotw(${rotRad}):oh=roth(${rotRad}):c=none[rotated];`
  } else {
    watermarkChain += `[transparent]null[rotated];`
  }

  const overlay = `[base][rotated]overlay=${overlayX}:${overlayY}`
  const tail = hwUpload ? `${overlay},${hwUpload}[outv]` : `${overlay}[outv]`

  return base + watermarkChain + tail
}
