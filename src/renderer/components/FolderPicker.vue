<template>
  <section class="fp-shell bg-accent flex flex-col text-left rounded-md min-h-0 w-full min-w-0" :class="[compact ? 'fp-compact gap-1 text-sm' : 'gap-2 text-base']">
    <div class="fp-meta flex flex-col gap-2 text-sm">
      <p v-if="configuredProjectRoot && !hideProjectControls" class="text-xs text-muted">Browse from storage root (<code>{{ configuredProjectRoot }}</code>)</p>

      <div v-if="subtitle && !compact" class="opacity-80">{{ subtitle }}</div>

      <div class="text-sm opacity-80 -mb-1 flex items-center justify-start gap-3 flex-wrap"
        v-if="!hideProjectControls && internalProject && internalProject.trim().length > 0">
        <span class="font-semibold">Project:</span>
        <code>{{ internalProject }}</code>
        <button type="button" class="btn btn-secondary" @click="changeProject()">Change Project Directory</button>
      </div>

      <div v-if="pickerReady" class="flex flex-row gap-2 items-center">
        <span class="whitespace-nowrap text-xs">{{ storageBrowse ? 'Storage location:' : 'Destination:' }}</span>
        <PathInput v-model="destAbs" class="min-w-0 flex-1" :apiFetch="pathInputApiFetch" :dirsOnly="true" commit-on-blur @choose="onChooseDest" />
      </div>
      <div v-else class="text-xs opacity-70">Loading destination...</div>
      <FlowNotice v-if="storageTruncated" tone="warning" size="sm">This listing is incomplete. Type a folder path in Storage location to open it.</FlowNotice>

      <div v-if="!hideProjectControls && (autoDetectRoots ?? true) && !showEntireTree" class="text-xs opacity-70">
        <template v-if="useConfiguredProjectRoot && configuredProjectRoot">
          Storage root: <code>{{ configuredProjectRoot }}</code>
        </template>
        <template v-else-if="detecting">Loading storage root…</template>
        <template v-else-if="browseMode === 'roots' && !projectRoots.length">Storage is not configured. Ask your administrator.</template>
      </div>

    </div>

    <div class="fp-browser border rounded overflow-hidden bg-accent flex flex-col min-w-0" :class="containerHeights">
      <div class="fp-toolbar bg-primary border-b border-default px-2 py-1 flex flex-wrap items-center gap-2 z-20 shrink-0 min-w-0">
        <button type="button" class="btn btn-secondary" :disabled="!canGoUp || browseMode === 'roots'" @click="goUpOne"
          title="Go up one directory">
          <FontAwesomeIcon :icon="faArrowLeft" />
        </button>

        <div class="text-xs opacity-75 truncate flex items-center gap-0.5 min-w-0" :title="browseCwd">
          <template v-if="browseMode === 'roots'">Pick a ZFS pool…</template>
          <template v-else>
            <button type="button" class="hover:underline hover:opacity-100 opacity-75 shrink-0"
              @click="navigateToBreadcrumb('/')">
              /
            </button>
            <template v-for="(seg, i) in breadcrumbSegments" :key="i">
              <span class="opacity-50 shrink-0">/</span>
              <button type="button" class="hover:underline hover:opacity-100 truncate"
                :class="i === breadcrumbSegments.length - 1 ? 'font-semibold opacity-100' : 'opacity-75'"
                @click="navigateToBreadcrumb(seg.path)">
                {{ seg.name }}
              </button>
            </template>
          </template>
        </div>

        <div class="ml-auto flex items-center" v-if="browseMode !== 'roots'">
          <button type="button" class="btn btn-secondary text-xs mr-2 flex items-center gap-1 px-2"
            @click="refreshBrowser" title="Refresh file listing">
            <FontAwesomeIcon :icon="faRotateRight" />
          </button>

          <button type="button" class="btn btn-secondary text-xs mr-2 flex items-center gap-1 px-2"
            @click="createNewFolder" title="Create a new folder in current directory">
            <FontAwesomeIcon :icon="faFolderPlus" />
            <span>New Folder</span>
          </button>

          <button type="button" class="px-2 py-1.5 text-xs flex items-center justify-center rounded-l-md transition-colors"
            :class="viewMode === 'tree' ? 'bg-[var(--btn-primary-bg)] text-white' : 'opacity-40 hover:opacity-70 hover:bg-white/5'" :aria-pressed="viewMode === 'tree'" aria-label="List view"
            title="List view" @click="viewMode = 'tree'">
            <FontAwesomeIcon :icon="faList" />
            <span class="sr-only">List</span>
          </button>

          <button type="button"
            class="px-2 py-1.5 text-xs flex items-center justify-center rounded-r-md transition-colors"
            :class="viewMode === 'icons' ? 'bg-[var(--btn-primary-bg)] text-white' : 'opacity-40 hover:opacity-70 hover:bg-white/5'" :aria-pressed="viewMode === 'icons'"
            aria-label="Grid view" title="Grid view" @click="viewMode = 'icons'">
            <FontAwesomeIcon :icon="faGrip" />
            <span class="sr-only">Grid</span>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="rounded-md overflow-auto min-h-0 flex-1 min-w-0">
      <template v-if="pickerReady && browseMode === 'roots' && !showEntireTree && (autoDetectRoots ?? true)">
        <div v-if="detectingRoots" class="flex flex-col items-center justify-center gap-3 py-10 text-sm opacity-80">
          <svg class="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span>Checking for ZFS pools…</span>
        </div>
        <template v-else-if="projectRoots.length">
          <div v-for="r in projectRoots" :key="r.mountpoint" class="fp-root-row grid items-center border-b border-default px-3 py-1 bg-default
                   [grid-template-columns:40px_minmax(0,1fr)_120px_180px]">
            <div></div>
            <div class="truncate">
              <code :title="`${r.name} → ${r.mountpoint}`">{{ r.mountpoint }}</code>
            </div>
            <div>ZFS Pool</div>
            <div class="px-2 py-1">
              <button type="button" class="btn btn-secondary" @click="chooseProject(r.mountpoint)">Select</button>
            </div>
          </div>
        </template>
        <div v-else class="flex flex-col items-center justify-center gap-3 py-10 text-sm opacity-80">
          <span>No ZFS pools detected.</span>
          <button type="button" class="btn btn-secondary text-xs" @click="retryDetect">Retry</button>
        </div>
      </template>
      <template v-if="pickerReady && browseMode !== 'roots' && viewMode === 'tree'">
        <div class="min-h-full" @click="onBrowserBackgroundClick">
          <TreeNode :key="'tree-' + browseCwd + refreshKey" :apiFetch="fileApiFetch" :selected="internalSelected"
            :selectedVersion="selectedVersion" :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0"
            :isRoot="true" :useCase="useCase || 'upload'" v-model:selectedFolder="selectedFolderBridge"
            :hide-metadata="storageBrowse"
            @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
        </div>
      </template>

      <template v-if="pickerReady && browseMode !== 'roots' && viewMode === 'icons'">
        <div :class="compact ? '' : 'min-h-full'" @click="onBrowserBackgroundClick">
          <IconMode :key="'icons-' + browseCwd + refreshKey" :apiFetch="fileApiFetch" :selected="internalSelected"
            :selectedVersion="selectedVersion" :getFilesFor="getFilesForFolder" :relPath="rootRel" :depth="0"
            :isRoot="true" :useCase="useCase || 'upload'" :compact="compact" v-model:selectedFolder="selectedFolderBridge"
            @select-folder="onSelectFolder" @toggle="togglePath" @navigate="navigateTo" />
        </div>
      </template>

      <div v-if="!pickerReady" class="p-3 text-xs opacity-70">
        Loading project roots...
      </div>
      </div>

      <FlowModal v-model="showNewFolderModal" title="Create New Folder" size="sm" hide-close :busy="creatingFolder">
          <p class="text-sm mb-4 text-muted">
            Current Path: <code>{{ newFolderBasePath }}</code>
          </p>

          <form id="fp-new-folder-form" @submit.stop.prevent="confirmNewFolder">
            <input ref="folderNameInput" type="text" v-model="newFolderName" placeholder="Enter folder name" required
              autofocus aria-label="Folder name" :disabled="creatingFolder"
              :pattern="storageBrowse ? '[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}' : undefined"
              :maxlength="storageBrowse ? 128 : undefined"
              class="w-full px-3 py-2 input-textlike text-default" />
            <p v-if="storageBrowse" class="text-xs text-muted mt-2">Start with a letter or digit. Use letters, digits, dot, dash or underscore.</p>
          </form>

          <FlowNotice v-if="newFolderError" tone="danger" size="sm" class="mt-4">
            Error: {{ newFolderError }}
          </FlowNotice>

          <template #footer>
              <button type="button" @click="showNewFolderModal = false" :disabled="creatingFolder" class="btn btn-dismiss">
                Cancel
              </button>
              <button type="submit" form="fp-new-folder-form" :disabled="creatingFolder || !newFolderName.trim()" class="btn btn-primary">
                {{ creatingFolder ? 'Creating…' : 'Create' }}
              </button>
          </template>
      </FlowModal>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faArrowLeft, faList, faGrip, faFolderPlus, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import PathInput from './PathInput.vue'
