import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import WatermarkCustomizer from './WatermarkCustomizer.vue'
import { createDefaultTextLayer, createDefaultWatermarkSettings } from '../types/watermark'

vi.mock('../composables/useApi', () => ({
  useApi: () => ({ apiFetch: vi.fn(async () => ({ ok: true, presets: [] })) }),
}))
vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: vi.fn(),
  Notification: vi.fn(),
}))

let app
let host
let text
let image
const clone = (value) => JSON.parse(JSON.stringify(value))

async function mount({ textLayer = createDefaultTextLayer(), ...props } = {}) {
  text = ref(textLayer)
  image = ref(createDefaultWatermarkSettings())
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(WatermarkCustomizer, {
      allowText: true,
      imageEnabled: false,
      ...props,
      textLayer: text.value,
      modelValue: image.value,
      'onUpdate:textLayer': (value) => { text.value = value },
      'onUpdate:modelValue': (value) => { image.value = value },
    }),
  })
  app.mount(host)
  await nextTick()
  const preview = host.querySelector('[data-testid="wm-text-preview"]')?.parentElement ||
    host.querySelector('img[alt="Watermark preview"]').parentElement
  vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 200 })
  return preview
}

function mouse(target, type, x, y) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }))
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
})

describe('watermark preview dragging', () => {
  it.each([
    ['top-left', '%', { x: 13, y: 13 }],
    ['bottom-right', '%', { x: -7, y: -7 }],
    ['top-left', 'px', { x: 43, y: 23 }],
    ['bottom-right', 'px', { x: -37, y: -17 }],
  ])('moves single text from %s in %s without changing image settings', async (anchor, unit, expected) => {
    const layer = createDefaultTextLayer()
    layer.settings.position = { x: 3, y: 3, anchor, xUnit: unit, yUnit: unit }
    const original = clone(layer)
    const preview = await mount({ textLayer: layer })
    const originalImage = clone(image.value)
    mouse(preview, 'mousedown', 100, 100)
    mouse(document, 'mousemove', 140, 120)
    await nextTick()
    expect(text.value.settings.position).toEqual({ ...original.settings.position, ...expected })
    expect(image.value).toEqual(originalImage)
    expect(text.value).toEqual({
      ...original,
      settings: { ...original.settings, position: { ...original.settings.position, ...expected } },
    })
    expect(layer).toEqual(original)
    mouse(document, 'mouseup', 140, 120)
    mouse(document, 'mousemove', 180, 160)
    await nextTick()
    expect(text.value.settings.position).toEqual({ ...original.settings.position, ...expected })
  })

  it.each(['center', 'tiled'])('keeps %s text fixed and does not advertise dragging', async (mode) => {
    const layer = createDefaultTextLayer()
    if (mode === 'center') layer.settings.position.anchor = 'center'
    else layer.layout = 'tiled'
    const original = clone(layer)
    const preview = await mount({ textLayer: layer })
    mouse(preview, 'mousedown', 100, 100)
    mouse(document, 'mousemove', 140, 120)
    await nextTick()
    expect(text.value).toEqual(original)
    expect(preview.classList.contains('cursor-grab')).toBe(false)
    expect(host.textContent).not.toContain('Drag the watermark to position it')
  })

  it('preserves image dragging when no text layer is active', async () => {
    const preview = await mount({ textLayer: null, imageEnabled: true, watermarkPreviewUrl: '/logo.png' })
    const original = clone(image.value)
    mouse(preview, 'mousedown', 100, 100)
    mouse(document, 'mousemove', 140, 120)
    await nextTick()
    expect(image.value.position).toEqual({
      ...original.position, x: original.position.x - 10, y: original.position.y - 10,
    })
    expect(text.value).toBeNull()
    mouse(document, 'mouseup', 140, 120)
  })
})
