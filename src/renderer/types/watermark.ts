/**
 * Premium Watermark Customization Types
 * These types support advanced watermark positioning, scaling, opacity, and rotation
 */

export type PositionAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
export type PositionUnit = 'px' | '%'

export interface WatermarkPosition {
  x: number // horizontal offset from anchor
  y: number // vertical offset from anchor
  xUnit: PositionUnit
  yUnit: PositionUnit
  anchor: PositionAnchor
}

export interface WatermarkSettings {
  // Position configuration
  position: WatermarkPosition
  // Scale as percentage of video height (10-100)
  scale: number
  // Opacity (0-100)
  opacity: number
  // Rotation in degrees (0-360)
  rotation: number
}

export interface WatermarkPreset {
  id: string
  name: string
  description?: string
  settings: WatermarkPresetSettings
  isCustom?: boolean // User-created preset vs. default
  createdAt?: string
}

// ── Text watermarks (Pro) ────────────────────────────────────────────────

export type WatermarkFont = 'sans' | 'sans-bold' // DejaVu Sans / DejaVu Sans Bold
export type TextLayout = 'single' | 'tiled'

export interface TextWatermarkLayer {
  /** 1..200 chars; may contain WATERMARK_TEXT_VARIABLES tokens */
  template: string
  font: WatermarkFont
  /** '#RRGGBB' */
  color: string
  /** Dark outline for legibility */
  outline: boolean
  /** 'tiled' repeats the text over the whole frame (position is ignored) */
  layout: TextLayout
  /** scale = text height as % of frame height (1..30) */
  settings: WatermarkSettings
}

/**
 * Preset settings may carry a text layer. The preset API stores `settings`
 * verbatim, so the optional `text` field round-trips without a server change.
 */
export type WatermarkPresetSettings = WatermarkSettings & { text?: TextWatermarkLayer }

export interface WatermarkSpec {
  /** file = same value as the link-level watermarkFile */
  image: { file: string; settings: WatermarkSettings } | null
  text: TextWatermarkLayer | null
}

export type RecipientWatermarkMode = 'default' | 'custom' | 'none'

export interface RecipientWatermarkOverride {
  userId?: number
  user_email?: string
  username?: string
  mode: RecipientWatermarkMode
  /** Required when mode === 'custom' */
  spec?: WatermarkSpec
}

export interface RecipientWatermarkPolicyInput {
  enabled: boolean
  /** Must contain image or text when enabled */
  defaultSpec: WatermarkSpec
  overrides: RecipientWatermarkOverride[]
}

export type RecipientCopyJobStatus = { status: string; progress?: number | null; error?: string | null }

export interface RecipientCopyRow {
  userId: number
  name?: string | null
  email?: string | null
  company?: string | null
  via?: 'user' | 'group'
  mode: RecipientWatermarkMode
  spec: WatermarkSpec | null
  status: { state: 'ready' | 'processing' | 'failed' | 'none'; done: number; total: number; failed: number }
  files: Array<{ fileId: number; name: string; jobs: Record<string, RecipientCopyJobStatus | null | undefined> }>
}

/** GET/PUT /api/links/:id/recipient-watermarks response */
export interface RecipientWatermarksResponse {
  ok: boolean
  enabled: boolean
  defaultSpec: WatermarkSpec | null
  recipients: RecipientCopyRow[]
}

export const TEXT_TEMPLATE_MAX_LENGTH = 200
export const TEXT_SCALE_MIN = 1
export const TEXT_SCALE_MAX = 30

export const WATERMARK_TEXT_VARIABLES = [
  { token: '{recipient}', label: 'Recipient name' },
  { token: '{email}', label: 'Email' },
  { token: '{company}', label: 'Company' },
  { token: '{date}', label: 'Date' },
  { token: '{link}', label: 'Link title' },
] as const

/** Variables that only have a value in a per-recipient copy. */
export const RECIPIENT_TEXT_VARIABLES = ['{recipient}', '{email}', '{company}'] as const

export interface TemplateSample {
  recipient?: string
  email?: string
  company?: string
  /** YYYY-MM-DD; defaults to today */
  date?: string
  link?: string
}

