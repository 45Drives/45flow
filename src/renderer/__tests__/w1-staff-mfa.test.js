// Gate G6: staff two-step sign-in in the desktop and browser clients (gates/w1-staff-mfa.md).
// Mocked fetch and API fixtures: these prove what the clients send and show, not that a real
// server, authenticator app or device works. That is gate G7.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'

const mocks = vi.hoisted(() => ({
    apiFetch: vi.fn(), apiCalls: [], connections: [], activeConnection: null, updateConnection: vi.fn(), notify: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: mocks.notify, Notification: vi.fn() }))
vi.mock('../composables/useSessionPersistence', () => ({ clearLastSession: vi.fn() }))
vi.mock('../composables/useConnections', () => ({
    useConnections: () => ({
        activeConnection: mocks.activeConnection,
        getConnection: id => mocks.connections.find(connection => connection.connectionId === id),
        updateConnection: mocks.updateConnection,
    }),
}))
vi.mock('../composables/useApi', async importOriginal => ({
    ...(await importOriginal()),
    useApi: (...args) => { mocks.apiCalls.push(args); return { apiFetch: mocks.apiFetch } },
}))

import {
    browserMfaTransport, enrollmentMessage, fetchMfaTransport, formatSecret, mfaChallenge,
} from '../composables/staffMfa'
import { signInWithSession } from '../web-session'
import { handleUnauthorized } from '../composables/useApi'
import StaffMfaEnrollModal from '../components/modals/StaffMfaEnrollModal.vue'
import AdminStaffMfaPanel from '../components/AdminStaffMfaPanel.vue'
import BackupOwnershipReview from '../components/BackupOwnershipReview.vue'
import StaffMfaRecovery from '../components/StaffMfaRecovery.vue'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = async () => { for (let i = 0; i < 6; i++) await nextTick() }
const find = (selector, text) => [...document.body.querySelectorAll(selector)].find(el => !text || el.textContent.includes(text))
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input')) }

let app
let host
afterEach(() => {
    app?.unmount()
    host?.remove()
    document.querySelectorAll('.flow-modal').forEach(modal => modal.remove())
    app = host = undefined
    vi.unstubAllGlobals()
    mocks.apiFetch.mockReset()
    mocks.apiCalls.length = 0
    mocks.notify.mockClear()
})

describe('what the server can answer at sign-in', () => {
    it('names each two-step answer and ignores everything else', () => {
        expect(mfaChallenge('mfa_required')).toBe('required')
        expect(mfaChallenge('invalid_mfa_code')).toBe('invalid')
        expect(mfaChallenge('mfa_locked')).toBe('locked')
        expect(mfaChallenge('mfa_enrollment_required')).toBe('enrollment-required')
        expect(mfaChallenge('entitlement_expired')).toBeNull()
        expect(mfaChallenge(undefined)).toBeNull()
    })

    it('turns a failed call into an error that keeps the server code, status and message', async () => {
        const send = fetchMfaTransport(async () => json({ error: 'enrollment_not_approved', message: 'not yet' }, 403))
        await expect(send('/api/mfa/enroll/begin', {})).rejects.toMatchObject({ code: 'enrollment_not_approved', status: 403, message: 'not yet' })
        const ok = browserMfaTransport(async () => json({ ok: true, requestCode: 'ABCD-EFGH' }))
        await expect(ok('/api/mfa/enroll/request', {})).resolves.toMatchObject({ requestCode: 'ABCD-EFGH' })
    })

    it('gives plain advice for the enrollment failures a person can fix', () => {
        expect(enrollmentMessage({ status: 401 })).toMatch(/username or password/)
        expect(enrollmentMessage({ code: 'enrollment_not_approved' })).toMatch(/approved|expired/)
        expect(enrollmentMessage({ code: 'mfa_locked' })).toMatch(/15 minutes/)
        expect(formatSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
    })
})

describe('browser sign-in', () => {
    it('sends the authenticator code only when there is one, and surfaces the server code on refusal', async () => {
        const fetch = vi.fn(async () => json({ user: { name: 'sam', admin: true }, csrfToken: 'c', expiresAt: 'x' }))
        vi.stubGlobal('fetch', fetch)
        await signInWithSession('sam', 'pw', 'build')
        await signInWithSession('sam', 'pw', 'build', '123456')
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: 'sam', password: 'pw', clientBuildDate: 'build' })
        expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ mfaCode: '123456' })

        vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'mfa_required', message: 'Enter your code' }, 401)))
        await expect(signInWithSession('sam', 'pw')).rejects.toMatchObject({ code: 'mfa_required', message: 'Enter your code', status: 401 })
    })
})

