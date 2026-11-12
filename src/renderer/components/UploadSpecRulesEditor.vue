<template>
    <div class="upload-spec-editor text-left">
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div class="min-w-0 grow basis-60">
                <div class="text-sm font-medium">Check uploads against file requirements</div>
                <div class="text-xs text-muted mt-0.5">{{ subline }}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <button v-if="enabled" type="button" class="btn btn-secondary btn-xs whitespace-nowrap" :disabled="disabled"
                    @click="openDialog">Edit requirements…</button>
                <FlowSwitch :model-value="enabled" label="Check uploads against file requirements" :disabled="disabled"
                    @update:model-value="setEnabled" />
            </div>
        </div>

        <template v-if="enabled">
            <ul v-if="summary.length" class="flex flex-wrap gap-1.5 mt-2" aria-label="File requirements">
                <li v-for="p in summary" :key="p.label">
                    <FlowChip size="sm" class="!whitespace-normal !font-medium"><span class="text-muted">{{ p.label }}</span> {{ p.value }}</FlowChip>
                </li>
            </ul>
            <FlowNotice v-if="invalid" tone="danger" size="sm" plain class="mt-2">
                Some requirements need fixing. Click Edit requirements…
            </FlowNotice>
            <FlowNotice v-else-if="!summary.length" tone="warning" size="sm" plain class="mt-2">
                No requirements picked yet, so nothing is checked.
            </FlowNotice>
        </template>

        <FlowModal :model-value="dialogOpen" title="File requirements" size="lg" position="top"
            description="Uploads must match one of the ticked options in each row. Rows with nothing ticked aren't checked."
            @close="cancelDialog">
            <fieldset :disabled="disabled" class="flex flex-col gap-5 min-w-0 text-left text-sm">
                <div role="radiogroup" aria-label="When a file doesn't match" class="flex flex-col gap-1.5">
                    <span class="text-xs font-medium text-muted">When a file doesn't match</span>
                    <div class="flex flex-wrap gap-x-6 gap-y-1">
                        <label class="inline-flex items-center gap-2">
                            <input v-model="draft.action" type="radio" :name="`${uid}-action`" value="reject" class="h-4 w-4" />
                            Reject it and tell the uploader why
                        </label>
                        <label class="inline-flex items-center gap-2">
                            <input v-model="draft.action" type="radio" :name="`${uid}-action`" value="flag" class="h-4 w-4" />
                            Accept it, but flag it
                        </label>
                    </div>
                </div>

                <div class="flow-group">
                    <div v-for="group in listGroups" :key="group.key" class="spec-row">
                        <div class="text-sm font-medium">{{ group.title }}</div>
                        <div class="min-w-0 flex flex-col gap-2">
                            <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                                <label v-for="opt in group.options" :key="String(opt.value)" class="inline-flex items-center gap-2">
                                    <input type="checkbox" class="proxy-quality-checkbox" :checked="has(group.key, opt.value)"
                                        @change="toggle(group.key, opt.value, ($event.target as HTMLInputElement).checked)" />
                                    <span>{{ opt.label }}</span>
                                </label>
                            </div>
                            <template v-if="group.key === 'resolutions'">
                                <input :id="`${uid}-res`" v-model="customResolutions" type="text" placeholder="1998x1080, 4096x1716"
                                    aria-label="Other resolutions"
                                    class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full max-w-xs"
                                    :aria-invalid="!!badResolutions.length" :aria-describedby="badResolutions.length ? `${uid}-res-err` : undefined" />
                                <FlowNotice v-if="badResolutions.length" :id="`${uid}-res-err`" tone="danger" size="sm" plain>
                                    Use width×height, like 1920x1080: {{ badResolutions.join(', ') }}
                                </FlowNotice>
                            </template>
                        </div>
                    </div>
                    <div class="spec-row">
                        <div class="text-sm font-medium">Length</div>
                        <div class="min-w-0 flex flex-col gap-2">
                            <div class="flex flex-wrap items-center gap-2">
                                <input :id="`${uid}-min`" v-model="minText" type="text" inputmode="numeric" placeholder="0:30"
                                    aria-label="Shortest (m:ss)" class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-24" />
                                <span class="text-muted">to</span>
                                <input :id="`${uid}-max`" v-model="maxText" type="text" inputmode="numeric" placeholder="1:00:00"
                                    aria-label="Longest (m:ss)" class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-24" />
                                <span class="text-xs text-muted">m:ss, either can be blank</span>
                            </div>
                            <FlowNotice v-if="durationError" tone="danger" size="sm" plain>{{ durationError }}</FlowNotice>
                        </div>
                    </div>
                </div>

                <label class="flex items-start gap-2 select-none cursor-pointer">
                    <input v-model="draft.allowOtherFiles" type="checkbox" class="proxy-quality-checkbox mt-0.5 shrink-0" />
                    <span>Accept files that aren't video or audio (PDFs, images, documents) without checking them</span>
                </label>
            </fieldset>

            <template #footer>
                <button type="button" class="btn btn-dismiss" @click="cancelDialog">Cancel</button>
                <button type="button" class="btn btn-primary" :disabled="invalid" @click="dialogOpen = false">Done</button>
            </template>
        </FlowModal>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { FlowChip, FlowModal, FlowNotice, FlowSwitch } from '../ui'
