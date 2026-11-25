<template>
    <section aria-label="Two-step sign-in for staff">
        <h4 class="text-sm font-semibold mb-3">Staff sign-in policy</h4>
        <p v-if="loading && !policy" class="text-sm text-muted py-2" role="status">Loading two-step sign-in…</p>
        <FlowNotice v-else-if="unsupported" tone="info" size="sm">
            This server can't require two-step sign-in yet. Update 45Flow on the server to turn it on.
        </FlowNotice>
        <template v-else>
            <FlowNotice v-if="loadError" tone="danger" size="sm" live class="mb-3">
                {{ loadError }}
                <template v-if="!policy && !loading" #actions><FlowButton size="xs" @click="load">Try again</FlowButton></template>
            </FlowNotice>

            <div v-if="policy" class="flow-group">
                <div class="py-3 text-sm space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <FlowChip :tone="policy.enabled ? 'success' : 'neutral'" data-test="status">
                            {{ policy.enabled ? 'On' : 'Off' }}
                        </FlowChip>
                        <p>
                            <template v-if="policy.enabled">
                                Staff who set it up need an authenticator code to sign in.
                            </template>
                            <template v-else>Staff sign in with a password. Nothing changes until you turn it on.</template>
                        </p>
                    </div>
                    <p v-if="policy.enabled && policy.deadlineAt">
                        Everyone else must set it up by {{ day(policy.deadlineAt) }}.
                    </p>
                    <p class="text-muted">
                        Set up: {{ policy.enrolledStaff.length ? policy.enrolledStaff.join(', ') : 'nobody yet' }}.
                        <template v-if="!policy.backupOwnershipUnassigned">
                            Scheduled Storage Wizard backups do not require an authenticator code.
                        </template>
                    </p>
                </div>

                <FlowNotice v-if="policy.backupOwnershipUnassigned" tone="warning" size="sm"
                    title="Some backup records need review" class="my-3" live>
                    <div class="space-y-2">
                        <p>
                            {{ policy.backupOwnershipUnassigned }} older Storage Wizard backup
                            {{ policy.backupOwnershipUnassigned === 1 ? 'record is' : 'records are' }}
                            missing a valid account or Storage Wizard installation. The server needs both to know which
                            backup account can access each record.
                        </p>
                        <p>
                            Scheduled backups do not need an authenticator code. These records may not be available
                            to backup clients for reporting or management until their ownership is assigned.
                        </p>
                        <p>
                            Review the records and verify the account and installation for each active backup.
                            <template v-if="policy.backupOwnershipReviewVersion === 1">Two-step sign-in can still be turned on.</template>
                            <template v-else>
                                This server must be updated before records can be reviewed here<span v-if="!policy.enabled"> or two-step sign-in can be turned on</span>.
                            </template>
                        </p>
                    </div>
                    <template #actions>
                        <FlowButton v-if="policy.backupOwnershipReviewVersion === 1" size="xs" type="button"
                            :disabled="loading" @click="reviewingBackups = true">Review backups</FlowButton>
                        <FlowButton size="xs" type="button" :disabled="loading" @click="load">Check again</FlowButton>
                    </template>
                </FlowNotice>

                <div v-if="!policy.callerEnrolled" class="py-3">
                    <p class="text-sm font-medium">Set up your own sign-in first</p>
                    <p class="text-sm text-muted mt-1">
                        You need an authenticator before you can require two-step sign-in or approve other staff.
                    </p>
                    <p v-if="!policy.enrolledStaff.length" class="text-sm text-muted mt-2">
                        You're setting up the first administrator. A server administrator must issue your approval code
                        as root on the server or over SSH. Choose Set up for instructions.
                    </p>
                    <FlowButton size="sm" variant="primary" class="mt-3" @click="enrolling = true">Set up my two-step sign-in</FlowButton>
                </div>

                <form v-if="policy.callerEnrolled" class="py-3 space-y-3" @submit.prevent="change">
                    <p class="text-sm font-medium">{{ policy.enabled ? 'Turn off two-step sign-in' : 'Turn on two-step sign-in' }}</p>
                    <div class="grid sm:grid-cols-2 gap-3">
                        <FlowField label="Your password" id="mfa-admin-password">
                            <template #default="{ id }">
                                <input :id="id" v-model="password" type="password" autocomplete="current-password" :disabled="busy"
                                    class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
                            </template>
                        </FlowField>
                        <FlowField label="Code from your app" id="mfa-admin-code">
                            <template #default="{ id }">
                                <input :id="id" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8"
                                    :disabled="busy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                            </template>
                        </FlowField>
                    </div>
                    <FlowNotice v-if="changeError" tone="danger" size="sm" live>{{ changeError }}</FlowNotice>
                    <FlowNotice v-if="reauth" tone="success" size="sm" live>
                        Two-step sign-in is on. Your current sign-in has ended; sign in again with your code.
                    </FlowNotice>
                    <FlowButton type="submit" :variant="policy.enabled ? 'danger' : 'primary'" :disabled="busy || !password || !code"
                        :loading="busy" loading-text="Saving…">
                        {{ policy.enabled ? 'Turn off' : 'Turn on' }}
                    </FlowButton>
                </form>

                <div v-if="requests.length" class="py-3 space-y-3">
                    <p class="text-sm font-medium">Waiting for approval</p>
                    <p class="text-sm text-muted">Check it's really that person, and match the code they read to you, before approving.</p>
                    <form v-for="item in requests" :key="item.username" class="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
                        @submit.prevent="approve(item.username)">
                        <p class="text-sm font-medium break-all self-center">{{ item.username }}</p>
                        <FlowField :label="`Code from ${item.username}`" :id="`approve-code-${item.username}`">
                            <template #default="{ id }">
                                <input :id="id" v-model="approvals[item.username].requestCode" type="text" autocomplete="off" spellcheck="false"
                                    class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                            </template>
                        </FlowField>
                        <FlowField :label="`Your app code (${item.username})`" :id="`approve-totp-${item.username}`">
                            <template #default="{ id }">
                                <input :id="id" v-model="approvals[item.username].mfaCode" type="text" inputmode="numeric" maxlength="8"
                                    class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                            </template>
                        </FlowField>
                        <FlowButton type="submit" size="sm" :disabled="busy || !approvals[item.username].requestCode || !approvals[item.username].mfaCode">
                            Approve
                        </FlowButton>
                    </form>
                    <FlowNotice v-if="approveError" tone="danger" size="sm" live>{{ approveError }}</FlowNotice>
                </div>
                <FlowNotice v-if="approved" tone="success" size="sm" live class="my-3">
                    Approved. {{ approved }} can finish setting up now. The approval lasts 15 minutes.
                </FlowNotice>

                <details class="py-3 text-sm">
                    <summary class="cursor-pointer">Locked out, or enrolling the first administrator?</summary>
                    <p class="mt-2">On the server, as root, issue a one-time code for that account. It lasts 15 minutes and never signs anyone in:</p>
                    <p class="font-mono break-all select-all mt-1">sudo node /opt/45drives/houston-broadcaster/dist/mfa-admin.js issue-code &lt;username&gt;</p>
                </details>
            </div>
        </template>

        <StaffMfaEnrollModal v-model="enrolling" :username="username" :send="send"
            :root-approval-required="policy !== null && !policy.enrolledStaff.length" @enrolled="load" />
        <BackupOwnershipReview v-model="reviewingBackups" :connection-id="connectionId" @changed="load" />
    </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import FlowChip from '../ui/FlowChip.vue'
