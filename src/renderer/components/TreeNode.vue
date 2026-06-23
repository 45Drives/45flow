<template>
    <div class="bg-accent">
        <!-- Non-root row -->
        <div v-if="!isRoot" data-fp-item class="grid auto-rows-[28px] items-center border-b border-default ss-explorer-hover text-default cursor-pointer 
            [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px] focus:outline-none"
            @click="modeIsUpload ? selectFolder() : onRowClick()"
            @keydown.enter.prevent="modeIsUpload ? selectFolder() : onRowClick()"
            @keydown.space.prevent="modeIsUpload ? selectFolder() : onRowClick()" role="button" tabindex="0"
            :aria-expanded="open">
            <!-- checkbox col -->
            <div class="px-2 py-1 flex justify-center">
                <template v-if="modeIsUpload">
                    <button type="button"
                        class="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current"
                        :aria-checked="isFolderSelected" role="radio" @click.stop="selectFolder()">
                        <span v-if="isFolderSelected" class="inline-block w-2 h-2 rounded-full bg-current"></span>
                    </button>
                </template>
                <template v-else>
                    <input class="input-checkbox h-4 w-4 m-0" type="checkbox"
                        :checked="folderFullySelected"
                        :indeterminate="folderPartiallySelected"
                        @click.stop="toggleFolder"
                        :aria-checked="folderFullySelected ? 'true' : folderPartiallySelected ? 'mixed' : 'false'"
                        title="Select all files in this folder" />
                </template>
            </div>

            <!-- name -->
            <div class="px-2 py-1 min-w-0">
                <div class="flex items-center gap-2"
                    :style="{ '--tw-ps': `${depth * 24}px`, paddingInlineStart: `var(--tw-ps)` }">
                    <!-- arrow (stop to avoid double toggle) -->
                    <button
                        class="w-4 h-4 rounded border border-current text-[10px] leading-none inline-flex items-center justify-center shrink-0"
                        @click.stop="toggleOpen" :aria-label="open ? 'Collapse' : 'Expand'">
                        {{ open ? '▾' : '▸' }}
                    </button>

                    <!-- label (also stops bubbling; the row already handles click) -->
                    <button class="underline truncate font-semibold" :title="label + '/'"
                        @click.stop="modeIsUpload ? emit('select-folder', props.relPath || '') : toggleOpen()">
                        {{ label }}/
                    </button>
                </div>
            </div>

            <div class="px-2 py-1">Folder</div>
            <div class="px-2 py-1">—</div>
            <div class="px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis tabular-nums"
                :title="fmtDateFull(entryMtime)">
                {{ fmtDate(entryMtime) }}
            </div>
        </div>

        <!-- children -->
        <div v-show="isRoot || open" class="">
            <div v-if="loading" class="opacity-70 text-xs p-2">Loading…</div>
            <!-- empty directory notice -->
            <div v-if="!loading && open && !children.length"
                class="grid auto-rows-[28px] [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px] items-center border-b border-default">
                <!-- keep first col blank like other rows -->
                <div class="px-2 py-2"></div>
                <div class="px-2 py-2 text-sm italic opacity-70">Directory is empty</div>
                <div class="px-2 py-2"></div>
                <div class="px-2 py-2"></div>
                <div class="px-2 py-2"></div>
            </div>
            <template v-for="ch in children" :key="ch.path" class="">
                <TreeNode v-if="ch.isDir" :label="ch.name" :relPath="ch.path" :apiFetch="apiFetch" :useCase="useCase"
                    :selectedFolder="selectedFolder" :selected="selected" :selectedVersion="selectedVersion"
                    :getFilesFor="getFilesFor" :depth="depth + 1" @select-folder="$emit('select-folder', $event)"
                    @toggle="$emit('toggle', $event)" @navigate="$emit('navigate', $event)"
                    @select-range="$emit('select-range', $event)" />
                <div v-else :class="[
                    'grid auto-rows-[28px] items-center border-b border-default cursor-pointer select-none [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]',
                    (!modeIsUpload && selected.has(ch.path)) ?
                    'bg-[var(--row-selected-bg)] ring-1 ring-[var(--btn-primary-border)] border-b-transparent relative z-[1]'
                        : 'ss-explorer-hover',
                    modeIsUpload ? 'opacity-90 pointer-events-none' : ''
                ]" @click="($event) => onFileToggle(ch.path, $event)" @keydown.enter.prevent="onFileToggle(ch.path)"
                    @keydown.space.prevent="onFileToggle(ch.path)" role="button" tabindex="0"
                    :aria-pressed="!modeIsUpload && selected.has(ch.path)" class="focus:outline-none">
                    <!-- checkbox -->
                    <div class="px-2 py-1 flex justify-center">
                        <template v-if="!modeIsUpload">
                            <input class="input-checkbox h-4 w-4 m-0" type="checkbox" :checked="selected.has(ch.path)"
                                @click.stop @change="() => onFileToggle(ch.path)"
                                :aria-checked="selected.has(ch.path)" />
                        </template>
                    </div>

                    <!-- name -->
                    <div class="px-2 py-1 min-w-0">
                        <div class="flex items-center gap-2"
                            :style="{ '--tw-ps': `${(depth + 1) * 24}px`, paddingInlineStart: `var(--tw-ps)` }">
                            <span class="w-4 h-4 rounded border border-transparent shrink-0"></span>
                            <span class="truncate font-medium text-default" :title="ch.name">{{ ch.name }}</span>
                        </div>
                    </div>

                    <div class="px-2 py-1 text-default">File</div>
                    <div class="px-2 py-1 text-default">{{ fmtBytes(ch.size) }}</div>
                    <div class="px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis tabular-nums text-default"
                        :title="fmtDateFull(ch.mtime)">
                        {{ fmtDate(ch.mtime) }}
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import { useTimeFormat } from '../composables/useTimeFormat'
defineOptions({ name: 'TreeNode' })

