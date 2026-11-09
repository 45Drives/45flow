<template>
  <FlowModal :model-value="modelValue" title="Comments Review" size="full" surface="default"
    flush body-class="flex flex-col !overflow-hidden text-left" :description="headerDescription" @close="close">
      <template #header-actions>
          <button type="button" class="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
            :disabled="!comments.length" @click="openExport">
            <ArrowDownTrayIcon class="w-4 h-4" aria-hidden="true" />
            Export…
          </button>
          <button type="button" class="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
            :disabled="loading" @click="loadComments">
            <ArrowPathIcon class="w-4 h-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button v-if="link?.url" type="button" class="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
            title="Open the share page in your browser" @click="openInBrowser">
            <ArrowTopRightOnSquareIcon class="w-4 h-4" aria-hidden="true" />
            Open link
          </button>
      </template>

      <!-- First load -->
      <div v-if="loading && !comments.length" class="flex-1 flex items-center justify-center gap-3 text-sm text-muted">
        <ArrowPathIcon class="w-5 h-5 animate-spin" aria-hidden="true" />
        Loading comments…
      </div>

      <div v-else-if="error && !comments.length" class="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <FlowNotice tone="danger" title="Couldn't load comments" class="max-w-md">{{ error }}</FlowNotice>
        <button type="button" class="btn btn-secondary" @click="loadComments">Try again</button>
      </div>

      <div v-else-if="!comments.length" class="flex-1 flex items-center justify-center p-6">
        <FlowEmpty title="No comments yet" description="When reviewers comment on files in this link, their comments show here.">
          <template #icon><ChatBubbleLeftRightIcon /></template>
        </FlowEmpty>
      </div>

      <div v-else class="flex-1 flex min-h-0">
        <!-- ═══ Filters ═══════════════════════════════════════ -->
        <aside class="crm-sidebar" aria-label="Filter and sort comments">
          <div class="relative">
            <MagnifyingGlassIcon class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60" aria-hidden="true" />
            <input v-model="searchText" type="search" aria-label="Search comments"
              class="input-textlike w-full pl-8 pr-3 py-1.5 text-sm" placeholder="Search text or people" />
          </div>

          <div class="crm-segmented" role="radiogroup" aria-label="Status">
            <button v-for="opt in statusOptions" :key="opt.value" type="button" role="radio"
              :aria-checked="statusFilter === opt.value" :class="{ 'is-on': statusFilter === opt.value }"
              @click="statusFilter = opt.value">
              {{ opt.label }}
            </button>
          </div>

          <div class="flex items-center justify-between mt-1">
            <p class="flow-subhead !m-0">Filter</p>
            <button v-if="filtersActive" type="button" class="crm-textbtn" @click="clearFilters">Clear filters</button>
          </div>

          <label class="crm-field">
            <span>File</span>
            <select v-model="selectedFileFilter" class="input-textlike px-2 py-1.5 text-sm w-full">
              <option value="">All files</option>
              <option v-for="fileName in allFileNames" :key="fileName" :value="fileName">
                {{ fileName }} ({{ getFileCommentCount(fileName) }})
              </option>
            </select>
          </label>

          <label class="crm-field">
            <span>Person</span>
            <select v-model="authorFilter" class="input-textlike px-2 py-1.5 text-sm w-full">
              <option value="">Everyone</option>
              <option v-for="author in allAuthors" :key="author" :value="author">{{ author }}</option>
            </select>
          </label>

          <div class="crm-field">
            <div class="flex items-center justify-between">
              <label for="crm-category-filter">Category</label>
              <button type="button" class="crm-textbtn" @click="showCategoryManagement = true">Manage…</button>
            </div>
            <select id="crm-category-filter" v-model="categoryFilter" class="input-textlike px-2 py-1.5 text-sm w-full">
              <option value="">All categories</option>
              <option v-for="cat in allCategories" :key="cat.id" :value="String(cat.id)">{{ cat.name }}</option>
              <option value="0">No category</option>
            </select>
          </div>

          <label v-if="allVersions.length > 0" class="crm-field">
            <span>Version</span>
            <select v-model="versionFilter" class="input-textlike px-2 py-1.5 text-sm w-full">
              <option value="">All versions</option>
              <option v-for="v in allVersions" :key="v.value" :value="v.value">{{ v.label }} ({{ v.count }})</option>
            </select>
          </label>

          <p class="flow-subhead !mb-0">Sort</p>
          <div class="flex items-center gap-2">
            <select v-model="sortBy" aria-label="Sort by" class="input-textlike px-2 py-1.5 text-sm flex-1 min-w-0">
              <option value="timecode">Timecode</option>
              <option value="date">Date posted</option>
              <option value="author">Person</option>
              <option value="status">Status</option>
              <option value="version">Version</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm whitespace-nowrap" :aria-pressed="sortReverse"
              :title="sortReverse ? 'Showing in reverse order' : 'Reverse the order'" @click="sortReverse = !sortReverse">
              <ArrowsUpDownIcon class="w-4 h-4" aria-hidden="true" />
              <span class="sr-only">Reverse order</span>
            </button>
          </div>
          <p class="text-xs text-muted -mt-1">{{ sortDescription }}</p>

          <template v-if="stats">
            <p class="flow-subhead !mb-0 mt-auto pt-2">Summary</p>
            <dl class="crm-stats">
              <div><dt>Total</dt><dd>{{ stats.total }}</dd></div>
              <div v-if="stats.topLevel"><dt>Comments</dt><dd>{{ stats.topLevel }}</dd></div>
              <div v-if="stats.replies"><dt>Replies</dt><dd>{{ stats.replies }}</dd></div>
              <div><dt>Open</dt><dd>{{ stats.unresolved }}</dd></div>
              <div><dt>Resolved</dt><dd>{{ stats.resolved }}</dd></div>
              <div v-if="stats.withAnnotations"><dt>With drawings</dt><dd>{{ stats.withAnnotations }}</dd></div>
            </dl>
          </template>
        </aside>

        <!-- ═══ Comments ══════════════════════════════════════ -->
        <section class="flex-1 flex flex-col min-w-0 min-h-0" aria-label="Comments">
          <div class="crm-toolbar" :class="{ 'crm-toolbar--selecting': selectedCommentIds.size > 0 }">
            <label class="inline-flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" class="styled-checkbox" :checked="allVisibleSelected" :indeterminate.prop="someVisibleSelected"
                :disabled="!visibleIds.length" aria-label="Select all shown comments" @change="toggleSelectAll" />
              <span v-if="selectedCommentIds.size" class="text-sm font-semibold">{{ selectedCommentIds.size }} selected</span>
              <span v-else class="text-sm font-semibold">
                {{ filtersActive ? `${visibleIds.length} of ${comments.length} shown` : pluralize(comments.length, 'comment') }}
              </span>
            </label>

            <div v-if="selectedCommentIds.size" class="flex flex-wrap items-center gap-2 ml-auto">
              <button type="button" class="btn btn-secondary btn-sm" :disabled="bulkBusy" @click="bulkResolve(true)">Resolve</button>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="bulkBusy" @click="bulkResolve(false)">Reopen</button>
              <select v-model="bulkCategoryId" aria-label="Set category for selected comments" :disabled="bulkBusy"
                class="input-textlike px-2 py-1 text-sm" @change="applyBulkCategory">
                <option value="" disabled>Set category…</option>
                <option v-for="cat in linkCategories" :key="cat.id" :value="String(cat.id)">{{ cat.name }}</option>
                <option value="null">No category</option>
              </select>
              <button type="button" class="crm-textbtn" @click="clearSelection">Clear selection</button>
            </div>
            <p v-else class="text-xs text-muted ml-auto hidden md:block">Select comments to resolve, reopen or categorize several at once.</p>
          </div>

          <FlowNotice v-if="error" tone="danger" size="sm" class="mx-5 mt-3">Couldn't refresh: {{ error }}</FlowNotice>

          <div class="flex-1 overflow-y-auto px-5 py-4">
            <FlowEmpty v-if="!filteredComments.length" compact title="No comments match"
              description="Try a different search, status or filter.">
              <template #actions><button type="button" class="btn btn-secondary btn-sm" @click="clearFilters">Clear filters</button></template>
            </FlowEmpty>

            <section v-for="group in visibleGroups" :key="group.fileName" class="crm-file" :aria-label="group.fileName">
              <header class="crm-file__head">
                <DocumentIcon class="w-4 h-4 shrink-0 opacity-70" aria-hidden="true" />
                <span class="font-semibold truncate" :title="group.fileName">{{ group.fileName }}</span>
                <span class="text-xs text-muted whitespace-nowrap ml-auto">{{ fileSummary(group.comments) }}</span>
              </header>

              <ul>
                <li v-for="comment in group.comments" :key="comment.id" class="crm-comment"
                  :class="{ 'crm-comment--selected': selectedCommentIds.has(comment.id), 'crm-comment--reply': (comment.depth || 0) > 0 }"
                  :style="{ '--crm-depth': Math.min(comment.depth || 0, 4) }"
                  @click="handleCommentClick($event, comment.id)">
                  <input type="checkbox" class="styled-checkbox mt-1" :checked="selectedCommentIds.has(comment.id)"
                    :aria-label="`Select comment by ${authorOf(comment)}`" @click.stop="toggleSelectComment(comment.id)" />
                  <span class="flow-avatar flow-avatar--sm mt-0.5" :style="avatarStyle(comment.author_color || comment.display_color)" aria-hidden="true">
                    {{ initials(authorOf(comment)) }}
                  </span>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-2">
                      <div class="min-w-0 flex-1">
                        <p class="text-sm">
                          <span class="font-semibold">{{ authorOf(comment) }}</span>
                          <span v-if="comment.parent_id" class="text-xs text-muted" :title="`Reply to comment #${comment.parent_id}`">
                            replied to {{ parentAuthor(comment) }}
                          </span>
                        </p>
                        <p class="crm-meta">
                          <span v-if="comment.start_seconds !== null && comment.start_seconds !== undefined" class="crm-tc">
                            <ClockIcon class="w-3 h-3" aria-hidden="true" />
                            {{ formatTimecodeRange(comment.start_seconds, comment.end_seconds) }}
                          </span>
                          <FlowChip v-if="comment.version_index != null" tone="info" size="sm" :title="`Version ${comment.version_index}`">V{{ comment.version_index }}</FlowChip>
                          <span>{{ formatDate(comment.created_at) }}</span>
                          <span v-if="comment.is_edited" class="italic">edited</span>
                          <span class="font-mono opacity-70">#{{ comment.id }}</span>
                        </p>
                      </div>
                      <div class="flex items-center gap-2 shrink-0" @click.stop>
                        <FlowChip :tone="comment.resolved ? 'muted' : 'neutral'" size="sm"
                          :title="comment.resolved && comment.resolved_at ? `Resolved ${formatDate(comment.resolved_at)}` : undefined">
                          {{ comment.resolved ? '✓ Resolved' : 'Open' }}
                        </FlowChip>
                        <button type="button" class="btn btn-secondary btn-xs" :disabled="resolvingIds.has(comment.id)" @click="toggleResolved(comment)">
                          {{ comment.resolved ? 'Reopen' : 'Resolve' }}
                        </button>
                      </div>
                    </div>

                    <p class="crm-body">{{ comment.body }}</p>

                    <div class="flex flex-wrap items-center gap-2 mt-2" @click.stop>
                      <label class="crm-category">
                        <span class="flow-dot" :style="{ background: comment.category_color || 'transparent', borderColor: comment.category_color ? 'transparent' : undefined }" aria-hidden="true" />
                        <span class="sr-only">Category</span>
                        <select :value="comment.category_id ?? ''"
                          @change="updateCommentCategory(comment.id, ($event.target as HTMLSelectElement).value)">
                          <option value="">No category</option>
                          <option v-for="cat in linkCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                        </select>
                      </label>
                      <span v-for="tag in parseTags(comment.tags)" :key="tag" class="flow-chip flow-chip--muted flow-chip--sm">#{{ tag }}</span>
                      <button v-if="comment.draw_data" type="button" class="btn btn-secondary btn-xs flex items-center gap-1"
                        title="See the drawing on the video frame" @click="viewAnnotation(comment)">
                        <PencilIcon class="w-3 h-3" aria-hidden="true" />
                        View drawing
                      </button>
                      <button type="button" class="btn btn-danger btn-xs ml-auto" :disabled="deletingIds.has(comment.id)"
                        @click="askDelete(comment)">
                        {{ deletingIds.has(comment.id) ? 'Deleting…' : 'Delete' }}
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </section>
      </div>
  </FlowModal>

  <template v-if="modelValue">
    <!-- Annotation Viewer Modal -->
    <AnnotationViewerModal
      v-model="showAnnotationViewer"
      :comment="selectedAnnotationComment"
      :link="link"
    />

    <!-- Category Management Modal -->
    <CategoryManagementModal
      :is-open="showCategoryManagement"
      :token="linkToken"
      :link-id="Number(link?.id ?? 0)"
      :categories="linkCategories"
      @close="showCategoryManagement = false"
      @categories-updated="onCategoriesUpdated"
    />

    <FlowModal v-model="exportOpen" title="Export comments" description="Download the comments on this link." size="md" :busy="exporting">
      <div class="flex flex-col gap-4">
        <FlowField label="Files">
          <template #default="{ id }">
            <select :id="id" v-model="exportFileFilter" class="input-textlike w-full px-3 py-2 text-sm">
              <option value="all">All files</option>
              <option v-for="fileName in allFileNames" :key="fileName" :value="fileName">{{ fileName }}</option>
            </select>
          </template>
        </FlowField>
        <fieldset>
          <legend class="text-sm font-medium mb-2">Format</legend>
          <ul class="flow-list">
            <li v-for="f in EXPORT_FORMATS" :key="f.value">
              <label class="flow-list__row flow-list__row--interactive !py-2.5 !items-start"
                :class="{ 'flow-list__row--selected': exportFormat === f.value }">
                <input v-model="exportFormat" type="radio" name="crm-export-format" class="mt-0.5" :value="f.value" />
                <span class="min-w-0">
                  <span class="block text-sm font-medium">{{ f.label }}</span>
                  <span class="block flow-list__meta">{{ f.help }}</span>
                </span>
              </label>
            </li>
          </ul>
        </fieldset>
      </div>
      <template #footer>
        <button type="button" class="btn btn-dismiss" :disabled="exporting" @click="exportOpen = false">Cancel</button>
        <button type="button" class="btn btn-primary flex items-center gap-2" :disabled="exporting" @click="handleExport">
          <ArrowDownTrayIcon class="w-4 h-4" aria-hidden="true" />
          {{ exporting ? 'Exporting…' : 'Export' }}
        </button>
      </template>
    </FlowModal>

    <ConfirmDeleteModal v-model="deleteOpen" title="Delete comment" :message="deleteMessage" :danger="true"
      :busy="deleteTarget ? deletingIds.has(deleteTarget.id) : false" busy-text="Deleting…"
      confirm-text="Delete comment" cancel-text="Cancel" :click-outside-cancels="true" @confirm="performDelete" />
  </template>
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
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  DocumentIcon,
  MagnifyingGlassIcon,
  PencilIcon,
} from '@heroicons/vue/24/outline'
import AnnotationViewerModal from './AnnotationViewerModal.vue'
import CategoryManagementModal from './CategoryManagementModal.vue'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'
import { useCommentCategories } from '../../composables/useCommentCategories'
import FlowModal from '../../ui/FlowModal.vue'
import FlowChip from '../../ui/FlowChip.vue'
import FlowEmpty from '../../ui/FlowEmpty.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import { avatarStyle, initials } from '../access/accessUi'