import StaffMfaEnrollModal from './modals/StaffMfaEnrollModal.vue'
import BackupOwnershipReview from './BackupOwnershipReview.vue'
import type { MfaTransport } from '../composables/staffMfa'

const props = defineProps<{ connectionId: string; username: string }>()
const { apiFetch } = useApi(props.connectionId, { transport: 'nginx-https' })

type Policy = {
    enabled: boolean; deadlineAt: string | null; enrolledStaff: string[]; callerEnrolled: boolean
    backupOwnershipUnassigned: number
    backupOwnershipReviewVersion?: number
}
const policy = ref<Policy | null>(null)
const requests = ref<{ username: string }[]>([])
const loading = ref(false)
const unsupported = ref(false)
const loadError = ref('')
const busy = ref(false)
const password = ref('')
const code = ref('')
const changeError = ref('')
const reauth = ref(false)
const approveError = ref('')
const approved = ref('')
const enrolling = ref(false)
const reviewingBackups = ref(false)
const approvals = reactive<Record<string, { requestCode: string; mfaCode: string }>>({})

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

// A failed step-up is a 403 here, so these never read as "session ended" and never sign the user out.
const send: MfaTransport = (path, body) => apiFetch(path, {
    method: 'POST', body: JSON.stringify(body), suppressAuthRedirect: true, retry: 0,
})

async function load() {
    loading.value = true
    loadError.value = ''
    try {
        policy.value = await apiFetch('/api/admin/mfa/policy')
        const waiting = (await apiFetch('/api/admin/mfa/requests')).requests ?? []
        // Form state exists before the rows that read it are rendered.
        for (const { username } of waiting) approvals[username] ??= { requestCode: '', mfaCode: '' }
        requests.value = waiting
    } catch (e: any) {
        if (e?.status === 404) { unsupported.value = true; return }
        loadError.value = e?.status === 403
            ? 'Admin access is required to manage two-step sign-in.'
            : `Couldn't load two-step sign-in: ${e?.message || 'request failed'}.`
    } finally {
        loading.value = false
    }
}

async function change() {
    if (!policy.value) return
    busy.value = true
    changeError.value = ''
    reauth.value = false
    try {
        const enabling = !policy.value.enabled
        const result = await apiFetch('/api/admin/mfa/policy', {
            method: 'PUT', suppressAuthRedirect: true, retry: 0,
            body: JSON.stringify({ enabled: enabling, password: password.value, mfaCode: code.value.trim() }),
        })
        reauth.value = enabling
        password.value = ''
        code.value = ''
        if (!enabling) await load()
        else policy.value = {
            ...policy.value, enabled: true,
            backupOwnershipUnassigned: result.backupOwnershipUnassigned ?? policy.value.backupOwnershipUnassigned,
        }
    } catch (e: any) {
        changeError.value = e?.message || 'Could not change two-step sign-in.'
    } finally {
        busy.value = false
    }
}

async function approve(username: string) {
    const entry = approvals[username]
    busy.value = true
    approveError.value = ''
    approved.value = ''
    try {
        await apiFetch('/api/admin/mfa/approvals', {
            method: 'POST', suppressAuthRedirect: true, retry: 0,
            body: JSON.stringify({ username, requestCode: entry.requestCode.trim(), mfaCode: entry.mfaCode.trim() }),
        })
        approved.value = username
        approvals[username] = { requestCode: '', mfaCode: '' }
        await load()
    } catch (e: any) {
        approveError.value = e?.message || 'Could not approve.'
    } finally {
        busy.value = false
    }
}

onMounted(load)
</script>
