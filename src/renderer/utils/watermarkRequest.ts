// Builds the watermark portion of link request bodies (POST /api/magic-link,
// PUT /api/links/:id/recipient-watermarks). Kept free of Vue so it can be unit tested.
import type {
  RecipientWatermarkMode,
  RecipientWatermarkOverride,
  RecipientWatermarkPolicyInput,
  TextWatermarkLayer,
  WatermarkSettings,
  WatermarkSpec,
} from '../types/watermark'
import { isUsableTextLayer, normalizeTextLayer, resolveTemplatePreview } from '../types/watermark'

/** Draft-only image reference meaning "the link's default watermark image". Never sent as-is. */
export const DEFAULT_IMAGE_REF = '@default-image'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export interface LinkWatermarkInput {
  /** Pro features active on this server (text layers are Pro only). */
  premium: boolean
  /** Server path for watermarkFile; empty when no image is used. */
  imageFile: string
  imageSettings: WatermarkSettings
  /** Active text layer, or null when text is off. */
  textLayer: TextWatermarkLayer | null
}

export interface LinkWatermarkFields {
  watermark?: boolean
  watermarkFile?: string
  watermarkSettings?: WatermarkSettings
  watermarkText?: TextWatermarkLayer
}

/** Link-level (shared) watermark fields. Returns {} when there is nothing to apply. */
export function buildLinkWatermarkFields(input: LinkWatermarkInput): LinkWatermarkFields {
  const out: LinkWatermarkFields = {}
  const text = input.premium && isUsableTextLayer(input.textLayer) ? normalizeTextLayer(input.textLayer) : null
  if (input.imageFile) {
    out.watermark = true
    out.watermarkFile = input.imageFile
    if (input.premium) out.watermarkSettings = clone(input.imageSettings)
  }
  if (text) {
    out.watermark = true
    out.watermarkText = text
  }
  return out
}

/** Combine editor parts into a spec. `imageFile` may be DEFAULT_IMAGE_REF in drafts. */
export function buildSpec(parts: {
  imageEnabled: boolean
  imageFile: string
  imageSettings: WatermarkSettings
  textLayer: TextWatermarkLayer | null
}): WatermarkSpec {
  return {
    image: parts.imageEnabled && parts.imageFile ? { file: parts.imageFile, settings: clone(parts.imageSettings) } : null,
    text: isUsableTextLayer(parts.textLayer) ? normalizeTextLayer(parts.textLayer) : null,
  }
}

export function specHasContent(spec: WatermarkSpec | null | undefined): boolean {
  return !!spec && (!!spec.image?.file || isUsableTextLayer(spec.text))
}

/** Replace DEFAULT_IMAGE_REF with the resolved default image (or drop the image if there is none). */
export function resolveSpecImage(spec: WatermarkSpec, defaultImageFile: string): WatermarkSpec {
  if (spec.image?.file !== DEFAULT_IMAGE_REF) return clone(spec)
  return {
    image: defaultImageFile ? { file: defaultImageFile, settings: clone(spec.image.settings) } : null,
    text: spec.text ? clone(spec.text) : null,
  }
}

export interface RecipientIdentity {
  id?: number | null
  username?: string | null
  user_email?: string | null
}

/** Stable key for a recipient row (matches the identifiers sent in users[]). */
export function recipientKey(r: RecipientIdentity): string {
  if (r.id != null && Number(r.id) > 0) return `id:${r.id}`
  if (r.user_email) return `email:${String(r.user_email).toLowerCase()}`
  return `user:${r.username || ''}`
}

export interface RecipientChoice {
  mode: RecipientWatermarkMode
  spec?: WatermarkSpec | null
}

/**
 * Overrides for the recipients still on the link. 'default' entries are omitted
 * (the server treats a missing override as the default).
 */
export function buildRecipientOverrides(
  recipients: RecipientIdentity[],
  choices: Record<string, RecipientChoice | undefined>,
  defaultImageFile: string,
): RecipientWatermarkOverride[] {
  const out: RecipientWatermarkOverride[] = []
  for (const r of recipients) {
    const choice = choices[recipientKey(r)]
    if (!choice || choice.mode === 'default') continue
    const o: RecipientWatermarkOverride = { mode: choice.mode }
    if (r.id != null && Number(r.id) > 0) o.userId = Number(r.id)
    if (r.user_email) o.user_email = r.user_email
    if (r.username) o.username = r.username
    if (choice.mode === 'custom') {
      if (!choice.spec) continue
      o.spec = resolveSpecImage(choice.spec, defaultImageFile)
    }
    out.push(o)
  }
  return out
}

export function buildRecipientPolicy(
  defaultSpec: WatermarkSpec,
  overrides: RecipientWatermarkOverride[],
  enabled = true,
): RecipientWatermarkPolicyInput {
  return { enabled, defaultSpec: clone(defaultSpec), overrides: clone(overrides) }
}

/** magic-link fields when per-recipient copies are on: the base (staff-only) copy is not watermarked. */
export function buildRecipientLinkFields(policy: RecipientWatermarkPolicyInput): {
  watermark: false
  recipientWatermarks: RecipientWatermarkPolicyInput
} {
  return { watermark: false, recipientWatermarks: policy }
}

/** First problem that would make the server reject the policy, or null. */
export function recipientPolicyProblem(policy: RecipientWatermarkPolicyInput): string | null {
  if (!policy.enabled) return null
  if (!specHasContent(policy.defaultSpec)) return 'The default watermark needs an image or text.'
  for (const o of policy.overrides) {
    if (o.mode === 'custom' && !specHasContent(o.spec)) return 'Each custom watermark needs an image or text.'
  }
  return null
}

/**
 * The desktop transcode renders literal text, so resolve link-level variables
 * before handing the layer over. Recipient variables are empty, as on the server.
 */
export function resolveTextLayerForRender(layer: TextWatermarkLayer, vars: { link?: string; date?: string } = {}): TextWatermarkLayer {
  const n = normalizeTextLayer(layer)
  return { ...n, template: resolveTemplatePreview(n.template, { link: vars.link ?? '', date: vars.date }).trim() }
}
