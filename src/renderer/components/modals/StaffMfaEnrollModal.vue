<template>
    <FlowModal :model-value="modelValue" title="Set up two-step sign-in" size="md" :busy="busy"
        :dismissible="step !== 'recovery' || saved" :hide-close="step === 'recovery' && !saved"
        description="First get approval, then add this account to an authenticator app on your phone."
        @update:model-value="value => !value && close()">
        <form v-if="step === 'approval'" class="space-y-4" @submit.prevent="begin">
            <p v-if="rootApprovalRequired" class="text-sm">
                No staff authenticator is set up yet. The first approval must come from the server's root administrator.
            </p>
            <fieldset v-else class="space-y-2" :disabled="busy">
                <legend class="text-sm font-medium mb-2">How will you get approval?</legend>
                <label class="flex items-center gap-2 text-sm">
                    <input v-model="approvalPath" type="radio" value="request" name="mfa-approval-path" />
                    Ask a 45Flow administrator
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <input v-model="approvalPath" type="radio" value="root" name="mfa-approval-path" />
                    Use a code issued on the server
                </label>
            </fieldset>
            <div v-if="approvalPath === 'root'" class="space-y-2 text-sm">
                <p>A server administrator runs this command as root, on the server or over SSH, replacing &lt;username&gt; with your server account name:</p>
                <code class="block font-mono text-xs break-all select-all">sudo node /opt/45drives/houston-broadcaster/dist/mfa-admin.js issue-code &lt;username&gt;</code>
                <p class="text-muted">They give the code only to you. It expires in 15 minutes. This is an approval code, not the 6-digit code from an authenticator.</p>
            </div>
            <FlowField label="Account password" id="mfa-password" help="Re-enter your server account password to protect authenticator setup.">
                <template #default="{ id, describedBy }">
                    <input :id="id" v-model="passwordDraft" type="password" autocomplete="current-password"
                        :aria-describedby="describedBy" :disabled="busy"
                        class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
                </template>
            </FlowField>

            <template v-if="approvalPath === 'request'">
                <FlowNotice v-if="request" tone="info" size="sm" live title="Waiting for administrator approval">
                    <p class="font-mono text-lg tracking-widest" data-test="request-code">{{ request.requestCode }}</p>
                    <p class="text-sm">Read this code to a 45Flow administrator through a trusted channel. They verify your identity and approve it in Settings → Two-step sign-in. Then choose Continue. The request expires in 15 minutes.</p>
                </FlowNotice>
                <template v-else>
                    <p class="text-sm text-muted">An administrator who already uses an authenticator in 45Flow must verify your identity and approve your request.</p>
                    <FlowButton type="button" :disabled="busy || !passwordDraft" @click="ask">Ask an administrator to approve</FlowButton>
                </template>
            </template>

            <FlowField v-if="approvalPath === 'root'" label="Code issued on the server" id="mfa-code"
                help="Enter the approval code the server administrator gave you.">
                <template #default="{ id, describedBy }">
                    <input :id="id" v-model="codeDraft" type="text" autocomplete="off" spellcheck="false"
                        :aria-describedby="describedBy" :disabled="busy"
                        class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                </template>
            </FlowField>
            <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
            <div class="flex justify-end">
                <FlowButton type="submit" variant="primary" :disabled="busy || !passwordDraft || !codeDraft || (approvalPath === 'request' && !request)" :loading="busy" loading-text="Checking…">
                    Continue
                </FlowButton>
            </div>
        </form>

        <form v-else-if="step === 'secret'" class="space-y-4" @submit.prevent="confirm">
            <p class="text-sm">In your authenticator app, add an account using this key, then enter the 6-digit code it shows.</p>
            <FlowCard variant="inset" padding="sm">
                <p class="text-xs text-muted">Setup key</p>
                <p class="font-mono text-lg break-all select-all" data-test="secret">{{ formattedSecret }}</p>
                <details class="mt-2 text-xs">
                    <summary class="cursor-pointer">Setup link for apps that accept one</summary>
                    <p class="font-mono break-all select-all mt-1">{{ enrollment?.otpauthUri }}</p>
                </details>
            </FlowCard>
            <FlowField label="Code from your app" id="mfa-totp">
                <template #default="{ id }">
                    <input :id="id" v-model="totpDraft" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8"
                        :disabled="busy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                </template>
            </FlowField>
            <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
            <div class="flex justify-end">
                <FlowButton type="submit" variant="primary" :disabled="busy || !totpDraft" :loading="busy" loading-text="Confirming…">
                    Confirm
                </FlowButton>
            </div>
        </form>

        <div v-else class="space-y-4">
            <FlowNotice tone="warning" size="sm" title="Save your recovery codes now">
                Each works once if you lose your phone. They are not shown again. Any existing sign-in on other devices ends,
                so sign in again with your app after you finish.
            </FlowNotice>
            <ul class="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm" data-test="recovery-codes">
                <li v-for="code in recoveryCodes" :key="code" class="select-all">{{ code }}</li>
            </ul>
            <div class="flex flex-wrap items-center gap-3">
                <FlowButton type="button" size="sm" @click="copy">{{ copied ? 'Copied' : 'Copy codes' }}</FlowButton>
                <label class="inline-flex items-center gap-2 text-sm">
                    <input v-model="saved" type="checkbox" /> I saved these codes somewhere safe
                </label>
            </div>
            <div class="flex justify-end">
                <FlowButton variant="primary" :disabled="!saved" @click="finish">Done</FlowButton>
            </div>
        </div>
    </FlowModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FlowButton from '../../ui/FlowButton.vue'
