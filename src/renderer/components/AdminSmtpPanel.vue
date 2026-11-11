<template>
    <section aria-label="Email (SMTP)">
        <p v-if="loading && !loaded" class="text-sm text-muted py-4" role="status">Loading email settings…</p>
        <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
            {{ error }}
            <template v-if="!loaded && !loading" #actions>
                <FlowButton size="xs" @click="load">Try again</FlowButton>
            </template>
        </FlowNotice>

        <template v-if="loaded">
            <p class="text-sm text-muted mb-3">
                45Flow sends email by signing in to a mail account you already have, such as your company's email,
                Microsoft 365 or Gmail. Enter that account's outgoing mail (SMTP) details from your provider.
                Then send yourself a test email to check them.
            </p>
            <FlowNotice v-if="status?.configured" tone="success" size="sm" live>
                Set up: <span class="font-mono">{{ status.host }}:{{ status.port }}</span>,
                {{ status.tlsMode === 'implicit' ? 'implicit TLS' : 'STARTTLS' }}{{ status.fromAddress ? `, from ${status.fromAddress}` : '' }}.
                <span class="text-muted">Updated {{ formatUpdated(status.updatedAt) }}.</span>
            </FlowNotice>
            <FlowNotice v-else tone="warning" size="sm" live>
                Not set up. Invitations and notifications are queued but not sent.
            </FlowNotice>
            <FlowNotice v-if="status?.configured && !status.fromAddress" tone="warning" size="sm" class="mt-2">
                No From address is saved, so emails can't be sent unless your login is an email address.
                Re-enter the settings below with a From address.
            </FlowNotice>

            <p class="flow-subhead">Server</p>
            <div class="flow-group">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 py-3">
                    <FlowField label="Host" required>
                        <template #default="{ id }">
                            <input :id="id" v-model.trim="form.host" type="text" placeholder="smtp.example.com"
                                class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full" :disabled="busy" />
                        </template>
                    </FlowField>
                    <FlowField label="Port" required>
                        <template #default="{ id }">
                            <input :id="id" v-model.number="form.port" type="number" min="1" max="65535" placeholder="587"
                                class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full" :disabled="busy" />
                        </template>
                    </FlowField>
                    <FlowField label="Encryption" help="Port 587 usually uses STARTTLS; port 465 uses implicit TLS.">
                        <template #default="{ id, describedBy }">
                            <select :id="id" v-model="form.tlsMode" :aria-describedby="describedBy"
                                class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full" :disabled="busy">
                                <option value="starttls" class="bg-default text-default">STARTTLS</option>
                                <option value="implicit" class="bg-default text-default">Implicit TLS</option>
                            </select>
                        </template>
                    </FlowField>
                    <FlowField label="From address" required
                        help="The address emails come from. Gmail and Microsoft 365 send as the account you sign in with, so it fills in from the username. Email services like SendGrid let you pick any address you've verified with them.">
                        <template #default="{ id, describedBy }">
                            <input :id="id" v-model.trim="form.fromAddress" type="email" placeholder="noreply@example.com"
                                :aria-describedby="describedBy"
                                class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full" :disabled="busy" />
                        </template>
                    </FlowField>
                </div>
            </div>

            <p class="flow-subhead">Sign-in</p>
            <div class="flow-group">
                <div class="py-3">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        <FlowField label="Username" required>
                            <template #default="{ id }">
                                <input :id="id" v-model.trim="form.username" type="text" autocomplete="off"
                                    class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full" :disabled="busy" />
                            </template>
                        </FlowField>
                        <FlowField label="Password" required>
                            <template #default="{ id }">
                                <div class="relative flex items-center min-w-0 w-full">
                                    <input :id="id" v-model="form.password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password"
                                        class="input-textlike border border-default rounded-lg px-3 py-1.5 pr-10 text-sm w-full min-w-0" :disabled="busy" />
                                    <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                                        :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword"
                                        @click="showPassword = !showPassword">
                                        <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                        <EyeSlashIcon v-else class="w-5 h-5" />
                                    </button>
                                </div>
                            </template>
                        </FlowField>
                    </div>
                    <p class="flow-field__help mt-2">
                        Saved encrypted and never shown again.
                        <template v-if="status?.configured">Leave both blank to keep the saved login, or enter both to change it.</template>
                    </p>
                </div>
            </div>

            <ul v-if="hints.length" class="flex flex-col gap-2 mt-3" aria-label="Tips for these settings">
                <li v-for="(hint, i) in hints" :key="i">
                    <FlowNotice :tone="hint.tone" size="sm">
                        {{ hint.text }}
                        <a v-if="hint.link" :href="hint.link.href" target="_blank" rel="noopener noreferrer"
                            class="block mt-1 underline font-medium">{{ hint.link.label }}</a>
                    </FlowNotice>
                </li>
            </ul>

            <div class="flex flex-wrap items-center gap-2 mt-4">
                <FlowButton variant="primary" :disabled="!canSave" :loading="saving" loading-text="Saving…" @click="save">
                    Save email settings
                </FlowButton>
                <FlowButton v-if="status?.configured" variant="danger" :disabled="busy || loading" @click="requestDelete">
                    Delete saved settings
                </FlowButton>
                <FlowButton variant="ghost" size="sm" :disabled="busy || loading" @click="load">Reload</FlowButton>
            </div>
            <FlowNotice v-if="saved" tone="success" plain size="sm" live class="mt-2">Email settings saved.</FlowNotice>
            <FlowNotice v-if="deleted" tone="success" plain size="sm" live class="mt-2">Email settings deleted.</FlowNotice>

            <template v-if="status?.configured">
                <p class="flow-subhead">Test</p>
                <div class="flow-group">
                    <div class="py-3">
                        <FlowField label="Send a test email to"
                            help="Sends one email now with the saved settings and shows what the mail server said.">
                            <template #default="{ id, describedBy }">
                                <div class="flex flex-wrap items-center gap-2 min-w-0">
                                    <input :id="id" v-model.trim="testTo" type="email" placeholder="you@example.com"
                                        autocomplete="email" :aria-describedby="describedBy"
                                        class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm min-w-0 flex-1"
                                        :disabled="testing" @keyup.enter="sendTest" />
                                    <FlowButton size="sm" class="whitespace-nowrap" :disabled="!testTo || testing || busy"
                                        :loading="testing" loading-text="Sending…" @click="sendTest">Send test email</FlowButton>
                                </div>
                            </template>
                        </FlowField>
                        <FlowNotice v-if="testResult" :tone="testResult.sent ? 'success' : 'danger'" size="sm" live class="mt-2">
                            {{ testResult.text }}
                            <span v-if="testResult.reply" class="block text-xs text-muted mt-1 font-mono break-all">Mail server said: {{ testResult.reply }}</span>
                        </FlowNotice>
                    </div>
                </div>
            </template>
        </template>

        <ConfirmDeleteModal v-model="confirmingDelete" title="Delete email settings?" confirm-text="Delete"
            :busy="deleting" busy-text="Deleting…" :error="error || null" @confirm="confirmDelete">
            45Flow stops sending email until you set it up again. New invitations and notifications are queued but not sent.
            Emails already sent are not affected.
        </ConfirmDeleteModal>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/20/solid'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import ConfirmDeleteModal from './modals/ConfirmDeleteModal.vue'
