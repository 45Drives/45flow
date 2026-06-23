<template>
    <div class="p-2">
        <!-- header / path + up -->
        <div v-if="loading" class="opacity-70 text-xs p-2">Loading…</div>

        <div v-else-if="!entries.length"
            class="opacity-70 text-sm italic p-6 text-center border border-dashed rounded-lg">
            This folder is empty
        </div>

        <!-- icon grid -->
        <div v-else class="grid gap-3 justify-start [grid-template-columns:repeat(auto-fill,minmax(9rem,9rem))]">
            <button v-for="ent in entries" :key="ent.path" data-fp-item type="button" class="group relative rounded-xl border border-default bg-default ss-explorer-tile-hover
         focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-[var(--btn-primary-border)]
         p-1 text-left" :class="[
            foldersOnly && !ent.isDir ? 'pointer-events-none opacity-60 select-none' : '',
            (!modeIsUpload && !ent.isDir && selected.has(ent.path))
                ? 'selected-tile text-[var(--btn-primary-border)]'
                : '',
            (modeIsUpload && ent.isDir && localSelectedFolder === ent.path)
                ? 'selected-tile text-[var(--btn-primary-border)]'
                : ''
        ]" role="button" tabindex="0" :aria-disabled="foldersOnly && !ent.isDir ? 'true' : 'false'"
                :aria-selected="modeIsUpload && ent.isDir && localSelectedFolder === ent.path ? 'true' : 'false'"
                :aria-label="ent.name + (ent.isDir ? ' folder' : ' file')"
                @click="ent.isDir ? onFolderClick(ent) : onFileClick(ent, $event)"
                @dblclick.prevent="ent.isDir ? openFolder(ent) : onFileKey(ent)"
                @keydown.space.prevent="ent.isDir ? onFolderClick(ent) : onFileKey(ent)"
                @keydown.enter.prevent="ent.isDir ? openFolder(ent) : onFileKey(ent)">
                <!-- icon -->
                <div class="flex justify-center">
                    <FolderIcon v-if="ent.isDir" class="w-6 h-6 text-amber-300 opacity-90" />
                    <template v-else>
                        <ImageIcon v-if="kindFor(ent) === 'image'" class="w-12 h-12 text-emerald-300 opacity-90" />
                        <VideoIcon v-else-if="kindFor(ent) === 'video'" class="w-12 h-12 text-indigo-300 opacity-90" />
                        <AudioIcon v-else-if="kindFor(ent) === 'audio'" class="w-12 h-12 text-violet-300 opacity-90" />
                        <FileIcon v-else class="w-12 h-12 text-slate-200 opacity-90" />
                    </template>
                </div>

                <!-- name -->
                <div class="mt-2 text-xs text-center truncate" :title="ent.name">
                    {{ ent.name }}
                </div>

                <!-- meta -->
                <div class="mt-1 text-[10px] opacity-60 text-center">
                    <template v-if="ent.isDir">Folder</template>
                    <template v-else>{{ fmtBytes(ent.size) }}</template>
                </div>
                <div class="text-[10px] opacity-60 text-center">
                    {{ fmtDate(ent.mtime) }}
                </div>

                <!-- selection affordances -->
                <div class="absolute top-2 right-2">
                    <!-- share mode: file checkbox -->
                    <template v-if="!modeIsUpload && !ent.isDir">
                        <input type="checkbox" class="input-checkbox h-4 w-4 m-0" :checked="selected.has(ent.path)"
                            :aria-checked="selected.has(ent.path)" @click.stop @change="onFileToggle(ent.path)" />
                    </template>

                    <!-- share mode: folder checkbox -->
                    <template v-else-if="!modeIsUpload && ent.isDir">
                        <input type="checkbox" class="input-checkbox h-4 w-4 m-0"
                            :checked="isFolderFullySelected(ent.path)"
                            :indeterminate="isFolderPartiallySelected(ent.path)"
                            @click.stop="onFolderToggle(ent.path)"
                            :aria-checked="isFolderFullySelected(ent.path) ? 'true' : isFolderPartiallySelected(ent.path) ? 'mixed' : 'false'"
                            title="Select all files in this folder" />
                    </template>

                    <!-- upload mode: folder radio -->
                    <template v-else-if="modeIsUpload && ent.isDir">
                        <button type="button"
                            class="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current"
                            role="radio" :aria-checked="localSelectedFolder === ent.path"
                            @click.stop="setSelectedFolder(ent.path)"
                            :title="localSelectedFolder === ent.path ? 'Selected' : 'Choose this folder'">
                            <span v-if="localSelectedFolder === ent.path"
                                class="inline-block w-2 h-2 rounded-full bg-current" />
                        </button>
                    </template>
                </div>
            </button>
        </div>
    </div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useTimeFormat } from '../composables/useTimeFormat'
defineOptions({ name: 'IconBrowserGrid' })
import { FolderIcon, FileIcon, ImageIcon, VideoIcon, AudioIcon } from "../assets/icons/index"

type Entry = { name: string; isDir: boolean; path: string; size?: number; mtime?: number; mime?: string }

const props = defineProps<{
    relPath: string
    apiFetch: (url: string, init?: any) => Promise<any>
    selected: Set<string>
    useCase?: 'upload' | 'share'
    selectedFolder?: string | null
    getFilesFor?: (folder: string) => Promise<string[]>
}>()

const emit = defineEmits<{
    (e: 'toggle', payload: { path: string; isDir: boolean }): void
    (e: 'navigate', rel: string): void
    (e: 'select-folder', folderRel: string): void
    (e: 'update:selectedFolder', value: string | null): void
    (e: 'select-range', paths: string[]): void
}>()