import FlowCard from '../../ui/FlowCard.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import {
    beginEnrollment, confirmEnrollment, enrollmentMessage, formatSecret, requestEnrollment,
    type MfaTransport,
} from '../../composables/staffMfa'

const props = defineProps<{
    modelValue: boolean
    username: string
    /** Prefilled from the sign-in form when there is one; always editable. */
    password?: string
    rootApprovalRequired?: boolean
    send: MfaTransport
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; enrolled: [] }>()

type Step = 'approval' | 'secret' | 'recovery'
const step = ref<Step>('approval')
const busy = ref(false)
const error = ref('')
const passwordDraft = ref(props.password ?? '')
const codeDraft = ref('')
const totpDraft = ref('')
const request = ref<{ requestCode: string; expiresAt: string } | null>(null)
const approvalPath = ref<'request' | 'root'>(props.rootApprovalRequired ? 'root' : 'request')
const enrollment = ref<{ secret: string; otpauthUri: string } | null>(null)
const recoveryCodes = ref<string[]>([])
const saved = ref(false)
const copied = ref(false)

const who = computed(() => ({ username: props.username, password: passwordDraft.value }))
const formattedSecret = computed(() => formatSecret(enrollment.value?.secret ?? ''))

function reset() {
    step.value = 'approval'
    busy.value = false
    error.value = ''
    passwordDraft.value = props.password ?? ''
    codeDraft.value = ''
    totpDraft.value = ''
    request.value = null
    approvalPath.value = props.rootApprovalRequired ? 'root' : 'request'
    enrollment.value = null
    recoveryCodes.value = []
    saved.value = false
    copied.value = false
}
watch(() => props.modelValue, open => { if (open) reset() })
watch(approvalPath, () => {
    codeDraft.value = approvalPath.value === 'request' ? request.value?.requestCode ?? '' : ''
    error.value = ''
})

async function run(action: () => Promise<void>) {
    busy.value = true
    error.value = ''
    try { await action() } catch (e) { error.value = enrollmentMessage(e) } finally { busy.value = false }
}

const ask = () => run(async () => {
    request.value = await requestEnrollment(props.send, who.value)
    codeDraft.value = request.value.requestCode
})

const begin = () => run(async () => {
    enrollment.value = await beginEnrollment(props.send, who.value, codeDraft.value.trim())
    step.value = 'secret'
})

const confirm = () => run(async () => {
    const done = await confirmEnrollment(props.send, who.value, codeDraft.value.trim(), totpDraft.value.trim())
    recoveryCodes.value = done.recoveryCodes
    passwordDraft.value = ''
    step.value = 'recovery'
})

async function copy() {
    try {
        await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
        copied.value = true
    } catch { error.value = 'Could not copy. Select the codes and copy them by hand.' }
}

function finish() {
    emit('enrolled')
    close()
}

function close() {
    // Secrets and codes never outlive the dialog.
    reset()
    emit('update:modelValue', false)
}
</script>