import TreeNode from './TreeNode.vue'
import IconMode from './IconMode.vue'
import { useProjectChoices } from '../composables/useProjectChoices'
import type { useApi } from '../composables/useApi'
import FlowModal from '../ui/FlowModal.vue'
import FlowNotice from '../ui/FlowNotice.vue'

type ViewMode = 'tree' | 'icons'

const props = defineProps<{
  modelValue: string
  apiFetch: ReturnType<typeof useApi>['apiFetch']
  storageBrowse?: boolean
  useCase?: 'upload' | 'share'
  title?: string
  subtitle?: string
  base?: string
  startDir?: string
  autoDetectRoots?: boolean
  showSelection?: boolean
  heightClass?: string
  allowEntireTree?: boolean
  isRootUser?: boolean
  uploadLink?: boolean
  project?: string
  dest?: string
  hideProjectControls?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'changed-cwd', v: string): void
  (e: 'update:project', v: string): void
  (e: 'update:dest', v: string): void
  (e: 'browse-ready', v: boolean): void
}>()

const internalProject = computed({
  get: () => props.project ?? '',
  set: (v: string) => emit('update:project', v),
})

const internalDest = computed({
  get: () => (props.dest ?? props.modelValue ?? ''),
  set: (v: string) => {
    emit('update:dest', v)
    emit('update:modelValue', v)
  },
})