import { emailReasonHelp } from '../utils/emailStatus'
import { smtpProviderHints } from '../utils/smtpProviders'

const props = defineProps<{ connectionId: string }>()
// Pin requests to the connection on which this keyed panel was opened, same
// pattern as AdminNetworksPanel.
const { apiFetch } = useApi(props.connectionId)
const endpoint = '/api/admin/credentials/smtp'

type TlsMode = 'implicit' | 'starttls'
type SmtpStatus = {
    configured: boolean
    host?: string
    port?: number
    tlsMode?: TlsMode
    fromAddress?: string | null
    keyVersion?: number | string | null
    updatedAt?: string | null
}

const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)
const saved = ref(false)
const deleted = ref(false)
const error = ref('')
const status = ref<SmtpStatus | null>(null)
const busy = computed(() => saving.value || deleting.value)

function formatUpdated(at?: string | null) {
    if (!at) return 'recently'
    const d = new Date(at)
    return Number.isNaN(d.getTime()) ? 'recently' : d.toLocaleString()
}

function emptyForm() {
    return { host: '', port: null as number | null, tlsMode: 'starttls' as TlsMode, fromAddress: '', username: '', password: '' }
}
const form = ref(emptyForm())
const showPassword = ref(false)

// This panel is remounted (via :key="connectionId" in SettingsModal) whenever
// the active connection changes, same as AdminNetworksPanel, so a connection
// switch never shares this instance or its in-flight requests. Within a
// single mount, this generation counter still guards against a stale
// response from an overlapping reload/save/delete landing out of order.
let generation = 0

