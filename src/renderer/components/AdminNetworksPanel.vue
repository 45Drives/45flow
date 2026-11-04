<template>
    <section class="space-y-4" aria-label="Admin networks">
        <h3 class="font-semibold">Trusted admin networks</h3>
        <p class="text-sm text-accent">
            Controls nginx access to administrative endpoints, not public share links.
            Enter one IPv4 or IPv6 CIDR per line. All other addresses are denied.
            Network access does not replace administrator authentication or establish that a network is safe.
        </p>
        <details class="text-sm">
            <summary class="cursor-pointer font-medium">What are these networks?</summary>
            <p class="mt-2">
                These defaults cover common local and VPN address ranges; they are not a discovery of your
                actual network. Use the narrowest ranges you trust. A larger number after / means a smaller
                range: 192.168.1.0/24 covers 192.168.1.0–192.168.1.255, while /32 allows one IPv4
                address and /128 allows one IPv6 address. /0 ranges are not permitted.
            </p>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-2">
                <template v-for="[cidr, meaning] in defaultNetworks" :key="cidr">
                    <dt class="font-mono">{{ cidr }}</dt><dd>{{ meaning }}</dd>
                </template>
            </dl>
        </details>
        <p class="text-sm text-danger">
            Keep server console or SSH recovery access available. Changes are temporary until confirmed
            through the reloaded nginx policy; unconfirmed changes are automatically rolled back.
            An empty list denies all nginx admin access.
        </p>
        <p class="text-sm">
            Admin network requests use this server's nginx HTTPS listener, including on LAN-only servers.
            No public domain or port forwarding is required. The desktop verifies HTTPS through SSH.
            If prompted, verify the SSH host-key fingerprint before trusting the server.
        </p>
        <p v-if="loading" role="status">Loading admin networks…</p>
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <template v-if="loaded">
            <p v-if="safety?.available" class="text-sm" role="status">
                nginx sees your connection as <strong>{{ safety.clientAddress }}</strong>.
                Currently allowed by: <span class="font-mono">{{ safety.matchedCidr || 'no matching range' }}</span>.
                This may be a proxy address, not your device, and does not identify your whole LAN or VPN.
            </p>
            <p v-else role="alert" class="text-sm text-danger">
                Connection safety is unavailable: {{ safety?.reason || 'update the server and its nginx configuration.' }}
                Changes are disabled; update/regenerate the server's nginx configuration and reload this panel.
            </p>
            <label for="admin-cidrs" class="block text-sm font-medium">Trusted CIDRs</label>
            <textarea id="admin-cidrs" v-model="text" rows="10" spellcheck="false"
                class="input-textlike border border-default rounded p-2 w-full font-mono text-sm"
                :disabled="saving || loading || !!pending" placeholder="192.168.1.0/24&#10;fc00::/7" />
            <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-secondary" :disabled="!canCheck || !safety?.hostCidr"
                    @click="allowDevice">Allow this device only</button>
                <button type="button" class="btn btn-secondary" :disabled="!canCheck" @click="preview">
                    Check proposed networks
                </button>
            </div>
            <p v-if="hasGlobalRange" role="alert" class="text-sm text-danger">
                Remove all /0 ranges before applying. They eliminate the admin network restriction
                for that IP family, and the server will reject them.
            </p>
            <p v-if="checked?.allowed" class="text-sm text-success" role="status">
                The proposed list includes your current nginx-observed address. This does not guarantee
                future access if your address, VPN, or proxy changes.
            </p>
            <p v-if="checked && !checked.allowed" role="alert" class="text-sm text-danger">
                The proposed list excludes your current connection ({{ checked.clientAddress }}).
                You will need another permitted connection to confirm, or the server will roll back.
            </p>
            <label v-if="checked && !checked.allowed" class="flex gap-2 text-sm">
                <input v-model="overrideCurrentConnection" type="checkbox" :disabled="saving || !!pending" />
                Intentionally exclude this connection. I have another permitted connection and recovery access.
            </label>
            <label class="flex gap-2 text-sm">
                <input v-model="confirmed" type="checkbox" :disabled="saving || loading || !!pending" />
                I understand this change can block my admin connection.
            </label>
        </template>
        <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-secondary" :disabled="saving || loading" @click="load">
                Reload admin networks
            </button>
            <button v-if="loaded" type="button" class="btn btn-primary"
                :disabled="!canApply" @click="save">
                {{ saving ? 'Applying…' : 'Apply admin networks' }}
            </button>
        </div>
        <div v-if="pending" class="space-y-2" role="status">
            <p>
                Temporary policy active. Confirm before {{ new Date(pending.expiresAt).toLocaleTimeString() }}.
                Without confirmation the server restores the previous policy, even if you close this panel.
            </p>
            <button type="button" class="btn btn-primary" :disabled="saving || confirming || loading"
                @click="confirmPolicy">{{ confirming ? 'Reconnecting to reloaded nginx…' : 'Reconnect and confirm' }}</button>
        </div>
        <p v-if="saved" role="status" class="text-sm text-success">
            Admin networks confirmed through reloaded nginx. Future connections must use a trusted network.
        </p>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi'

