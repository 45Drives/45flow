<template>
    <section aria-label="Client resolution emails" class="mt-6">
        <h3 class="text-sm font-semibold">Client resolution emails</h3>
        <p class="text-sm text-muted mt-1">Enable updates for invited clients on this link. Each client is emailed only when their own feedback is resolved. Off by default.</p>
        <FlowNotice v-if="error" tone="danger" size="sm" live class="mt-3">
            {{ error }}
            <template #actions><FlowButton size="xs" @click="load">Try again</FlowButton></template>
        </FlowNotice>
        <FlowNotice v-if="unsupported" tone="info" size="sm" class="mt-3">Update the server to configure resolution emails.</FlowNotice>
        <p v-else-if="loading || saving" class="text-sm text-muted mt-3" role="status">{{ saving ? 'Saving...' : 'Loading...' }}</p>
        <p v-else-if="loaded && !items.length" class="text-sm text-muted mt-3">Invite a client with an email address to enable updates.</p>
        <div v-if="items.length" class="mt-3 flex flex-col gap-3">
            <label v-for="item in items" :key="item.id" class="flex items-start gap-2 text-sm">
                <input type="checkbox" class="mt-1" :checked="!!item.enabled" :disabled="loading || saving"
                    :aria-label="`Resolution emails for ${item.name}`" @change="change(item, $event)" />
                <span class="min-w-0"><span class="font-medium">{{ item.name }}</span><span class="block text-muted break-all">{{ item.user_email }}</span></span>
            </label>
        </div>
    </section>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowNotice from '../ui/FlowNotice.vue'

interface Recipient { id: number; name: string; user_email: string; enabled: number }
const props = defineProps<{
    linkId: string | number
    apiFetch: (path: string, init?: { method?: string; body?: string; retry?: number }) => Promise<unknown>
}>()
const items = ref<Recipient[]>([])
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const unsupported = ref(false)
const error = ref('')
let generation = 0
const endpoint = () => `/api/links/${encodeURIComponent(String(props.linkId))}/feedback-notifications`

function apply(data: unknown) {
    if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)
        || !data.items.every(item => Number.isSafeInteger(item?.id) && typeof item.name === 'string'
            && typeof item.user_email === 'string' && [0, 1].includes(item.enabled))) {
        throw new Error('Invalid notification settings response')
    }
    items.value = data.items
    loaded.value = true
}
async function load() {
    const mine = ++generation
    loading.value = true
    error.value = ''
    try {
        const data = await props.apiFetch(endpoint())
        if (mine === generation) apply(data)
    } catch (e: unknown) {
        if (mine !== generation) return
        if (e instanceof Error && 'status' in e && e.status === 404) unsupported.value = true
        else error.value = "Couldn't load resolution email settings."
    } finally { if (mine === generation) loading.value = false }
}
async function change(item: Recipient, event: Event) {
    if (!(event.target instanceof HTMLInputElement) || saving.value) return
    const enabled = event.target.checked
    event.target.checked = !!item.enabled
    const mine = ++generation
    saving.value = true
    error.value = ''
    try {
        const data = await props.apiFetch(endpoint(), { method: 'PUT', retry: 0, body: JSON.stringify({ userId: item.id, enabled }) })
        if (mine === generation) apply(data)
    } catch {
        if (mine === generation) error.value = "Couldn't save the resolution email setting. Check the current setting before retrying."
    } finally { if (mine === generation) saving.value = false }
}
watch(() => props.linkId, () => {
    items.value = []
    loaded.value = false
    unsupported.value = false
    saving.value = false
    void load()
}, { immediate: true })
onUnmounted(() => { generation++ })
</script>
