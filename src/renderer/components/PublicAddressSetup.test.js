import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const api = vi.hoisted(() => ({ apiFetch: vi.fn(), readiness: { ready: false, reason: 'missing_hostname' } }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: api.apiFetch }) }))
vi.mock('../composables/useExternalAddressReadiness', async (orig) => ({
  ...(await orig()),
  useExternalAddressReadiness: () => ({ checkExternalAddressReady: async () => api.readiness }),
}))

import PublicAddressSetup from './PublicAddressSetup.vue'
import { noipStatusView } from '../utils/noipStatus'

let app, host, events
async function flush() { for (let i = 0; i < 10; i++) await nextTick(); await new Promise(r => setTimeout(r, 0)) }
afterEach(() => { app?.unmount(); host?.remove(); api.apiFetch.mockReset(); api.readiness = { ready: false, reason: 'missing_hostname' } })

function mount(props = {}) {
  events = []
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(PublicAddressSetup, {
      connectionId: 'c1', externalBase: '', externalAuto: true, publicIp: '203.0.113.5',
      onUseHostname: (x) => events.push(['use-hostname', x]), onOpenSection: (x) => events.push(['open-section', x]),
      ...props,
    }),
  })
  app.mount(host)
}
const button = (text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const input = (label) => [...host.querySelectorAll('label')].find(l => l.textContent.trim() === label)?.control
  || host.querySelector(`#${[...host.querySelectorAll('label')].find(l => l.textContent.includes(label))?.htmlFor}`)
async function type(el, v) { el.value = v; el.dispatchEvent(new Event('input')); await flush() }

const status = (extra = {}) => ({ ok: true, entitled: true, enabled: false, hostname: null, hasCredentials: false,
  state: { stopped: false, retryAfterTs: null, lastOutcome: null, lastCode: null, lastIp: null, lastAttemptAt: null, lastSuccessAt: null }, ...extra })

describe('public address setup', () => {
  it('explains the own-domain route with this server\'s IP, and hands the hostname to the address field', async () => {
    api.apiFetch.mockResolvedValue(status())
    mount()
    await flush()
    expect(host.textContent).toContain('203.0.113.5')
    await type(input('Hostname'), 'share.studio.test')
    button('Use share.studio.test').click()
    expect(events).toContainEqual(['use-hostname', 'share.studio.test'])
    expect(host.textContent).toContain("Set a public web address")
    button('HTTPS certificate').click()
    expect(events).toContainEqual(['open-section', 'certificate'])
  })

  it('tells a Free server that No-IP setup needs Pro', async () => {
    api.apiFetch.mockResolvedValue(status({ entitled: false, entitlementReason: 'premium_required' }))
    mount()
    await flush()
    button('No-IP (Pro)').click()
    await flush()
    expect(host.querySelector('[data-testid="noip-upgrade"]').textContent).toContain('45Flow Pro')
    expect(button('Save No-IP')).toBeUndefined()
  })

  it('saves No-IP once, sends an update, and never shows the credentials again', async () => {
    const saved = status({ enabled: true, hostname: 'studio.ddns.net', hasCredentials: true })
    api.apiFetch.mockImplementation(async (url, opts = {}) => {
      if (url === '/api/admin/noip' && !opts.method) return status()
      if (url === '/api/admin/noip' && opts.method === 'PUT') return saved
      if (url === '/api/admin/noip/update') return { ok: true, sent: true, state: { ...saved.state, lastOutcome: 'updated', lastIp: '203.0.113.5' } }
      throw new Error(url)
    })
    mount()
    await flush()
    button('No-IP (Pro)').click()
    await flush()
    await type(input('No-IP hostname'), 'studio.ddns.net')
    await type(input('No-IP username or email'), 'me@studio.test')
    await type(input('No-IP password'), 'pw')
    button('Save No-IP').click()
    await flush()

    const put = api.apiFetch.mock.calls.find(([u, o]) => u === '/api/admin/noip' && o?.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ hostname: 'studio.ddns.net', enabled: true, username: 'me@studio.test', password: 'pw' })
    expect(api.apiFetch).toHaveBeenCalledWith('/api/admin/noip/update', expect.objectContaining({ method: 'POST' }))
    expect(host.querySelector('[data-testid="noip-status"]').textContent).toBe('studio.ddns.net points to 203.0.113.5. 45Flow keeps it updated.')
    expect(input('No-IP password').value).toBe('')
    expect(input('No-IP username or email').placeholder).toContain('Saved')
  })

  it('shows what to fix after No-IP refuses the sign-in', () => {
    const view = noipStatusView(status({ hostname: 'studio.ddns.net', hasCredentials: true, enabled: true,
      state: { stopped: true, lastOutcome: 'auth_error', lastCode: 'badauth' } }))
    expect(view).toEqual({ text: "No-IP didn't accept the username or password. Enter them again and save.", tone: 'danger' })
  })

  it('marks steps done once the address uses the hostname and HTTPS is ready', async () => {
    api.apiFetch.mockResolvedValue(status({ hostname: 'studio.ddns.net', hasCredentials: true, enabled: true }))
    api.readiness = { ready: true, reason: 'hostname_and_certificate_ready' }
    mount({ externalBase: 'https://studio.ddns.net', externalAuto: false })
    await flush()
    expect(host.textContent).toContain('Internet links use studio.ddns.net.')
    expect(host.textContent).toContain('Internet links can be created and copied.')
    expect(button('HTTPS certificate')).toBeUndefined()
  })
})
