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
const checkbox = (text) => [...host.querySelectorAll('label')].find((l) => l.textContent.includes(text))?.querySelector('input')
async function click(el) {
    el.click()
    await flush()
}
async function type(id, value) {
    const input = host.querySelector(`input[placeholder="${id}"]`)
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
})

describe('UploadSpecRulesEditor', () => {
    it('is off by default and emits rules once turned on and filled in', async () => {
        await mount()
        expect(checkbox('Apple ProRes')).toBeUndefined()
        await click(checkbox('Check uploads against file requirements'))
        await click(checkbox('Apple ProRes'))
        await click(checkbox('3840×2160'))
        await click(checkbox('23.976'))
        await click(checkbox('Stereo (2)'))
        await type('1998x1080, 4096x1716', '1998x1080')
        await type('0:30', '1:30')
        expect(model.value).toMatchObject({
            action: 'reject', videoCodecs: ['prores'], resolutions: ['3840x2160', '1998x1080'],
            frameRates: [23.976], audioChannels: [2], minDurationSec: 90, maxDurationSec: null,
        })
        expect(invalid.value).toBe(false)

        await click(checkbox('Check uploads against file requirements'))
        expect(model.value).toBeNull()
    })

    it('flags bad resolutions and durations as invalid', async () => {
        await mount()
        await click(checkbox('Check uploads against file requirements'))
        await type('1998x1080, 4096x1716', 'huge')
        expect(invalid.value).toBe(true)
        expect(host.textContent).toContain('Use width×height')
        await type('1998x1080, 4096x1716', '')
        await type('0:30', '2:00')
        await type('1:00:00', '1:00')
        expect(invalid.value).toBe(true)
        expect(host.textContent).toContain('shortest length is longer')
    })

    it('shows rules loaded from the server, including custom resolutions and durations', async () => {
        await mount({ action: 'flag', videoCodecs: ['dnxhd'], resolutions: ['1920x1080', '1998x1080'], maxDurationSec: 3600 })
        expect(checkbox('Check uploads against file requirements').checked).toBe(true)
        expect(checkbox('Avid DNxHD').checked).toBe(true)
        expect(checkbox('1920×1080').checked).toBe(true)
        expect(host.querySelector('input[placeholder="1998x1080, 4096x1716"]').value).toBe('1998x1080')
        expect(host.querySelector('input[placeholder="1:00:00"]').value).toBe('1:00:00')
        expect(host.querySelector('input[value="flag"]').checked).toBe(true)
    })
})
