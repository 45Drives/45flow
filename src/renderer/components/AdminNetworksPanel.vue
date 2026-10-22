<template>
    <section class="space-y-4" aria-label="Admin networks">
        <h3 class="font-semibold">Trusted admin networks</h3>
        <p class="text-sm text-accent">
            Controls nginx access to administrative endpoints, not public share links.
            Enter one IPv4 or IPv6 CIDR per line. All other addresses are denied.
            /0 ranges (including 0.0.0.0/0 and ::/0) are not permitted because they trust every address
            in that IP family. Use specific trusted LAN or VPN networks.
        </p>
        <p class="text-sm text-danger">
            Removing your current LAN or VPN network can disconnect you. Keep server console or SSH access
            available for recovery. An empty list denies all nginx admin access.
        </p>
        <p v-if="loading" role="status">Loading admin networks…</p>
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
        <template v-if="loaded">
            <label for="admin-cidrs" class="block text-sm font-medium">Trusted CIDRs</label>
            <textarea id="admin-cidrs" v-model="text" rows="10" spellcheck="false"
                class="input-textlike border border-default rounded p-2 w-full font-mono text-sm"
                :disabled="saving || loading" placeholder="192.168.0.0/16&#10;fc00::/7" />
            <p v-if="hasGlobalRange" role="alert" class="text-sm text-danger">
                Remove all /0 ranges before applying. They eliminate the admin network restriction
                for that IP family, and the server will reject them.
            </p>
            <label class="flex gap-2 text-sm">
                <input v-model="confirmed" type="checkbox" :disabled="saving || loading" />
                I understand this change can block my admin connection.
            </label>
        </template>
        <div class="flex gap-2">
            <button type="button" class="btn btn-secondary" :disabled="saving || loading" @click="load">
                Reload admin networks
            </button>
            <button v-if="loaded" type="button" class="btn btn-primary"
                :disabled="saving || loading || !confirmed || hasGlobalRange" @click="save">
                {{ saving ? 'Applying…' : 'Apply admin networks' }}
            </button>
        </div>
        <p v-if="saved" role="status" class="text-sm text-success">
            Admin networks applied and nginx reloaded. Future connections must use a trusted network.
        </p>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi'

const props = defineProps<{ connectionId: string }>()
// Pin requests to the connection on which this keyed panel was opened.
const { apiFetch } = useApi(props.connectionId)
const endpoint = '/api/admin/nginx-admin-cidrs'
const text = ref('')
const confirmed = ref(false)
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const saved = ref(false)
const error = ref('')
const hasGlobalRange = computed(() => text.value.split(/\r?\n/).some(line => /\/0+$/.test(line.trim())))
watch(text, () => { confirmed.value = false; saved.value = false })

async function load() {
    loading.value = true
    loaded.value = false
    saved.value = false
    confirmed.value = false
    error.value = ''
    try {
        const data = await apiFetch(endpoint, { exposeServerMessage: true })
        if (!Array.isArray(data?.cidrs) || !data.cidrs.every((cidr: unknown) => typeof cidr === 'string')) {
            throw new Error('Unexpected admin network response from server.')
        }
        text.value = data.cidrs.join('\n')
        loaded.value = true
    } catch (e: any) {
        error.value = e?.status === 404 ? 'This server does not support admin network settings yet.' : e.message
    } finally { loading.value = false }
}

async function save() {
    if (!loaded.value || !confirmed.value || saving.value || loading.value || hasGlobalRange.value) return
    saving.value = true
    saved.value = false
    error.value = ''
    try {
        await apiFetch(endpoint, {
            method: 'PUT',
            body: JSON.stringify({ cidrs: text.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean) }),
            retry: 0,
            timeoutMs: 70000,
            exposeServerMessage: true,
        })
        saved.value = true
        confirmed.value = false
    } catch (e: any) {
        error.value = e?.status === 400
            ? `${e.message} No changes were applied. Correct the CIDRs and try again.`
            : `${e.message}. If the connection was interrupted, the result is uncertain. Reconnect from a trusted network and reload this setting before retrying.`
    } finally { saving.value = false }
}
onMounted(load)
</script>
