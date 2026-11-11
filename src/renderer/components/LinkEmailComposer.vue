<template>
    <div class="flow-group" data-tour="link-email-composer" aria-label="Email the link">
        <div class="flex items-center justify-between gap-4 py-3">
            <div class="min-w-0">
                <p class="text-sm font-medium text-default">Send link by email</p>
                <p class="text-xs text-muted mt-0.5">{{ summary }}</p>
            </div>
            <FlowSwitch :model-value="enabled" label="Send link by email" :disabled="disabled" @update:model-value="setEnabled" />
        </div>

        <div v-if="enabled" class="flex flex-col gap-3 py-3">
            <fieldset v-if="peopleRows.length" class="flex flex-col gap-1.5 min-w-0">
                <legend class="text-sm font-medium mb-1">Invited people</legend>
                <label v-for="p in peopleRows" :key="p.key" class="flex items-center gap-2 min-w-0 text-sm"
                    :class="p.email ? 'cursor-pointer' : 'opacity-60'">
                    <input type="checkbox" class="styled-checkbox shrink-0" :checked="!!p.email && selected.has(p.email)"
                        :disabled="!p.email || disabled" :aria-label="`Email ${p.name}`" @change="toggle(p.email)" />
                    <span class="truncate font-medium" :title="p.name">{{ p.name }}</span>
                    <span class="truncate text-muted" :title="p.email || undefined">{{ p.email || 'No email address' }}</span>
                </label>
            </fieldset>
            <FlowField :label="peopleRows.length ? 'Other email addresses' : 'Email addresses'" :optional="peopleRows.length > 0"
                help="Separate several addresses with commas.">
                <template #default="{ id, describedBy }">
                    <input :id="id" v-model.trim="typed" type="email" multiple autocomplete="email"
                        placeholder="name@example.com, other@example.com" :aria-describedby="describedBy" :disabled="disabled"
                        class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full min-w-0" />
                </template>
            </FlowField>
            <p v-if="invalid.length" class="text-xs text-flow-danger" role="status">
                Check {{ invalid.length === 1 ? 'this address' : 'these addresses' }}: {{ invalid.join(', ') }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FlowField from '../ui/FlowField.vue'
import FlowSwitch from '../ui/FlowSwitch.vue'
import { collectRecipients, invalidAddresses, invitePeopleRows, type InvitePerson } from '../utils/emailRecipients'

const props = defineProps<{
    /** People invited to the link being set up. */
    people?: InvitePerson[]
    disabled?: boolean
}>()

const enabled = defineModel<boolean>({ default: false })
const emit = defineEmits<{
    /** Addresses to email once the link exists; empty when sending is off. */
    (e: 'update:recipients', v: string[]): void
    /** Typed entries that aren't addresses; creating the link should wait until they're fixed. */
    (e: 'update:invalid', v: string[]): void
}>()

const typed = ref('')
const selected = ref<Set<string>>(new Set())
// People already auto-ticked once, so unticking someone sticks.
const seenPeople = new Set<string>()
let enabledTouched = false

const peopleRows = computed(() => invitePeopleRows(props.people))
const invalid = computed(() => (enabled.value ? invalidAddresses(typed.value) : []))
const recipients = computed(() => (enabled.value ? collectRecipients(peopleRows.value, selected.value, typed.value) : []))

const summary = computed(() => {
    if (!enabled.value) return 'Email the link to your client when it is created.'
    const n = recipients.value.length
    if (!n) return 'Tick someone or enter an address, or turn this off.'
    return `Emails ${n === 1 ? recipients.value[0] : `${n} people`} when the link is created.`
})

// Invited people with an email start ticked, and the first one turns sending on
// unless the switch was set by hand.
watch(peopleRows, (rows) => {
    const next = new Set(selected.value)
    const present = new Set<string>()
    let added = false
    for (const p of rows) {
        if (!p.email) continue
        present.add(p.email)
        if (!seenPeople.has(p.email)) {
            seenPeople.add(p.email)
            next.add(p.email)
            added = true
        }
    }
    for (const e of next) if (!present.has(e)) next.delete(e)
    selected.value = next
    if (added && !enabledTouched && !enabled.value) enabled.value = true
}, { immediate: true })

watch(recipients, v => emit('update:recipients', v), { immediate: true })
watch(invalid, v => emit('update:invalid', v), { immediate: true })

function setEnabled(v: boolean) {
    enabledTouched = true
    enabled.value = v
}

function toggle(email: string | null) {
    if (!email) return
    const next = new Set(selected.value)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    selected.value = next
}

function reset() {
    typed.value = ''
    selected.value = new Set()
    seenPeople.clear()
    enabledTouched = false
    enabled.value = false
}

defineExpose({ reset })
</script>