import {
    SPEC_ASPECT_RATIOS, SPEC_AUDIO_CHANNELS, SPEC_CONTAINERS, SPEC_FRAME_RATES, SPEC_RESOLUTIONS, SPEC_VIDEO_CODECS,
    describeSpecRules, emptySpecRules, formatDuration, hasAnySpecRule, parseDuration, withSpecDefaults, type UploadSpecRules,
} from '../utils/uploadSpec'

const props = defineProps<{ modelValue: UploadSpecRules | null; disabled?: boolean }>()
const emit = defineEmits<{
    (e: 'update:modelValue', v: UploadSpecRules | null): void
    /** True while an entry can't be saved (bad resolution or duration). */
    (e: 'update:invalid', v: boolean): void
}>()

const uid = `spec-${Math.random().toString(36).slice(2, 8)}`
type ListKey = 'containers' | 'videoCodecs' | 'frameRates' | 'aspectRatios' | 'audioChannels' | 'resolutions'

const enabled = ref(props.modelValue != null)
const draft = reactive<UploadSpecRules>(emptySpecRules())
const customResolutions = ref('')
const minText = ref('')
const maxText = ref('')
const dialogOpen = ref(false)

const listGroups = computed<{ key: ListKey; title: string; options: { value: string | number; label: string }[] }[]>(() => [
    { key: 'containers', title: 'File type', options: SPEC_CONTAINERS.map((c) => ({ value: c.id, label: c.label })) },
    { key: 'videoCodecs', title: 'Video codec', options: SPEC_VIDEO_CODECS.map((c) => ({ value: c.id, label: c.label })) },
    { key: 'resolutions', title: 'Resolution', options: SPEC_RESOLUTIONS.map((r) => ({ value: r, label: r.replace('x', '×') })) },
    { key: 'frameRates', title: 'Frame rate (fps)', options: SPEC_FRAME_RATES.map((f) => ({ value: f, label: String(f) })) },
    { key: 'aspectRatios', title: 'Aspect ratio', options: SPEC_ASPECT_RATIOS.map((a) => ({ value: a, label: a })) },
    { key: 'audioChannels', title: 'Audio', options: SPEC_AUDIO_CHANNELS.map((a) => ({ value: a.value, label: a.label })) },
])

function has(key: ListKey, value: string | number) {
    return (draft[key] as (string | number)[]).includes(value)
}

function toggle(key: ListKey, value: string | number, on: boolean) {
    const list = draft[key] as (string | number)[]
    const i = list.indexOf(value)
    if (on && i < 0) list.push(value)
    if (!on && i >= 0) list.splice(i, 1)
}

