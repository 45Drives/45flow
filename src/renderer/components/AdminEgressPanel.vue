<template>
    <section aria-label="Outbound calls">
        <p class="flow-subhead">Outbound calls</p>
        <p class="text-sm text-muted mb-3">
            Everything this server sends over the internet: where it goes, what it sends and how often.
            Each call is written to the audit history. You can turn off the ones marked optional.
        </p>
        <p v-if="loading && !calls.length" class="text-sm text-muted py-2" role="status">Loading outbound calls…</p>
        <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
            {{ error }}
            <template v-if="!calls.length" #actions>
                <FlowButton size="xs" @click="load">Try again</FlowButton>
            </template>
        </FlowNotice>

        <ul v-if="calls.length" class="flow-list">
            <li v-for="call in calls" :key="call.id" class="flow-list__row items-start">
                <div class="min-w-0 flex-1">
                    <p class="flow-list__title flex flex-wrap items-center gap-2">
                        <span>{{ call.name }}</span>
                        <FlowChip size="sm" :tone="badge(call).tone">{{ badge(call).text }}</FlowChip>
                    </p>
                    <p class="flow-list__meta break-words">To: <span class="font-mono">{{ call.destination }}</span></p>
                    <p class="text-xs mt-1"><span class="text-muted">Sends:</span> {{ call.dataSent }}</p>
                    <p class="text-xs mt-0.5"><span class="text-muted">How often:</span> {{ call.frequency }}</p>
                    <p v-if="call.optional && !call.enabled" class="text-xs mt-0.5 text-flow-warning">Off: {{ call.whenOff }}</p>
                    <p v-else-if="!call.notActive" class="text-xs mt-0.5 text-muted">{{ call.optional ? 'If turned off' : 'Turning it off' }}: {{ call.whenOff }}</p>
                    <p v-if="activity(call)" class="text-xs mt-0.5 text-muted">{{ activity(call) }}</p>
                </div>
                <div v-if="call.optional" class="flex items-center gap-2 shrink-0 pt-0.5">
                    <span class="text-xs text-muted">{{ call.enabled ? 'On' : 'Off' }}</span>
                    <FlowSwitch :model-value="call.enabled" :label="`${call.name}: ${call.enabled ? 'on' : 'off'}`"
                        :disabled="saving === call.id || needsLicense(call)" @update:model-value="(v: boolean) => toggle(call, v)" />
                </div>
                <p v-if="needsLicense(call)" class="text-xs mt-0.5 text-muted basis-full" role="note">
                    Needs a 45Flow Premium license. Activate one under License to turn this on.
                </p>
                <div v-if="showActivation(call)" class="basis-full mt-1" data-test="p2p-activation">
                    <FlowNotice v-if="call.p2p?.state === 'active'" tone="success" size="sm" live>
                        Your P2P address is active: <span class="font-mono break-all">{{ call.p2p.address }}</span>
                        <span class="block text-xs mt-0.5">New share links use it.</span>
                    </FlowNotice>
                    <FlowNotice v-else tone="info" size="sm" live>
                        <span class="block">Waiting for 45Drives to activate <span class="font-mono break-all">{{ call.p2p?.address }}</span></span>
                        <span class="block text-xs mt-0.5">
                            New share links use your direct address until it is active, then switch automatically.
                            Ask 45Drives support to activate it: {{ SUPPORT_CONTACT }}.
                        </span>
                        <template #actions>
                            <FlowButton size="xs" @click="copyAddress(call.p2p?.address)">{{ copied ? 'Copied' : 'Copy address' }}</FlowButton>
                        </template>
                    </FlowNotice>
                </div>
            </li>
        </ul>
    </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowNotice from '../ui/FlowNotice.vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowSwitch from '../ui/FlowSwitch.vue'
import { writeClipboard } from '../clipboard'

