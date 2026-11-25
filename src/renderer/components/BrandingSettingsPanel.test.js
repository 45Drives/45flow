// Branding settings: composable contract with /api/branding and the tabbed panel.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

vi.mock('@45drives/houston-common-ui', () => ({
    pushNotification: vi.fn(),
    Notification: class { constructor(...args) { this.args = args } },
}))

const { useBrandingSettings } = await import('../composables/useBrandingSettings')
const { default: BrandingSettingsPanel } = await import('./BrandingSettingsPanel.vue')

const SERVER = {
    enabled: true, companyName: 'Acme', enforcedTheme: 'custom', customPrimary: '#112233', customSecondary: '',
    logoLight: 'logo_light_0a1b2c3d.png', favicon: 'favicon_0a1b2c3d.png', backgroundImage: null,
    colorMode: 'dark', fontFamily: 'geometric', attribution: 'footer', backgroundTexture: false,
    supportUrl: 'support.acme.example', customCss: '.panel { border-width: 2px; }',
}

let app
let host
async function flush() { for (let i = 0; i < 6; i++) await nextTick() }
afterEach(() => { app?.unmount(); host?.remove(); app = null; vi.restoreAllMocks() })

function setup(apiFetch) {
    const saved = vi.fn()
    const branding = useBrandingSettings({ apiFetch, baseUrl: ref('https://hb.local'), isPremiumActive: ref(true), onSaved: saved })
    return { branding, saved }
}

async function mountPanel(branding) {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({ render: () => h(BrandingSettingsPanel, { branding }) })
    app.mount(host)
    await flush()
}
const tab = (name) => [...host.querySelectorAll('[role="tab"]')].find((el) => el.textContent.includes(name))
const visiblePanel = () => [...host.querySelectorAll('[role="tabpanel"]')].find((el) => el.style.display !== 'none')

describe('useBrandingSettings', () => {
    it('loads every field, is clean after load, and saves the whole form', async () => {
        const apiFetch = vi.fn(async (url, init) => (init?.method === 'POST' ? { ok: true } : SERVER))
        const { branding, saved } = setup(apiFetch)
        await branding.load()

        expect(branding.form).toMatchObject({
            companyName: 'Acme', colorMode: 'dark', fontFamily: 'geometric', attribution: 'footer',
            backgroundTexture: false, customSecondary: '#b02428', customCss: '.panel { border-width: 2px; }',
        })
        expect(branding.assets.favicon.previewUrl).toBe('https://hb.local/branding/logos/favicon_0a1b2c3d.png')
        expect(branding.dirty.value).toBe(false)
        expect(saved).toHaveBeenCalledTimes(1)

        branding.form.cornerStyle = 'pill'
        expect(branding.dirty.value).toBe(true)
        await branding.save()
        const body = JSON.parse(apiFetch.mock.calls.at(-1)[1].body)
        expect(body).toMatchObject({ cornerStyle: 'pill', customCss: '.panel { border-width: 2px; }', attribution: 'footer' })
        expect(branding.dirty.value).toBe(false)
    })

    it('flags bad new URLs and colors but keeps accepting existing loose support URLs', async () => {
        const { branding } = setup(vi.fn(async () => SERVER))
        await branding.load()
        expect(branding.validationError.value).toBeNull()
        branding.form.termsUrl = 'javascript:alert(1)'
        expect(branding.validationError.value).toMatch(/terms url/)
        branding.form.termsUrl = ''
        branding.form.linkColor = '#12'
        expect(branding.validationError.value).toMatch(/link color/)
    })

    it('clears uploaded images and saves the defaults', async () => {
        const apiFetch = vi.fn(async (url, init) => (init ? { ok: true } : SERVER))
        const { branding } = setup(apiFetch)
        await branding.load()
        await branding.clearAll()
        const calls = apiFetch.mock.calls.map(([url, init]) => `${init?.method || 'GET'} ${url}`)
        expect(calls).toEqual(expect.arrayContaining([
            'DELETE /api/branding/logo/logo_light', 'DELETE /api/branding/logo/favicon', 'POST /api/branding',
        ]))
        expect(calls).not.toContain('DELETE /api/branding/logo/background')
        expect(JSON.parse(apiFetch.mock.calls.at(-1)[1].body)).toMatchObject({ enabled: false, customCss: '', attribution: 'header' })
    })
})

describe('BrandingSettingsPanel', () => {
    it('switches tabs, previews the chosen font, and seeds the CSS editor', async () => {
        const { branding } = setup(vi.fn(async () => ({ ...SERVER, customCss: '' })))
        await branding.load()
        await mountPanel(branding)

        expect(visiblePanel().id).toBe('branding-panel-identity')
        expect(host.querySelector('[data-testid="branding-preview"] [style*="font-family"]').getAttribute('style')).toContain('Avenir')

        tab('Custom CSS').click()
        await flush()
        expect(visiblePanel().id).toBe('branding-panel-css')
        expect(host.querySelector('[data-testid="branding-preview"]')).toBeNull()
        ;[...host.querySelectorAll('button')].find((b) => b.textContent.includes('Start from example')).click()
        await flush()
        expect(branding.form.customCss).toContain('data-flow-view="upload"')
        expect(tab('Custom CSS').textContent).toContain('On')
    })

    it('opens the CSS tab with the server reason when custom CSS is rejected', async () => {
        const apiFetch = vi.fn(async (url, init) => {
            if (init?.method === 'POST') throw Object.assign(new Error('@import is not allowed. Paste the rules directly instead.'), { code: 'invalid_css' })
            return SERVER
        })
        const { branding } = setup(apiFetch)
        await branding.load()
        await mountPanel(branding)
        await branding.save()
        await flush()
        expect(visiblePanel().id).toBe('branding-panel-css')
        expect(visiblePanel().textContent).toContain('Not saved: @import is not allowed')
    })
})