/* Bridge modelValue <-> v-model:selectedFolder on child components */
const selectedFolderBridge = computed<string | null>({
  get: () => (internalDest.value ? internalDest.value : null),
  set: (v) => {
    internalDest.value = v ?? ''
  },
})

/* Keep legacy request-coordinate support while browsing within storage. */
const showEntireTree = ref(!!props.storageBrowse)
const {
  detecting,
  detectingRoots,
  projectRoots,
  loadProjectChoices,
  configuredProjectRoot,
  useConfiguredProjectRoot,
} = useProjectChoices(showEntireTree)

/* Local state */
const clampBase = ref<string>(internalProject.value || props.base || '')
const browseMode = ref<'roots' | 'dir'>('dir')
const viewMode = ref<ViewMode>('icons')
const browseCwd = ref<string>(props.startDir ?? props.base ?? '/')

/* Destination (what PathInput shows) */
const destAbs = ref<string>('')

/* Non-fromRoot file listings use filesystem-relative paths, including the storage root. */
const rootRel = computed(() => {
  const raw = (browseCwd.value || '/').replace(/\/+$/, '') || '/'
  return raw.replace(/^\/+/, '')
})

/* Wrap apiFetch to add fromRoot=1 when in "show entire tree" mode */
const fileApiFetch = computed(() => {
  if (props.storageBrowse) return storageFileApiFetch
  if (showEntireTree.value) {
    return (url: string, init?: any) => {
      const sep = url.includes('?') ? '&' : '?'
      return props.apiFetch(url + sep + 'fromRoot=1', init)
    }
  }
  return props.apiFetch
})