type EgressCall = {
    id: string
    name: string
    destination: string
    dataSent: string
    frequency: string
    whenOff: string
    optional: boolean
    enabled: boolean
    scope: 'internet' | 'lan'
    inProcess: boolean
    notActive?: boolean
    licensed?: boolean
    /** P2P only: the address and whether 45Drives has activated it ('off' | 'pending' | 'active'). */
    p2p?: { address: string | null; state: 'off' | 'pending' | 'active'; checkedAt: string | null }
    lastCall: { ts: string; ok: boolean; status: number | null } | null
    recent: { calls: number; failures: number; lastAt: string | null }
}
type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'

const props = defineProps<{ connectionId: string }>()
const emit = defineEmits<{ (e: 'changed'): void }>()
const { apiFetch } = useApi(props.connectionId)

const calls = ref<EgressCall[]>([])
const statsDays = ref(30)
const loading = ref(false)
const saving = ref<string | null>(null)
const error = ref('')
const copied = ref(false)

const SUPPORT_CONTACT = 'support@45drives.com'

// Only while P2P is on and an address exists: waiting for activation, or active.
const showActivation = (call: EgressCall) =>
    call.id === 'p2p-handshake' && call.enabled && !!call.p2p?.address && call.p2p.state !== 'off'

async function copyAddress(address?: string | null) {
    if (!address) return
    try {
        await writeClipboard(address)
        copied.value = true
        setTimeout(() => { copied.value = false }, 3000)
    } catch (e: unknown) {
        error.value = e instanceof Error ? e.message : 'Couldn\'t copy the address.'
    }
}

function badge(call: EgressCall): { text: string; tone: ChipTone } {
    if (call.notActive) return { text: 'Not active', tone: 'muted' }
    if (call.scope === 'lan') return { text: 'Local network only', tone: 'info' }
    if (call.optional) return { text: 'Optional', tone: call.enabled ? 'neutral' : 'warning' }
    return { text: call.inProcess ? 'Required' : 'Outside the app', tone: 'muted' }
}

// Only P2P needs a licence today: the server sends `licensed` for such calls.
const needsLicense = (call: EgressCall) => call.licensed === false && !call.enabled

function activity(call: EgressCall) {
    if (!call.inProcess || call.notActive || call.scope === 'lan') return ''
    const parts: string[] = []
    if (call.recent.calls) {
        parts.push(`${call.recent.calls.toLocaleString()} call${call.recent.calls === 1 ? '' : 's'} in the last ${statsDays.value} days`)
        if (call.recent.failures) parts.push(`${call.recent.failures} failed`)
    } else {
        parts.push(`No calls in the last ${statsDays.value} days`)
    }
    if (call.lastCall) parts.push(`last ${call.lastCall.ok ? 'succeeded' : 'failed'} ${new Date(call.lastCall.ts).toLocaleString()}`)
    return parts.join(', ')
}

async function load() {
    loading.value = true
    error.value = ''
    try {
        const data = await apiFetch('/api/admin/egress', { exposeServerMessage: true })
        if (!Array.isArray(data?.calls)) throw new Error('Unexpected outbound call list from the server.')
        calls.value = data.calls
        statsDays.value = Number(data.statsDays) || 30
    } catch (e: unknown) {
        const status = typeof e === 'object' && e !== null && 'status' in e ? e.status : undefined
        error.value = status === 404
            ? 'This server does not list its outbound calls yet. Update the Broadcaster.'
            : e instanceof Error ? e.message : 'Couldn\'t load outbound calls.'
    } finally {
        loading.value = false
    }
}

async function toggle(call: EgressCall, enabled: boolean) {
    if (saving.value) return
    saving.value = call.id
    error.value = ''
    const previous = call.enabled
    call.enabled = enabled
    try {
        await apiFetch(`/api/admin/egress/${encodeURIComponent(call.id)}`, {
            method: 'PUT', body: JSON.stringify({ enabled }), retry: 0, exposeServerMessage: true,
        })
        emit('changed')
    } catch (e: unknown) {
        call.enabled = previous
        error.value = `Couldn't turn ${call.name} ${enabled ? 'on' : 'off'}: ${e instanceof Error ? e.message : 'unknown error'}`
    } finally {
        saving.value = null
    }
}

onMounted(load)
</script>
