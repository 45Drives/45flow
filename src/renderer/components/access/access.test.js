import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import RolesPanel from './RolesPanel.vue'
import TeamsPanel from './TeamsPanel.vue'
import LinkAccessList from './LinkAccessList.vue'
import { initials, normalizeHex, pickLinkRoleId, usernameFromName } from './accessUi'

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
    expect(initials('Jordan (Editor)')).toBe('JE')
  })

  it('normalizes hex colours', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc')
    expect(normalizeHex('#A1B2C3')).toBe('#a1b2c3')
    expect(normalizeHex('red')).toBeUndefined()
  })

  // The system roles a fresh Broadcaster ships with
  const systemRoles = [
    { id: 1, name: 'editor', can_view: 1, can_comment: 1, can_download: 1, can_upload: 1 },
    { id: 2, name: 'viewer', can_view: 1, can_comment: 0, can_download: 0, can_upload: 0 },
    { id: 3, name: 'feedback', can_view: 1, can_comment: 1, can_download: 0, can_upload: 0 },
  ]

  it('invites reviewers as feedback so they can comment without uploading', () => {
    expect(pickLinkRoleId(systemRoles, 'view')).toBe(3)
    expect(pickLinkRoleId(systemRoles, 'comment')).toBe(3)
    expect(pickLinkRoleId(systemRoles, undefined)).toBe(3)
  })

  it('invites upload-link clients with a role that can upload', () => {
    expect(pickLinkRoleId(systemRoles, 'upload')).toBe(1)
  })

  it('falls back to a comment-only role, then viewer, when feedback is missing', () => {
    const custom = [
      { id: 7, name: 'Producer', can_view: 1, can_comment: 1, can_download: 1, can_upload: 1 },
      { id: 8, name: 'Client review', can_view: 1, can_comment: 1, can_download: 1, can_upload: 0 },
      { id: 9, name: 'viewer', can_view: 1, can_comment: 0, can_download: 0, can_upload: 0 },
    ]
    expect(pickLinkRoleId(custom, 'view')).toBe(8)
    expect(pickLinkRoleId(custom.filter(r => r.id !== 8), 'view')).toBe(9)
    expect(pickLinkRoleId(custom.filter(r => r.id !== 8), 'comment')).toBe(7)
    expect(pickLinkRoleId([], 'view')).toBeNull()
  })

  it('suggests a username from the client name', () => {
    expect(usernameFromName('Jane Doe')).toBe('jane.doe')
    expect(usernameFromName('  José   Núñez ')).toBe('jose.nunez')
    expect(usernameFromName("Mary-Ann O'Neil")).toBe('mary-ann.oneil')
    expect(usernameFromName('Acme Corp (Post)')).toBe('acme.corp.post')
    expect(usernameFromName('')).toBe('')
    expect(usernameFromName('李雷')).toBe('')
    expect(usernameFromName('a'.repeat(50)).length).toBe(32)
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

describe('LinkAccessList', () => {
  const users = [
    { user_id: 5, user_name: 'dana', name: 'Dana Ortiz', role_name: 'Reviewer' },
    { user_id: 6, user_name: 'lee', name: 'Lee Park', role_name: 'Viewer', pending: 'removed' },
    { user_id: -1, user_name: 'sam', name: 'Sam Reid', role_name: 'Viewer', pending: 'added' },
  ]
  const groups = [{ group_id: 2, group_name: 'Acme Marketing', member_count: 3, role_name: 'Commenter', pending: 'changed' }]

  it('is read-only and shows no edit tags when not editable', async () => {
    const host = mount(LinkAccessList, { users: [users[0]], groups: [] })
    await flush()
    expect(host.textContent).toContain('Dana Ortiz')
    expect(host.querySelectorAll('button')).toHaveLength(0)
  })

  it('marks unsaved changes and offers Undo for removed rows', async () => {
    const onRemoveUser = vi.fn()
    const onUndoUser = vi.fn()
    const host = mount(LinkAccessList, { users, groups, editable: true, onRemoveUser, onUndoUser })
    await flush()
    const rowFor = (name) => [...host.querySelectorAll('.flow-list__row')].find(r => r.textContent.includes(name))
    expect(rowFor('Lee Park').textContent).toContain('Will be removed')
    expect(rowFor('Sam Reid').textContent).toContain('New')
    expect(rowFor('Acme Marketing').textContent).toContain('Role changed')

    rowFor('Lee Park').querySelector('button').click()
    rowFor('Dana Ortiz').querySelector('button').click()
    expect(onUndoUser).toHaveBeenCalledWith(6)
    expect(onRemoveUser).toHaveBeenCalledWith(5)
  })

  it('says loading only while there is nothing to show yet', async () => {
    const loadingEmpty = mount(LinkAccessList, { users: [], groups: [], loading: true })
    await flush()
    expect(loadingEmpty.textContent).toContain('Loading')
    const loadingWithRows = mount(LinkAccessList, { users: [users[0]], groups: [], loading: true })
    await flush()
    expect(loadingWithRows.textContent).toContain('Dana Ortiz')
  })
})