function message(e: unknown) {
    return e instanceof Error ? e.message : 'Unexpected SMTP settings request failure.'
}
function statusCode(e: unknown) {
    return typeof e === 'object' && e !== null && 'status' in e ? (e as any).status : undefined
}
function detailsOf(e: unknown): string[] | undefined {
    return typeof e === 'object' && e !== null && Array.isArray((e as any).details) ? (e as any).details : undefined
}

const TLS_MODES: TlsMode[] = ['implicit', 'starttls']

function readStatus(data: unknown): SmtpStatus {
    if (typeof data !== 'object' || data === null || !('ok' in data) || (data as any).ok !== true
        || !('smtp' in data) || typeof (data as any).smtp !== 'object' || (data as any).smtp === null) {
        throw new Error('Unexpected SMTP settings response from server.')
    }
    const smtp: any = (data as any).smtp
    if (typeof smtp.configured !== 'boolean') {
        throw new Error('Unexpected SMTP settings response from server.')
    }
    if (!smtp.configured) {
        return { configured: false, keyVersion: smtp.keyVersion ?? null, updatedAt: smtp.updatedAt ?? null }
    }
    if (typeof smtp.host !== 'string' || !smtp.host
        || typeof smtp.port !== 'number'
        || typeof smtp.tlsMode !== 'string' || !TLS_MODES.includes(smtp.tlsMode)
        || (smtp.fromAddress !== null && typeof smtp.fromAddress !== 'string')
        || typeof smtp.updatedAt !== 'string') {
        throw new Error('Unexpected SMTP settings response from server.')
    }
    // Secret fields must never be present on a configured response; a server
    // that leaked them would be a producer bug, not something to display.
    if ('username' in smtp || 'password' in smtp) {
        throw new Error('Unexpected SMTP settings response contained secret fields.')
    }
    return {
        configured: true, host: smtp.host, port: smtp.port, tlsMode: smtp.tlsMode,
        fromAddress: smtp.fromAddress ?? null, keyVersion: smtp.keyVersion ?? null, updatedAt: smtp.updatedAt,
    }
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
// The server fills a blank From with the login when the login is an email address.
const hasSender = computed(() => EMAIL_RE.test(form.value.fromAddress.trim()) || EMAIL_RE.test(form.value.username.trim()))
// Both blank on saved settings keeps the saved login (server side); otherwise both are needed.
const keepsSavedLogin = computed(() => !!status.value?.configured && !form.value.username.trim() && !form.value.password)
const loginOk = computed(() => keepsSavedLogin.value || (!!form.value.username.trim() && !!form.value.password))
const hasSenderOrKept = computed(() => hasSender.value || (keepsSavedLogin.value && EMAIL_RE.test(form.value.fromAddress.trim())))
const canSave = computed(() => !saving.value && !deleting.value && loaded.value
    && !!form.value.host.trim() && Number.isInteger(form.value.port) && (form.value.port ?? 0) > 0 && (form.value.port ?? 0) <= 65535
    && loginOk.value && hasSenderOrKept.value)

const hints = computed(() => smtpProviderHints({
    host: form.value.host, port: form.value.port, tlsMode: form.value.tlsMode,
    username: form.value.username, fromAddress: form.value.fromAddress,
}))

// Most providers send as the login, so keep From in step with an email-address
// login until the admin types a different From themselves.
watch(() => form.value.username, (next, prev) => {
    const login = next.trim()
    if (!EMAIL_RE.test(login)) return
    const from = form.value.fromAddress.trim()
    if (!from || from === (prev || '').trim()) form.value.fromAddress = login
})

const testTo = ref('')
const testing = ref(false)
const testResult = ref<{ sent: boolean; text: string; reply: string | null } | null>(null)

async function sendTest() {
    if (!testTo.value || testing.value) return
    const myGeneration = generation
    testing.value = true
    testResult.value = null
    try {
        const data = await apiFetch(`${endpoint}/test`, {
            method: 'POST', body: JSON.stringify({ to: testTo.value }), retry: 0, exposeServerMessage: true,
        })
        if (myGeneration !== generation) return
        const reply = typeof data?.smtpResponse === 'string' && data.smtpResponse ? data.smtpResponse : null
        testResult.value = data?.sent
            ? { sent: true, text: `Sent. The mail server accepted it; check ${testTo.value} (and its spam folder).`, reply }
            : { sent: false, text: emailReasonHelp(data?.reason) || "The mail server didn't accept the test email.", reply }
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        const code = typeof e === 'object' && e !== null && 'code' in e ? (e as any).code : undefined
        const text = statusCode(e) === 404 ? "This server can't send test emails yet. Update 45Flow on the server."
            : code === 'smtp_not_configured' || message(e) === 'smtp_not_configured' ? 'Save the email settings first.'
            : code === 'smtp_disabled' ? 'Email is turned off in Settings → Scanning & privacy. Turn it on to send a test.'
                : `Couldn't send the test email: ${message(e)}`
        testResult.value = { sent: false, text, reply: null }
    } finally {
        if (myGeneration === generation) testing.value = false
    }
}

async function load() {
    generation += 1
    const myGeneration = generation
    loading.value = true
    loaded.value = false
    error.value = ''
    saved.value = false
    deleted.value = false
    confirmingDelete.value = false
    try {
        const data = await apiFetch(endpoint)
        if (myGeneration !== generation) return
        const result = readStatus(data)
        status.value = result
        // Known fields are informational only; username/password are
        // strictly write-only and are never populated from a GET response.
        form.value = {
            host: result.configured ? result.host! : '', port: result.configured ? result.port! : null,
            tlsMode: result.configured ? result.tlsMode! : 'starttls',
            fromAddress: result.configured ? (result.fromAddress || '') : '', username: '', password: '',
        }
        showPassword.value = false
        loaded.value = true
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        error.value = statusCode(e) === 403 ? 'Admin access is required to view or change installation SMTP settings.'
            : statusCode(e) === 503 ? `SMTP credential store is unavailable: ${message(e)}`
                : message(e)
    } finally {
        if (myGeneration === generation) loading.value = false
    }
}

async function save() {
    if (!canSave.value) return
    generation += 1
    const myGeneration = generation
    saving.value = true
    saved.value = false
    error.value = ''
    const body: Record<string, unknown> = {
        host: form.value.host.trim(), port: form.value.port, tlsMode: form.value.tlsMode,
        username: form.value.username.trim(), password: form.value.password,
    }
    if (form.value.fromAddress.trim()) body.fromAddress = form.value.fromAddress.trim()
    try {
        const data = await apiFetch(endpoint, {
            method: 'PUT', body: JSON.stringify(body), retry: 0, exposeServerMessage: true,
        })
        if (myGeneration !== generation) return
        status.value = readStatus(data)
        saved.value = true
        // Secrets are write-only: clear them from memory immediately after a
        // successful save, never keep them around or echo them back.
        form.value = { ...form.value, username: '', password: '' }
        showPassword.value = false
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        const details = detailsOf(e)
        error.value = statusCode(e) === 400
            ? `${message(e)}${details?.length ? `: ${details.join('; ')}` : ''}. No changes were saved.`
            : statusCode(e) === 503
                ? `SMTP credential store is unavailable: ${message(e)}. No changes were saved.`
                : `${message(e)}. No changes were saved.`
    } finally {
        if (myGeneration === generation) saving.value = false
    }
}

function requestDelete() {
    if (saving.value || loading.value || deleting.value) return
    confirmingDelete.value = true
}

async function confirmDelete() {
    if (deleting.value) return
    generation += 1
    const myGeneration = generation
    deleting.value = true
    deleted.value = false
    error.value = ''
    try {
        const data = await apiFetch(endpoint, { method: 'DELETE', retry: 0, exposeServerMessage: true })
        if (myGeneration !== generation) return
        status.value = readStatus(data)
        deleted.value = true
        confirmingDelete.value = false
        // Clear any re-entered secrets on a successful delete too.
        form.value = emptyForm()
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        error.value = statusCode(e) === 503
            ? `SMTP credential store is unavailable: ${message(e)}. Credentials were not deleted.`
            : `${message(e)}. Credentials were not deleted.`
    } finally {
        if (myGeneration === generation) deleting.value = false
    }
}

onMounted(load)
onUnmounted(() => {
    generation += 1
    // Never leave a typed secret resident after this panel goes away.
    form.value = emptyForm()
})
</script>
