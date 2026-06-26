<template>
  <div v-if="modelValue" class="fixed inset-0 z-[150]">
    <div class="absolute inset-0 bg-black/60" @click="close"></div>

    <div
      class="absolute inset-4 mx-auto max-w-[95vw] max-h-[92vh] bg-accent border border-default rounded-lg shadow-2xl z-[151] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-default shrink-0 bg-well">
        <div class="flex-1 min-w-0">
          <h3 class="text-xl font-bold">
            Comments Review
          </h3>
          <p class="text-xs text-muted mt-0.5">
            {{ link?.title || 'Untitled' }} • {{ filteredComments.length }} comment{{ filteredComments.length !== 1 ? 's' : '' }} across {{ filteredFileNames.length }} file{{ filteredFileNames.length !== 1 ? 's' : '' }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            @click="loadComments"
            :disabled="loading"
            class="btn btn-secondary px-4 py-2 h-fit flex items-center gap-2"
            title="Refresh comments"
          >
            <svg 
              class="w-4 h-4" 
              :class="{ 'animate-spin': loading }"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button 
            v-if="link?.url" 
            @click="openInBrowser"
            class="btn btn-secondary px-4 py-2 h-fit flex items-center gap-2"
            title="Open link in browser"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open in Browser
          </button>
          <button class="btn btn-danger" @click="close">Close</button>
        </div>
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
              <option value="pdf">PDF Report</option>
              <option value="edl">EDL (Edit Decision List)</option>
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
          <div class="text-sm font-bold opacity-90">Filters & Search</div>
          
          <!-- Text Search -->
          <div class="space-y-2">
            <label class="text-xs font-semibold opacity-70">Search Text</label>
            <input
              v-model="searchText"
              type="text"
              placeholder="Search comments..."
              class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default"
            />
          </div>

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

          <!-- Author Filter -->
          <div class="space-y-2">
            <label class="text-xs font-semibold opacity-70">Author</label>
            <select v-model="authorFilter" class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default">
              <option value="">All Authors ({{ allAuthors.length }})</option>
              <option v-for="author in allAuthors" :key="author" :value="author">
                {{ author }}
              </option>
            </select>
          </div>

          <!-- Version Filter -->
          <div v-if="allVersions.length > 0" class="space-y-2">
            <label class="text-xs font-semibold opacity-70">Version</label>
            <select v-model="versionFilter" class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default">
              <option value="">All Versions</option>
              <option v-for="v in allVersions" :key="v.id ?? 'none'" :value="String(v.id ?? '')">
                {{ v.label }} ({{ v.count }})
              </option>
            </select>
          </div>

          <!-- Sort Options -->
          <div class="space-y-2">
            <label class="text-xs font-semibold opacity-70">Sort By</label>
            <select v-model="sortBy" class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default">
              <option value="timecode">Timecode</option>
              <option value="date">Date Created</option>
              <option value="author">Author Name</option>
              <option value="status">Status</option>
              <option value="version">Version</option>
            </select>
          </div>

          <!-- Sort Order -->
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                v-model="sortReverse"
                class="rounded border-default"
              />
              <span class="text-xs font-semibold select-none">Reverse Sort Order</span>
            </label>
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
          <!-- Comments Header with Bulk Actions -->
          <div class="px-4 py-3 border-b border-default shrink-0 bg-default/5">
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="text-sm font-semibold">
                  {{ filteredComments.length }} comment{{ filteredComments.length === 1 ? '' : 's' }}
                  <span v-if="selectedCommentIds.size > 0" class="text-primary">
                    ({{ selectedCommentIds.size }} selected)
                  </span>
                </div>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="allVisibleSelected"
                    @change="toggleSelectAll"
                    class="rounded border-default"
                  />
                  <span class="text-xs font-semibold select-none">Select All</span>
                </label>
              </div>

              <!-- Help Text / Bulk Actions -->
              <div class="flex items-center gap-3">
                <div v-if="selectedCommentIds.size === 0" class="text-xs text-muted italic">
                  Click comments to select • Use bulk actions to resolve multiple at once
                </div>
                <div v-else class="flex items-center gap-2">
                  <button
                    @click="bulkResolve(true)"
                    class="btn btn-success px-3 py-1 text-xs h-fit"
                  >
                    Resolve ({{ selectedCommentIds.size }})
                  </button>
                  <button
                    @click="bulkResolve(false)"
                    class="btn btn-secondary px-3 py-1 text-xs h-fit"
                  >
                    Unresolve ({{ selectedCommentIds.size }})
                  </button>
                </div>
              </div>
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
                  class="relative rounded-lg border border-default bg-well/40 hover:bg-well/60 transition-colors cursor-pointer comment-card"
                  :class="{ 'comment-selected': selectedCommentIds.has(comment.id) }"
                  :style="{ marginLeft: `${(comment.depth || 0) * 2}rem` }"
                  @click="handleCommentClick($event, comment.id)"
                >
                  <!-- Depth indicator line -->
                  <div
                    v-if="(comment.depth || 0) > 0"
                    class="absolute left-0 top-0 bottom-0 w-1 bg-primary/30 rounded-l-lg"
                  ></div>

                  <!-- Bulk Selection Checkbox - Top Left -->
                  <div class="absolute top-3 left-3">
                    <input
                      type="checkbox"
                      :checked="selectedCommentIds.has(comment.id)"
                      @click.stop="toggleSelectComment(comment.id)"
                      class="rounded border-default cursor-pointer"
                      title="Select for bulk actions"
                    />
                  </div>

                  <!-- Comment Content - Padded for checkbox -->
                  <div class="pl-10 pr-4 py-4">
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
                          <span v-if="comment.version_index != null" class="inline-flex items-center px-2 py-0.5 bg-blue-500/15 text-blue-500 rounded text-xs font-bold" :title="`Version ${comment.version_index}`">V{{ comment.version_index }}</span>
                        </div>
                        <div class="text-xs text-muted mt-1">
                          {{ formatDate(comment.created_at) }}
                          <span v-if="comment.is_edited" class="ml-1 italic">(edited)</span>
                        </div>
                      </div>
                      
                      <!-- Individual Resolved Toggle - Top Right -->
                      <label class="flex items-center gap-1.5 cursor-pointer shrink-0" @click.stop>
                        <input
                          type="checkbox"
                          :checked="comment.resolved"
                          @change="toggleResolved(comment)"
                          class="rounded border-default"
                          title="Toggle resolved status"
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
                    <div class="flex items-center gap-3 text-xs mt-2">
                      <button
                        v-if="comment.draw_data"
                        @click.stop="viewAnnotation(comment)"
                        class="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-semibold"
                        title="View annotation on video frame"
                      >
                        <PencilIcon class="w-3 h-3" />
                        View Annotation
                      </button>
                      <span v-if="comment.resolved_at" class="text-green-400 flex items-center gap-1 opacity-60">
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

    <!-- Annotation Viewer Modal -->
    <AnnotationViewerModal
      v-model="showAnnotationViewer"
      :comment="selectedAnnotationComment"
      :link="link"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useTimeFormat } from '../../composables/useTimeFormat'
