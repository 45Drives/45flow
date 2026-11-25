<template>
    <section aria-label="Security alert emails" class="mt-6">
        <p class="flow-subhead">Security alert emails</p>
        <p v-if="loading && !loaded" class="text-sm text-muted py-2" role="status">Loading security alert settings…</p>
        <FlowNotice v-else-if="unsupported" tone="info" size="sm">
            Update the server to configure security alert emails.
        </FlowNotice>
        <template v-else>
            <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
                {{ error }}
                <template v-if="!loaded && !loading" #actions>
                    <FlowButton size="xs" @click="load">Try again</FlowButton>
                </template>
            </FlowNotice>
            <div v-if="loaded" class="flow-group py-3">
                <FlowField label="Send security alerts to" optional
                    :help="`Separate from staff review alerts. One address per line, up to ${max}. Leave empty to turn off security emails.`">
                    <template #default="{ id, describedBy }">
                        <textarea :id="id" v-model="draft" rows="3" :aria-describedby="describedBy"
                            placeholder="security@example.com" autocomplete="off" spellcheck="false"
                            class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full font-mono"
                            :disabled="saving" />
                    </template>
                </FlowField>
                <p class="text-sm text-muted mt-2">
                    Requires email to be configured and enabled. Unconfirmed messages are retried and may arrive more than once.
                </p>
                <p v-if="pending > 0" class="text-sm text-muted mt-2" role="status">
                    {{ pending }} security alert {{ pending === 1 ? 'email is' : 'emails are' }} waiting for mail-server acceptance.
                </p>
            </div>
            <div v-if="loaded" class="flex flex-wrap items-center gap-2 mt-3">
                <FlowButton variant="primary" :disabled="!dirty || saving" :loading="saving"
                    loading-text="Saving…" @click="save">Save security alerts</FlowButton>
                <span v-if="saved && !dirty" class="text-sm text-muted" role="status">Security alert recipients saved.</span>
            </div>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId)
const endpoint = '/api/admin/mail/security-alerts'
const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const unsupported = ref(false)
const saved = ref(false)
const error = ref('')
const emails = ref<string[]>([])
const draft = ref('')
const max = ref(20)
const pending = ref(0)

function parseDraft(text: string) {
    const seen = new Set<string>()
    return text.split(/[\s,;]+/).filter(email => {
        const key = email.toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}
const dirty = computed(() => loaded.value && parseDraft(draft.value).join('\n') !== emails.value.join('\n'))

function apply(data: { emails: string[], max: number, pending?: number }) {
    emails.value = data.emails
    draft.value = emails.value.join('\n')
    max.value = data.max
    if (typeof data.pending === 'number') pending.value = data.pending
}

async function load() {
    loading.value = true
    error.value = ''
    try {
        apply(await apiFetch(endpoint))
        loaded.value = true
    } catch (e: any) {
        if (e?.status === 404) unsupported.value = true
        else error.value = `Couldn't load security alerts: ${e?.message || 'request failed'}.`
    } finally {
        loading.value = false
    }
}

async function save() {
    if (!dirty.value || saving.value) return
    saving.value = true
    saved.value = false
    error.value = ''
    try {
        apply(await apiFetch(endpoint, {
            method: 'PUT', body: JSON.stringify({ emails: parseDraft(draft.value) }), retry: 0,
        }))
        saved.value = true
        await load()
    } catch (e: any) {
        error.value = e?.status === 400
            ? 'Check the email addresses. Nothing was saved.'
            : e?.code === 'audit_write_failed_after_save'
                ? 'Recipients were saved, but the audit record failed. Check audit storage and reload this setting.'
            : e?.code === 'audit_write_failed'
                ? 'Could not record this change in the audit log. Check audit storage and try again.'
                : `Couldn't save security alerts: ${e?.message || 'request failed'}. Nothing was saved.`
    } finally {
        saving.value = false
    }
}

onMounted(load)
</script>