const props = defineProps<{ connectionId: string }>()
// Pin requests to the connection on which this keyed panel was opened.
const { apiFetch, baseUrl } = useApi(props.connectionId, { transport: 'nginx-https' })
const endpoint = '/api/admin/nginx-admin-cidrs'
const text = ref('')
const confirmed = ref(false)
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const saved = ref(false)
const error = ref('')
type Safety = {
    available: boolean
    clientAddress: string | null
    hostCidr: string | null
    matchedCidr: string | null
    reason?: string
}
type Pending = { id: string; expiresAt: string }
const safety = ref<Safety | null>(null)
const checked = ref<(Safety & { allowed: boolean }) | null>(null)
const pending = ref<Pending | null>(null)
const overrideCurrentConnection = ref(false)
const confirming = ref(false)
let disposed = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let finishReconnectWait: (() => void) | undefined
const defaultNetworks = [
    ['127.0.0.0/8', 'IPv4 loopback: connections originating on the server'],
    ['10.0.0.0/8', 'Private IPv4 LANs and VPNs'],
    ['172.16.0.0/12', 'Private IPv4: 172.16.0.0–172.31.255.255'],
    ['192.168.0.0/16', 'Private IPv4, common on home and office LANs'],
    ['100.64.0.0/10', 'Shared address space: carrier-grade NAT and VPNs such as Tailscale'],
    ['::1/128', 'IPv6 loopback'],
    ['fc00::/7', 'IPv6 unique-local addresses'],
    ['fe80::/10', 'IPv6 link-local addresses'],
]
const hasGlobalRange = computed(() => text.value.split(/\r?\n/).some(line => /\/0+$/.test(line.trim())))
const canCheck = computed(() => loaded.value && safety.value?.available && !saving.value
    && !loading.value && !pending.value && !hasGlobalRange.value)
const canApply = computed(() => canCheck.value && checked.value?.available && confirmed.value
    && (checked.value.allowed || overrideCurrentConnection.value))
watch(text, () => {
    confirmed.value = false
    saved.value = false
    checked.value = null
    overrideCurrentConnection.value = false
}, { flush: 'sync' })

function cidrs() {
    return text.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}
function message(e: unknown) {
    return e instanceof Error ? e.message : 'Unexpected admin network operation failure.'
}
function status(e: unknown) {
    return typeof e === 'object' && e !== null && 'status' in e ? e.status : undefined
}
function readSafety(value: unknown): Safety | null {
    if (value === undefined || value === null) return null
    if (typeof value !== 'object' || !('available' in value) || typeof value.available !== 'boolean') {
        throw new Error('Unexpected connection safety response from server.')
    }
    const nullableString = (key: string) => {
        if (!(key in value)) throw new Error('Incomplete connection safety response from server.')
        const field: unknown = Reflect.get(value, key)
        if (field !== null && typeof field !== 'string') throw new Error('Invalid connection safety response from server.')
        return field
    }
    const reason: unknown = 'reason' in value ? value.reason : undefined
    if (reason !== undefined && typeof reason !== 'string') throw new Error('Invalid connection safety reason.')
    const result = {
        available: value.available, clientAddress: nullableString('clientAddress'),
        hostCidr: nullableString('hostCidr'), matchedCidr: nullableString('matchedCidr'), reason,
    }
    if (result.available && (!result.clientAddress || !result.hostCidr)) {
        throw new Error('Missing verified connection address from server.')
    }
    return result
}
function readPending(value: unknown): Pending | null {
    if (value === undefined || value === null) return null
    if (typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !value.id
        || !('expiresAt' in value) || typeof value.expiresAt !== 'string'
        || !Number.isFinite(Date.parse(value.expiresAt))) {
        throw new Error('Unexpected pending policy response from server.')
    }
    return { id: value.id, expiresAt: value.expiresAt }
}
function scheduleRefresh() {
    clearTimeout(refreshTimer)
    if (!pending.value || disposed) return
    refreshTimer = setTimeout(async () => {
        if (!saving.value && !confirming.value) await load()
        else scheduleRefresh()
    }, 3000)
}