/* PathInput always uses absolute paths, so always needs fromRoot=1 */
const pathInputApiFetch = (url: string, init?: any) => {
  if (props.storageBrowse) return storageFileApiFetch(url)
  const sep = url.includes('?') ? '&' : '?'
  return props.apiFetch(url + sep + 'fromRoot=1', init)
}

/* Breadcrumb segments derived from browseCwd */
const breadcrumbSegments = computed(() => {
  const parts = (browseCwd.value || '/').replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean)
  return parts.map((name, i) => ({
    name,
    path: '/' + parts.slice(0, i + 1).join('/'),
  }))
})

const internalSelected = ref<Set<string>>(new Set())
const selectedVersion = ref(0)
const expandCache = new Map<string, string[]>()
const refreshKey = ref(0)
type StorageListing = { path: string; dirs: { name: string; path: string }[]; truncated?: boolean }
const storageListings = new Map<string, Promise<StorageListing>>()
const storageTruncated = ref(false)

async function storageFileApiFetch(url: string) {
  const dir = new URL(url, 'http://picker').searchParams.get('dir') || ''
  const absolute = '/' + dir.replace(/^\/+|\/+$/g, '')
  const base = (props.base || '').replace(/\/+$/, '')
  if (absolute !== base && !absolute.startsWith(base + '/')) return { dir, entries: [] }
  const isCurrent = () => absolute === browseCwd.value.replace(/\/+$/, '')
  if (isCurrent()) emit('browse-ready', false)
  let request = storageListings.get(absolute)
  if (!request) {
    request = props.apiFetch(`/api/admin/storage/dirs?path=${encodeURIComponent(absolute)}`)
    storageListings.set(absolute, request)
  }
  try {
    const data = await request
    if (isCurrent() && storageListings.get(absolute) === request) {
      storageTruncated.value = !!data.truncated
      emit('browse-ready', true)
    }
    return { dir: data.path.replace(/^\/+/, ''), entries: data.dirs.map(item => ({ name: item.name, isDir: true })) }
  } catch (error) {
    if (storageListings.get(absolute) === request) {
      storageListings.delete(absolute)
      if (isCurrent()) emit('browse-ready', false)
    }
    throw error
  }
}

function refreshBrowser() {
  expandCache.clear()
  storageListings.clear()
  refreshKey.value++
}
const pickerReady = ref(false)

/* Persist view mode */
onMounted(() => {
  const saved = localStorage.getItem('folderpicker:viewMode') as ViewMode | null
  if (saved === 'tree' || saved === 'icons') viewMode.value = saved
})
watch(viewMode, (m) => localStorage.setItem('folderpicker:viewMode', m))

/* Keep PathInput (destAbs) synced to internalDest */
watch(
  () => internalDest.value,
  (rel) => {
    if (!pickerReady.value && !(rel || '').trim()) return
    const abs = ensureSlash('/' + (rel || '').replace(/^\/+/, ''))
    destAbs.value = abs
  },
  { immediate: true },
)

