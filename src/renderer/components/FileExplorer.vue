<template>
  <div class="flex flex-col rounded-md min-w-0" :class="compact ? 'gap-1 mt-1' : 'gap-3 mt-2'">
    <!-- Top controls + PathInput -->
    <div class="flex flex-col gap-2 text-sm">
      <div v-if="!compact" class="text-muted">Click on files to select or deselect them. Shift-click to select a range. <span v-if="viewMode === 'grid'">Click on folders to enter. Use folder checkboxes to select all contents.</span><span v-else>Use folder checkboxes to select all contents.</span></div>

      <div class="flex flex-row gap-2 items-center min-w-0">
        <span class="whitespace-nowrap text-xs">Root:</span>
        <div class="min-w-0 flex-1">
          <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
        </div>
      </div>
    </div>

    <!-- Table wrapper -->
    <div class="bg-accent border border-default rounded overflow-hidden flex flex-col min-w-0" :class="compact ? 'h-[22rem] min-h-[12rem]' : 'h-[440px] min-h-[200px]'">
      <!-- Small toolbar: List / Grid toggle -->
      <div class="bg-primary border-b border-default px-2 py-1 flex flex-wrap items-center gap-2 z-20 shrink-0 min-w-0">
        <button class="btn btn-secondary" :disabled="!canGoUp" @click="goUpOne" title="Go up one directory">
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>

        <div class="text-xs opacity-75 truncate min-w-[5rem] flex-1" :title="activeDir">Showing: {{ activeDir || '/' }}</div>

        <!-- Select All checkbox -->
        <label class="flex items-center gap-1.5 cursor-pointer text-xs select-none ml-2 whitespace-nowrap" title="Select or deselect all files in this directory">
            <input type="checkbox" class="proxy-quality-checkbox h-3.5 w-3.5 m-0"
                :checked="selectAllChecked"
                :indeterminate="selectAllIndeterminate"
                @change="toggleSelectAll" />
            <span>Select All</span>
            <span v-if="allCwdFiles.length" class="text-white">({{ allCwdFiles.length }})</span>
        </label>

        <div class="ml-auto flex items-center shrink-0" data-tour="file-browser-view-toggle">
          <button type="button" class="btn btn-secondary text-xs mr-2 flex items-center gap-1 px-2"
            @click="refreshBrowser" title="Refresh file listing">
            <FontAwesomeIcon :icon="faRotateRight" />
          </button>

          <button type="button" class="px-2 py-1.5 text-xs flex items-center justify-center rounded-l-md transition-colors"
            :class="viewMode === 'list' ? 'bg-[var(--btn-primary-bg)] text-white' : 'opacity-40 hover:opacity-70 hover:bg-white/5'" :aria-pressed="viewMode === 'list'" aria-label="List view"
            title="List view" @click="viewMode = 'list'">
            <FontAwesomeIcon :icon="faList" />
            <span class="sr-only">List</span>
          </button>
          <button type="button"
            class="px-2 py-1.5 text-xs flex items-center justify-center rounded-r-md transition-colors"
            :class="viewMode === 'grid' ? 'bg-[var(--btn-primary-bg)] text-white' : 'opacity-40 hover:opacity-70 hover:bg-white/5'" :aria-pressed="viewMode === 'grid'"
            aria-label="Grid view" title="Grid view" @click="viewMode = 'grid'">
            <FontAwesomeIcon :icon="faGrip" />
            <span class="sr-only">Grid</span>
          </button>
        </div>
      </div>


      <!-- Body -->
      <div class="rounded-md overflow-auto min-h-0 flex-1 min-w-0" style="container-type: inline-size; container-name: file-browser;">
        <!-- List view -->
        <template v-if="viewMode === 'list'">
          <TreeNode :key="'list-'+cwd+refreshKey" :apiFetch="apiFetch" :selected="selectedSet"
            :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0" :isRoot="true" useCase="share"
            :activeFolder="activeDir"
            @toggle="togglePath" @navigate="navigateTo" @select-range="onSelectRange" />
        </template>

        <!-- Grid view -->
        <template v-else>
          <IconMode :key="'grid-'+cwd+refreshKey" :apiFetch="apiFetch" :selected="selectedSet"
            :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0" :isRoot="true" useCase="share"
            :compact="compact"
            @toggle="togglePath" @navigate="navigateTo" @select-range="onSelectRange" />
        </template>
      </div>
    </div>
  </div>