const modeIsUpload = computed(() => (props.useCase ?? 'share') === 'upload')
const foldersOnly = computed(() => modeIsUpload.value)
const localSelectedFolder = ref<string | null>(props.selectedFolder ?? null)

const cwd = ref(props.relPath || '')

const loading = ref(false)
const entries = ref<Entry[]>([])

async function loadDir() {
    loading.value = true
    try {
        const data = await props.apiFetch(`/api/files?dir=${encodeURIComponent(cwd.value)}`)
        const dir = data.dir ?? cwd.value
        const ents = (data.entries || [])
            .map((e: any) => ({ ...e, path: (dir ? dir + '/' : '') + e.name }))
            .sort((a: any, b: any) => (Number(b.isDir) - Number(a.isDir)) || a.name.localeCompare(b.name))
        entries.value = ents as Entry[]
    } finally {
        loading.value = false
    }
    void preloadFolderFiles()
}

// --- Folder file pre-loading for selection state ---
const folderFilesMap = ref<Record<string, string[]>>({})

async function preloadFolderFiles() {
    if (!props.getFilesFor) return
    const folders = entries.value.filter(e => e.isDir)
    if (!folders.length) return
    const results: Record<string, string[]> = {}
    await Promise.all(folders.map(async (ent) => {
        try {
            results[ent.path] = await props.getFilesFor!(ent.path)
        } catch {
            results[ent.path] = []
        }
    }))
    folderFilesMap.value = { ...folderFilesMap.value, ...results }
}

function isFileInSelected(f: string) {
    const stripped = f.replace(/^\/+/, '')
    return props.selected.has(f) || props.selected.has('/' + stripped) || props.selected.has(stripped)
}

function isFolderFullySelected(folderPath: string) {
    const files = folderFilesMap.value[folderPath]
    if (!files || !files.length) return false
    return files.every(isFileInSelected)
}

function isFolderPartiallySelected(folderPath: string) {
    const files = folderFilesMap.value[folderPath]
    if (!files || !files.length) return false
    const some = files.some(isFileInSelected)
    const all = files.every(isFileInSelected)
    return some && !all
}

function onFolderToggle(path: string) {
    emit('toggle', { path, isDir: true })
}

function onFolderClick(ent: Entry) {
    if (modeIsUpload.value) {
        // Single click navigates into folder AND selects it as destination
        setSelectedFolder(ent.path)
        openFolder(ent)
    } else {
        openFolder(ent)
    }
}


watch(() => props.relPath, (r) => {
    cwd.value = r || ''
    loadDir()
})
watch(() => props.selectedFolder, v => { localSelectedFolder.value = v ?? null })

function setSelectedFolder(path: string) {
    localSelectedFolder.value = path                // instant visual check
    emit('update:selectedFolder', path)             // enables v-model:selectedFolder (optional)
}

onMounted(loadDir)

/* utils */
function fmtBytes(n?: number) {
    if (!n || n < 0) return '—'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let x = n
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++ }
    return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}
const { hour12: hour12Pref } = useTimeFormat()
function fmtDate(ms?: number) {
    if (!Number.isFinite(ms!)) return '—'
    const d = new Date(ms!)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: hour12Pref.value,
    }).format(d)
}

function selectFolderOnly(ent: Entry) {
    setSelectedFolder(ent.path)
}

function openFolder(ent: Entry) {
    // double-click opens (navigates)
    cwd.value = ent.path
    emit('navigate', ent.path)
    loadDir()
}

function onFileClick(ent: Entry, event?: MouseEvent) {
    if (foldersOnly.value) return
    onFileToggle(ent.path, event)
}




// keyboard fallback for files
function onFileKey(ent: Entry) {
    if (foldersOnly.value) return
    onFileToggle(ent.path)
}

// --- Shift-click range selection ---
const lastClickedFilePath = ref<string | null>(null)

function onFileToggle(path: string, event?: MouseEvent) {
    if (foldersOnly.value) return

    const fileEntries = entries.value.filter(e => !e.isDir)
    const currentIdx = fileEntries.findIndex(e => e.path === path)

    if (event?.shiftKey && lastClickedFilePath.value != null) {
        const lastIdx = fileEntries.findIndex(e => e.path === lastClickedFilePath.value)
        if (lastIdx >= 0 && currentIdx >= 0 && lastIdx !== currentIdx) {
            const start = Math.min(lastIdx, currentIdx)
            const end = Math.max(lastIdx, currentIdx)
            const rangePaths = fileEntries.slice(start, end + 1).map(e => e.path)
            emit('select-range', rangePaths)
            lastClickedFilePath.value = path
            return
        }
    }

    emit('toggle', { path, isDir: false })
    lastClickedFilePath.value = path
}

/** Decide which media icon to use */
function kindFor(ent: Entry): 'image' | 'video' | 'audio' | 'other' {
    const s = (ent.mime || ent.name || '').toLowerCase()
    if (/(^image\/)|\.(png|jpe?g|gif|webp|bmp|tiff|tif|svg|avif|heic|heif|psd|exr|dpx|dng|cr2|cr3|nef|arw|raw)$/.test(s)) return 'image'
    if (/(^video\/)|(application\/(x-)?mxf)|\.(mp4|mkv|mov|avi|webm|m4v|wmv|flv|mpg|mpeg|mxf|ts|m2ts|mts|3gp|3g2|ogv|vob|r3d|braw|ari)$/.test(s)) return 'video'
    if (/(^audio\/)|\.(mp3|wav|flac|aac|ogg|m4a|opus|aif|aiff|wma|ac3|dts)$/.test(s)) return 'audio'
    return 'other'
}
</script>

<!-- Icons -->
<style scoped>
:deep(.selected-tile) {
    outline: 2px solid var(--btn-primary-border);
    outline-offset: -2px;
}
</style>