import type { LinkItem } from '../../typings/electron'
import type { CommentExport, CommentStats } from '../../types/comments'
import type { Comment } from '../../composables/useComments'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { 
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  ClockIcon,
  CheckIcon,
  PencilIcon,
  ArrowDownTrayIcon
} from '@heroicons/vue/24/outline'
import AnnotationViewerModal from './AnnotationViewerModal.vue'

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
const showAnnotationViewer = ref(false)
const selectedAnnotationComment = ref<Comment | null>(null)
const comments = ref<CommentExport[]>([])
const stats = ref<CommentStats | null>(null)
const selectedFileFilter = ref('')
const searchText = ref('')
const authorFilter = ref('')
const sortBy = ref<'timecode' | 'date' | 'author' | 'status' | 'version'>('timecode')
const sortReverse = ref(false)

// Bulk selection
const selectedCommentIds = ref<Set<number>>(new Set())
const statusFilter = ref<'all' | 'resolved' | 'unresolved'>('all')
const versionFilter = ref('')

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

// Get unique authors
const allAuthors = computed(() => {
  const authors = new Set<string>()
  comments.value.forEach(c => {
    const author = c.author_name || c.user_name || 'Anonymous'
    authors.add(author)
  })
  return Array.from(authors).sort()
})

// Get unique versions from comments
const allVersions = computed(() => {
  const vMap = new Map<string, { id: number | null, index: number | null, count: number }>()
  comments.value.filter(c => !c.parent_id).forEach(c => {
    const key = c.asset_version_id != null ? String(c.asset_version_id) : ''
    if (!vMap.has(key)) {
      vMap.set(key, { id: c.asset_version_id, index: c.version_index, count: 0 })
    }
    vMap.get(key)!.count++
  })
  return Array.from(vMap.entries())
    .map(([key, v]) => ({ id: v.id, label: v.index != null ? `V${v.index}` : 'Unversioned', count: v.count }))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
})

// Get all top-level comments
const topLevelComments = computed(() => {
  return comments.value.filter(c => !c.parent_id)
})

