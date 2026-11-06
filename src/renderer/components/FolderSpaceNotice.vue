<template>
  <div v-if="normalizedPath" class="fsn flex flex-col gap-1.5 text-xs" aria-live="polite">
    <div v-if="loading && !info" class="fsn-row opacity-70">
      <span class="inline-block w-3 h-3 border-2 border-default border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
      <span>Checking this folder…</span>
    </div>

    <template v-else-if="info">
      <div class="fsn-row" :class="info.isZfs ? 'fsn-ok' : 'fsn-warn'">
        <span aria-hidden="true">{{ info.isZfs ? '✓' : '⚠' }}</span>
        <span v-if="info.isZfs">
          On storage pool <strong>{{ info.zfsPool || info.zfsDataset }}</strong>
          <template v-if="spaceKnown"> · <strong>{{ formatBytes(info.availBytes) }}</strong> free of {{ formatBytes(info.totalBytes) }}</template>
        </span>
        <span v-else>
          Not on a storage pool<template v-if="info.mountpoint"> (disk mounted at <code>{{ info.mountpoint }}</code>)</template>.
          <template v-if="spaceKnown"> <strong>{{ formatBytes(info.availBytes) }}</strong> free of {{ formatBytes(info.totalBytes) }}.</template>
          Media can fill a small disk fast; if this is the server's system disk, the server can stop working.
        </span>
      </div>

      <div v-if="lowSpace" class="fsn-row fsn-danger">
        <span aria-hidden="true">⚠</span>
        <span>Low space: only {{ formatBytes(info.availBytes) }} left ({{ Math.round(info.usedPercent) }}% used). Pick a folder with more room for proxies and client uploads.</span>
      </div>

      <div v-if="!info.exists" class="fsn-row opacity-80">
        <span aria-hidden="true">＋</span>
        <span>This folder doesn't exist yet. 45Flow will create it.</span>
      </div>
    </template>

    <div v-if="showDataNote" class="fsn-row opacity-80">
      <span aria-hidden="true">ⓘ</span>
      <span>45Flow keeps this project's proxy files and streams in a hidden <code>.45flow</code> folder inside the project folder.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

interface FolderSpaceInfo {
  path: string
  checkedPath: string
  exists: boolean
  totalBytes: number | null
  freeBytes: number | null
  availBytes: number | null
  usedPercent: number | null
  isZfs: boolean
  zfsDataset: string | null
  zfsPool: string | null
  mountpoint: string | null
}

const props = withDefaults(defineProps<{
  path: string
  apiFetch: (url: string, init?: any) => Promise<any>
  showDataNote?: boolean
  lowSpaceBytes?: number
}>(), {
  showDataNote: true,
  lowSpaceBytes: 50 * 1024 ** 3,
})

const info = ref<FolderSpaceInfo | null>(null)
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0

const normalizedPath = computed(() => (props.path || '').trim())
const spaceKnown = computed(() => typeof info.value?.availBytes === 'number' && typeof info.value?.totalBytes === 'number')
const lowSpace = computed(() => {
  const i = info.value
  if (!i || typeof i.availBytes !== 'number') return false
  return i.availBytes < props.lowSpaceBytes || (typeof i.usedPercent === 'number' && i.usedPercent >= 90)
})

function formatBytes(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`
}

async function load(path: string) {
  const seq = ++requestSeq
  loading.value = true
  try {
    const data = await props.apiFetch(`/api/fs/space?path=${encodeURIComponent(path)}`)
    if (seq !== requestSeq) return
    info.value = data?.ok === false ? null : (data as FolderSpaceInfo)
  } catch {
    // Older servers don't expose this endpoint; the notice is advisory only.
    if (seq === requestSeq) info.value = null
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(normalizedPath, (p) => {
  if (timer) clearTimeout(timer)
  if (!p) {
    info.value = null
    return
  }
  timer = setTimeout(() => void load(p), 350)
}, { immediate: true })

onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped>
.fsn-row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  line-height: 1.4;
}

.fsn-ok {
  color: rgb(22 163 74);
}

.fsn-warn {
  padding: 0.45rem 0.6rem;
  border-radius: 0.45rem;
  border: 1px solid color-mix(in srgb, #d97706 45%, transparent);
  background: color-mix(in srgb, #f59e0b 12%, transparent);
}

.fsn-danger {
  padding: 0.45rem 0.6rem;
  border-radius: 0.45rem;
  border: 1px solid color-mix(in srgb, #dc2626 45%, transparent);
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

:global(.dark) .fsn-ok {
  color: rgb(74 222 128);
}
</style>
