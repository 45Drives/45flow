import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminOwnershipInventoryPanel from './AdminOwnershipInventoryPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app
let host
async function flush() { for (let i = 0; i < 10; i++) await nextTick() }
async function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminOwnershipInventoryPanel, { connectionId: 'server' })
    app.mount(host)
    await flush()
}
function setSelect(label, value) {
    const select = Array.from(host.querySelectorAll('select')).find(item => item.getAttribute('aria-label') === label)
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
})

const reviewState = () => ({
    period: '2026-Q4',
    group: 'staff',
    groupExists: true,
    members: ['alice', 'bob'],
    accounts: [
        { staffAccountId: 'staff-a', username: 'alice', uid: 1001, member: true, identityAvailable: true,
            lastSuccessfulLoginAt: 1_800_000_000_000, inactive90Days: true, loginRecordUnavailable: false,
            ownedProjects: 1, ownedLinks: 0 },
        { staffAccountId: 'staff-b', username: 'bob', uid: 1002, member: true, identityAvailable: true,
            lastSuccessfulLoginAt: null, inactive90Days: false, loginRecordUnavailable: true,
            ownedProjects: 0, ownedLinks: 0 },
    ],
    legacyUnassigned: { projects: 1, links: 0 },
    review: null,
})

describe('quarterly account review', () => {
    it('shows report-only inactivity, requires explicit review acknowledgement, and records it', async () => {
        const state = reviewState()
        mocks.apiFetch.mockImplementation(async (url, init) => {
            if (url === '/api/admin/account-review' && init?.method !== 'POST') return state
            if (url === '/api/admin/account-review/complete') {
                state.review = { reviewedAt: 1_800_000_000_000, reviewedBy: 'staff-a', snapshot: {} }
                return { ok: true }
            }
            if (url.startsWith('/api/admin/ownership-inventory')) return { kind: 'project', items: [], nextAfter: null }
            throw new Error(`Unexpected request: ${url}`)
        })
        await mount()
        expect(host.textContent).toContain('2026-Q4')
        expect(host.textContent).toContain('never automatically disabled')
        expect(host.textContent).toContain('No successful sign-in in 90 days')
        expect(host.textContent).toContain('No sign-in history is available yet')
        expect(host.textContent).toContain('No review has been recorded')
        Array.from(host.querySelectorAll('button')).find(button => button.textContent.includes('Record quarterly review')).click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/account-review/complete', expect.objectContaining({
            method: 'POST', body: '{}',
        }))
        expect(host.textContent).toContain('Review recorded')
    })

    it('transfers attributable resources only to a selected current staff account', async () => {
        const state = reviewState()
        mocks.apiFetch.mockImplementation(async (url, init) => {
            if (url === '/api/admin/account-review' && init?.method !== 'POST') return state
            if (url === '/api/admin/account-review/transfer') return { ok: true, transferred: { projects: 1, links: 0 } }
            if (url.startsWith('/api/admin/ownership-inventory')) return { kind: 'project', items: [], nextAfter: null }
            throw new Error(`Unexpected request: ${url}`)
        })
        await mount()
        setSelect('Transfer ownership from alice to', 'staff-b')
        await flush()
        Array.from(host.querySelectorAll('button')).find(button => button.textContent.includes('Transfer owned resources')).click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/account-review/transfer', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ sourceStaffId: 'staff-a', targetStaffId: 'staff-b' }),
        }))
    })

    it('manually assigns an unassigned legacy record and paginates without inferring an owner', async () => {
        const state = reviewState()
        let inventoryCalls = 0
        mocks.apiFetch.mockImplementation(async (url, init) => {
            if (url === '/api/admin/account-review' && init?.method !== 'POST') return state
            if (url === '/api/admin/account-review/assign') return { ok: true }
            if (url.startsWith('/api/admin/ownership-inventory')) {
                inventoryCalls++
                if (url.includes('after=1')) return {
                    kind: 'project',
                    items: [{ id: 2, label: 'Second project', disabled: false, ownership: 'unassigned', owner: null }],
                    nextAfter: null,
                }
                return {
                    kind: 'project',
                    items: [{ id: 1, label: 'Legacy project', disabled: false, ownership: 'unassigned', owner: null }],
                    nextAfter: 1,
                }
            }
            throw new Error(`Unexpected request: ${url}`)
        })
        await mount()
        expect(host.textContent).toContain('Unassigned legacy record')
        setSelect('Assign project 1 to staff member', 'staff-b')
        await flush()
        Array.from(host.querySelectorAll('button')).find(button => button.textContent.includes('Assign ownership')).click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/account-review/assign', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ resourceType: 'project', resourceId: 1, targetStaffId: 'staff-b' }),
        }))
        Array.from(host.querySelectorAll('button')).find(button => button.textContent.includes('Load more'))?.click()
        await flush()
        expect(inventoryCalls).toBeGreaterThanOrEqual(3)
        expect(host.textContent).toContain('Second project')
    })

    it('shows server incompatibility and request failures', async () => {
        mocks.apiFetch.mockImplementation(async url => {
            if (url === '/api/admin/account-review') return reviewState()
            throw Object.assign(new Error('not found'), { status: 404 })
        })
        await mount()
        expect(host.textContent).toContain('Update the server to view the ownership inventory')
        mocks.apiFetch.mockRejectedValue(new Error('offline'))
        Array.from(host.querySelectorAll('button')).find(button => button.textContent.includes('Refresh review')).click()
        await flush()
        expect(host.textContent).toContain("Couldn't load the quarterly account review: offline")
    })
})