/* Initial mount logic */
onMounted(async () => {
  pickerReady.value = false
  if (!props.storageBrowse) await loadProjectChoices()
  if (!clampBase.value && configuredProjectRoot.value) clampBase.value = configuredProjectRoot.value

  if (props.startDir) {
    browseMode.value = 'dir'
    browseCwd.value = ensureSlash(props.startDir)
    clampBase.value = (props.base || props.startDir).replace(/\/+$/, '')
  } else if (internalProject.value) {
    browseMode.value = 'dir'
    browseCwd.value = ensureSlash(internalProject.value)
  } else if (
    !showEntireTree.value &&
    useConfiguredProjectRoot.value &&
    configuredProjectRoot.value
  ) {
    const root = ensureSlash(configuredProjectRoot.value)
    internalProject.value = root.replace(/\/+$/, '')
    browseMode.value = 'dir'
    browseCwd.value = root
  } else if (props.autoDetectRoots ?? true) {
    browseMode.value = 'roots'
    browseCwd.value = '/'
  } else {
    browseMode.value = 'dir'
    browseCwd.value = '/'
  }

  emit('changed-cwd', browseCwd.value)

  if (!internalDest.value) {
    const rel = browseCwd.value.replace(/^\/+/, '').replace(/\/+$/, '')
    internalDest.value = rel
  } else {
    destAbs.value = ensureSlash('/' + internalDest.value.replace(/^\/+/, ''))
  }
  pickerReady.value = true
})

watch(
  () => props.base,
  (v) => {
    clampBase.value = v ?? ''
    if (v) {
      browseMode.value = 'dir'
      browseCwd.value = ensureSlash(v)
      emit('changed-cwd', browseCwd.value)
    }
  },
)

watch(projectRoots, (roots) => {
  if (!props.base && (props.autoDetectRoots ?? true)) {
    if ((!roots || roots.length === 0) && browseMode.value === 'roots') {
      browseMode.value = 'dir'
      browseCwd.value = '/'
      emit('changed-cwd', browseCwd.value)
    }
  }
})

watch(browseCwd, (v) => {
  if (browseMode.value === 'roots' && v !== '/') browseMode.value = 'dir'
})

watch(useConfiguredProjectRoot, async () => {
  // Don't override if startDir is explicitly provided (e.g. from active project)
  if (props.startDir) return
  // Don't fight initial mount logic
  if (!pickerReady.value) return
  pickerReady.value = false
  await loadProjectChoices()
  if (!showEntireTree.value && useConfiguredProjectRoot.value && configuredProjectRoot.value) {
    const root = ensureSlash(configuredProjectRoot.value)
    internalProject.value = root.replace(/\/+$/, '')
    browseMode.value = 'dir'
    browseCwd.value = root
    destAbs.value = root
    internalDest.value = root.replace(/^\/+/, '').replace(/\/+$/, '')
    emit('changed-cwd', browseCwd.value)
  } else if (!internalProject.value && (props.autoDetectRoots ?? true)) {
    browseMode.value = 'roots'
    browseCwd.value = '/'
    emit('changed-cwd', browseCwd.value)
  }
  pickerReady.value = true
})

/* Helpers */
function ensureSlash(p: string) {
  if (!p) return '/'
  return p.endsWith('/') ? p : p + '/'
}

function toAbsUnder(base: string, p: string) {
  const bName = (base || '').replace(/\/+$/, '').replace(/^\/+/, '')
  const clean = (p || '').replace(/^\/+/, '')
  if (!bName) return '/' + clean
  if (clean === bName || clean.startsWith(bName + '/')) return '/' + clean
  if (p.startsWith('/')) return '/' + bName
  return '/' + bName + '/' + clean
}

/* Data providers */
async function getFilesForFolder(folder: string): Promise<string[]> {
  if ((props.useCase || 'upload') === 'upload') return []
  if (expandCache.has(folder)) return expandCache.get(folder)!
  try {
    const resp = await props.apiFetch('/api/expand-paths', {
      method: 'POST',
      body: JSON.stringify({ paths: [folder] }),
    })
    const files: string[] = resp.files || []
    expandCache.set(folder, files)
    return files
  } catch {
    expandCache.set(folder, [])
    return []
  }
}

/* PathInput choose: navigate + select destination */
function onChooseDest(pick: { path: string; isDir: boolean }) {
  if (browseMode.value === 'roots') browseMode.value = 'dir'

  const next = pick.isDir ? ensureSlash(pick.path) : ensureSlash(pick.path.replace(/\/[^/]+$/, '') || '/')

  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, next)) : next

  browseCwd.value = clamped
  emit('changed-cwd', browseCwd.value)

  destAbs.value = clamped
  internalDest.value = clamped.replace(/^\/+/, '').replace(/\/+$/, '')
}

