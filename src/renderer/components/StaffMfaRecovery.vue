<template>
    <section aria-label="Your two-step sign-in">
        <h4 class="text-sm font-semibold mb-3">Your recovery codes</h4>
        <p v-if="loading" class="text-sm text-muted" role="status">Loading sign-in settings…</p>
        <FlowNotice v-else-if="loadError" tone="danger" size="sm" live>
            {{ loadError }}
            <template #actions><FlowButton size="xs" @click="load">Try again</FlowButton></template>
        </FlowNotice>
        <p v-else-if="unsupported" class="text-sm text-muted">Update the server to manage recovery codes.</p>
        <p v-else-if="!enrolled" class="text-sm text-muted">You have not set up an authenticator for this account.</p>
        <div v-else class="space-y-2">
            <p class="text-sm text-muted">
                {{ remaining }} recovery {{ remaining === 1 ? 'code' : 'codes' }} remaining.
                Replacement immediately invalidates all your old codes.
            </p>
            <FlowButton size="sm" @click="open = true">Replace recovery codes</FlowButton>
        </div>

        <FlowModal v-model="open" title="Replace recovery codes" size="md" :busy="busy"
            :dismissible="!codes.length" :hide-close="codes.length > 0"
            @close="reset">
            <form v-if="!codes.length" class="space-y-4" @submit.prevent="replace">
                <p class="text-sm">Enter a current code from your authenticator app. Your old recovery codes will stop working.</p>
                <FlowField label="Code from your app" id="mfa-recovery-totp">
                    <template #default="{ id }">
                        <input :id="id" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8"
                            :disabled="busy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                    </template>
                </FlowField>
                <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
                <div class="flex justify-end">
                    <FlowButton type="submit" variant="primary" :disabled="busy || !code.trim()" :loading="busy" loading-text="Replacing…">
                        Replace codes
                    </FlowButton>
                </div>
            </form>
            <div v-else class="space-y-4">
                <FlowNotice tone="warning" size="sm" title="Save your new recovery codes">
                    Your old codes no longer work. Each new code works once and will not be shown again.
                </FlowNotice>
                <ul class="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm" data-test="replacement-codes">
                    <li v-for="item in codes" :key="item" class="select-all">{{ item }}</li>
                </ul>
                <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
                <div class="flex flex-wrap items-center gap-3">
                    <FlowButton size="sm" @click="copy">{{ copied ? 'Copied' : 'Copy codes' }}</FlowButton>
                    <label class="inline-flex items-center gap-2 text-sm">
                        <input v-model="saved" type="checkbox" /> I saved these codes somewhere safe
                    </label>
                </div>
                <div class="flex justify-end">
                    <FlowButton variant="primary" :disabled="!saved" @click="finish">Done</FlowButton>
                </div>
            </div>
        </FlowModal>
    </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowField from '../ui/FlowField.vue'
import FlowModal from '../ui/FlowModal.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId, { transport: 'nginx-https' })
const loading = ref(false)
const unsupported = ref(false)
const loadError = ref('')
const enrolled = ref(false)
const remaining = ref<number | null>(null)
const open = ref(false)
const busy = ref(false)
const code = ref('')
const codes = ref<string[]>([])
const saved = ref(false)
const copied = ref(false)
const error = ref('')

async function load() {
    loading.value = true
    loadError.value = ''
    unsupported.value = false
    try {
        const status = await apiFetch('/api/mfa/me', { retry: 0 })
        enrolled.value = status.enrolled
        remaining.value = status.recoveryCodesRemaining
    } catch (e: unknown) {
        const failure = e as { status?: number; message?: string }
        if (failure.status === 404) unsupported.value = true
        else loadError.value = `Couldn't load sign-in settings: ${failure.message || 'request failed'}.`
    } finally {
        loading.value = false
    }
}

async function replace() {
    busy.value = true
    error.value = ''
    try {
        const result = await apiFetch('/api/mfa/recovery-codes', {
            method: 'POST', body: JSON.stringify({ code: code.value.trim() }), retry: 0,
        })
        if (!Array.isArray(result.recoveryCodes) || !result.recoveryCodes.length ||
            !result.recoveryCodes.every((item: unknown) => typeof item === 'string' && item.length > 0)) {
            throw new Error('Invalid recovery-code response')
        }
        codes.value = result.recoveryCodes
        remaining.value = codes.value.length
        code.value = ''
    } catch (e: unknown) {
        const failure = e as { status?: number; message?: string }
        error.value = failure.status && failure.status >= 400 && failure.status < 500
            ? failure.message || 'The code was not accepted. Try again.'
            : 'Could not confirm whether your codes were replaced. Your old codes may no longer work. Try again with a new authenticator code, or contact an administrator.'
    } finally {
        busy.value = false
    }
}

async function copy() {
    try {
        await navigator.clipboard.writeText(codes.value.join('\n'))
        copied.value = true
    } catch {
        error.value = 'Could not copy. Select the codes and copy them by hand.'
    }
}

function reset() {
    code.value = ''
    codes.value = []
    saved.value = false
    copied.value = false
    error.value = ''
}

async function finish() {
    reset()
    await nextTick()
    open.value = false
}

onMounted(load)
</script>