export function createDefaultTextLayer(): TextWatermarkLayer {
  return {
    template: 'Confidential – {recipient} – {date}',
    font: 'sans-bold',
    color: '#FFFFFF',
    outline: true,
    layout: 'single',
    settings: {
      position: { x: 3, y: 3, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
      scale: 4,
      opacity: 60,
      rotation: 0,
    },
  }
}

export function todayIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Client-side substitution of template variables, for previews (and for the
 * desktop transcode, which renders literal text). Unknown `{…}` are kept as typed.
 * Missing recipient values resolve to empty, like the server's link-level renders.
 */
export function resolveTemplatePreview(template: string, sample: TemplateSample = {}): string {
  const values: Record<string, string> = {
    '{recipient}': sample.recipient ?? '',
    '{email}': sample.email ?? '',
    '{company}': sample.company ?? '',
    '{date}': sample.date ?? todayIsoDate(),
    '{link}': sample.link ?? '',
  }
  return String(template ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\{(recipient|email|company|date|link)\}/g, (token) => values[token])
}

export function templateUsesRecipientVariables(template: string | null | undefined): boolean {
  const t = String(template ?? '')
  return RECIPIENT_TEXT_VARIABLES.some(v => t.includes(v))
}

/** Clean a text layer for a request body: collapse newlines, trim, clamp ranges. */
export function normalizeTextLayer(layer: TextWatermarkLayer): TextWatermarkLayer {
  const clamp = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  const s = layer.settings
  return {
    template: String(layer.template ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, TEXT_TEMPLATE_MAX_LENGTH),
    font: layer.font === 'sans' ? 'sans' : 'sans-bold',
    color: /^#[0-9a-fA-F]{6}$/.test(layer.color) ? layer.color.toUpperCase() : '#FFFFFF',
    outline: !!layer.outline,
    layout: layer.layout === 'tiled' ? 'tiled' : 'single',
    settings: {
      position: { ...s.position },
      scale: clamp(Number(s.scale), TEXT_SCALE_MIN, TEXT_SCALE_MAX, 4),
      opacity: clamp(Number(s.opacity), 0, 100, 60),
      rotation: clamp(Number(s.rotation), 0, 360, 0),
    },
  }
}

export function isUsableTextLayer(layer: TextWatermarkLayer | null | undefined): layer is TextWatermarkLayer {
  return !!layer && String(layer.template ?? '').trim().length > 0
}

export interface Default45FlowWatermark {
  id: string
  name: string
  path: string // e.g., '/assets/watermarks/45drives.png' or '/assets/logos/45Flow-grad.png'
  description?: string
}

/**
 * Extended watermark configuration passed to transcoder
 */
export interface WatermarkConfig {
  // Image source
  imagePath: string
  // Customization settings (premium only)
  settings?: WatermarkSettings
}

/**
 * Default preset definitions
 */
export const DEFAULT_WATERMARK_PRESETS: WatermarkPreset[] = [
  {
    id: 'bottom-right-small',
    name: 'Bottom Right (Small)',
    description: 'Small watermark in bottom-right corner',
    settings: {
      position: { x: 2, y: 2, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
      scale: 20,
      opacity: 70,
      rotation: 0,
    },
  },
  {
    id: 'bottom-right-large',
    name: 'Bottom Right (Large)',
    description: 'Larger watermark in bottom-right corner',
    settings: {
      position: { x: 3, y: 3, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
      scale: 35,
      opacity: 70,
      rotation: 0,
    },
  },
  {
    id: 'center-translucent',
    name: 'Center (Translucent)',
    description: 'Large semi-transparent center watermark',
    settings: {
      position: { x: 0, y: 0, xUnit: '%', yUnit: '%', anchor: 'center' },
      scale: 50,
      opacity: 30,
      rotation: 0,
    },
  },
  {
    id: 'top-left-corner',
    name: 'Top Left Corner',
    description: 'Watermark in top-left corner',
    settings: {
      position: { x: 2, y: 2, xUnit: '%', yUnit: '%', anchor: 'top-left' },
      scale: 25,
      opacity: 80,
      rotation: 0,
    },
  },
  {
    id: 'diagonal-watermark',
    name: 'Diagonal (Rotated)',
    description: 'Rotated watermark across center',
    settings: {
      position: { x: 0, y: 0, xUnit: '%', yUnit: '%', anchor: 'center' },
      scale: 40,
      opacity: 25,
      rotation: 315,
    },
  },
]

/**
 * Create default watermark settings
 */
export function createDefaultWatermarkSettings(): WatermarkSettings {
  return {
    position: { x: 3, y: 3, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
    scale: 35,
    opacity: 70,
    rotation: 0,
  }
}

/**
 * Default 45Flow watermark images
 * Includes both dedicated watermarks and logo variations
 * These are served from houston-broadcaster's built-in assets
 */
export const DEFAULT_45FLOW_WATERMARKS: Default45FlowWatermark[] = [
  {
    id: '45drives',
    name: '45Drives',
    path: '/.watermarks-builtin/45drives.png',
    description: '45Drives logo with fan',
  },
  {
    id: '45drives-nofan',
    name: '45Drives (No Fan)',
    path: '/.watermarks-builtin/45drives-nofan.png',
    description: '45Drives logo without fan',
  },
  {
    id: '45fan',
    name: '45 Fan',
    path: '/.watermarks-builtin/45fan.png',
    description: '45Drives fan icon',
  },
  {
    id: '45homelab',
    name: '45HomeLab',
    path: '/.watermarks-builtin/45homelab.png',
    description: '45HomeLab branding',
  },
  {
    id: '45professional',
    name: '45Professional',
    path: '/.watermarks-builtin/45professional.png',
    description: '45Professional branding',
  },
  {
    id: '45studio',
    name: '45Studio',
    path: '/.watermarks-builtin/45studio.png',
    description: '45Studio branding',
  },
  {
    id: '45flow-grad',
    name: '45Flow Gradient',
    path: '/.watermarks-builtin/45Flow-grad.png',
    description: '45Flow logo with gradient',
  },
  {
    id: '45flow-w',
    name: '45Flow White',
    path: '/.watermarks-builtin/45Flow-w.png',
    description: '45Flow logo in white',
  },
]
