<template>
    <div class="upload-spec-editor flex flex-col gap-3 text-left">
        <label class="flex items-start gap-2 select-none cursor-pointer">
            <input type="checkbox" class="proxy-quality-checkbox mt-0.5 shrink-0" :checked="enabled" :disabled="disabled"
                @change="setEnabled(($event.target as HTMLInputElement).checked)" />
            <div class="min-w-0">
                <div class="text-sm font-medium">Check uploads against file requirements</div>
                <div class="text-xs text-default">
                    Each upload is inspected for container, codec, resolution, frame rate, aspect ratio, duration and audio.
                    Uploaders see the requirements before they send anything.
                </div>
            </div>
        </label>

        <fieldset v-if="enabled" :disabled="disabled" class="flex flex-col gap-3 ml-6 min-w-0">
            <div role="radiogroup" aria-label="When a file doesn't match" class="flex flex-col gap-1">
                <span class="text-xs font-medium text-default">When a file doesn't match</span>
                <label class="inline-flex items-center gap-2 text-sm">
                    <input v-model="draft.action" type="radio" :name="`${uid}-action`" value="reject" class="h-4 w-4" />
                    Reject it and tell the uploader why
                </label>
                <label class="inline-flex items-center gap-2 text-sm">
                    <input v-model="draft.action" type="radio" :name="`${uid}-action`" value="flag" class="h-4 w-4" />
                    Accept it, but flag it and tell the uploader why
                </label>
            </div>

            <div v-for="group in listGroups" :key="group.key" class="flex flex-col gap-1">
                <span class="text-xs font-medium text-default">{{ group.title }} <span class="text-muted font-normal">(any of)</span></span>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <label v-for="opt in group.options" :key="String(opt.value)" class="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" class="proxy-quality-checkbox" :checked="has(group.key, opt.value)"
                            @change="toggle(group.key, opt.value, ($event.target as HTMLInputElement).checked)" />
                        <span>{{ opt.label }}</span>
                    </label>
                </div>
            </div>

            <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-default" :for="`${uid}-res`">Other resolutions</label>
                <input :id="`${uid}-res`" v-model="customResolutions" type="text" placeholder="1998x1080, 4096x1716"
                    class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full max-w-sm"
                    :aria-invalid="!!badResolutions.length" :aria-describedby="badResolutions.length ? `${uid}-res-err` : undefined" />
                <p v-if="badResolutions.length" :id="`${uid}-res-err`" class="text-xs text-flow-danger">
                    Use width×height, like 1920x1080: {{ badResolutions.join(', ') }}
                </p>
            </div>

            <div class="flex flex-wrap gap-4">
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-medium text-default" :for="`${uid}-min`">Shortest (m:ss)</label>
                    <input :id="`${uid}-min`" v-model="minText" type="text" inputmode="numeric" placeholder="0:30"
                        class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-28" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-medium text-default" :for="`${uid}-max`">Longest (m:ss)</label>
                    <input :id="`${uid}-max`" v-model="maxText" type="text" inputmode="numeric" placeholder="1:00:00"
                        class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-28" />
                </div>
            </div>
            <p v-if="durationError" class="text-xs text-flow-danger">{{ durationError }}</p>

            <label class="flex items-start gap-2 select-none cursor-pointer">
                <input v-model="draft.allowOtherFiles" type="checkbox" class="proxy-quality-checkbox mt-0.5 shrink-0" />
                <span class="text-sm">Accept files that aren't video or audio (PDFs, images, documents) without checking them</span>
            </label>

            <p v-if="!hasAnySpecRule(draft)" class="text-xs text-flow-warning">
                Pick at least one requirement, or nothing is checked.
            </p>
        </fieldset>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
    SPEC_ASPECT_RATIOS, SPEC_AUDIO_CHANNELS, SPEC_CONTAINERS, SPEC_FRAME_RATES, SPEC_RESOLUTIONS, SPEC_VIDEO_CODECS,
    emptySpecRules, formatDuration, hasAnySpecRule, parseDuration, withSpecDefaults, type UploadSpecRules,
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
    if (Number.isNaN(minSec.value) || Number.isNaN(maxSec.value)) return 'Enter durations as seconds or m:ss, like 90 or 1:30.'
    if (minSec.value != null && maxSec.value != null && minSec.value > maxSec.value) return 'The shortest length is longer than the longest.'
    return ''
})

function load(rules: UploadSpecRules | null) {
    const r = withSpecDefaults(rules) || emptySpecRules()
    Object.assign(draft, JSON.parse(JSON.stringify(r)))
    draft.resolutions = r.resolutions.filter((x) => SPEC_RESOLUTIONS.includes(x))
    customResolutions.value = r.resolutions.filter((x) => !SPEC_RESOLUTIONS.includes(x)).join(', ')
    minText.value = formatDuration(r.minDurationSec)
    maxText.value = formatDuration(r.maxDurationSec)
}

function output(): UploadSpecRules | null {
    if (!enabled.value) return null
    const custom = badResolutions.value.length ? [] : customList.value.map((s) => s.toLowerCase().replace(/\s*[x×]\s*/, 'x'))
    return {
        ...JSON.parse(JSON.stringify(draft)),
        resolutions: [...new Set([...draft.resolutions, ...custom])],
        minDurationSec: Number.isNaN(minSec.value) ? null : minSec.value,
        maxDurationSec: Number.isNaN(maxSec.value) ? null : maxSec.value,
    }
}

function setEnabled(on: boolean) {
    enabled.value = on
}

let lastEmitted = JSON.stringify(props.modelValue ?? null)
load(props.modelValue)

watch([enabled, draft, customResolutions, minText, maxText], () => {
    const value = output()
    lastEmitted = JSON.stringify(value)
    emit('update:modelValue', value)
    emit('update:invalid', enabled.value && (!!badResolutions.value.length || !!durationError.value))
}, { deep: true })

// Rules loaded later by the parent (for example from the server).
watch(() => props.modelValue, (v) => {
    if (JSON.stringify(v ?? null) === lastEmitted) return
    lastEmitted = JSON.stringify(v ?? null)
    enabled.value = v != null
    load(v)
}, { deep: true })
</script>