const props = defineProps<{
  modelValue: boolean
  link: LinkItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { apiFetch } = useApi()
const { getCategoriesForLink } = useCommentCategories()

// LinkItem.token is optional; fall back to parsing it out of the share URL.
const linkToken = computed(() => {
  const direct = String(props.link?.token || '').trim()
  if (direct) return direct
  const m = String(props.link?.url || '').match(/\/link\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]!) : ''
})

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
const showCategoryManagement = ref(false)
const linkCategories = ref<Array<{ id: number; name: string; color: string | null }>>([])
const bulkCategoryId = ref('')

// Bulk selection
const selectedCommentIds = ref<Set<number>>(new Set())
const deletingIds = ref<Set<number>>(new Set())
const statusFilter = ref<'all' | 'resolved' | 'unresolved'>('all')
const versionFilter = ref('')
const categoryFilter = ref('')

// Export state
const exportFileFilter = ref('all')
const exportFormat = ref('json')
const exporting = ref(false)
const exportOpen = ref(false)
const EXPORT_FORMATS = [
  { value: 'pdf', label: 'PDF report', help: 'A styled report grouped by file and version, for sharing or printing.' },
  { value: 'csv', label: 'CSV', help: 'A spreadsheet with one row per comment.' },
  { value: 'markdown', label: 'Markdown', help: 'A readable list for notes, emails or docs.' },
  { value: 'edl', label: 'EDL (edit decision list)', help: 'Timeline markers for Premiere, Resolve or Avid.' },
  { value: 'webvtt', label: 'WebVTT subtitles', help: 'Timecoded comments as caption cues.' },
  { value: 'json', label: 'JSON', help: 'Every field, for scripts and other tools.' },
] as const