async function preview() {
    if (!canCheck.value) return
    saving.value = true
    checked.value = null
    error.value = ''
    const proposedText = text.value
    try {
        const data = await apiFetch(`${endpoint}/preview`, {
            method: 'POST', body: JSON.stringify({ cidrs: cidrs() }), retry: 0, exposeServerMessage: true,
        })
        const result = readSafety(data?.safety)
        if (!result?.available || typeof data?.safety?.allowed !== 'boolean') {
            throw new Error(result?.reason || 'Cannot verify the proposed connection policy.')
        }
        if (text.value === proposedText) checked.value = { ...result, allowed: data.safety.allowed }
    } catch (e: unknown) { error.value = message(e) }
    finally { saving.value = false }
}

function allowDevice() {
    if (!canCheck.value || !safety.value?.hostCidr) return
    text.value = [...new Set([...cidrs(), safety.value.hostCidr])].join('\n')
}

async function load() {
    loading.value = true
    loaded.value = false
    saved.value = false
    confirmed.value = false
    error.value = ''
    checked.value = null
    overrideCurrentConnection.value = false
    try {
        const data = await apiFetch(endpoint, { exposeServerMessage: true })
        if (!Array.isArray(data?.cidrs) || !data.cidrs.every((cidr: unknown) => typeof cidr === 'string')) {
            throw new Error('Unexpected admin network response from server.')
        }
        text.value = data.cidrs.join('\n')
        safety.value = readSafety(data.safety)
        pending.value = readPending(data.pending)
        loaded.value = true
    } catch (e: unknown) {
        error.value = status(e) === 404 ? 'This server does not support admin network settings yet.'
            : e instanceof TypeError && status(e) === undefined
                ? `Cannot reach the nginx HTTPS listener at ${baseUrl.value}. Check the server's HTTPS port, firewall, trusted admin networks, and certificate trust. ${message(e)}`
                : message(e)
    } finally {
        loading.value = false
        scheduleRefresh()
    }
}

async function save() {
    if (!canApply.value) return
    saving.value = true
    saved.value = false
    error.value = ''
    try {
        const data = await apiFetch(endpoint, {
            method: 'PUT',
            body: JSON.stringify({ cidrs: cidrs(), overrideCurrentConnection: overrideCurrentConnection.value }),
            retry: 0,
            timeoutMs: 70000,
            exposeServerMessage: true,
        })
        pending.value = readPending(data?.pending)
        if (!pending.value) throw new Error('Server did not return a temporary policy. Reload to verify the effective policy.')
        confirmed.value = false
        checked.value = null
    } catch (e: unknown) {
        error.value = status(e) === 400
            ? `${message(e)} No changes were applied. Correct the CIDRs and try again.`
            : `${message(e)}. If the connection was interrupted, the result is uncertain. Unconfirmed changes should roll back automatically; reconnect from a trusted network and reload before retrying.`
    } finally {
        saving.value = false
        scheduleRefresh()
    }
}

async function confirmPolicy() {
    if (!pending.value || confirming.value || saving.value || loading.value) return
    const transaction = pending.value
    confirming.value = true
    error.value = ''
    try {
        while (!disposed) {
            if (Date.now() >= Date.parse(transaction.expiresAt)) {
                throw new Error('The confirmation deadline has passed. Reload to check the restored policy.')
            }
            try {
                const data = await apiFetch(`${endpoint}/confirm`, {
                    method: 'POST', body: JSON.stringify({ id: transaction.id }),
                    retry: 0, exposeServerMessage: true, suppressAuthRedirect: true,
                })
                if (data?.pending !== null || !Array.isArray(data?.cidrs)
                    || !data.cidrs.every((cidr: unknown) => typeof cidr === 'string')) {
                    throw new Error('Unexpected policy confirmation response; reload to verify the effective policy.')
                }
                text.value = data.cidrs.join('\n')
                pending.value = null
                saved.value = true
                break
            } catch (e: unknown) {
                // Only a verified old-worker rejection is safe to retry automatically.
                if (!(typeof e === 'object' && e !== null && 'code' in e
                    && e.code === 'confirmation_requires_new_connection')) throw e
                await new Promise<void>(resolve => {
                    finishReconnectWait = resolve
                    reconnectTimer = setTimeout(resolve, 1000)
                })
                finishReconnectWait = undefined
            }
        }
    } catch (e: unknown) {
        error.value = `${message(e)} Confirmation was not verified. Retry using a new connection to nginx before the deadline, or wait for rollback and reload.`
    } finally {
        confirming.value = false
        scheduleRefresh()
    }
}
onMounted(load)
onUnmounted(() => {
    disposed = true
    clearTimeout(refreshTimer)
    clearTimeout(reconnectTimer)
    finishReconnectWait?.()
})
</script>