// Apply filters and sorting
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

  // Filter by author
  if (authorFilter.value) {
    result = result.filter(c => {
      const author = c.author_name || c.user_name || 'Anonymous'
      return author === authorFilter.value
    })
  }

  // Filter by version
  if (versionFilter.value !== '') {
    const vId = versionFilter.value ? Number(versionFilter.value) : null
    result = result.filter(c => {
      if (vId === null) return c.asset_version_id == null
      return c.asset_version_id === vId
    })
  }

  // Filter by search text
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase()
    result = result.filter(c => {
      return c.body?.toLowerCase().includes(search) ||
             c.author_name?.toLowerCase().includes(search) ||
             c.user_name?.toLowerCase().includes(search)
    })
  }
  
  // Sort
  const sortFn = (a: CommentExport, b: CommentExport): number => {
    switch (sortBy.value) {
      case 'timecode':
        return (a.start_seconds || 0) - (b.start_seconds || 0)
      case 'date':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'author': {
        const authorA = a.author_name || a.user_name || 'Anonymous'
        const authorB = b.author_name || b.user_name || 'Anonymous'
        return authorA.localeCompare(authorB)
      }
      case 'status':
        return (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0)
      case 'version':
        return (a.version_index ?? 0) - (b.version_index ?? 0)
      default:
        return 0
    }
  }

  result = result.sort(sortFn)
  
  if (sortReverse.value) {
    result = result.reverse()
  }
  
  return result
})

// Get unique file names from filtered comments
const filteredFileNames = computed(() => {
  const names = new Set(filteredComments.value.map(c => c.file_name || 'Unknown'))
  return Array.from(names).sort()
})

// Check if all visible comments are selected
const allVisibleSelected = computed(() => {
  if (filteredComments.value.length === 0) return false
  return filteredComments.value.every(c => selectedCommentIds.value.has(c.id))
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

const { hour12 } = useTimeFormat()

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
      minute: '2-digit',
      hour12: hour12.value
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
    
    // Clear selections when reloading
    selectedCommentIds.value.clear()
  } catch (err: any) {
    error.value = err?.message || String(err)
    console.error('[CommentsReview] Load error:', err)
  } finally {
    loading.value = false
  }
}

function toggleSelectComment(commentId: number) {
  if (selectedCommentIds.value.has(commentId)) {
    selectedCommentIds.value.delete(commentId)
  } else {
    selectedCommentIds.value.add(commentId)
  }
  // Force reactivity
  selectedCommentIds.value = new Set(selectedCommentIds.value)
}

function handleCommentClick(event: MouseEvent, commentId: number) {
  // Allow text selection without toggling
  const selection = window.getSelection()
  if (selection && selection.toString().length > 0) {
    return
  }
  
  // Toggle selection on comment click
  toggleSelectComment(commentId)
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    // Deselect all visible
    filteredComments.value.forEach(c => selectedCommentIds.value.delete(c.id))
  } else {
    // Select all visible
    filteredComments.value.forEach(c => selectedCommentIds.value.add(c.id))
  }
  // Force reactivity
  selectedCommentIds.value = new Set(selectedCommentIds.value)
}

async function bulkResolve(resolved: boolean) {
  if (selectedCommentIds.value.size === 0 || !props.link?.id) return

  const linkId = props.link.id
  const count = selectedCommentIds.value.size
  const ids = Array.from(selectedCommentIds.value)

  try {
    // Update all selected comments
    await Promise.all(
      ids.map(commentId =>
        apiFetch(`/api/links/${linkId}/comments/${commentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ resolved }),
        })
      )
    )

    // Reload to refresh stats and filters
    await loadComments()

    pushNotification(
      new Notification(
        'Bulk Update Complete',
        `Marked ${count} comment${count !== 1 ? 's' : ''} as ${resolved ? 'resolved' : 'unresolved'}`,
        'success',
        3000
      )
    )
  } catch (err: any) {
    console.error('[CommentsReview] Bulk resolve error:', err)
    pushNotification(
      new Notification(
        'Bulk Update Failed',
        err?.message || 'Could not update selected comments',
        'error',
        4000
      )
    )
  }
}

function openInBrowser() {
  if (!props.link?.url) return
  window.open(props.link.url, '_blank', 'noopener,noreferrer')
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

    const isPdf = exportFormat.value === 'pdf'
    const response = await apiFetch(`/api/links/${props.link.id}/export/comments?${params.toString()}`, {
      parse: isPdf ? 'blob' : 'text'
    })

    // Determine file extension
    const extMap: Record<string, string> = { markdown: 'md', webvtt: 'vtt', json: 'json', csv: 'csv', pdf: 'pdf', edl: 'edl' }
    const ext = extMap[exportFormat.value] || exportFormat.value
    const fileName = exportFileFilter.value === 'all' 
      ? `comments-all.${ext}`
      : `comments-${exportFileFilter.value.replace(/[^a-z0-9_-]/gi, '_')}.${ext}`

    // Create download
    const blob = isPdf ? response : new Blob([response], { type: 'text/plain' })
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

function viewAnnotation(comment: Comment) {
  selectedAnnotationComment.value = comment
  showAnnotationViewer.value = true
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
.comment-card.comment-selected {
  outline: 2px solid var(--btn-primary-border);
  outline-offset: -2px;
  border-color: var(--btn-primary-border);
}

/* Checkboxes already use theme colors via global CSS variables:
   --checkbox-checked-border and --checkbox-checked-bg */
</style>
