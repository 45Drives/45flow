import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import RolesPanel from './RolesPanel.vue'
import TeamsPanel from './TeamsPanel.vue'
import { initials, normalizeHex } from './accessUi'

vi.mock('../../composables/useTourManager', () => ({ useTourManager: () => ({ requestTour: vi.fn() }) }))
vi.mock('../../composables/useOnboarding', () => ({
  useOnboarding: () => ({ onboarding: { value: { manageRolesTourDone: true } }, markDone: vi.fn() }),
}))

const apps = []
const flush = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve() } }

function mount(component, props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component, props) })
  app.mount(host)
  apps.push(app)
  return host
}

const buttonByText = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text)

afterEach(() => {
  while (apps.length) apps.pop().unmount()
  document.body.innerHTML = ''
})

describe('accessUi helpers', () => {
  it('builds initials from names and usernames', () => {
    expect(initials('Jane Doe')).toBe('JD')
    expect(initials('priya')).toBe('PR')
    expect(initials('mary-ann o.neil')).toBe('MN')
    expect(initials('')).toBe('?')
  })

  it('normalizes hex colours', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc')
    expect(normalizeHex('#A1B2C3')).toBe('#a1b2c3')
    expect(normalizeHex('red')).toBeUndefined()
  })
})

describe('RolesPanel', () => {
  const roles = [
    { id: 1, name: 'Viewer', can_view: 1, can_comment: 0, can_download: 0, can_upload: 0, is_system: 1 },
    { id: 4, name: 'Finance', can_view: 1, can_comment: 0, can_download: 1, can_upload: 0, is_system: 0 },
  ]

  it('lists roles and keeps built-in roles from being deleted', async () => {
    const apiFetch = vi.fn(async () => ({ roles }))
    mount(RolesPanel, { apiFetch })
    await flush()
    const rows = [...document.querySelectorAll('[role="row"]')].slice(1)
    expect(rows.map(r => r.querySelector('.flow-list__title').textContent)).toEqual(['Viewer', 'Finance'])
    const deletes = rows.map(r => [...r.querySelectorAll('button')].find(b => b.textContent.trim() === 'Delete'))
    expect(deletes[0].disabled).toBe(true)
    expect(deletes[1].disabled).toBe(false)
  })

  it('creates a role with the ticked permissions', async () => {
    const apiFetch = vi.fn(async () => ({ roles }))
    const onUpdated = vi.fn()
    mount(RolesPanel, { apiFetch, onUpdated })
    await flush()
    buttonByText('New role').click()
    await flush()
    const name = document.querySelector('#role-form input[type="text"], #role-form input:not([type])')
    name.value = 'Editor'
    name.dispatchEvent(new Event('input'))
    const boxes = document.querySelectorAll('#role-form input[type="checkbox"]')
    boxes[1].click()
    await flush()
    document.querySelector('#role-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()
    const post = apiFetch.mock.calls.find(([url, init]) => url === '/api/roles' && init?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({
      name: 'Editor',
      permissions: { view: true, comment: true, download: false, upload: false },
    })
    expect(onUpdated).toHaveBeenCalled()
  })
})

describe('TeamsPanel', () => {
  it('creates a team with the chosen members', async () => {
    const apiFetch = vi.fn(async (url) => {
      if (url === '/api/groups') return { groups: [] }
      if (url === '/api/users') return [{ id: 7, username: 'jane', name: 'Jane Doe' }, { id: 8, username: 'tom' }]
      return {}
    })
    mount(TeamsPanel, { apiFetch })
    await flush()
    expect(document.body.textContent).toContain('No teams yet')
    buttonByText('New team').click()
    await flush()
    const name = document.querySelector('#team-form input')
    name.value = 'Acme Marketing'
    name.dispatchEvent(new Event('input'))
    const member = document.querySelector('#team-form input[type="checkbox"]')
    member.click()
    await flush()
    document.querySelector('#team-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()
    const post = apiFetch.mock.calls.find(([url, init]) => url === '/api/groups' && init?.method === 'POST')
    const body = JSON.parse(post[1].body)
    expect(body.name).toBe('Acme Marketing')
    expect(body.member_ids).toEqual([7])
  })
})