const customList = computed(() => customResolutions.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))
const badResolutions = computed(() => customList.value.filter((s) => !/^\d{2,5}\s*[x×]\s*\d{2,5}$/i.test(s)))

const minSec = computed(() => parseDuration(minText.value))
const maxSec = computed(() => parseDuration(maxText.value))
const durationError = computed(() => {
    if (Number.isNaN(minSec.value) || Number.isNaN(maxSec.value)) return 'Enter lengths as seconds or m:ss, like 90 or 1:30.'
    if (minSec.value != null && maxSec.value != null && minSec.value > maxSec.value) return 'The shortest length is longer than the longest.'
    return ''
})
const invalid = computed(() => enabled.value && (!!badResolutions.value.length || !!durationError.value))

function load(rules: UploadSpecRules | null) {
    const r = withSpecDefaults(rules) || emptySpecRules()
    Object.assign(draft, JSON.parse(JSON.stringify(r)))
    draft.resolutions = r.resolutions.filter((x) => SPEC_RESOLUTIONS.includes(x))
    customResolutions.value = r.resolutions.filter((x) => !SPEC_RESOLUTIONS.includes(x)).join(', ')
    minText.value = formatDuration(r.minDurationSec)
    maxText.value = formatDuration(r.maxDurationSec)
}

function build(): UploadSpecRules {
    const custom = badResolutions.value.length ? [] : customList.value.map((s) => s.toLowerCase().replace(/\s*[x×]\s*/, 'x'))
    return {
        ...JSON.parse(JSON.stringify(draft)),
        resolutions: [...new Set([...draft.resolutions, ...custom])],
        minDurationSec: Number.isNaN(minSec.value) ? null : minSec.value,
        maxDurationSec: Number.isNaN(maxSec.value) ? null : maxSec.value,
    }
}

const output = (): UploadSpecRules | null => (enabled.value ? build() : null)
const summary = computed(() => describeSpecRules(build()))
const subline = computed(() => {
    if (!enabled.value) return 'Uploads are inspected for container, codec, resolution, frame rate, length and audio. Uploaders see the requirements first.'
    const what = draft.action === 'flag' ? 'accepted but flagged' : 'rejected'
    return `Files that don't match are ${what}, and the uploader is told why.${draft.allowOtherFiles ? ' Non-media files are accepted unchecked.' : ''}`
})

// Cancel in the dialog puts back what was there when it opened, including the switch.
let snapshot = ''
function capture() {
    snapshot = JSON.stringify({ enabled: enabled.value, draft, customResolutions: customResolutions.value, minText: minText.value, maxText: maxText.value })
}
function openDialog() {
    capture()
    dialogOpen.value = true
}
function cancelDialog() {
    if (snapshot) {
        const s = JSON.parse(snapshot)
        enabled.value = s.enabled
        Object.assign(draft, s.draft)
        customResolutions.value = s.customResolutions
        minText.value = s.minText
        maxText.value = s.maxText
    }
    dialogOpen.value = false
}

function setEnabled(on: boolean) {
    if (on && !hasAnySpecRule(build())) {
        openDialog()
        enabled.value = true
        return
    }
    enabled.value = on
}

let lastEmitted = JSON.stringify(props.modelValue ?? null)
load(props.modelValue)

watch([enabled, draft, customResolutions, minText, maxText], () => {
    const value = output()
    lastEmitted = JSON.stringify(value)
    emit('update:modelValue', value)
    emit('update:invalid', invalid.value)
}, { deep: true })

// Rules loaded later by the parent (for example from the server).
watch(() => props.modelValue, (v) => {
    if (JSON.stringify(v ?? null) === lastEmitted) return
    lastEmitted = JSON.stringify(v ?? null)
    enabled.value = v != null
    load(v)
}, { deep: true })
</script>

<style scoped>
.spec-row {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    column-gap: 1rem;
    row-gap: 0.25rem;
    align-items: start;
    padding: 0.75rem 0;
}

@media (max-width: 640px) {
    .spec-row {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