</template>
  
  <script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
  import PathInput from './PathInput.vue'
  import TreeNode from './TreeNode.vue'
  import IconMode from './IconMode.vue'
  import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
  import { faArrowLeft, faList, faGrip, faRotateRight } from '@fortawesome/free-solid-svg-icons'
  
  const props = defineProps<{
    apiFetch: (url: string, init?: any) => Promise<any>,
    startDir?: string,
    modelValue?: string[], // existing selection passed in (if any)
    compact?: boolean
  }>()
  
const emit = defineEmits<{
    (e: 'add', paths: string[]): void
    (e: 'remove', paths: string[]): void
    (e: 'error', message: string): void
}>()
  
  const apiFetch = props.apiFetch
  
  function normDir(p?: string) {
    if (!p) return ''
    return p.endsWith('/') ? p : (p + '/')
  }
  
  const cwd = ref<string>('') // drives what TreeNode/IconMode show
  const activeDir = ref<string>('') // drives "Showing" + Select All target in list mode
  onMounted(() => {
    const initial = normDir(props.startDir || '/')
    cwd.value = initial
    activeDir.value = initial
  })
  
  // keep cwd in sync if parent changes it
  watch(() => props.startDir, (v) => {
    const next = normDir(v || '/')
    cwd.value = next
    activeDir.value = next
  })
  
  const rootRel = computed(() => {
    const raw = (cwd.value || '/').replace(/\/+$/, '') || ''
    // Send path with pool prefix (e.g. 'tank/test123') — server's resolveSharePath strips it
    return raw.replace(/^\/+/, '') || '.'
  })
  
function normalizePath(p?: string) {
  const s = String(p || '').trim().replace(/\/+/g, '/')
  if (!s) return '/'
  return s.startsWith('/') ? s : ('/' + s)
}

function stripLeadingSlash(p: string) {
  return p.replace(/^\/+/, '')
}

function pathVariants(p?: string) {
  const raw = String(p || '').trim()
  const abs = normalizePath(raw)
  return [raw, abs, stripLeadingSlash(abs)]
}

const selectedSet = computed(() => {
  const s = new Set<string>()
  for (const p of (props.modelValue || [])) {
    for (const v of pathVariants(p)) if (v) s.add(v)
  }
  return s
})

function isSelected(path: string) {
  for (const v of pathVariants(path)) if (selectedSet.value.has(v)) return true
  return false
}
  
  // ---------- View mode toggle (persisted) ----------
  type ViewMode = 'list' | 'grid'
  const VIEW_KEY = 'sharepicker:viewMode'
  const viewMode = ref<ViewMode>('grid')
  
  onMounted(() => {
    const saved = localStorage.getItem(VIEW_KEY) as ViewMode | null
    if (saved === 'list' || saved === 'grid') viewMode.value = saved
  })
  watch(viewMode, m => {
    localStorage.setItem(VIEW_KEY, m)
    // Entering grid view should browse the currently active folder.
    if (m === 'grid') {
      const next = ensureSlash(normalizePath(activeDir.value || cwd.value || '/'))
      cwd.value = next
      activeDir.value = next
    }
  })
  
  // ---------- Expand cache ----------
  const expandCache = new Map<string, string[]>()
  const refreshKey = ref(0)
  
  async function getFilesForFolder(folder: string): Promise<string[]> {
    if (expandCache.has(folder)) return expandCache.get(folder)!
    try {
      const resp = await apiFetch('/api/expand-paths', {
        method: 'POST',
        body: JSON.stringify({ paths: [folder] }),
        // Recursively expanding a large folder (deep trees, backup shares) can
        // take a while — the default ~12s API timeout made big folders look
        // "empty" when they'd simply timed out mid-scan.
        timeoutMs: 5 * 60 * 1000,
      })
      const files: string[] = resp.files || []
      expandCache.set(folder, files)
      return files
    } catch (e: any) {
      // Don't cache failures — a transient network/auth blip shouldn't
      // permanently lock this folder out of selection for the session.
      const message = e?.message || String(e)
      console.error(`[FileExplorer] expand-paths failed for "${folder}":`, message)
      emit('error', `Couldn't read "${folder.split('/').pop() || folder}": ${message}`)
      return []
    }
  }
  
