import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_REF,
  buildLinkWatermarkFields,
  buildRecipientOverrides,
  buildRecipientPolicy,
  buildSpec,
  recipientKey,
  recipientPolicyProblem,
} from './watermarkRequest'
import { createDefaultTextLayer, createDefaultWatermarkSettings, resolveTemplatePreview } from '../types/watermark'

const settings = createDefaultWatermarkSettings()

describe('watermark request bodies', () => {
  it('drops text layers when Pro is not active', () => {
    const text = createDefaultTextLayer()
    expect(buildLinkWatermarkFields({ premium: false, imageFile: '', imageSettings: settings, textLayer: text })).toEqual({})
    expect(buildLinkWatermarkFields({ premium: true, imageFile: '', imageSettings: settings, textLayer: text }))
      .toMatchObject({ watermark: true, watermarkText: { template: text.template } })
  })

  it('sends only non-default overrides and swaps the default-image placeholder for the real file', () => {
    const recipients = [{ id: 4, user_email: 'a@x.test' }, { id: 5 }, { user_email: 'new@x.test' }]
    const custom = buildSpec({ imageEnabled: true, imageFile: DEFAULT_IMAGE_REF, imageSettings: settings, textLayer: null })
    const overrides = buildRecipientOverrides(recipients, {
      [recipientKey({ id: 4 })]: { mode: 'custom', spec: custom },
      [recipientKey({ id: 5 })]: { mode: 'default' },
      [recipientKey({ user_email: 'new@x.test' })]: { mode: 'none' },
    }, 'logo.png')
    expect(overrides).toEqual([
      { mode: 'custom', userId: 4, user_email: 'a@x.test', spec: { image: { file: 'logo.png', settings }, text: null } },
      { mode: 'none', user_email: 'new@x.test' },
    ])
  })

  it('flags a policy the server would reject', () => {
    const empty = buildSpec({ imageEnabled: false, imageFile: '', imageSettings: settings, textLayer: null })
    expect(recipientPolicyProblem(buildRecipientPolicy(empty, []))).toMatch(/image or text/)
    expect(recipientPolicyProblem(buildRecipientPolicy(empty, [], false))).toBeNull()
  })

  it('previews templates with sample values and blanks missing recipient fields', () => {
    expect(resolveTemplatePreview('For {recipient} <{email}> {date}\n{link}', { recipient: 'Ana', date: '2026-11-11', link: 'Cut 3' }))
      .toBe('For Ana <> 2026-11-11 Cut 3')
  })
})