describe('desktop session recovery', () => {
    beforeEach(() => {
        mocks.connections = [reactive({
            connectionId: 'c1', baseUrl: 'https://server.invalid', token: 'old', username: 'sam', savedPassword: 'pw', name: 'Studio',
        })]
        mocks.activeConnection = ref(mocks.connections[0])
        mocks.updateConnection.mockImplementation((id, updates) => Object.assign(mocks.connections[0], updates))
    })

    it('does not loop on a saved password when the server now wants a code: it signs out and says why', async () => {
        const fetch = vi.fn(async () => json({ error: 'mfa_required', message: 'Enter your code' }, 401))
        vi.stubGlobal('fetch', fetch)
        await expect(handleUnauthorized('c1', 'old')).resolves.toBe('signed-out')
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: 'sam', password: 'pw' })
        expect(mocks.connections[0]).toMatchObject({ token: '', savedPassword: undefined })
        expect(mocks.connections[0].lastError).toMatch(/authenticator code/)
    })
})

describe('StaffMfaEnrollModal', () => {
    const send = vi.fn()
    const mount = (props = {}) => {
        host = document.createElement('div')
        document.body.appendChild(host)
        const events = { update: vi.fn(), enrolled: vi.fn() }
        app = createApp({
            render: () => h(StaffMfaEnrollModal, {
                modelValue: true, username: 'sam', password: 'pw', send, ...props,
                'onUpdate:modelValue': events.update, onEnrolled: events.enrolled,
            }),
        })
        app.mount(host)
        return events
    }
    beforeEach(() => send.mockReset())

    it('walks request, secret and recovery codes, sending the account password at every step', async () => {
        const events = mount()
        await flush()
        send.mockResolvedValueOnce({ requestCode: 'ABCD-EFGH', expiresAt: 'later' })
        find('button', 'Ask an administrator').click()
        await flush()
        expect(send).toHaveBeenLastCalledWith('/api/mfa/enroll/request', { username: 'sam', password: 'pw' })
        expect(find('[data-test="request-code"]').textContent).toContain('ABCD-EFGH')

        send.mockResolvedValueOnce({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' })
        find('button', 'Continue').click()
        await flush()
        expect(send).toHaveBeenLastCalledWith('/api/mfa/enroll/begin', { username: 'sam', password: 'pw', requestCode: 'ABCD-EFGH' })
        expect(find('[data-test="secret"]').textContent).toContain('JBSW Y3DP EHPK 3PXP')

        type(find('#mfa-totp'), '123456')
        await flush()
        send.mockResolvedValueOnce({ recoveryCodes: ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'] })
        find('button', 'Confirm').click()
        await flush()
        expect(send).toHaveBeenLastCalledWith('/api/mfa/enroll/confirm', { username: 'sam', password: 'pw', requestCode: 'ABCD-EFGH', code: '123456' })
        expect(find('[data-test="recovery-codes"]').textContent).toContain('AAAA-BBBB-CCCC-DDDD')

        const done = find('button', 'Done')
        expect(done.disabled).toBe(true)
        const saved = find('input[type="checkbox"]')
        saved.checked = true
        saved.dispatchEvent(new Event('change'))
        await flush()
        expect(find('button', 'Done').disabled).toBe(false)
        find('button', 'Done').click()
        await flush()
        expect(events.enrolled).toHaveBeenCalled()
        expect(events.update).toHaveBeenCalledWith(false)
    })

    it('explains an unapproved code and stays on the same step so it can be retried', async () => {
        mount()
        await flush()
        find('input[value="root"]').click()
        await flush()
        type(find('#mfa-code'), 'WRONG-CODE')
        await flush()
        send.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 403, code: 'enrollment_not_approved' }))
        find('button', 'Continue').click()
        await flush()
        expect(document.body.textContent).toMatch(/not approved yet|expired/)
        expect(find('#mfa-code')).toBeTruthy()
        expect(find('[data-test="secret"]')).toBeUndefined()
    })

    it('shows the root approval instructions for the first administrator without asking them to approve themselves', async () => {
        mount({ rootApprovalRequired: true })
        await flush()
        expect(document.body.textContent).toContain("first approval must come from the server's root administrator")
        expect(document.body.textContent).toContain('mfa-admin.js issue-code <username>')
        expect(find('button', 'Ask an administrator')).toBeUndefined()
        expect(find('input[name="mfa-approval-path"]')).toBeUndefined()
        expect(find('button', 'Continue').disabled).toBe(true)
        type(find('#mfa-code'), 'ROOT-APPROVAL')
        await flush()
        send.mockResolvedValueOnce({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/test' })
        find('button', 'Continue').click()
        await flush()
        expect(send).toHaveBeenLastCalledWith('/api/mfa/enroll/begin', {
            username: 'sam', password: 'pw', requestCode: 'ROOT-APPROVAL',
        })
        expect(find('[data-test="secret"]')).toBeTruthy()
    })

    it('does not reuse a server-issued code after switching to the administrator-request path', async () => {
        mount()
        await flush()
        find('input[value="root"]').click()
        await flush()
        type(find('#mfa-code'), 'ROOT-APPROVAL')
        await flush()
        find('input[value="request"]').click()
        await flush()
        expect(find('#mfa-code')).toBeUndefined()
        expect(find('button', 'Continue').disabled).toBe(true)
        expect(send).not.toHaveBeenCalled()
    })
})

describe('AdminStaffMfaPanel', () => {
    const policy = (over = {}) => ({
        ok: true, enabled: false, deadlineAt: null, enrolledStaff: [], callerEnrolled: true,
        backupOwnershipUnassigned: 0, backupOwnershipReviewVersion: 1, ...over,
    })
    const mount = async () => {
        host = document.createElement('div')
        document.body.appendChild(host)
        app = createApp(AdminStaffMfaPanel, { connectionId: 'c1', username: 'admin' })
        app.mount(host)
        await flush()
    }
    const load = (p, requests = []) => mocks.apiFetch.mockResolvedValueOnce(p).mockResolvedValueOnce({ ok: true, requests })

    it('says it is off by default and offers no switch to an administrator who has not set up their own', async () => {
        load(policy({ callerEnrolled: false }))
        await mount()
        expect(mocks.apiCalls).toContainEqual(['c1', { transport: 'nginx-https' }])
        expect(find('[data-test="status"]').textContent).toContain('Off')
        expect(document.body.textContent).toContain('Set up your own sign-in first')
        expect(find('button', 'Turn on')).toBeUndefined()
        find('button', 'Set up my two-step sign-in').click()
        await flush()
        expect(document.body.textContent).toContain("first approval must come from the server's root administrator")
        expect(find('button', 'Ask an administrator')).toBeUndefined()
    })

    describe('StaffMfaRecovery', () => {
        const mount = async (status = { enrolled: true, recoveryCodesRemaining: 3 }) => {
            mocks.apiFetch.mockResolvedValueOnce(status)
            host = document.createElement('div')
            document.body.appendChild(host)
            app = createApp(StaffMfaRecovery, { connectionId: 'c1' })
            app.mount(host)
            await flush()
        }

        it('replaces codes over verified HTTPS and keeps them visible until saved', async () => {
            await mount()
            expect(mocks.apiCalls).toContainEqual(['c1', { transport: 'nginx-https' }])
            expect(document.body.textContent).toContain('3 recovery codes remaining')
            find('button', 'Replace recovery codes').click()
            await flush()
            expect(document.body.textContent).toContain('old recovery codes will stop working')
            type(find('#mfa-recovery-totp'), '123456')
            await flush()
            mocks.apiFetch.mockResolvedValueOnce({ recoveryCodes: ['NEW-ONE', 'NEW-TWO'] })
            find('button', 'Replace codes').click()
            await flush()
            const [url, options] = mocks.apiFetch.mock.calls.at(-1)
            expect(url).toBe('/api/mfa/recovery-codes')
            expect(options.retry).toBe(0)
            expect(JSON.parse(options.body)).toEqual({ code: '123456' })
            expect(find('[data-test="replacement-codes"]').textContent).toContain('NEW-ONE')
            expect(find('button', 'Done').disabled).toBe(true)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            await flush()
            expect(find('[data-test="replacement-codes"]')).toBeTruthy()
            const saved = find('input[type="checkbox"]')
            saved.checked = true
            saved.dispatchEvent(new Event('change'))
            await flush()
            find('button', 'Done').click()
            await flush()
            expect(find('[data-test="replacement-codes"]')).toBeUndefined()
            expect(document.body.textContent).toContain('2 recovery codes remaining')
        })

        it('reports a rejected code and an uncertain network outcome without displaying codes', async () => {
            await mount()
            find('button', 'Replace recovery codes').click()
            await flush()
            type(find('#mfa-recovery-totp'), '123456')
            await flush()
            mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('That code was not accepted.'), { status: 403 }))
            find('button', 'Replace codes').click()
            await flush()
            expect(document.body.textContent).toContain('That code was not accepted.')
            mocks.apiFetch.mockRejectedValueOnce(new TypeError('network failed'))
            find('button', 'Replace codes').click()
            await flush()
            expect(document.body.textContent).toContain('Your old codes may no longer work')
            expect(find('[data-test="replacement-codes"]')).toBeUndefined()
        })

        it('does not offer replacement when the staff account is not enrolled', async () => {
            await mount({ enrolled: false, recoveryCodesRemaining: null })
            expect(document.body.textContent).toContain('have not set up an authenticator')
            expect(find('button', 'Replace recovery codes')).toBeUndefined()
        })
    })

    it('turns it on with the password and a current code, telling the administrator to sign in again', async () => {
        load(policy({ enrolledStaff: ['admin'] }))
        await mount()
        type(find('#mfa-admin-password'), 'pw')
        type(find('#mfa-admin-code'), '123456')
        await flush()
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, enabled: true, reauthRequired: true })
        find('button', 'Turn on').click()
        await flush()
        const [url, options] = mocks.apiFetch.mock.calls.at(-1)
        expect(url).toBe('/api/admin/mfa/policy')
        expect(options.method).toBe('PUT')
        expect(options.suppressAuthRedirect).toBe(true)
        expect(JSON.parse(options.body)).toEqual({ enabled: true, password: 'pw', mfaCode: '123456' })
        expect(document.body.textContent).toContain('sign in again')
        expect(find('[data-test="status"]').textContent).toContain('On')
    })

    it('shows the server reason when turning it on is refused, such as backups with no verified owner', async () => {
        load(policy({ enrolledStaff: ['admin'], backupOwnershipUnassigned: 2 }))
        await mount()
        expect(document.body.textContent).toContain('2 older Storage Wizard backup')
        expect(document.body.textContent).toContain('Scheduled backups do not need an authenticator code')
        expect(document.body.textContent).toContain('Two-step sign-in can still be turned on')
        expect(find('button', 'Review backups')).toBeTruthy()
        expect(document.body.textContent).not.toContain('/api/storage-wizard/')
        type(find('#mfa-admin-password'), 'pw')
        type(find('#mfa-admin-code'), '123456')
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Verify and assign an owner for each legacy backup record'), { status: 409 }))
        find('button', 'Turn on').click()
        await flush()
        expect(document.body.textContent).toContain('Verify and assign an owner')
        expect(find('[data-test="status"]').textContent).toContain('Off')
    })

    it('rechecks backup ownership and removes the warning when all records are assigned', async () => {
        load(policy({ backupOwnershipUnassigned: 1 }))
        await mount()
        expect(document.body.textContent).toContain('record is')
        load(policy({ backupOwnershipUnassigned: 0 }))
        find('button', 'Check again').click()
        await flush()
        expect(find('button', 'Check again')).toBeUndefined()
    })

    it('keeps the backup warning visible after MFA is enabled', async () => {
        load(policy({ enabled: true, backupOwnershipUnassigned: 1 }))
        await mount()
        expect(find('button', 'Review backups')).toBeTruthy()
    })

    it('does not claim older servers allow MFA with unresolved records', async () => {
        load(policy({ backupOwnershipUnassigned: 1, backupOwnershipReviewVersion: undefined }))
        await mount()
        expect(document.body.textContent).toContain('This server must be updated')
        expect(find('button', 'Review backups')).toBeUndefined()
    })

    it('opens the backup review from the policy warning', async () => {
        load(policy({ backupOwnershipUnassigned: 1 }))
        await mount()
        mocks.apiFetch.mockResolvedValueOnce({ ownershipReviewVersion: 1, unassigned: [{
            uuid: 'b1', name: 'Photos', source: '/photos', target: '/backup',
            owner_user: null, client_id: 'client-a', smb_user: 'sam',
        }] })
        find('button', 'Review backups').click()
        await flush()
        expect(mocks.apiFetch.mock.calls.at(-1)[0]).toBe('/api/storage-wizard/backup-ownership-preflight')
        expect(document.body.textContent).toContain('Saved Samba username (unverified): sam')
    })

    it('approves a waiting request with the code the person read out and the administrator\'s own code', async () => {
        load(policy({ enabled: true, enrolledStaff: ['admin'], deadlineAt: '2026-12-07T12:00:00.000Z' }), [{ username: 'pat' }])
        await mount()
        type(find('#approve-code-pat'), 'ABCD-EFGH')
        type(find('#approve-totp-pat'), '654321')
        await flush()
        mocks.apiFetch.mockResolvedValueOnce({ ok: true })
        load(policy({ enabled: true, enrolledStaff: ['admin'] }))
        find('button', 'Approve').click()
        await flush()
        const approval = mocks.apiFetch.mock.calls.find(([url]) => url === '/api/admin/mfa/approvals')
        expect(approval[1].method).toBe('POST')
        expect(approval[1].suppressAuthRedirect).toBe(true)
        expect(JSON.parse(approval[1].body)).toEqual({ username: 'pat', requestCode: 'ABCD-EFGH', mfaCode: '654321' })
        expect(document.body.textContent).toContain('Approved. pat can finish')
    })

    describe('BackupOwnershipReview', () => {
        const record = {
            uuid: 'backup-1', name: 'Photos', source: '/photos', target: '/backup',
            owner_user: null, client_id: 'client-a', smb_user: 'old-samba-user',
        }
        const response = (unassigned = [record]) => ({ ownershipReviewVersion: 1, unassigned })
        const mount = async () => {
            const changed = vi.fn()
            host = document.createElement('div')
            document.body.appendChild(host)
            app = createApp(BackupOwnershipReview, { modelValue: true, connectionId: 'c1', onChanged: changed })
            app.mount(host)
            await flush()
            return changed
        }

        it('requires explicit verification and never treats the saved Samba username as the owner', async () => {
            mocks.apiFetch.mockResolvedValueOnce(response())
            const changed = await mount()
            expect(document.body.textContent).toContain('Saved Samba username (unverified): old-samba-user')
            find('button', 'Assign owner').click()
            await flush()
            expect(find('#backup-owner-backup-1').value).toBe('')
            expect(find('#backup-client-backup-1').value).toBe('client-a')
            type(find('#backup-owner-backup-1'), 'sam')
            await flush()
            expect(find('button', 'Assign owner').disabled).toBe(true)
            const checkbox = find('input[type="checkbox"]')
            checkbox.checked = true
            checkbox.dispatchEvent(new Event('change'))
            await flush()
            mocks.apiFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(response([]))
            find('button', 'Assign owner').click()
            await flush()
            const [url, options] = mocks.apiFetch.mock.calls[1]
            expect(url).toBe('/api/storage-wizard/backup-configs/backup-1?all=true')
            expect(options.method).toBe('PUT')
            expect(JSON.parse(options.body)).toEqual({
                owner_user: 'sam', client_id: 'client-a', expected_owner_user: null, expected_client_id: 'client-a',
            })
            expect(changed).toHaveBeenCalledOnce()
            expect(document.body.textContent).toContain('All backup records have an account')
        })

        it('confirms removal of metadata and includes the expected ownership state', async () => {
            mocks.apiFetch.mockResolvedValueOnce(response())
            const changed = await mount()
            find('button', 'Remove record').click()
            await flush()
            expect(document.body.textContent).toContain('does not delete backup files or stop a schedule')
            expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
            mocks.apiFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(response([]))
            find('[data-confirm]').click()
            await flush()
            const [url, options] = mocks.apiFetch.mock.calls[1]
            expect(url).toBe('/api/storage-wizard/backup-configs/backup-1?all=true')
            expect(options.method).toBe('DELETE')
            expect(JSON.parse(options.body)).toEqual({ expected_owner_user: null, expected_client_id: 'client-a' })
            expect(changed).toHaveBeenCalledOnce()
        })

        it('does not permit review on an older server without concurrency protection', async () => {
            mocks.apiFetch.mockResolvedValueOnce({ unassigned: [record] })
            await mount()
            expect(document.body.textContent).toContain('Update the server before reviewing backup records')
            expect(find('button', 'Assign owner')).toBeUndefined()
        })

        it('surfaces a conflicting assignment and asks the administrator to refresh', async () => {
            mocks.apiFetch.mockResolvedValueOnce(response())
            const changed = await mount()
            find('button', 'Assign owner').click()
            await flush()
            type(find('#backup-owner-backup-1'), 'sam')
            const checkbox = find('input[type="checkbox"]')
            checkbox.checked = true
            checkbox.dispatchEvent(new Event('change'))
            await flush()
            mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('This backup record changed. Refresh and review it again.'), { status: 409 }))
            find('button', 'Assign owner').click()
            await flush()
            expect(document.body.textContent).toContain('This backup record changed')
            expect(find('button', 'Refresh records')).toBeTruthy()
            expect(changed).not.toHaveBeenCalled()
        })
    })

    it('explains when the server is too old to know about two-step sign-in', async () => {
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }))
        await mount()
        expect(document.body.textContent).toContain("can't require two-step sign-in yet")
    })
})
