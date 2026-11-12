import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import UploadSpecRulesEditor from './UploadSpecRulesEditor.vue'

let app
let host
const model = ref(null)
const invalid = ref(false)

async function flush() {
    for (let i = 0; i < 4; i++) await nextTick()
}
async function mount(initial = null) {
    model.value = initial
    invalid.value = false
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({
        render: () => h(UploadSpecRulesEditor, {
            modelValue: model.value,
            'onUpdate:modelValue': (v) => { model.value = v },
            'onUpdate:invalid': (v) => { invalid.value = v },
        }),
    })
    app.mount(host)
    await flush()
}
// The requirements dialog is teleported to <body>; jsdom never finishes its leave transition, so skip closing ones.
const dialog = () => document.body.querySelector('.flow-modal:not(.flow-modal-leave-active) [role="dialog"]')
const all = (sel) => [...host.querySelectorAll(sel), ...(dialog()?.querySelectorAll(sel) ?? [])]
const checkbox = (text) => all('label').find((l) => l.textContent.includes(text))?.querySelector('input')
const button = (text) => all('button').find((b) => b.textContent.trim() === text)
const field = (placeholder) => dialog().querySelector(`input[placeholder="${placeholder}"]`)
const toggleSwitch = () => host.querySelector('[role="switch"]')
async function click(el) {
    el.click()
    await flush()
}
async function type(id, value) {
    const input = field(id)
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    document.body.querySelectorAll('.flow-modal').forEach((el) => el.remove())
})

describe('UploadSpecRulesEditor', () => {
    it('is off by default, opens the dialog when turned on and summarises the rules after Done', async () => {
        await mount()
        expect(dialog()).toBeNull()
        await click(toggleSwitch())
        expect(dialog()).not.toBeNull()
        await click(checkbox('Apple ProRes'))
        await click(checkbox('3840×2160'))
        await click(checkbox('23.976'))
        await click(checkbox('Stereo (2)'))
        await type('1998x1080, 4096x1716', '1998x1080')
        await type('0:30', '1:30')
        await click(button('Done'))
        expect(dialog()).toBeNull()
        expect(model.value).toMatchObject({
            action: 'reject', videoCodecs: ['prores'], resolutions: ['3840x2160', '1998x1080'],
            frameRates: [23.976], audioChannels: [2], minDurationSec: 90, maxDurationSec: null,
        })
        expect(invalid.value).toBe(false)
        expect(host.textContent).toContain('Apple ProRes')
        expect(host.textContent).toContain('3840×2160 or 1998×1080')
        expect(host.textContent).toContain('at least 1:30')

        await click(toggleSwitch())
        expect(model.value).toBeNull()
    })

    it('puts everything back on Cancel, including the switch', async () => {
        await mount({ videoCodecs: ['h264'] })
        await click(button('Edit requirements…'))
        await click(checkbox('Apple ProRes'))
        expect(model.value.videoCodecs).toEqual(['h264', 'prores'])
        await click(button('Cancel'))
        expect(model.value.videoCodecs).toEqual(['h264'])

        await click(toggleSwitch())
        expect(model.value).toBeNull()
        await click(toggleSwitch())
        expect(dialog()).toBeNull()
        expect(model.value.videoCodecs).toEqual(['h264'])
    })

    it('flags bad resolutions and durations as invalid and blocks Done', async () => {
        await mount()
        await click(toggleSwitch())
        await type('1998x1080, 4096x1716', 'huge')
        expect(invalid.value).toBe(true)
        expect(dialog().textContent).toContain('Use width×height')
        expect(button('Done').disabled).toBe(true)
        await type('1998x1080, 4096x1716', '')
        await type('0:30', '2:00')
        await type('1:00:00', '1:00')
        expect(invalid.value).toBe(true)
        expect(dialog().textContent).toContain('shortest length is longer')
    })

    it('shows rules loaded from the server, including custom resolutions and durations', async () => {
        await mount({ action: 'flag', videoCodecs: ['dnxhd'], resolutions: ['1920x1080', '1998x1080'], maxDurationSec: 3600 })
        expect(toggleSwitch().getAttribute('aria-checked')).toBe('true')
        expect(host.textContent).toContain('accepted but flagged')
        expect(host.textContent).toContain('up to 1:00:00')
        await click(button('Edit requirements…'))
        expect(checkbox('Avid DNxHD').checked).toBe(true)
        expect(checkbox('1920×1080').checked).toBe(true)
        expect(field('1998x1080, 4096x1716').value).toBe('1998x1080')
        expect(field('1:00:00').value).toBe('1:00:00')
        expect(dialog().querySelector('input[value="flag"]').checked).toBe(true)
    })
})
