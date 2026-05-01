<template>
  <div class="flex flex-col gap-3 max-h-[500px] mt-2 rounded-md">
    <!-- Top controls + PathInput -->
    <div class="flex flex-col gap-2 text-sm">
      <div class="text-muted">Click on files to select or deselect them. Shift-click to select a range. <span v-if="viewMode === 'grid'">Click on folders to enter. Use folder checkboxes to select all contents.</span><span v-else>Use folder checkboxes to select all contents.</span></div>

      <div class="flex flex-row gap-2 items-center">
        <span class="whitespace-nowrap ">Enter root path to use.</span>
        <PathInput v-model="cwd" :apiFetch="apiFetch" :dirsOnly="true" @choose="onChoose" />
      </div>
    </div>

    <!-- Table wrapper -->
    <div class="bg-accent border border-default rounded overflow-auto max-h-[440px] min-h-[300px] p-1">
      <!-- Small toolbar: List / Grid toggle -->
      <div class="sticky top-0 bg-primary rounded-md border-b border-default px-2 py-1 flex items-center gap-2 z-20">
        <button class="btn btn-secondary" :disabled="!canGoUp" @click="goUpOne" title="Go up one directory">
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>

        <div class="text-xs opacity-75 truncate" :title="cwd">Showing: {{ cwd || '/' }}</div>

        <!-- Select All checkbox -->
        <label class="flex items-center gap-1.5 cursor-pointer text-xs select-none ml-2 whitespace-nowrap" title="Select or deselect all files in this directory">
            <input type="checkbox" class="input-checkbox h-3.5 w-3.5 m-0"
                :checked="selectAllChecked"
                :indeterminate="selectAllIndeterminate"
                @change="toggleSelectAll" />
            <span>Select All</span>
            <span v-if="allCwdFiles.length" class="text-muted">({{ allCwdFiles.length }})</span>
        </label>

        <div class="ml-auto flex items-center" data-tour="file-browser-view-toggle">
          <button type="button" class="btn btn-secondary text-xs mr-2 flex items-center gap-1 px-2"
            @click="refreshBrowser" title="Refresh file listing">
            <FontAwesomeIcon :icon="faRotateRight" />
          </button>

          <button type="button" class="px-2 py-1 text-xs flex items-center justify-center hover:bg-white/5 rounded-l-md"
            :class="viewMode === 'list' ? 'bg-white/10' : ''" :aria-pressed="viewMode === 'list'" aria-label="List view"
            title="List view" @click="viewMode = 'list'">
            <FontAwesomeIcon :icon="faList" />
            <span class="sr-only">List</span>
          </button>
          <button type="button"
            class="px-2 py-1 text-xs flex items-center justify-center border-l border-default hover:bg-white/5 rounded-r-md"
            :class="viewMode === 'grid' ? 'bg-white/10' : ''" :aria-pressed="viewMode === 'grid'"
            aria-label="Grid view" title="Grid view" @click="viewMode = 'grid'">
            <FontAwesomeIcon :icon="faGrip" />
            <span class="sr-only">Grid</span>
          </button>
        </div>
      </div>


      <!-- Body -->
      <div class="rounded-md">
        <!-- List view -->
        <template v-if="viewMode === 'list'">
          <TreeNode :key="'list-'+cwd+refreshKey" :apiFetch="apiFetch" :selected="selectedSet"
            :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0" :isRoot="true" useCase="share"
            @toggle="togglePath" @navigate="navigateTo" @select-range="onSelectRange" />
        </template>

        <!-- Grid view -->
        <template v-else>
          <IconMode :key="'grid-'+cwd+refreshKey" :apiFetch="apiFetch" :selected="selectedSet"
            :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0" :isRoot="true" useCase="share"
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
    modelValue?: string[] // existing selection passed in (if any)
  }>()
  
const emit = defineEmits<{
    (e: 'add', paths: string[]): void
    (e: 'remove', paths: string[]): void
}>()
  
  const apiFetch = props.apiFetch
  
  function normDir(p?: string) {
    if (!p) return ''
    return p.endsWith('/') ? p : (p + '/')
  }
  
  const cwd = ref<string>('') // drives what TreeNode/IconMode show
  onMounted(() => {
    if (props.startDir) cwd.value = normDir(props.startDir)
  })
  
  // keep cwd in sync if parent changes it
  watch(() => props.startDir, (v) => { cwd.value = normDir(v) })
  
  const rootRel = computed(() =>
    (cwd.value || '/').replace(/\/+$/, '') // keep leading slash; trim trailing
  )
  
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
  watch(viewMode, m => localStorage.setItem(VIEW_KEY, m))
  
  // ---------- Expand cache ----------
  const expandCache = new Map<string, string[]>()
  const refreshKey = ref(0)
  
  async function getFilesForFolder(folder: string): Promise<string[]> {
    if (expandCache.has(folder)) return expandCache.get(folder)!
    try {
      const resp = await apiFetch('/api/expand-paths', {
        method: 'POST',
        body: JSON.stringify({ paths: [folder] })
      })
      const files: string[] = resp.files || []
      expandCache.set(folder, files)
      return files
    } catch {
      expandCache.set(folder, [])
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
  if (!files.length) return
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
      cwd.value = pick.path.endsWith('/') ? pick.path : (pick.path + '/')
    } else {
      const parent = pick.path.replace(/\/[^/]+$/, '') || '/'
      cwd.value = parent.endsWith('/') ? parent : (parent + '/')
    }
  }
  
  function navigateTo(rel: string) {
    const absLike = '/' + rel.replace(/^\/+/, '')
    cwd.value = absLike.endsWith('/') ? absLike : (absLike + '/')
  }

  function ensureSlash(p: string) {
    if (!p) return '/'
    return p.endsWith('/') ? p : p + '/'
  }

  const baseDir = computed(() => ensureSlash(props.startDir || '/'))

  const canGoUp = computed(() => {
    if (!cwd.value || cwd.value === '/') return false
    return cwd.value !== baseDir.value
  })

  function parentPath(absLike: string): string {
    const p = (absLike || '/').replace(/\/+$/, '')
    if (!p || p === '/') return '/'
    const parent = p.replace(/\/[^/]*$/, '') || '/'
    return ensureSlash(parent)
  }

  function goUpOne() {
    const parent = parentPath(cwd.value || '/')
    const base = baseDir.value
    cwd.value = parent.startsWith(base) ? parent : base
  }

  // ---------- Select All ----------
  const allCwdFiles = ref<string[]>([])

  async function loadAllCwdFiles() {
    try {
      const dir = rootRel.value || '/'
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

  watch(cwd, () => { void loadAllCwdFiles() })
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
  
