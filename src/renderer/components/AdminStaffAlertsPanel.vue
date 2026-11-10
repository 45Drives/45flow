<template>
    <section aria-label="Staff alerts" class="mt-6">
        <p class="flow-subhead">Staff alerts</p>
        <p v-if="loading && !loaded" class="text-sm text-muted py-2" role="status">Loading staff alerts…</p>
        <FlowNotice v-else-if="unsupported" tone="info" size="sm">
            This server can't send staff alerts yet. Update 45Flow on the server to turn them on.
        </FlowNotice>
        <template v-else>
            <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
                {{ error }}
                <template v-if="!loaded && !loading" #actions>
                    <FlowButton size="xs" @click="load">Try again</FlowButton>
                </template>
            </FlowNotice>
            <div v-if="loaded" class="flow-group">
                <div class="py-3">
                    <FlowField label="Send staff alerts to" optional
                        :help="`Emailed when a client approves, requests changes or rejects, and the first time each verified client downloads a file, on every link. One address per line, up to ${max}.`">
                        <template #default="{ id, describedBy }">
                            <textarea :id="id" v-model="draft" rows="3" :aria-describedby="describedBy"
                                placeholder="producer@studio.com&#10;office@studio.com" autocomplete="off" spellcheck="false"
                                class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full font-mono"
                                :disabled="saving" />
                        </template>
                    </FlowField>
                </div>
            </div>
            <div v-if="loaded" class="flex flex-wrap items-center gap-2 mt-3">
                <FlowButton variant="primary" :disabled="!dirty || saving" :loading="saving" loading-text="Saving…" @click="save">
                    Save staff alerts
                </FlowButton>
                <span v-if="!dirty && saved" class="text-sm text-muted" role="status">
                    {{ emails.length ? `Saved. ${emails.length === 1 ? '1 address' : `${emails.length} addresses`} will get alerts.` : 'Saved. Staff alerts are off.' }}
                </span>
            </div>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId)
const endpoint = '/api/admin/mail/staff-alerts'

const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const saved = ref(false)
const unsupported = ref(false)
const error = ref('')
const emails = ref<string[]>([])
const max = ref(20)
const draft = ref('')
let generation = 0

function parseDraft(text: string) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of text.split(/[\s,;]+/)) {
        const email = part.trim()
        if (!email || seen.has(email.toLowerCase())) continue
        seen.add(email.toLowerCase())
        out.push(email)
    }
    return out
}

const dirty = computed(() => loaded.value && parseDraft(draft.value).join('\n') !== emails.value.join('\n'))

function apply(data: any) {
    emails.value = Array.isArray(data?.emails) ? data.emails.filter((e: unknown) => typeof e === 'string') : []
    if (Number.isInteger(data?.max)) max.value = data.max
    draft.value = emails.value.join('\n')
}

async function load() {
    generation += 1
    const mine = generation
    loading.value = true
    error.value = ''
    try {
        const data = await apiFetch(endpoint)
        if (mine !== generation) return
        apply(data)
        loaded.value = true
    } catch (e: any) {
        if (mine !== generation) return
        if (e?.status === 404) { unsupported.value = true; return }
        error.value = e?.status === 403
            ? 'Admin access is required to change staff alerts.'
            : `Couldn't load staff alerts: ${e?.message || 'request failed'}.`
    } finally {
        if (mine === generation) loading.value = false
    }
}

async function save() {
    if (!dirty.value || saving.value) return
    generation += 1
    const mine = generation
    saving.value = true
    saved.value = false
    error.value = ''
    try {
        const data = await apiFetch(endpoint, {
            method: 'PUT', body: JSON.stringify({ emails: parseDraft(draft.value) }), retry: 0, exposeServerMessage: true,
        })
        if (mine !== generation) return
        apply(data)
        saved.value = true
    } catch (e: any) {
        if (mine !== generation) return
        const details: string[] | undefined = Array.isArray(e?.details) ? e.details : undefined
        error.value = e?.status === 400 && details?.length
            ? `Check the addresses: ${details.join('; ')}. Nothing was saved.`
            : `Couldn't save staff alerts: ${e?.message || 'request failed'}. Nothing was saved.`
    } finally {
        if (mine === generation) saving.value = false
    }
}

onMounted(load)
onUnmounted(() => { generation += 1 })
</script>
