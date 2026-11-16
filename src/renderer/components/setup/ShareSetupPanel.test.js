import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ShareSetupPanel from './ShareSetupPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.includes(text))
const status = extra => ({
  ready: true,
  storageRoot: { configured: true, path: '/tank', fstype: 'zfs' },
  shareAddress: { externalBase: 'https://share.example.com', httpsPort: 443 },
  ...extra,
})

async function mount(initialStatus = status()) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(ShareSetupPanel, { status: initialStatus, connectionId: 'server-one' })
  app.mount(host)
  await flush()
}

beforeEach(() => mocks.apiFetch.mockReset())
afterEach(() => { app?.unmount(); host?.remove() })

describe('sharing setup panel', () => {
  it('saves a public address directly from the wizard', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: true })
    await mount()
    const address = host.querySelector('input[type="url"]')
    expect(address.value).toBe('https://share.example.com')
    address.value = 'https://files.example.com/'
    address.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    button('Save address').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/setup/settings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ externalBase: 'https://files.example.com' }),
    }))
    expect(host.textContent).toContain('Share address saved.')
  })

  it('restores automatic address detection from the wizard', async () => {
    mocks.apiFetch.mockImplementation(async url => url === '/api/setup/status'
      ? status({ shareAddress: { externalBase: 'https://detected.example.com', httpsPort: 443 } })
      : { ok: true })
    await mount()
    button('Use automatic address').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/setup/settings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ externalBase: 'auto' }),
    }))
    expect(host.querySelector('input[type="url"]').value).toBe('https://detected.example.com')
  })

  it('loads certificate details only when advanced options open and installs a trusted certificate', async () => {
    let finishSetup
    mocks.apiFetch.mockImplementation(url => {
      if (url === '/api/settings/letsencrypt/status') {
        return Promise.resolve({ certMode: 'self-signed', certDomain: null, certEmail: null, valid: false })
      }
      if (url === '/api/settings/letsencrypt/setup') return new Promise(resolve => { finishSetup = resolve })
      return Promise.resolve({ ok: true })
    })
    await mount()
    expect(mocks.apiFetch).not.toHaveBeenCalled()
    const details = host.querySelector('details')
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/settings/letsencrypt/status', { timeoutMs: 15_000 })
    const inputs = host.querySelectorAll('input')
    inputs[1].value = 'files.example.com'
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    inputs[2].value = 'admin@example.com'
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    button('Set up trusted certificate').click()
    await flush()
    expect(host.querySelector('[role="status"]').textContent).toContain('Installing the certificate')
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/settings/letsencrypt/setup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ domain: 'files.example.com', email: 'admin@example.com' }),
      timeoutMs: 120_000,
    }))
    finishSetup({ domain: 'files.example.com', message: 'Trusted certificate installed.' })
    await flush()
    expect(host.textContent).toContain('Trusted certificate installed.')
  })

  it('shows the result of an internet access check without opening Settings', async () => {
    mocks.apiFetch.mockResolvedValue({ issues: [{ message: 'HTTPS is blocked.' }] })
    await mount()
    button('Test internet access').click()
    await flush()
    expect(host.textContent).toContain('HTTPS is blocked.')
  })
})