/* Navigation from children (double click): navigate + select */
function navigateTo(rel: string) {
  let absLike: string
  if (rel.startsWith('/')) {
    absLike = ensureSlash(rel)
  } else {
    absLike = ensureSlash('/' + rel.replace(/^\/+/, ''))
  }
  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, absLike)) : absLike

  browseCwd.value = clamped
  emit('changed-cwd', browseCwd.value)

  destAbs.value = clamped
  internalDest.value = clamped.replace(/^\/+/, '').replace(/\/+$/, '')
}

/* Breadcrumb click: navigate to an absolute path */
function navigateToBreadcrumb(absPath: string) {
  const target = ensureSlash(absPath || '/')
  const clamped = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, target)) : target

  browseCwd.value = clamped
  emit('changed-cwd', browseCwd.value)

  destAbs.value = clamped
  internalDest.value = clamped.replace(/^\/+/, '').replace(/\/+$/, '')
}

async function togglePath({ path, isDir }: { path: string; isDir: boolean }) {
  if (!isDir) return
  await getFilesForFolder(path)
}

function onBrowserBackgroundClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return
  if (browseMode.value === 'roots') return

  // If the click happened inside an item (folder row/tile), do nothing.
  if (target.closest('[data-fp-item]')) return

  // Ignore interactive elements
  if (target.closest('button, a, input, select, textarea, label')) return

  // Select current directory
  onSelectFolder(browseCwd.value)
}

/* New folder modal */
const showNewFolderModal = ref(false)
const newFolderName = ref('')
const newFolderError = ref<string | null>(null)
const creatingFolder = ref(false)
const folderNameInput = ref<HTMLInputElement | null>(null)
const newFolderBasePath = ref<string>('/')

watch(showNewFolderModal, (isOpen) => {
  if (isOpen) {
    nextTick(() => folderNameInput.value?.focus())
  }
})

function createNewFolder() {
  newFolderName.value = ''
  newFolderError.value = null

  // Use the user's current selection (destAbs). Fallback to browseCwd if somehow empty.
  const base = destAbs.value && destAbs.value.trim() ? destAbs.value : browseCwd.value
  newFolderBasePath.value = ensureSlash(base)

  showNewFolderModal.value = true
}

async function confirmNewFolder() {
  const name = newFolderName.value.trim()
  if (!name || creatingFolder.value) return

  const current = (newFolderBasePath.value || browseCwd.value || '/').replace(/\/+$/, '')
  const newPath = current + '/' + name

  creatingFolder.value = true
  newFolderError.value = null
  try {
    const response = props.storageBrowse
      ? await props.apiFetch('/api/admin/storage/dirs', {
        method: 'POST', retry: 0, timeoutMs: 120_000, exposeServerMessage: true,
        body: JSON.stringify({ path: current, name }),
      })
      : await props.apiFetch('/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path: newPath }),
      })

    if (response.error) {
      newFolderError.value = response.error
      return
    }

    expandCache.delete(ensureSlash(current))
    if (current === '') expandCache.delete('/')
    storageListings.clear()

    refreshKey.value++
    showNewFolderModal.value = false

    // Navigate into the newly created folder
    navigateTo(newPath)

    pushNotification(
      new Notification(
        'New Folder Created',
        `Folder '${name}' has been created successfully.`,
        'success',
        8000,
      ),
    )
  } catch (e: any) {
    console.error(e)
    newFolderError.value = `API failed: ${e.message || 'Unknown error'}`
  } finally {
    creatingFolder.value = false
  }
}

/* Up clamp */
const canGoUp = computed(() => {
  if (!browseCwd.value || browseCwd.value === '/') return false
  if (!clampBase.value) return browseCwd.value !== '/'
  const base = ensureSlash(clampBase.value)
  return browseCwd.value !== base
})