const resolvingIds = ref<Set<number>>(new Set())
const bulkBusy = ref(false)
const deleteOpen = ref(false)
const deleteTarget = ref<CommentExport | null>(null)

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
    .map(([key, v]) => ({ id: v.id, value: key || 'none', label: v.index != null ? `V${v.index}` : 'No version', count: v.count }))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
})

// Every category defined on the link, plus any still referenced by a comment
const allCategories = computed(() => {
  const catMap = new Map<number, { id: number, name: string, color: string | null, count: number }>()
  linkCategories.value.forEach(c => {
    catMap.set(c.id, { id: c.id, name: c.name, color: c.color, count: 0 })
  })
  comments.value.forEach(c => {
    if (c.category_id) {
      const key = c.category_id
      if (!catMap.has(key)) {
        catMap.set(key, { id: c.category_id, name: c.category_name || 'Uncategorized', color: c.category_color, count: 0 })
      }
      catMap.get(key)!.count++
    }
  })
  return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name))
})

// Get all top-level comments
const topLevelComments = computed(() => {
  return comments.value.filter(c => !c.parent_id)
})

// Build a map of parent_id → replies for nesting
const repliesByParent = computed(() => {
  const map = new Map<number, CommentExport[]>()
  comments.value.forEach(c => {
    if (c.parent_id) {
      if (!map.has(c.parent_id)) map.set(c.parent_id, [])
      map.get(c.parent_id)!.push(c)
    }
  })
  // Sort replies by created_at within each group
  for (const replies of map.values()) {
    replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }
  return map
})