type TogglePayload = { path: string; isDir: boolean }

const props = defineProps<{
    label?: string                // display name (no trailing slash)
    relPath: string               // '' means root
    apiFetch: (url: string, init?: any) => Promise<any>
    selected: Set<string>         // files only
    selectedVersion?: number      // bump whenever selection changes
    getFilesFor: (folder: string) => Promise<string[]>
    depth?: number
    isRoot?: boolean
    useCase?: 'upload' | 'share'
    selectedFolder?: string | null
}>()

const emit = defineEmits<{
    (e: 'toggle', payload: TogglePayload): void
    (e: 'navigate', rel: string): void
    (e: 'select-folder', folderRel: string): void
    (e: 'select-range', paths: string[]): void
}>()

const modeIsUpload = computed(() => (props.useCase ?? 'share') === 'upload')
const isFolderSelected = computed(() =>
 modeIsUpload.value && !isRoot && props.selectedFolder === props.relPath)

// --- Folder selection state (share mode) ---
function isFileInSelected(f: string) {
    const stripped = f.replace(/^\/+/, '')
    return props.selected.has(f) || props.selected.has('/' + stripped) || props.selected.has(stripped)
}
const folderFileCount = computed(() => allFiles.value?.length ?? 0)
const folderSelectedCount = computed(() => {
    if (!allFiles.value) return 0
    return allFiles.value.filter(isFileInSelected).length
})
const folderFullySelected = computed(() =>
    folderFileCount.value > 0 && folderSelectedCount.value >= folderFileCount.value
)
const folderPartiallySelected = computed(() =>
    folderSelectedCount.value > 0 && folderSelectedCount.value < folderFileCount.value
)
function toggleFolder() {
    emit('toggle', { path: props.relPath || '', isDir: true })
}

const depth = props.depth ?? 0
const isRoot = props.isRoot ?? false

const open = ref<boolean>(isRoot ? true : false)
const loading = ref(false)
const children = ref<Array<{ name: string; isDir: boolean; path: string; size?: number; mtime?: number }>>([])

const entryMtime = computed(() => 0)

function onRowClick() {
    toggleOpen();
}

async function ensureChildren() {
    if (children.value.length || loading.value) return
    loading.value = true
    const data = await props.apiFetch(`/api/files?dir=${encodeURIComponent(props.relPath)}`)
    const dir = data.dir ?? props.relPath
    const ents = (data.entries || [])
        .map((e: any) => ({ ...e, path: (dir ? dir + '/' : '') + e.name }))
        .sort((a: any, b: any) => (Number(b.isDir) - Number(a.isDir)) || a.name.localeCompare(b.name))
    children.value = ents
    loading.value = false
}

function toggleOpen() {
    open.value = !open.value
    if (open.value) {
        ensureChildren()
        ensureAllFiles()
    }
}

const allFiles = ref<string[] | null>(null)

async function ensureAllFiles() {
    if (isRoot) return
    if (allFiles.value === null) {
        allFiles.value = await props.getFilesFor(props.relPath || '')
    }
}


// mount: load per-folder file list even when collapsed
onMounted(async () => {
    if (isRoot) {
        await ensureChildren()
    } else {
        allFiles.value = null
        await ensureAllFiles()
    }
})

// root/folder path changed (e.g., PathInput picked a new cwd) → reset caches
watch(() => props.relPath, async () => {
    children.value = []
    allFiles.value = null
    open.value = isRoot ? true : open.value
    await ensureChildren()
    await ensureAllFiles()
})

function fmtBytes(n?: number) {
    if (!n || n < 0) return '—'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, x = n
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++ }
    return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

const { hour12 } = useTimeFormat()

function fmtDate(ms?: number) {
    if (!Number.isFinite(ms!)) return '—'
    const d = new Date(ms!)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: hour12.value,
    }).format(d)
}

function fmtDateFull(ms?: number) {
    if (!Number.isFinite(ms!)) return '—'
    const d = new Date(ms!)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, { hour12: hour12.value }) 
}

// --- Shift-click range selection ---
const lastClickedFilePath = ref<string | null>(null)

function onFileToggle(path: string, event?: MouseEvent) {
  if (modeIsUpload.value) return

  const fileEntries = children.value.filter(ch => !ch.isDir)
  const currentIdx = fileEntries.findIndex(ch => ch.path === path)

  if (event?.shiftKey && lastClickedFilePath.value != null) {
    const lastIdx = fileEntries.findIndex(ch => ch.path === lastClickedFilePath.value)
    if (lastIdx >= 0 && currentIdx >= 0 && lastIdx !== currentIdx) {
      const start = Math.min(lastIdx, currentIdx)
      const end = Math.max(lastIdx, currentIdx)
      const rangePaths = fileEntries.slice(start, end + 1).map(ch => ch.path)
      emit('select-range', rangePaths)
      lastClickedFilePath.value = path
      return
    }
  }

  emit('toggle', { path, isDir: false })
  lastClickedFilePath.value = path
}

function selectFolder() {
  emit('select-folder', props.relPath || '')
}
</script>
