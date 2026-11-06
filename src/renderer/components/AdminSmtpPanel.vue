<template>
    <section class="space-y-4" aria-label="Email (SMTP)">
        <h3 class="font-semibold">Installation SMTP settings</h3>
        <p class="text-sm text-accent">
            Installation-wide outgoing mail credentials, used to send share invitations from this
            server. These credentials are never tied to a single link; they are encrypted at rest
            and never sent back to any client once saved.
        </p>
        <p v-if="loading" role="status">Loading SMTP settings…</p>
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <button type="button" class="btn btn-secondary" :disabled="saving || loading || deleting" @click="load">
            Reload
        </button>
        <template v-if="loaded">
            <p v-if="status?.configured" class="text-sm" role="status">
                SMTP is configured: <span class="font-mono">{{ status.host }}:{{ status.port }}</span>
                ({{ status.tlsMode }}){{ status.fromAddress ? `, from ${status.fromAddress}` : '' }}.
                Last updated {{ new Date(status.updatedAt).toLocaleString() }}.
            </p>
            <p v-else class="text-sm" role="status">
                SMTP is not configured. Share invitations will be queued but not sent until this is set up.
            </p>
            <p class="text-sm">
                Enter the full host, port, encryption mode, and installation mailbox credentials below
                to replace the stored configuration, or re-enter them to change any field. The stored
                username and password are never shown here once saved; fields below are always blank
                on load and must be re-entered in full to replace them.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="block text-sm">
                    <span class="font-medium">Host</span>
                    <input v-model.trim="form.host" type="text" placeholder="smtp.example.com"
                        class="input-textlike border border-default rounded p-2 w-full mt-1"
                        :disabled="saving || deleting" />
                </label>
                <label class="block text-sm">
                    <span class="font-medium">Port</span>
                    <input v-model.number="form.port" type="number" min="1" max="65535"
                        class="input-textlike border border-default rounded p-2 w-full mt-1"
                        :disabled="saving || deleting" />
                </label>
                <label class="block text-sm">
                    <span class="font-medium">Encryption</span>
                    <select v-model="form.tlsMode"
                        class="input-textlike border border-default rounded p-2 w-full mt-1"
                        :disabled="saving || deleting">
                        <option value="implicit">Implicit TLS</option>
                        <option value="starttls">STARTTLS</option>
                    </select>
                </label>
                <label class="block text-sm">
                    <span class="font-medium">From address (optional)</span>
                    <input v-model.trim="form.fromAddress" type="email" placeholder="noreply@example.com"
                        class="input-textlike border border-default rounded p-2 w-full mt-1"
                        :disabled="saving || deleting" />
                </label>
                <label class="block text-sm">
                    <span class="font-medium">Username</span>
                    <input v-model.trim="form.username" type="text" autocomplete="off"
                        class="input-textlike border border-default rounded p-2 w-full mt-1"
                        placeholder="Re-enter to replace" :disabled="saving || deleting" />
                </label>
                <label class="block text-sm">
                    <span class="font-medium">Password</span>
                    <input v-model="form.password" type="password" autocomplete="new-password"
                        class="input-textlike border border-default rounded p-2 w-full mt-1"
                        placeholder="Re-enter to replace" :disabled="saving || deleting" />
                </label>
            </div>
            <p class="text-xs opacity-70">
                Username and password are kept only in this form while you type and are cleared
                immediately after a successful save or delete, or if you switch connections or close
                this panel. They are never written to local storage, session storage, or logs.
            </p>
            <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-primary" :disabled="!canSave" @click="save">
                    {{ saving ? 'Saving…' : 'Save SMTP settings' }}
                </button>
                <button v-if="status?.configured" type="button" class="btn btn-danger"
                    :disabled="saving || loading || deleting" @click="requestDelete">
                    {{ deleting ? 'Deleting…' : 'Delete stored credentials' }}
                </button>
            </div>
            <div v-if="confirmingDelete" class="space-y-2 text-sm" role="alert">
                <p>
                    This removes the stored SMTP credentials. Future invitations will be queued but not
                    sent until reconfigured. This does not affect any share or invitation already sent.
                </p>
                <div class="flex flex-wrap gap-2">
                    <button type="button" class="btn btn-danger" :disabled="deleting" @click="confirmDelete">
                        {{ deleting ? 'Deleting…' : 'Confirm delete' }}
                    </button>
                    <button type="button" class="btn btn-secondary" :disabled="deleting" @click="confirmingDelete = false">
                        Cancel
                    </button>
                </div>
            </div>
            <p v-if="saved" role="status" class="text-sm text-success">SMTP settings saved.</p>
            <p v-if="deleted" role="status" class="text-sm text-success">SMTP credentials deleted.</p>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useApi } from '../composables/useApi'

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

function emptyForm() {
    return { host: '', port: null as number | null, tlsMode: 'starttls' as TlsMode, fromAddress: '', username: '', password: '' }
}
const form = ref(emptyForm())

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

const canSave = computed(() => !saving.value && !deleting.value && loaded.value
    && !!form.value.host.trim() && Number.isInteger(form.value.port) && (form.value.port ?? 0) > 0 && (form.value.port ?? 0) <= 65535
    && !!form.value.username.trim() && !!form.value.password)

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