// True if any reply below this comment, at any depth, matches
function anyInThread(parentId: number, pred: (c: CommentExport) => boolean, seen = new Set<number>([parentId])): boolean {
  for (const reply of repliesByParent.value.get(parentId) || []) {
    if (seen.has(reply.id)) continue
    seen.add(reply.id)
    if (pred(reply) || anyInThread(reply.id, pred, seen)) return true
  }
  return false
}

// Apply filters and sorting
const filteredComments = computed(() => {
  let result = topLevelComments.value.slice()
  
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

  // Filter by author — include parent if any of its replies match
  if (authorFilter.value) {
    result = result.filter(c => {
      if (authorOf(c) === authorFilter.value) return true
      return anyInThread(c.id, r => authorOf(r) === authorFilter.value)
    })
  }

  // Filter by version
  if (versionFilter.value !== '') {
    const vId = versionFilter.value === 'none' ? null : Number(versionFilter.value)
    result = result.filter(c => {
      if (vId === null) return c.asset_version_id == null
      return c.asset_version_id === vId
    })
  }

  // Filter by category
  if (categoryFilter.value !== '') {
    const catId = Number(categoryFilter.value)
    result = result.filter(c => {
      if (catId === 0) return c.category_id == null
      return c.category_id === catId
    })
  }

  // Filter by search text — include parent if any of its replies match
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase()
    const matchesSearch = (c: CommentExport) =>
      c.body?.toLowerCase().includes(search) ||
      c.author_name?.toLowerCase().includes(search) ||
      c.user_name?.toLowerCase().includes(search)
    result = result.filter(c => {
      if (matchesSearch(c)) return true
      return anyInThread(c.id, matchesSearch)
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

// Flatten filtered top-level comments with their whole reply thread (replies to replies included).
// When person/search filters are active, only replies that match are kept.
function matchesReplyFilters(r: CommentExport) {
  if (authorFilter.value && authorOf(r) !== authorFilter.value) return false
  const search = searchText.value.trim().toLowerCase()
  if (search) {
    return !!(r.body?.toLowerCase().includes(search) ||
      r.author_name?.toLowerCase().includes(search) ||
      r.user_name?.toLowerCase().includes(search))
  }
  return true
}

function threadOf(parentId: number, out: CommentExport[], seen: Set<number>) {
  for (const reply of repliesByParent.value.get(parentId) || []) {
    if (seen.has(reply.id)) continue
    seen.add(reply.id)
    if (matchesReplyFilters(reply)) out.push(reply)
    threadOf(reply.id, out, seen)
  }
}

const filteredCommentsWithReplies = computed(() => {
  const flat: CommentExport[] = []
  for (const comment of filteredComments.value) {
    flat.push(comment)
    threadOf(comment.id, flat, new Set([comment.id]))
  }
  return flat
})

// Get unique file names from filtered comments
const filteredFileNames = computed(() => {
  const names = new Set(filteredComments.value.map(c => c.file_name || 'Unknown'))
  return Array.from(names).sort()
})

const visibleGroups = computed(() => {
  const byFile = new Map<string, CommentExport[]>()
  for (const c of filteredCommentsWithReplies.value) {
    const fn = c.file_name || 'Unknown'
    if (!byFile.has(fn)) byFile.set(fn, [])
    byFile.get(fn)!.push(c)
  }
  return filteredFileNames.value
    .filter(fn => byFile.has(fn))
    .map(fileName => ({ fileName, comments: byFile.get(fileName)! }))
})

const visibleIds = computed(() => filteredCommentsWithReplies.value.map(c => c.id))
const allVisibleSelected = computed(() =>
  visibleIds.value.length > 0 && visibleIds.value.every(id => selectedCommentIds.value.has(id))
)
const someVisibleSelected = computed(() =>
  !allVisibleSelected.value && visibleIds.value.some(id => selectedCommentIds.value.has(id))
)

// Bulk actions only touch what's on screen, so drop selections that a filter has hidden.
watch(visibleIds, (ids) => {
  if (!selectedCommentIds.value.size) return
  const visible = new Set(ids)
  const kept = [...selectedCommentIds.value].filter(id => visible.has(id))
  if (kept.length !== selectedCommentIds.value.size) selectedCommentIds.value = new Set(kept)
})

const statusOptions = [
  { value: 'all' as const, label: 'All' },
  { value: 'unresolved' as const, label: 'Open' },
  { value: 'resolved' as const, label: 'Resolved' },
]

const filtersActive = computed(() =>
  !!searchText.value.trim() || statusFilter.value !== 'all' || !!selectedFileFilter.value ||
  !!authorFilter.value || categoryFilter.value !== '' || versionFilter.value !== ''
)

function clearFilters() {
  searchText.value = ''
  statusFilter.value = 'all'
  selectedFileFilter.value = ''
  authorFilter.value = ''
  categoryFilter.value = ''
  versionFilter.value = ''
}

const SORT_DESCRIPTIONS: Record<string, [string, string]> = {
  timecode: ['Earliest timecode first', 'Latest timecode first'],
  date: ['Oldest first', 'Newest first'],
  author: ['People A to Z', 'People Z to A'],
  status: ['Open first', 'Resolved first'],
  version: ['Oldest version first', 'Newest version first'],
}
const sortDescription = computed(() => (SORT_DESCRIPTIONS[sortBy.value] || ['', ''])[sortReverse.value ? 1 : 0])

const headerDescription = computed(() => {
  const title = props.link?.title || 'Untitled link'
  if (!comments.value.length) return title
  return `${title} · ${pluralize(comments.value.length, 'comment')} on ${pluralize(allFileNames.value.length, 'file')}`
})

function pluralize(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function authorOf(c: CommentExport) {
  return c.author_name || c.user_name || 'Anonymous'
}

function parentAuthor(c: CommentExport) {
  const parent = comments.value.find(p => p.id === c.parent_id)
  return parent ? authorOf(parent) : `#${c.parent_id}`
}

function fileSummary(list: CommentExport[]) {
  const open = list.filter(c => !c.resolved).length
  return `${pluralize(list.length, 'comment')} · ${open} open`
}

function clearSelection() {
  selectedCommentIds.value = new Set()
}

function getFileCommentCount(fileName: string): number {
  return topLevelComments.value.filter(c => c.file_name === fileName).length
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

function categoryBadgeStyle(color: string | null | undefined) {
  const base = color || '#9CA3AF'
  return {
    backgroundColor: `${base}26`,
    borderColor: `${base}99`,
    color: base,
  }
}

async function loadCategories() {
  if (!linkToken.value || !props.link?.id) return
  try {
    const categories = await getCategoriesForLink(linkToken.value, Number(props.link.id))
    linkCategories.value = categories || []
  } catch (err) {
    console.warn('[CommentsReview] Failed to load categories:', err)
  }
}

async function loadComments() {
  if (!props.link?.id) return
  
  loading.value = true
  error.value = null
  
  // Load categories alongside comments
  loadCategories()
  
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
    selectedCommentIds.value = new Set()
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
  const next = new Set(selectedCommentIds.value)
  if (allVisibleSelected.value) visibleIds.value.forEach(id => next.delete(id))
  else visibleIds.value.forEach(id => next.add(id))
  selectedCommentIds.value = next
}

function applyCategoryLocally(ids: number[], catId: number | null) {
  const category = catId ? linkCategories.value.find(c => c.id === catId) : null
  for (const c of comments.value) {
    if (!ids.includes(c.id)) continue
    c.category_id = catId
    c.category_name = category?.name || null
    c.category_color = category?.color || null
  }
}

function patchCategory(commentId: number, catId: number | null) {
  return apiFetch(`/api/token/${encodeURIComponent(linkToken.value)}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_id: catId }),
  })
}

async function updateCommentCategory(commentId: number, categoryId: string) {
  if (!linkToken.value) return
  const catId = categoryId === '' ? null : Number(categoryId)
  try {
    await patchCategory(commentId, catId)
    applyCategoryLocally([commentId], catId)
  } catch (err: any) {
    console.error('[CommentsReview] Update category error:', err)
    pushNotification(new Notification('Update Failed', err?.message || 'Could not update comment category', 'error', 5000))
    // Put the select back to the saved value
    comments.value = [...comments.value]
  }
}

// Runs one request per comment and reports how many failed, so a partial failure isn't silent.
async function runForEach(ids: number[], fn: (id: number) => Promise<any>) {
  const results = await Promise.allSettled(ids.map(fn))
  const ok: number[] = []
  let firstError = ''
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.ok !== false) ok.push(ids[i])
    else if (!firstError) firstError = r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : (r.value?.error || 'Request failed')
  })
  return { ok, failed: ids.length - ok.length, firstError }
}

async function applyBulkCategory() {
  if (selectedCommentIds.value.size === 0 || !linkToken.value || bulkCategoryId.value === '') {
    bulkCategoryId.value = ''
    return
  }
  const catId = bulkCategoryId.value === 'null' ? null : Number(bulkCategoryId.value)
  const ids = Array.from(selectedCommentIds.value)
  bulkBusy.value = true
  try {
    const { ok, failed, firstError } = await runForEach(ids, id => patchCategory(id, catId))
    applyCategoryLocally(ok, catId)
    selectedCommentIds.value = new Set(ids.filter(id => !ok.includes(id)))
    if (failed) {
      pushNotification(new Notification('Some Categories Not Updated',
        `${ok.length} updated, ${failed} failed. ${firstError}`.trim(), 'error', 6000))
    } else {
      pushNotification(new Notification('Categories Updated', `Updated ${pluralize(ok.length, 'comment')}.`, 'success', 3000))
    }
  } finally {
    bulkCategoryId.value = ''
    bulkBusy.value = false
  }
}

function onCategoriesUpdated(categories: Array<{ id: number; name: string; color: string | null }>) {
  linkCategories.value = categories
}

function applyResolvedLocally(ids: number[], resolved: boolean) {
  const now = new Date().toISOString()
  for (const c of comments.value) {
    if (!ids.includes(c.id) || c.resolved === resolved) continue
    c.resolved = resolved
    c.resolved_at = resolved ? now : null
    // The server's open/resolved counts only include top-level comments
    if (stats.value && !c.parent_id) {
      stats.value.resolved += resolved ? 1 : -1
      stats.value.unresolved += resolved ? -1 : 1
    }
  }
}

function patchResolved(commentId: number, resolved: boolean) {
  return apiFetch(`/api/links/${props.link!.id}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ resolved }),
  })
}

async function bulkResolve(resolved: boolean) {
  if (selectedCommentIds.value.size === 0 || !props.link?.id) return
  const ids = Array.from(selectedCommentIds.value)
  bulkBusy.value = true
  try {
    const { ok, failed, firstError } = await runForEach(ids, id => patchResolved(id, resolved))
    applyResolvedLocally(ok, resolved)
    selectedCommentIds.value = new Set(ids.filter(id => !ok.includes(id)))
    if (failed) {
      pushNotification(new Notification('Some Comments Not Updated',
        `${ok.length} updated, ${failed} failed. ${firstError}`.trim(), 'error', 6000))
    } else {
      pushNotification(new Notification(resolved ? 'Comments Resolved' : 'Comments Reopened',
        `${resolved ? 'Resolved' : 'Reopened'} ${pluralize(ok.length, 'comment')}.`, 'success', 3000))
    }
  } finally {
    bulkBusy.value = false
  }
}

function openInBrowser() {
  if (!props.link?.url) return
  window.open(props.link.url, '_blank', 'noopener,noreferrer')
}

const deleteMessage = computed(() => {
  const c = deleteTarget.value
  if (!c) return ''
  let replyCount = 0
  const walk = (id: number) => (repliesByParent.value.get(id) || []).forEach(r => { replyCount++; walk(r.id) })
  walk(c.id)
  return [
    `Delete this comment by ${authorOf(c)}?`,
    c.draw_data ? 'Its drawing will also be removed.' : '',
    replyCount ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'} will also be deleted.` : '',
    'This cannot be undone.',
  ].filter(Boolean).join(' ')
})

function askDelete(comment: CommentExport) {
  deleteTarget.value = comment
  deleteOpen.value = true
}

async function performDelete() {
  const comment = deleteTarget.value
  if (comment) await deleteComment(comment)
  deleteOpen.value = false
}

async function deleteComment(comment: CommentExport) {
  const linkId = props.link?.id
  if (!linkId || deletingIds.value.has(comment.id)) return

  deletingIds.value = new Set(deletingIds.value).add(comment.id)
  try {
    const response = await apiFetch(`/api/links/${linkId}/comments/${comment.id}`, { method: 'DELETE' })
    if (!response?.ok) throw new Error(response?.error || 'Failed to delete comment')

    const removed = new Set<number>((response.deletedIds as number[] | undefined) ?? [comment.id])
    comments.value = comments.value.filter(c => !removed.has(c.id))
    selectedCommentIds.value = new Set([...selectedCommentIds.value].filter(id => !removed.has(id)))
    if (selectedAnnotationComment.value && removed.has(Number(selectedAnnotationComment.value.id))) {
      showAnnotationViewer.value = false
    }
    void refreshStats()

    pushNotification(new Notification(
      'Comment Deleted',
      removed.size > 1 ? `Deleted the comment and ${removed.size - 1} repl${removed.size === 2 ? 'y' : 'ies'}` : 'The comment was deleted.',
      'success',
      3000
    ))
  } catch (err: any) {
    console.error('[CommentsReview] Delete error:', err)
    // premium_required already shows its own notification from apiFetch
    if (err?.code !== 'premium_required') {
      pushNotification(new Notification(
        'Delete Failed',
        err?.message || 'Could not delete the comment',
        'error',
        5000
      ))
    }
  } finally {
    const next = new Set(deletingIds.value)
    next.delete(comment.id)
    deletingIds.value = next
  }
}

// Re-fetch counts from the server so totals (replies, annotations) stay accurate after a delete
async function refreshStats() {
  if (!props.link?.id) return
  try {
    const response = await apiFetch(`/api/links/${props.link.id}/comments`)
    if (response?.ok && response.stats) stats.value = response.stats
  } catch (err) {
    console.warn('[CommentsReview] Stats refresh failed:', err)
  }
}

async function toggleResolved(comment: CommentExport) {
  if (!props.link?.id || resolvingIds.value.has(comment.id)) return
  const newResolved = !comment.resolved
  resolvingIds.value = new Set(resolvingIds.value).add(comment.id)
  try {
    const response = await patchResolved(comment.id, newResolved)
    if (!response?.ok) throw new Error(response?.error || 'Failed to update comment')
    applyResolvedLocally([comment.id], newResolved)
  } catch (err: any) {
    console.error('[CommentsReview] Toggle resolved error:', err)
    pushNotification(new Notification('Update Failed', err?.message || 'Could not update comment status', 'error', 4000))
  } finally {
    const next = new Set(resolvingIds.value)
    next.delete(comment.id)
    resolvingIds.value = next
  }
}

function openExport() {
  // Start from the file being looked at, if any
  exportFileFilter.value = selectedFileFilter.value || 'all'
  exportOpen.value = true
}

function slugify(v: string) {
  return v.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60)
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
    const prefix = slugify(props.link?.title || '') || 'link'
    const fileName = exportFileFilter.value === 'all'
      ? `${prefix}-comments.${ext}`
      : `${prefix}-${slugify(exportFileFilter.value)}-comments.${ext}`

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

    exportOpen.value = false
    pushNotification(new Notification(
      'Export Complete',
      `Comments exported as ${fileName}`,
      'success',
      5000
    ))
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

// Filters from one link make no sense on another (file names, people, versions differ).
watch(() => props.link?.id, (id, prev) => {
  if (id === prev) return
  clearFilters()
  comments.value = []
  stats.value = null
  error.value = null
  selectedCommentIds.value = new Set()
})

onMounted(() => {
  if (props.modelValue) {
    loadComments()
  }
})
</script>

<style scoped>
/* ── Filter sidebar ──────────────────────────────────── */
.crm-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 17rem;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 1rem;
  border-right: 1px solid var(--flow-line);
  background: var(--flow-surface-sunken);
}
.crm-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.crm-field > span,
.crm-field label {
  font-size: var(--flow-text-xs);
  font-weight: 600;
  color: var(--ui-subtle-text);
}
.crm-textbtn {
  font-size: var(--flow-text-xs);
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: var(--flow-accent-line);
  text-underline-offset: 3px;
}
.crm-textbtn:focus-visible {
  outline: 2px solid var(--ui-ring);
  outline-offset: 2px;
  border-radius: 2px;
}
.crm-segmented {
  display: flex;
  padding: 2px;
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-md);
  background: var(--flow-surface-sunken);
}
.crm-segmented > button {
  flex: 1;
  padding: 0.3rem 0.4rem;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  color: var(--ui-subtle-text);
  border-radius: calc(var(--flow-radius-md) - 2px);
}
.crm-segmented > button:hover {
  color: inherit;
}
.crm-segmented > button.is-on {
  color: white;
  font-weight: 600;
  background: var(--btn-primary-fill);
}
.crm-segmented > button:focus-visible {
  outline: 2px solid var(--ui-ring);
  outline-offset: 1px;
}
.crm-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}
.crm-stats dt {
  font-size: var(--flow-text-xs);
  color: var(--ui-subtle-text);
}
.crm-stats dd {
  font-size: var(--flow-text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ── Comment list ────────────────────────────────────── */
.crm-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid var(--flow-line);
}
.crm-toolbar--selecting {
  background: var(--flow-accent-soft);
}
.crm-file {
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-lg);
}
.crm-file + .crm-file {
  margin-top: 1rem;
}
.crm-file__head {
  position: sticky;
  top: -1rem;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  padding: 0.6rem 1rem;
  font-size: var(--flow-text-sm);
  border-bottom: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-lg) var(--flow-radius-lg) 0 0;
  background: var(--flow-surface-sunken);
  backdrop-filter: blur(8px);
}
.crm-comment {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.85rem calc(1rem + var(--crm-depth, 0) * 1.75rem);
  cursor: pointer;
}
.crm-comment + .crm-comment {
  border-top: 1px solid var(--flow-line);
}
.crm-comment:hover {
  background: var(--flow-surface-hover);
}
.crm-comment--reply {
  background-image: linear-gradient(var(--flow-line), var(--flow-line));
  background-repeat: no-repeat;
  background-size: 2px 100%;
  background-position: calc(1rem + var(--crm-depth, 0) * 1.75rem - 0.9rem) 0;
}
.crm-comment--selected,
.crm-comment--selected:hover {
  background-color: var(--flow-accent-soft);
}
.crm-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.6rem;
  margin-top: 0.15rem;
  font-size: var(--flow-text-xs);
  color: var(--ui-subtle-text);
}
.crm-tc {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: inherit;
}
.crm-body {
  margin-top: 0.4rem;
  font-size: var(--flow-text-sm);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
}
.crm-category {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.15rem 0 0.5rem;
  font-size: var(--flow-text-xs);
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-pill);
}
.crm-category .flow-dot {
  border: 1px dashed var(--flow-neutral-border);
}
.crm-category select {
  padding: 0.15rem 1.6rem 0.15rem 0;
  font-size: var(--flow-text-xs);
  border: 0;
  background-color: transparent;
  background-position: right 0.25rem center;
  box-shadow: none;
}
.crm-category:focus-within {
  outline: 2px solid var(--ui-ring);
  outline-offset: 1px;
}
</style>
