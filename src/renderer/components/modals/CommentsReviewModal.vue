<template>
  <div v-if="modelValue" class="fixed inset-0 z-[150]">
    <div class="absolute inset-0 bg-black/60" @click="close"></div>

    <div
      class="absolute inset-4 mx-auto max-w-[95vw] max-h-[92vh] bg-accent border border-default rounded-lg shadow-2xl z-[151] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-default shrink-0 bg-well">
        <div>
          <h3 class="text-xl font-bold">
            Comments Review
          </h3>
          <p class="text-xs text-muted mt-0.5">
            {{ link?.title || 'Untitled' }} • {{ filteredComments.length }} comment{{ filteredComments.length !== 1 ? 's' : '' }} across {{ filteredFileNames.length }} file{{ filteredFileNames.length !== 1 ? 's' : '' }}
          </p>
        </div>
        <button class="btn btn-danger" @click="close">Close</button>
      </div>

      <!-- Export Section -->
      <div v-if="!loading && comments.length > 0" class="px-5 py-4 border-b border-default bg-default/5 shrink-0">
        <div class="flex items-end gap-3 flex-wrap">
          <div class="flex-1 min-w-[180px]">
            <label class="block text-xs font-semibold text-muted mb-1.5">Export File(s)</label>
            <select v-model="exportFileFilter" class="w-full px-3 py-2 border border-default rounded-lg bg-default text-sm">
              <option value="all">All Files</option>
              <option v-for="fileName in allFileNames" :key="fileName" :value="fileName">
                {{ fileName }}
              </option>
            </select>
          </div>

          <div class="flex-1 min-w-[180px]">
            <label class="block text-xs font-semibold text-muted mb-1.5">Format</label>
            <select v-model="exportFormat" class="w-full px-3 py-2 border border-default rounded-lg bg-default text-sm">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="markdown">Markdown</option>
              <option value="webvtt">WebVTT (Subtitles)</option>
            </select>
          </div>

          <button
            @click="handleExport"
            :disabled="exporting"
            class="btn btn-primary px-5 py-2 h-fit"
          >
            <span v-if="exporting">Exporting...</span>
            <span v-else class="flex items-center gap-2">
              <ArrowDownTrayIcon class="w-4 h-4" />
              Export
            </span>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-default/60 border border-default shadow-sm">
          <span
            class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
          <div class="flex flex-col leading-tight">
            <div class="text-sm font-semibold text-default">Loading comments</div>
            <div class="text-xs text-muted">Fetching data...</div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex-1 flex items-center justify-center">
        <div class="p-4 rounded bg-red-900/30 text-default border border-red-800 max-w-md">
          <div class="font-semibold mb-1">Failed to load comments</div>
          <div class="text-sm opacity-80">{{ error }}</div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!comments.length" class="flex-1 flex items-center justify-center">
        <div class="text-center text-muted">
          <ChatBubbleLeftRightIcon class="w-16 h-16 mx-auto mb-3 opacity-50" />
          <div class="font-semibold">No comments yet</div>
          <div class="text-sm opacity-70">This link doesn't have any comments</div>
        </div>
      </div>

      <!-- Main Content: Split View -->
      <div v-else class="flex-1 flex min-h-0 overflow-hidden">
        <!-- Left Sidebar: Filters (30%) -->
        <div class="w-[30%] border-r border-default p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
          <div class="text-sm font-bold opacity-90">Filters</div>
          
          <!-- Status Filter -->
          <div class="space-y-2">
            <label class="text-xs font-semibold opacity-70">Status</label>
            <select v-model="statusFilter" class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default">
              <option value="all">All ({{ stats?.total || 0 }})</option>
              <option value="unresolved">Unresolved ({{ stats?.unresolved || 0 }})</option>
              <option value="resolved">Resolved ({{ stats?.resolved || 0 }})</option>
            </select>
          </div>

          <!-- File Filter -->
          <div class="space-y-2">
            <label class="text-xs font-semibold opacity-70">File</label>
            <select v-model="selectedFileFilter" class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default">
              <option value="">All Files ({{ fileGroups.length }})</option>
              <option v-for="fileName in allFileNames" :key="fileName" :value="fileName">
                {{ fileName }} ({{ getFileCommentCount(fileName) }})
              </option>
            </select>
          </div>

          <!-- Stats Panel -->
          <div v-if="stats" class="mt-auto pt-4 border-t border-default space-y-2">
            <div class="text-xs font-semibold opacity-70 mb-2">Statistics</div>
            <div class="text-sm space-y-1">
              <div class="flex justify-between">
                <span class="opacity-70">Total:</span>
                <span class="font-semibold">{{ stats.total }}</span>
              </div>
              <div class="flex justify-between">
                <span class="opacity-70">Resolved:</span>
                <span class="font-semibold text-green-500">{{ stats.resolved }}</span>
              </div>
              <div class="flex justify-between">
                <span class="opacity-70">Unresolved:</span>
                <span class="font-semibold text-yellow-500">{{ stats.unresolved }}</span>
              </div>
              <div v-if="stats.withAnnotations" class="flex justify-between">
                <span class="opacity-70">With Drawings:</span>
                <span class="font-semibold">{{ stats.withAnnotations }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Comments List (70%) -->
        <div class="flex-1 flex flex-col min-h-0">
          <!-- Comments Header -->
          <div class="px-4 py-3 border-b border-default shrink-0 flex items-center justify-between bg-default/5">
            <div class="text-sm font-semibold">
              {{ filteredComments.length }} comment{{ filteredComments.length === 1 ? '' : 's' }}
            </div>
          </div>

          <!-- Comments List -->
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <!-- Empty state -->
            <div v-if="!filteredComments.length" class="text-center py-12 text-muted">
              <ChatBubbleLeftRightIcon class="w-16 h-16 mx-auto mb-3 opacity-50" />
              <div class="font-semibold">No comments match the current filters</div>
              <div class="text-sm opacity-70 mt-1">
                <span v-if="stats && stats.total > 0">
                  {{ stats.total }} total comment{{ stats.total !== 1 ? 's' : '' }} • Try changing the status or file filter
                </span>
                <span v-else>
                  Try changing the status or file filter
                </span>
              </div>
            </div>

            <!-- Group comments by file -->
            <div 
              v-for="fileName in filteredFileNames" 
              :key="fileName" 
              v-show="getFilteredFileComments(fileName).length > 0"
              class="border border-default rounded-lg bg-default overflow-hidden shadow-sm"
            >
              <!-- File Header -->
              <div class="sticky top-0 z-10 bg-well/95 backdrop-blur-sm border-b border-default px-4 py-3">
                <div class="flex items-center gap-2">
                  <DocumentIcon class="w-5 h-5 shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-default truncate">{{ fileName }}</div>
                    <div class="text-xs text-muted">
                      {{ getFilteredFileComments(fileName).length }} comment{{ getFilteredFileComments(fileName).length !== 1 ? 's' : '' }}
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Comments for this file -->
              <div class="p-3 space-y-2">
                <div
                  v-for="comment in getFilteredFileComments(fileName)"
                  :key="comment.id"
                  class="relative rounded-lg border border-default bg-well/40 hover:bg-well/60 transition-colors p-4"
                  :style="{ marginLeft: `${(comment.depth || 0) * 2}rem` }"
                >
                  <!-- Depth indicator line -->
                  <div
                    v-if="(comment.depth || 0) > 0"
                    class="absolute left-0 top-0 bottom-0 w-1 bg-primary/30 rounded-l-lg"
                  ></div>

                  <div class="flex items-start justify-between gap-3 mb-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-default">
                          {{ comment.author_name || comment.user_name || 'Anonymous' }}
                        </span>
                        <span v-if="comment.start_seconds !== null && comment.start_seconds !== undefined" class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-mono font-semibold">
                          <ClockIcon class="w-3 h-3" />
                          {{ formatTimecodeRange(comment.start_seconds, comment.end_seconds) }}
                        </span>
                      </div>
                      <div class="text-xs text-muted mt-1">
                        {{ formatDate(comment.created_at) }}
                        <span v-if="comment.is_edited" class="ml-1 italic">(edited)</span>
                      </div>
                    </div>
                    
                    <!-- Resolved Toggle -->
                    <label class="flex items-center gap-1.5 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        :checked="comment.resolved"
                        @change="toggleResolved(comment)"
                        class="rounded border-default"
                      />
                      <span class="text-xs select-none">
                        {{ comment.resolved ? 'Resolved' : 'Unresolved' }}
                      </span>
                    </label>
                  </div>

                  <div class="text-default whitespace-pre-wrap leading-relaxed">{{ comment.body }}</div>

                  <!-- Tags if present -->
                  <div v-if="comment.tags" class="mt-2 flex flex-wrap gap-1">
                    <span
                      v-for="tag in parseTags(comment.tags)"
                      :key="tag"
                      class="inline-block px-2 py-0.5 bg-accent text-xs rounded-full border border-default"
                    >
                      #{{ tag }}
                    </span>
                  </div>

                  <!-- Comment Meta -->
                  <div class="flex items-center gap-3 text-xs opacity-60 mt-2">
                    <span v-if="comment.draw_data" class="flex items-center gap-1">
                      <PencilIcon class="w-3 h-3" />
                      Has annotation
                    </span>
                    <span v-if="comment.resolved_at" class="text-green-400 flex items-center gap-1">
                      <CheckIcon class="w-3 h-3" />
                      Resolved {{ formatDate(comment.resolved_at) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import type { LinkItem } from '../../typings/electron'
import type { CommentExport, CommentStats } from '../../types/comments'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { 
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  ClockIcon,
  CheckIcon,
  PencilIcon,
  ArrowDownTrayIcon
} from '@heroicons/vue/24/outline'

const props = defineProps<{
  modelValue: boolean
  link: LinkItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { apiFetch } = useApi()

const loading = ref(false)
const error = ref<string | null>(null)
const comments = ref<CommentExport[]>([])
const stats = ref<CommentStats | null>(null)
const selectedFileFilter = ref('')
const statusFilter = ref<'all' | 'resolved' | 'unresolved'>('all')

// Export state
const exportFileFilter = ref('all')
const exportFormat = ref('json')
const exporting = ref(false)

// Group comments by file
const fileGroups = computed(() => {
  const fileMap = new Map<string, CommentExport[]>()
  
  comments.value.forEach(c => {
    const fileName = c.file_name || 'Unknown'
    if (!fileMap.has(fileName)) {
      fileMap.set(fileName, [])
    }
    fileMap.get(fileName)!.push(c)
  })
  
  return Array.from(fileMap.entries()).map(([fileName, comments]) => ({
    fileName,
    comments,
  }))
})

const allFileNames = computed(() => fileGroups.value.map(g => g.fileName))

// Get all top-level comments
const topLevelComments = computed(() => {
  return comments.value.filter(c => !c.parent_id)
})

// Apply filters
const filteredComments = computed(() => {
  let result = topLevelComments.value
  
  // Filter by file
  if (selectedFileFilter.value) {
    result = result.filter(c => c.file_name === selectedFileFilter.value)
  }
  
  // Filter by status
  if (statusFilter.value === 'resolved') {
    result = result.filter(c => c.resolved)
  } else if (statusFilter.value === 'unresolved') {
    result = result.filter(c => !c.resolved)
  }
  
  return result.sort((a, b) => (a.start_seconds || 0) - (b.start_seconds || 0))
})

// Get unique file names from filtered comments
const filteredFileNames = computed(() => {
  const names = new Set(filteredComments.value.map(c => c.file_name || 'Unknown'))
  return Array.from(names).sort()
})

function getFileCommentCount(fileName: string): number {
  return topLevelComments.value.filter(c => c.file_name === fileName).length
}

function getFilteredFileComments(fileName: string): CommentExport[] {
  return filteredComments.value.filter(c => c.file_name === fileName)
}

function formatTimecode(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimecodeRange(start: number | null | undefined, end: number | null | undefined): string {
  const startStr = formatTimecode(start)
  if (!end || end === start) return startStr
  const endStr = formatTimecode(end)
  return `${startStr} - ${endStr}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const utcDate = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z'
    const date = new Date(utcDate)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

function parseTags(tags: string[] | null): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  // If it's a JSON string, parse it
  try {
    const parsed = JSON.parse(tags as any)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function loadComments() {
  if (!props.link?.id) return
  
  loading.value = true
  error.value = null
  
  try {
    const response = await apiFetch(`/api/links/${props.link.id}/comments`)
    
    if (!response.ok) {
      throw new Error(response.error || 'Failed to load comments')
    }
    
    comments.value = response.comments || []
    stats.value = response.stats || {
      total: 0,
      resolved: 0,
      unresolved: 0,
      withAnnotations: 0,
    }
  } catch (err: any) {
    error.value = err?.message || String(err)
    console.error('[CommentsReview] Load error:', err)
  } finally {
    loading.value = false
  }
}

async function toggleResolved(comment: CommentExport) {
  const newResolved = !comment.resolved
  const commentId = comment.id
  const linkId = props.link?.id
  
  if (!linkId) return
  
  try {
    const response = await apiFetch(`/api/links/${linkId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        resolved: newResolved,
      }),
    })
    
    if (!response.ok) {
      throw new Error(response.error || 'Failed to update comment')
    }
    
    // Reload all comments to ensure filters and stats are up to date
    await loadComments()
    
    pushNotification(
      new Notification(
        'Comment Updated',
        `Marked as ${newResolved ? 'resolved' : 'unresolved'}`,
        'success',
        2000
      )
    )
  } catch (err: any) {
    console.error('[CommentsReview] Toggle resolved error:', err)
    pushNotification(
      new Notification(
        'Update Failed',
        err?.message || 'Could not update comment status',
        'error',
        4000
      )
    )
  }
}

async function handleExport() {
  if (!props.link?.id) return

  exporting.value = true
  try {
    const params = new URLSearchParams()
    params.set('format', exportFormat.value)
    
    // If specific file selected, add to query
    if (exportFileFilter.value !== 'all') {
      params.set('file', exportFileFilter.value)
    }

    const response = await apiFetch(`/api/links/${props.link.id}/export/comments?${params.toString()}`, {
      parse: 'text'
    })

    // Determine file extension
    const ext = exportFormat.value === 'markdown' ? 'md' : exportFormat.value === 'webvtt' ? 'vtt' : exportFormat.value
    const fileName = exportFileFilter.value === 'all' 
      ? `comments-all.${ext}`
      : `comments-${exportFileFilter.value.replace(/[^a-z0-9_-]/gi, '_')}.${ext}`

    // Create download
    const blob = new Blob([response], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err: any) {
    pushNotification(new Notification(
      'Export Failed',
      err.message || 'Failed to export comments',
      'error',
      8000
    ))
  } finally {
    exporting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    loadComments()
  }
})

onMounted(() => {
  if (props.modelValue) {
    loadComments()
  }
})
</script>

<style scoped>
/* Ensure consistent modal styling */
</style>
