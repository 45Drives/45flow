import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import SetupSettingsPanel from './SetupSettingsPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), connection: null }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: mocks.connection }) }))
vi.mock('../FolderPicker.vue', () => ({
  default: { props: ['modelValue', 'base', 'startDir'], emits: ['update:modelValue'], template: '<div :data-picker-base="base"><button @click="$emit(\'update:modelValue\', \'tank/shared\')">Choose global folder</button><button @click="$emit(\'update:modelValue\', \'other/shared\')">Choose outside folder</button></div>' },
}))
vi.mock('../../ui/FlowSwitch.vue', () => ({
  default: { props: ['modelValue', 'disabled', 'label'], emits: ['update:modelValue'], template: '<button role="switch" :aria-label="label" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue ? \'On\' : \'Off\' }}</button>' },
}))
let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.includes(text))
const status = extra => ({
  ready: true, storageRoot: { configured: true, path: '/tank', fstype: 'zfs' },
  malwareScan: { required: true, scannerAvailable: false, locked: false },
  adminGroup: { required: true, exists: true, members: ['alice', 'bob'], currentUserIsMember: true },
  watermarks: { globalEnabled: false, globalDir: '' }, ...extra,
})
async function mount(section) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(SetupSettingsPanel, { section, connectionId: 'server-one' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  mocks.connection = ref({ username: 'alice' })
  mocks.apiFetch.mockReset()
})
afterEach(() => { app?.unmount(); host?.remove() })
describe('shared setup / Settings panels', () => {
  it('adds and removes existing staff users while protecting the signed-in user', async () => {
    let bobMember = true
    mocks.apiFetch.mockImplementation(async (url, init) => {
      if (url === '/api/setup/status') return status()
      if (init?.method === 'POST') { bobMember = JSON.parse(init.body).member; return { ok: true } }
      return { members: bobMember ? ['alice', 'bob'] : ['alice'], accounts: [{ username: 'alice', member: true }, { username: 'bob', member: bobMember }] }
    })
    await mount('staff')
    const removes = [...host.querySelectorAll('button')].filter(item => item.textContent === 'Remove')
    expect(removes[0].disabled).toBe(true)
    removes[1].click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/staff-accounts', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'bob', member: false }) }))
    button('Add').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/staff-accounts', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'bob', member: true }) }))
  })
  it('warns before saving an unscanned upload policy and supports scanner installation', async () => {
    mocks.apiFetch.mockImplementation(async url => url === '/api/setup/status' ? status() : { ok: true })
    await mount('uploads')
    host.querySelector('[role=switch]').click()
    await flush()
    expect(host.textContent).toContain('may contain malware')
    button('Allow uploads without scanning').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/setup/settings', expect.objectContaining({ body: JSON.stringify({ malwareScanPolicy: 'skip' }) }))
    button('Install scanner').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/malware-scanner/install', expect.objectContaining({ method: 'POST', retry: 0 }))
  })
  it('shows a locked scanning policy without allowing edits', async () => {
    mocks.apiFetch.mockResolvedValue(status({ malwareScan: { required: true, scannerAvailable: false, locked: true } }))
    await mount('uploads')
    expect(host.querySelector('[role=switch]').disabled).toBe(true)
    expect(button('Save scanning policy').disabled).toBe(true)
    expect(host.textContent).toContain('locked by the server configuration')
  })
  it('constrains the global watermark folder to the storage root and saves an absolute path', async () => {
    mocks.apiFetch.mockImplementation(async url => url === '/api/setup/status' ? status() : { ok: true })
    await mount('watermarks')
    host.querySelector('[role=switch]').click()
    await flush()
    expect(host.querySelector('[data-picker-base="/tank"]')).not.toBeNull()
    button('Choose outside folder').click()
    await flush()
    button('Save watermarks').click()
    await flush()
    expect(host.textContent).toContain('inside the storage root')
    expect(mocks.apiFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    button('Choose global folder').click()
    await flush()
    button('Save watermarks').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/setup/settings', expect.objectContaining({ body: JSON.stringify({ globalWatermarkEnabled: true, globalWatermarkDir: '/tank/shared' }) }))
  })
})