type TogglePayload = { path: string; isDir: boolean }
async function togglePath({ path, isDir }: TogglePayload) {
  if (!isDir) {
    const normalized = normalizePath(path)
    if (isSelected(path)) emit('remove', [normalized])
    else emit('add', [normalized])
    return
  }
  const files = await getFilesForFolder(path)
  if (!files.length) {
    emit('error', `"${path.split('/').pop() || path}" has no files to select (it may be empty, or couldn't be read).`)
    return
  }
  const normalizedFiles = Array.from(new Set(files.map(normalizePath)))
  const allSelected = normalizedFiles.every(f => isSelected(f))
  if (allSelected) emit('remove', normalizedFiles)
  else {
    const toAdd = normalizedFiles.filter(f => !isSelected(f))
    if (toAdd.length) emit('add', toAdd)
  }
}
  
  // ---------- Navigation ----------
  function onChoose(pick: { path: string; isDir: boolean }) {
    // PathInput "choose" means explicit navigation
    if (pick.isDir) {
      const next = pick.path.endsWith('/') ? pick.path : (pick.path + '/')
      cwd.value = next
      activeDir.value = next
    } else {
      const parent = pick.path.replace(/\/[^/]+$/, '') || '/'
      const next = parent.endsWith('/') ? parent : (parent + '/')
      cwd.value = next
      activeDir.value = next
    }
  }
  
  function navigateTo(rel: string) {
    const clean = rel.replace(/^\/+/, '')
    const next = ensureSlash('/' + clean)
    // Grid behaves like an icon browser (enter folder). List keeps tree root, but updates "Showing".
    if (viewMode.value === 'grid') cwd.value = next
    activeDir.value = next
  }

  function ensureSlash(p: string) {
    if (!p) return '/'
    return p.endsWith('/') ? p : p + '/'
  }

  const baseDir = computed(() => ensureSlash(props.startDir || '/'))

  const canGoUp = computed(() => {
    const current = viewMode.value === 'list' ? activeDir.value : cwd.value
    if (!current || current === '/') return false
    return true
  })

  function parentPath(absLike: string): string {
    const p = (absLike || '/').replace(/\/+$/, '')
    if (!p || p === '/') return '/'
    const parent = p.replace(/\/[^/]*$/, '') || '/'
    return ensureSlash(parent)
  }

  function goUpOne() {
    // Both view modes must move the actual root (cwd) — otherwise the visible
    // tree/grid never changes and "Showing:" desyncs from what's on screen.
    const next = parentPath((viewMode.value === 'list' ? activeDir.value : cwd.value) || cwd.value || '/')
    cwd.value = next
    activeDir.value = next
  }

  // ---------- Select All ----------
  const allCwdFiles = ref<string[]>([])

  const activeRel = computed(() => {
    const raw = (activeDir.value || '/').replace(/\/+$/, '') || ''
    return raw.replace(/^\/+/, '') || '.'
  })

  async function loadAllCwdFiles() {
    try {
      const dir = activeRel.value || '.'
      const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dir)}`)
      const dirPrefix = data.dir ?? dir
      const files = (data.entries || [])
        .filter((e: any) => !e.isDir)
        .map((e: any) => (dirPrefix ? dirPrefix + '/' : '') + e.name)
      allCwdFiles.value = files
    } catch {
      allCwdFiles.value = []
    }
  }

  watch(activeDir, () => { void loadAllCwdFiles() })
  onMounted(() => { void loadAllCwdFiles() })

  function refreshBrowser() {
    expandCache.clear()
    refreshKey.value++
    void loadAllCwdFiles()
  }

  const selectAllChecked = computed(() => {
    if (!allCwdFiles.value.length) return false
    return allCwdFiles.value.every(f => isSelected(f))
  })

  const selectAllIndeterminate = computed(() => {
    if (!allCwdFiles.value.length) return false
    const someSelected = allCwdFiles.value.some(f => isSelected(f))
    const allSelected = allCwdFiles.value.every(f => isSelected(f))
    return someSelected && !allSelected
  })

  function toggleSelectAll() {
    if (selectAllChecked.value) {
      const normalized = allCwdFiles.value.map(normalizePath)
      emit('remove', normalized)
    } else {
      const toAdd = allCwdFiles.value.filter(f => !isSelected(f)).map(normalizePath)
      if (toAdd.length) emit('add', toAdd)
    }
  }

  // ---------- Select Range ----------
  function onSelectRange(paths: string[]) {
    const toAdd = paths.map(normalizePath).filter(p => !isSelected(p))
    if (toAdd.length) emit('add', toAdd)
  }
  
  </script>
  
