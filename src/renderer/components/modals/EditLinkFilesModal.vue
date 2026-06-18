<template>
    <div v-if="modelValue" class="fixed inset-0 z-[70]">
        <div class="absolute inset-0 bg-black/60" @click="close"></div>

        <div
            class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl bg-well border border-default rounded-lg shadow-lg">
            <div class="flex items-center justify-between px-4 py-3 border-b border-default">
                <h3 class="text-lg font-semibold">
                    Edit Shared Files
                </h3>

                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary" @click="close">Close</button>
                </div>
            </div>

            <div class="px-4 pt-4 pb-4 space-y-4 max-h-[75vh] overflow-y-auto">
                <div class="text-sm opacity-80">
                    Click on files to select or deselect them. Shift-click to select a range. Click on folders to enter. Use folder checkboxes to select all contents.
                </div>

                <FileExplorer :apiFetch="apiFetch" :modelValue="selected" :base="base" :startDir="startDir"
                    @add="onExplorerAdd" @remove="onExplorerRemove" />

                <div class="border rounded bg-accent">
                    <div class="flex flex-wrap items-center gap-2 p-2">
                        <button class="btn btn-secondary" @click="showSelected = !showSelected">
                            {{ showSelected ? 'Hide' : 'Show' }} list
                        </button>
                        <button class="btn btn-danger" @click="clearAll">Clear all</button>

                        <div class="ml-auto text-xs opacity-70">
                            {{ selected.length }} selected
                        </div>
                    </div>

                    <div v-show="showSelected" class="max-h-48 overflow-auto">
                        <div v-for="(p, i) in selected" :key="p + ':' + i"
                            class="grid items-center [grid-template-columns:minmax(0,1fr)_auto] border-t border-default text-sm">
                            <div class="px-3 py-2 rounded-md bg-default min-w-0">
                                <span class="truncate block">{{ p }}</span>
                            </div>

                            <button class="btn btn-danger m-2 px-2 py-1" @click="removeAt(i)" title="Remove">✕</button>
                        </div>
                    </div>
                </div>

                <div v-if="validationError" class="text-sm text-red-400">
                    {{ validationError }}
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button class="btn btn-secondary" @click="close">Cancel</button>
                    <button class="btn btn-primary" :disabled="!!validationError" @click="apply">
                        Apply
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FileExplorer from '../FileExplorer.vue'

const props = defineProps<{
    modelValue: boolean
    apiFetch: (url: string, opts?: any) => Promise<any>
    linkType?: string
    initialPaths: string[]
    base?: string
    startDir?: string
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'apply', paths: string[]): void
}>()

const selected = ref<string[]>([])
const showSelected = ref(true)

function normalizeAbs(p: string) {
    const s = (p || '').trim()
    if (!s) return ''
    return s.startsWith('/') ? s : '/' + s.replace(/^\/+/, '')
}

function inferBaseFromPaths(paths: string[]) {
    const first = (paths || []).map(normalizeAbs).find(Boolean)
    if (!first) return ''
    const seg = first.split('/').filter(Boolean)[0]
    return seg ? '/' + seg : ''
}

const base = computed(() => {
    const b = (props.base ?? '').trim()
    return b || inferBaseFromPaths(props.initialPaths || [])
})

const startDir = computed(() => {
    const sd = (props.startDir ?? '').trim()
    return sd || base.value || '/'
})

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            selected.value = Array.isArray(props.initialPaths)
                ? props.initialPaths.map(normalizeAbs).filter(Boolean)
                : []
            showSelected.value = true
        }
    }
)

function close() {
    emit('update:modelValue', false)
}

function clearAll() {
    selected.value = []
}

function removeAt(i: number) {
    selected.value.splice(i, 1)
}

function onExplorerAdd(paths: string[]) {
    for (const p of paths.map(normalizeAbs)) {
        if (!p) continue
        if (!selected.value.includes(p)) selected.value.push(p)
    }
}

function onExplorerRemove(paths: string[]) {
    const removeSet = new Set(paths.map(normalizeAbs).filter(Boolean))
    selected.value = selected.value.filter((p) => !removeSet.has(normalizeAbs(p)))
}

const validationError = computed(() => {
    if (selected.value.length < 1) return 'Select at least 1 file.'
    return ''
})

const nextType = computed(() => (selected.value.length === 1 ? 'download' : 'collection'))
const typeWillChange = computed(() => props.linkType !== nextType.value)

function apply() {
    if (validationError.value) return
    emit('apply', selected.value.slice())
    close()
}
</script>