function parentPath(absLike: string): string {
  const p = (absLike || '/').replace(/\/+$/, '')
  if (!p || p === '/') return '/'
  const parent = p.replace(/\/[^/]*$/, '') || '/'
  return ensureSlash(parent)
}

function goUpOne() {
  const parent = parentPath(browseCwd.value || '/')
  if (clampBase.value) {
    const base = ensureSlash(clampBase.value)
    browseCwd.value = parent.startsWith(base) ? parent : base
  } else {
    browseCwd.value = parent
  }
  emit('changed-cwd', browseCwd.value)

  // keep destination following nav on Up
  destAbs.value = browseCwd.value
  internalDest.value = browseCwd.value.replace(/^\/+/, '').replace(/\/+$/, '')
}

/* Single click selection from children: destination only (no navigation) */
function onSelectFolder(relOrAbs: string) {
  const looksAbs = relOrAbs.startsWith('/')
  let abs: string
  if (looksAbs) {
    abs = ensureSlash(relOrAbs)
  } else {
    abs = ensureSlash('/' + relOrAbs.replace(/^\/+/, ''))
  }
  const clampedAbs = clampBase.value ? ensureSlash(toAbsUnder(clampBase.value, abs)) : abs

  destAbs.value = clampedAbs
  internalDest.value = clampedAbs.replace(/^\/+/, '').replace(/\/+$/, '')
}

async function chooseProject(dirPath: string) {
  const absNoTrail = ensureSlash(dirPath).replace(/\/+$/, '')
  internalProject.value = absNoTrail
  browseMode.value = 'dir'

  browseCwd.value = ensureSlash(absNoTrail)
  emit('changed-cwd', browseCwd.value)

  destAbs.value = browseCwd.value
  internalDest.value = absNoTrail.replace(/^\/+/, '')
}

async function changeProject() {
  pickerReady.value = false
  internalProject.value = ''
  internalDest.value = ''
  await loadProjectChoices()

  if (!showEntireTree.value && useConfiguredProjectRoot.value && configuredProjectRoot.value) {
    browseMode.value = 'dir'
    browseCwd.value = ensureSlash(configuredProjectRoot.value)
    destAbs.value = browseCwd.value
    internalDest.value = browseCwd.value.replace(/^\/+/, '').replace(/\/+$/, '')
  } else {
    browseMode.value = (props.autoDetectRoots ?? true) && !showEntireTree.value ? 'roots' : 'dir'
    browseCwd.value = '/'
    destAbs.value = '/'
  }
  emit('changed-cwd', browseCwd.value)
  pickerReady.value = true
}

async function retryDetect() {
  await loadProjectChoices()
  if (!projectRoots.value.length) {
    browseMode.value = 'dir'
    browseCwd.value = '/'
    emit('changed-cwd', browseCwd.value)
  }
}

const containerHeights = computed(() => props.heightClass || (props.compact ? 'h-[22rem] min-h-[12rem]' : 'h-[440px] min-h-[200px]'))
</script>

<style scoped>
.fp-shell {
    border-radius: 0.78rem;
}

.fp-shell:not(.fp-compact) {
    border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 20%, #4d4d5e);
    padding: 0.55rem;
}

.fp-meta {
    padding-inline: 0.2rem;
}

.fp-browser {
    border-color: color-mix(in srgb, var(--btn-primary-bg) 24%, #4d4e5e);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, white 3%, transparent);
    min-height: 0;
    overscroll-behavior: contain;
}

.fp-toolbar {
    backdrop-filter: blur(7px);
    background: color-mix(in srgb, black 24%, transparent);
}

.fp-root-row:hover {
    background: color-mix(in srgb, var(--btn-primary-bg) 12%, transparent);
}

@media (max-width: 980px) {
    .fp-root-row {
        grid-template-columns: minmax(0, 1fr) auto !important;
        gap: 0.55rem;
    }

    .fp-root-row > :nth-child(3),
    .fp-root-row > :nth-child(4) {
        display: none;
    }
}
</style>
