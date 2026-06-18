<template>
	<div class="min-h-0 flex flex-col">
		<div class="manage-header">
			<div class="manage-heading">
				<h3>{{ headingTitle }}</h3>
				<p class="ss-subtle">Search links, adjust settings, and track status in real time.</p>
			</div>
			<div class="manage-metrics">
				<span class="ss-chip ss-chip--neutral">Total {{ linkSummary.total }}</span>
				<span class="ss-chip ss-chip--success">Active {{ linkSummary.active }}</span>
				<span class="ss-chip ss-chip--warning">Expired {{ linkSummary.expired }}</span>
				<span class="ss-chip ss-chip--muted">Disabled {{ linkSummary.disabled }}</span>
			</div>
		</div>

		<div class="manage-surface p-2 bg-well rounded-md min-w-0 flex flex-col">
			<div data-tour="manage-links-toolbar" class="manage-toolbar">
				<input v-model="q" type="search" placeholder="Search title, directory, file..."
					class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-default w-72" />
				<select v-model="typeFilter" class="px-3 py-2 border border-default rounded-lg bg-default">
					<option value="">All types</option>
					<option value="upload">Upload</option>
					<option value="download">Review (file)</option>
					<option value="collection">Review (collection)</option>
					<option value="combined">Review + Upload</option>
				</select>
				<select v-model="statusFilter" class="px-3 w-36 py-2 border border-default rounded-lg bg-default">
					<option value="">All status</option>
					<option value="active">Active</option>
					<option value="expired">Expired</option>
					<option value="disabled">Disabled</option>
				</select>
				<button class="btn btn-secondary px-4 py-2 ml-auto" @click="refresh" :disabled="loading">
					{{ loading ? 'Refreshing…' : 'Refresh' }}
				</button>
			</div>

			<div v-if="error" class="p-3 rounded bg-red-900/30 text-default border border-red-800 mb-3 text-center items-center justify-self-center">
				{{ error }}
			</div>

			<div data-tour="manage-links-table" class="manage-table-wrap overflow-x-auto min-w-0 overscroll-x-contain touch-pan-x">
				<table class="manage-table min-w-[1320px] text-sm border-collapse">
					<colgroup>
						<col class="thumb-col" /> <!-- Thumbnail -->
						<col class="w-[18%]" /> <!-- Title -->
						<col class="w-[6%]" /> <!-- Type -->
						<col class="w-[16%]" /> <!-- Link -->
						<col class="w-[18%]" /> <!-- Expires -->
						<col class="w-[5%]" /> <!-- Status -->
						<col class="w-[5%]" /> <!-- Access -->
						<col class="w-[8%]" /> <!-- Created -->
						<col class="w-[8%]" /> <!-- Server -->
						<col class="w-[14%]" /> <!-- Actions -->
					</colgroup>
					<thead>
						<tr class="manage-table-head-row border-b border-default">
							<th class="p-1 border border-default thumb-td"></th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('title')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Title</span>
									<span>{{ sortIndicator('title') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('type')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Type</span>
									<span>{{ sortIndicator('type') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('url')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Link</span>
									<span>{{ sortIndicator('url') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('expires')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Expires</span>
									<span>{{ sortIndicator('expires') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('status')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Status</span>
									<span>{{ sortIndicator('status') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('access')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Access</span>
									<span>{{ sortIndicator('access') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default cursor-pointer select-none"
								@click="setSort('created')">
								<span class="flex items-center justify-between gap-2 w-full">
									<span class="hover:underline">Created</span>
									<span>{{ sortIndicator('created') }}</span>
								</span>
							</th>
							<th class="text-left p-2 font-semibold border border-default">Server</th>
							<th class="text-left p-2 font-semibold border border-default">Actions</th>
						</tr>
					</thead>

					<tbody class="bg-accent">
						<tr v-if="loading">
							<td colspan="10" class="p-0 border border-default">
								<div class="w-full min-h-[140px] flex items-center justify-center">
									<div
										class="flex items-center gap-3 px-4 py-3 rounded-lg bg-default/60 border border-default shadow-sm">
										<span
											class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										<div class="flex flex-col leading-tight">
											<div class="text-sm font-semibold text-default">Loading links</div>
											<div class="text-xs text-muted">Fetching latest data…</div>
										</div>
									</div>
								</div>
							</td>
						</tr>

						<tr v-else-if="filteredRows.length === 0 && !showingDemoData">
							<td colspan="10"
								class="px-2 py-4 text-center text-default font-bold border border-default align-middle whitespace-nowrap">
								No links found.
							</td>
						</tr>

						<!-- Demo rows for guided tour -->
						<tr v-else-if="showingDemoData" v-for="it in DEMO_LINKS" :key="'demo-' + it.id"
							data-tour-demo
							class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default h-12 opacity-80">
							<!-- Thumbnail -->
							<td class="p-1 border border-default align-middle thumb-td">
								<div class="thumb-cell">
									<div class="thumb-placeholder" :class="thumbIconClass(it)">
										{{ thumbIconLabel(it) }}
									</div>
								</div>
							</td>
							<!-- Title -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center justify-between gap-2">
									<span class="font-medium block truncate max-w-[28ch] md:max-w-[40ch]">
										{{ it.title || fallbackTitle(it) }}
									</span>
									<span data-tour="manage-links-edit-title" class="text-xs text-blue-500 shrink-0">
										Edit Title
									</span>
								</div>
							</td>
							<!-- Type -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col gap-0.5">
									<span class="px-2 py-0.5 rounded-full text-[10px] font-bold leading-tight text-center"
										:class="hasShareCap(it) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-well/50 text-muted/40'"
									>Review</span>
									<span class="px-2 py-0.5 rounded-full text-[10px] font-bold leading-tight text-center"
										:class="hasUploadCap(it) ? 'bg-blue-500/20 text-blue-400' : 'bg-well/50 text-muted/40'"
									>Upload</span>
								</div>
							</td>
							<!-- Link -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center gap-2 justify-between">
									<span class="block truncate max-w-[28ch] md:max-w-[34ch]">{{ it.url }}</span>
									<span data-tour="manage-links-copy" class="text-blue-500 text-xs shrink-0">Copy</span>
								</div>
							</td>
							<!-- Expires -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center gap-2">
									<div class="truncate" :class="expiresClass(it)">{{ expiresLabel(it) }}</div>
									<span data-tour="manage-links-edit-expiry" class="btn btn-primary text-xs h-fit ml-auto">Edit</span>
								</div>
							</td>
							<!-- Status -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="bg-default dark:bg-well/75 px-2 py-0.5 rounded-full text-xs font-semibold"
									:class="statusChipClass(statusOf(it))">{{ statusOf(it).toUpperCase() }}</span>
							</td>
							<!-- Access -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="bg-default dark:bg-well/75 px-2 py-0.5 rounded-full text-xs font-semibold"
									:class="accessChipClass(it)">{{ accessLabel(it) }}</span>
							</td>
							<!-- Created -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col leading-tight">
									<div>{{ formatLocal(it.createdAt, { dateStyle: 'medium' }) }}</div>
									<div class="text-xs text-muted">{{ formatLocal(it.createdAt, { timeStyle: 'short' }) }}</div>
								</div>
							</td>
							<!-- Server -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="text-xs text-muted">Demo Server</span>
							</td>
							<!-- Actions -->
							<td data-tour="manage-links-actions" class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-nowrap items-center justify-around gap-1">
									<span class="btn btn-secondary h-fit px-2 rounded-md">Details</span>
									<span class="btn btn-primary h-fit px-2 rounded-md">Open</span>
									<span class="btn btn-danger h-fit px-2 rounded-md">Disable</span>
								</div>
							</td>
						</tr>

						<tr v-for="it in pagedRows" :key="'link-' + it.id" v-else
							class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default h-12">
							<!-- Thumbnail -->
							<td class="p-1 border border-default align-middle w-[50px]">
								<div class="thumb-cell">
									<img v-if="hasThumbnail(it)" :src="thumbSrc(it)" class="thumb-img" />
									<div v-else class="thumb-placeholder" :class="thumbIconClass(it)">
										{{ thumbIconLabel(it) }}
									</div>
								</div>
							</td>
							<!-- Title -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div v-if="editingId !== it.id" class="min-w-0 flex items-center justify-between gap-2">
									<span :title="it.title || fallbackTitle(it)"
										class="font-medium cursor-pointer hover:underline block truncate max-w-[28ch] md:max-w-[40ch]"
										@click="openDetails(it)">
										{{ it.title || fallbackTitle(it) }}
									</span>
									<button class="text-xs text-blue-500 hover:underline shrink-0"
										@click="startEdit(it)">
										Edit Title
									</button>
								</div>

								<div v-else class="flex items-center gap-2">
									<input v-model="editTitle"
										class="px-2 py-1 rounded bg-default border border-default w-56 h-8" />
									<button class="btn btn-secondary text-xs h-8 px-2"
										@click="saveTitle(it)">Save</button>
									<button class="btn btn-danger text-xs h-8 px-2" @click="cancelEdit">Cancel</button>
								</div>
							</td>


							<!-- Type -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col gap-0.5">
									<span class="px-2 py-0.5 rounded-full text-[10px] font-bold leading-tight text-center"
										:class="hasShareCap(it) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-well/50 text-muted/40'"
									>Review</span>
									<span class="px-2 py-0.5 rounded-full text-[10px] font-bold leading-tight text-center"
										:class="hasUploadCap(it) ? 'bg-blue-500/20 text-blue-400' : 'bg-well/50 text-muted/40'"
									>Upload</span>
								</div>
							</td>


							<!-- Link -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center gap-2 justify-between">
									<a :href="it.url" target="_blank" rel="noopener" :title="it.url"
										class="hover:underline block truncate max-w-[28ch] md:max-w-[34ch]">
										{{ it.url }}
									</a>
									<button class="text-blue-500 hover:underline text-xs shrink-0"
										@click="copy(it.url)">Copy</button>
								</div>
							</td>


							<!-- Expires -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div v-if="!expEditor[it.id]?.open" class="min-w-0 flex items-center gap-2">
									<div class="truncate" :class="expiresClass(it)">
										{{ expiresLabel(it) }}
									</div>
									<div class="ml-auto flex items-center gap-1 flex-nowrap">
										<button class="btn btn-primary text-xs h-fit"
											@click="openCustom(it)">Edit</button>
									</div>
								</div>

								<!-- custom editor -->
								<div v-else class="flex flex-col items-center gap-1 text-xs">
									<div class="flex flex-row justify-between w-full">
										<label class="flex items-center gap-1">
											<span class="opacity-70">Days</span>
											<input type="number" min="0" class="input-textlike h-7 w-16 text-left"
												v-model.number="expEditor[it.id].days" />
										</label>
										<label class="flex items-center gap-1">
											<span class="opacity-70">Hours</span>
											<input type="number" min="0" class="input-textlike h-7 w-16 text-left"
												v-model.number="expEditor[it.id].hours" />
										</label>
									</div>
									<div class="flex flex-row justify-around w-full gap-0.5">
										<button class="btn btn-secondary text-xs" @click="applyCustom(it)">
											Apply
										</button>
										<button class="btn btn-primary text-xs"
											@click="makeNever(it)">Never</button>
										<button class="btn btn-danger text-xs" @click="closeCustom(it)">
											Cancel
										</button>
									</div>

								</div>
							</td>


							<!-- Status -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="bg-default dark:bg-well/75 px-2 py-0.5 rounded-full text-xs font-semibold"
									:class="statusChipClass(statusOf(it))">{{ statusOf(it).toUpperCase() }}</span>
							</td>

							<!-- Access -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span
									class="bg-default dark:bg-well/75 px-2 py-0.5 rounded-full text-xs font-semibold"
									:class="accessChipClass(it)"
									:title="accessDetail(it)"
								>
									{{ accessLabel(it) }}
								</span>
							</td>

							<!-- Created -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col leading-tight">
									<div>{{ formatLocal(it.createdAt, { dateStyle: 'medium' }) }}</div>
									<div class="text-xs text-muted">{{ formatLocal(it.createdAt, { timeStyle: 'short' })
										}}</div>
								</div>
							</td>

							<!-- Server -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col leading-tight">
									<div class="text-xs font-medium" :title="(it as any)._serverName || 'Unknown'">{{ (it as any)._serverName || 'Unknown' }}</div>
									<div class="text-xs text-muted" :title="(it as any)._serverIp || ''">{{ (it as any)._serverIp || '' }}</div>
								</div>
							</td>


							<!-- Actions -->
							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-nowrap items-center justify-around gap-1">
									<button class="btn btn-secondary h-fit px-2 rounded-md" @click="openDetails(it)">
										Details</button>
									<!-- <button
										v-if="it.type !== 'upload' && it.allow_comments"
										class="btn btn-secondary h-fit px-2 rounded-md"
										@click="openComments(it)"
										:title="'View & manage comments'"
									>
										💬
									</button> -->
									<button :disabled="isDisabled(it)" class="btn btn-primary h-fit px-2 rounded-md"
										@click="viewLink(it)">
										Open
									</button>
									<button class="btn h-fit px-2 rounded-md"
										:class="statusOf(it) === 'disabled' ? 'btn-success' : 'btn-danger'"
										@click="toggleDisable(it)">
										{{ statusOf(it) === 'disabled' ? 'Enable' : 'Disable' }}
									</button>
								</div>
							</td>
						</tr>
						<tr v-for="n in emptyRowCount" :key="`empty-${n}`" class="h-12">
							<td colspan="10" class="p-0 bg-well">&nbsp;</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="mt-3 flex items-center justify-between gap-2 text-sm">
				<div class="text-muted">
					Showing {{ pageStart }}-{{ pageEnd }} of {{ filteredRows.length }}
				</div>
				<div class="flex items-center gap-2">
					<button class="btn btn-secondary px-3 py-1" :disabled="currentPage <= 1" @click="prevPage">
						Previous
					</button>
					<span>Page {{ currentPage }} / {{ totalPages }}</span>
					<button class="btn btn-secondary px-3 py-1" :disabled="currentPage >= totalPages" @click="nextPage">
						Next
					</button>
				</div>
			</div>
		</div>
	</div>

	<!--  /////////////////////////////////////////////////////////////////////////////////////////////////////////////// -->
	<LinkDetailsModal v-model="showModal" :link="current" :apiFetch="apiFetch" @updated="applyLinkPatch" />
	<!-- <CommentsReviewModal v-model="showCommentsModal" :link="commentsLink" /> -->
</template>
	
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import { useConnections } from '../composables/useConnections'
import { useLinkRefreshSignal } from '../composables/useLinkRefresh'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { appLog } from '../composables/useLog'
import LinkDetailsModal from "../components/modals/LinkDetailsModal.vue"
import type { LinkItem, LinkType, Status } from '../typings/electron'
import { useTime } from '../composables/useTime'
import { useTimeFormat } from '../composables/useTimeFormat'
type SortKey = 'title' | 'type' | 'url' | 'expires' | 'status' | 'access' | 'created'
type SortDir = 'asc' | 'desc'

const props = withDefaults(defineProps<{ tourActive?: boolean; projectId?: number | null }>(), { tourActive: false, projectId: null })

/** Demo rows shown during the guided tour when no real links exist */
const DEMO_LINKS: LinkItem[] = [
	{
		id: 'demo-1',
		type: 'download',
		title: 'Client Rough Cut v2',
		url: 'https://flow.example.com/s/abc123',
		createdAt: Date.now() - 86400e3 * 2,
		expiresAt: Date.now() + 86400e3 * 5,
		isDisabled: false,
		access_mode: 'open',
		auth_mode: 'none',
		allow_comments: true,
		shareMode: 'Review Copy',
		target: { dirRel: '/projects/rough-cut', files: [{ name: 'rough_cut_v2.mov', size: 2_400_000_000, mime: 'video/quicktime' }] },
	},
	{
		id: 'demo-2',
		type: 'upload',
		title: 'B-Roll Upload — NYC Shoot',
		url: 'https://flow.example.com/u/xyz789',
		createdAt: Date.now() - 86400e3,
		expiresAt: Date.now() + 86400e3 * 13,
		isDisabled: false,
		access_mode: 'restricted',
		auth_mode: 'none',
		allow_comments: false,
		target: { dirRel: '/projects/nyc-shoot/incoming', allowUpload: true },
	},
	{
		id: 'demo-3',
		type: 'collection',
		title: 'Final Deliverables — Season 2',
		url: 'https://flow.example.com/s/def456',
		createdAt: Date.now() - 86400e3 * 7,
		expiresAt: null,
		isDisabled: false,
		access_mode: 'open',
		auth_mode: 'password',
		passwordRequired: true,
		allow_comments: true,
		shareMode: 'Review Copy',
		proxyQualities: ['1080p', '720p'],
		target: { dirRel: '/projects/season2', files: [{ name: 'ep01_final.mp4' }, { name: 'ep02_final.mp4' }, { name: 'ep03_final.mp4' }] },
	},
]

const showingDemoData = computed(() => props.tourActive && rows.value.length === 0 && !loading.value)

const { apiFetch, baseUrl, meta } = useApi()
const { activeConnection, connections } = useConnections()

async function refresh() {
	loading.value = true
	error.value = null
	
	try {
		if (!activeConnection.value) {
			throw new Error('No active server connection')
		}
		
		const params = {
			q: q.value.trim() || undefined,
			type: typeFilter.value || undefined,
			status: statusFilter.value || undefined,
			limit: fetchLimit.value,
		}
		
		const qs = new URLSearchParams()
		if (params.q) qs.set('q', params.q)
		if (params.type) qs.set('type', params.type)
		if (params.status) qs.set('status', params.status)
		if (params.limit) qs.set('limit', String(params.limit))
		if (props.projectId) qs.set('project_id', String(props.projectId))
		
		const data = await apiFetch(`/api/links?${qs.toString()}`) as { items: LinkItem[] }
		
		// Add server metadata to each link
		const linksWithServer = (data?.items || []).map((link: LinkItem) => ({
			...link,
			_serverName: activeConnection.value!.name,
			_serverIp: activeConnection.value!.serverIp,
			_connectionId: activeConnection.value!.connectionId
		}))
		
		rows.value = linksWithServer
	} catch (e: any) {
		error.value = e?.message || String(e)
	} finally {
		loading.value = false
	}
}

const showModal = ref(false)
const showCommentsModal = ref(false)
const commentsLink = ref<LinkItem | null>(null)
const expEditor = ref<Record<string | number, { days: number; hours: number; open: boolean }>>({})
const { formatEpochMs } = useTime();
const { hour12 } = useTimeFormat();

const headingTitle = computed(() => {
	let label: string

	if (!statusFilter.value) {
		label = 'All Links'
	} else if (statusFilter.value === 'active') {
		label = 'Active Links'
	} else if (statusFilter.value === 'expired') {
		label = 'Expired Links'
	} else if (statusFilter.value === 'disabled') {
		label = 'Disabled Links'
	} else {
		label = 'All Links'
	}

	return `Currently ${label}`
})

const linkSummary = computed(() => {
	let active = 0
	let expired = 0
	let disabled = 0

	for (const it of rows.value) {
		const status = statusOf(it)
		if (status === 'active') active += 1
		else if (status === 'expired') expired += 1
		else disabled += 1
	}

	return {
		total: rows.value.length,
		active,
		expired,
		disabled,
	}
})

onMounted(refresh);

const { linkVersion } = useLinkRefreshSignal()
watch(linkVersion, () => refresh())

// Refresh when active connection changes
watch(activeConnection, () => refresh())

/* ----------- fetch/list endpoints ----------- */
async function listLinks(params: { q?: string; type?: '' | LinkType; status?: '' | Status; limit?: number; offset?: number }) {
	const qs = new URLSearchParams()
	if (params.q) qs.set('q', params.q)
	if (params.type) qs.set('type', params.type)
	if (params.status) qs.set('status', params.status)
	if (params.limit) qs.set('limit', String(params.limit))
	if (params.offset) qs.set('offset', String(params.offset))
	return apiFetch(`/api/links?${qs.toString()}`)
}

async function patchLink(linkItem: any, body: any) {
	// Use the connection that owns this link
	const connectionId = linkItem._connectionId
	const { apiFetch } = useApi(connectionId)
	return apiFetch(`/api/links/${linkItem.id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

/* ------------------- state ------------------- */
const loading = ref(false)
const error = ref<string | null>(null)
const rows = ref<LinkItem[]>([])
const q = ref('')
const typeFilter = ref<'' | LinkType>('')
const statusFilter = ref<'' | Status>('active') // match “Currently Active Links” by default
const fetchLimit = ref(200)
const pageSize = ref(10)
const currentPage = ref(1)
const sortKey = ref<SortKey>('expires')
const sortDir = ref<SortDir>('desc')

watch([q, typeFilter, statusFilter], () => {
	currentPage.value = 1
	refresh()
})
watch([sortKey, sortDir], () => {
	currentPage.value = 1
})

/* ------------------- mappers/helpers ------------------- */
function fallbackTitle(it: LinkItem) {
	if (it.type === 'upload') return it.target?.dirRel || '(Upload)'
	const n = it.target?.files?.length || (it.type === 'download' ? 1 : 0)
	if (n === 1) return it.target?.files?.[0]?.name || '1 File'
	return `${n} Files`
}

function typeLabel(t: LinkType) {
	if (t === 'upload') return 'Upload'
	if (t === 'download') return 'Review (file)'
	if (t === 'combined') return 'Review + Upload'
	return 'Review (collection)'
}

function hasShareCap(it: LinkItem) {
	const anyIt = it as any
	if (anyIt.share_enabled != null) return !!anyIt.share_enabled
	return it.type === 'download' || it.type === 'collection' || it.type === 'combined'
}

function hasUploadCap(it: LinkItem) {
	const anyIt = it as any
	if (anyIt.upload_enabled != null) return !!anyIt.upload_enabled
	return it.type === 'upload' || it.type === 'combined'
}

/* ------------------- thumbnail helpers ------------------- */
const thumbCache = ref<Record<string, string>>({})
const thumbFailed = ref<Set<string>>(new Set())

async function loadThumbnail(it: LinkItem) {
	if (!it.thumbnailUrl) return
	const key = String(it.id)
	if (thumbCache.value[key] || thumbFailed.value.has(key)) return

	try {
		// Use the link's own connection, not the active connection
		const linkConnectionId = (it as any)._connectionId
		const linkConnection = connections.find(c => c.connectionId === linkConnectionId)
		
		// Fall back to current connection if link's connection not found
		const base = linkConnection?.baseUrl || baseUrl.value || ''
		const token = linkConnection?.token || meta.value?.token
		
		const url = `${base}${it.thumbnailUrl}`
		const headers: Record<string, string> = {}
		if (token) headers['Authorization'] = `Bearer ${token}`

		const res = await fetch(url, { headers })
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const blob = await res.blob()
		thumbCache.value[key] = URL.createObjectURL(blob)
	} catch {
		thumbFailed.value.add(key)
	}
}

function thumbSrc(it: LinkItem) {
	return thumbCache.value[String(it.id)] || ''
}

function hasThumbnail(it: LinkItem) {
	const key = String(it.id)
	if (thumbFailed.value.has(key)) return false
	if (thumbCache.value[key]) return true
	if (it.thumbnailUrl) {
		loadThumbnail(it)
		return false // not loaded yet, show placeholder
	}
	return false
}

function thumbIconClass(it: LinkItem) {
	if (it.type === 'upload') return 'thumb-icon--upload'
	const firstFile = it.target?.files?.[0]
	if (!firstFile?.mime) return 'thumb-icon--file'
	if (firstFile.mime.startsWith('video/')) return 'thumb-icon--video'
	if (firstFile.mime.startsWith('image/')) return 'thumb-icon--image'
	if (firstFile.mime.startsWith('audio/')) return 'thumb-icon--audio'
	return 'thumb-icon--file'
}

function thumbIconLabel(it: LinkItem) {
	if (it.type === 'upload') return '⬆'
	const firstFile = it.target?.files?.[0]
	if (!firstFile?.mime) return '📄'
	if (firstFile.mime.startsWith('video/')) return '🎬'
	if (firstFile.mime.startsWith('image/')) return '🖼'
	if (firstFile.mime.startsWith('audio/')) return '🎵'
	return '📄'
}

function isDisabled(it: LinkItem) {
	return !!(it.isDisabled)
}

function statusOf(it: LinkItem): Status {
	if (it.isDisabled) return 'disabled'
	if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
	return 'active'
}

function statusChipClass(s: Status) {
	return s === 'active'
		? 'text-green-500'
		: s === 'expired'
			? 'text-amber-500'
			: 'text-gray-500'
}

function isRestricted(it: LinkItem) {
	return it.access_mode === 'restricted'
}

function hasOpenPassword(it: LinkItem) {
	return it.auth_mode === 'password' || !!it.passwordRequired
}

function accessLabel(it: LinkItem) {
	if (isRestricted(it)) return 'Users only'
	return hasOpenPassword(it) ? 'Password' : 'Open'
}

function accessDetail(it: LinkItem) {
	if (isRestricted(it)) return 'Users only'
	const comments = it.allow_comments ? 'Comments: on' : 'Comments: off'
	return hasOpenPassword(it) ? `Password protected • ${comments}` : `Open link • ${comments}`
}

function accessChipClass(it: LinkItem) {
	if (isRestricted(it)) return 'text-rose-400'
	return hasOpenPassword(it) ? 'text-amber-400' : 'text-emerald-400'
}

const nowMs = ref(Date.now())
setInterval(() => { nowMs.value = Date.now() }, 60_000)

function expiresLabel(it: LinkItem) {
	if (!it.expiresAt) return 'Never'
	const ms = it.expiresAt - nowMs.value
	if (ms <= 0) return 'Expired'

	// show minutes granularity:
	if (ms < 60e3) return '< 1 Minute'
	if (ms < 3600e3) {
		const m = Math.max(1, Math.floor(ms / 60e3))
		return m === 1 ? '1 Minute left' : `${m} Minutes left`
	}

	if (ms < 86400e3) {
		// round up so 59m -> 1 Hour
		const h = Math.ceil(ms / 3600e3)
		return h === 1 ? '1 Hour' : `${h} Hours`
	}

	const days = Math.floor(ms / 86400e3)
	const hours = Math.floor((ms % 86400e3) / 3600e3)
	return hours ? `${days}d ${hours}h` : (days === 1 ? '1 Day' : `${days} Days`)
}

function expiresClass(it: LinkItem) {
	if (!it.expiresAt) return ''
	const ms = it.expiresAt - Date.now()
	return ms <= 86400000 ? 'text-red-400 font-semibold' : ''
}

async function copy(txt?: string | null) {
	if (!txt) return
	await navigator.clipboard.writeText(txt)
	appLog.info('link.copied')
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000, 'clipboard-copy'))
}

/* ------------------- table actions ------------------- */
async function toggleDisable(it: LinkItem) {
	const disable = statusOf(it) !== 'disabled'
	try {
		await patchLink(it, { isDisabled: disable })
		it.isDisabled = disable
		appLog.info('link.toggled', { linkId: it.id, disabled: disable })

		// Cancel any active client-side transcodes when a link is disabled
		if (disable && window.electron?.transcodeCancelAllActive) {
			window.electron.transcodeCancelAllActive().catch(() => {})
		}

		pushNotification(
			new Notification(
				disable ? 'Link Disabled' : 'Link Enabled',
				disable
					? 'The link is now disabled and can no longer be used.'
					: 'The link is active again and can be accessed normally.',
				'success',
				8000,
			)
		)
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		const level: 'error' | 'denied' =
			/forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'

		pushNotification(
			new Notification(
				'Failed to Update Link Status',
				msg,
				level,
				8000,
			)
		)
	}
}


function viewLink(it: LinkItem) {
	const anyIt: any = it as any
	const u = anyIt.url
	if (u) window.open(u, '_blank', 'noopener,noreferrer')
}
/* ------------------- inline title edit ------------------- */
const editingId = ref<number | string | null>(null)
const editTitle = ref('')
function startEdit(it: LinkItem) {
	editingId.value = it.id
	editTitle.value = it.title || ''
}
function cancelEdit() {
	editingId.value = null
	editTitle.value = ''
}

async function saveTitle(it: LinkItem) {
	const trimmed = (editTitle.value || '').trim()

	if (!trimmed) {
		pushNotification(
			new Notification(
				'Invalid Title',
				'Title cannot be empty. Keep the previous title or enter a new one.',
				'denied',
				8000,
			)
		)
		return
	}

	try {
		await patchLink(it, { title: trimmed || null })
		it.title = trimmed || null

		pushNotification(
			new Notification(
				'Title Updated',
				'Link title was updated successfully.',
				'success',
				8000,
			)
		)
		cancelEdit()
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		const level: 'error' | 'denied' =
			/forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'

		pushNotification(
			new Notification(
				'Failed to Update Title',
				msg,
				level,
				8000,
			)
		)
	}
}


/* ------------------- details drawer ------------------- */
const current = ref<LinkItem | null>(null)

async function openDetails(it: LinkItem) {
	current.value = it
	showModal.value = true
}

async function openComments(it: LinkItem) {
	commentsLink.value = it
	showCommentsModal.value = true
	appLog.info('comments_review.opened', { linkId: it.id, linkTitle: it.title })
}

function applyLinkPatch(p: Partial<LinkItem> & { id: LinkItem['id'] }) {
	if (!p?.id) return
	// patch current
	if (current.value?.id === p.id) Object.assign(current.value, p)
	// patch list row
	const idx = rows.value.findIndex(r => r.id === p.id)
	if (idx >= 0) Object.assign(rows.value[idx], p)
	// Refresh full list to reflect capability/type changes from server
	refresh()
}

/* ------------------- filters ------------------- */
const filteredRows = computed(() => {
	return rows.value
		.filter(r => (typeFilter.value ? r.type === typeFilter.value : true))
		.filter(r => {
			const s = statusOf(r)
			return statusFilter.value ? s === statusFilter.value : true
		})
		.filter(r => {
			const needle = q.value.trim().toLowerCase()
			if (!needle) return true
			const hay =
				(r.title || '') + ' ' +
				(r.target?.dirRel || '') + ' ' +
				JSON.stringify(r.target?.files || [])
			return hay.toLowerCase().includes(needle)
		})
})

const sortedRows = computed(() => {
	const dir = sortDir.value === 'asc' ? 1 : -1
	return filteredRows.value.slice().sort((a, b) => {
		const cmp = compareByKey(a, b, sortKey.value)
		return cmp * dir
	})
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)))

const pagedRows = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value
	return sortedRows.value.slice(start, start + pageSize.value)
})

const pageStart = computed(() => {
	if (!filteredRows.value.length) return 0
	return (currentPage.value - 1) * pageSize.value + 1
})

const pageEnd = computed(() => {
	if (!sortedRows.value.length) return 0
	return Math.min(currentPage.value * pageSize.value, sortedRows.value.length)
})

watch(sortedRows, () => {
	if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})

const emptyRowCount = computed(() => {
	if (loading.value) return 0
	const visibleDataRows = pagedRows.value.length
	const emptyStateRow = filteredRows.value.length === 0 ? 1 : 0
	return Math.max(0, pageSize.value - visibleDataRows - emptyStateRow)
})

function defaultSortDirForKey(key: SortKey): SortDir {
	return key === 'expires' || key === 'created' ? 'desc' : 'asc'
}

function setSort(key: SortKey) {
	if (sortKey.value === key) {
		sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
		return
	}
	sortKey.value = key
	sortDir.value = defaultSortDirForKey(key)
}

function sortIndicator(key: SortKey) {
	if (sortKey.value !== key) return ''
	return sortDir.value === 'asc' ? '▲' : '▼'
}

function compareText(a: string, b: string) {
	return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function expirySortValue(it: LinkItem) {
	const ms = Number(it.expiresAt)
	if (!Number.isFinite(ms) || ms <= 0) return Number.POSITIVE_INFINITY // Never = longest
	const remaining = ms - nowMs.value
	if (remaining <= 0) return Number.NEGATIVE_INFINITY // Expired = shortest
	return remaining
}

function compareByKey(a: LinkItem, b: LinkItem, key: SortKey) {
	switch (key) {
		case 'title':
			return compareText(String(a.title || fallbackTitle(a) || ''), String(b.title || fallbackTitle(b) || ''))
		case 'type':
			return compareText(typeLabel(a.type), typeLabel(b.type))
		case 'url':
			return compareText(String((a as any).url || ''), String((b as any).url || ''))
		case 'expires': {
			const va = expirySortValue(a)
			const vb = expirySortValue(b)
			return va === vb ? 0 : (va < vb ? -1 : 1)
		}
		case 'status':
			return compareText(statusOf(a), statusOf(b))
		case 'access':
			return compareText(accessLabel(a), accessLabel(b))
		case 'created': {
			const va = toDateUTC(a.createdAt)?.getTime() || 0
			const vb = toDateUTC(b.createdAt)?.getTime() || 0
			return va - vb
		}
		default:
			return 0
	}
}

function prevPage() {
	if (currentPage.value > 1) currentPage.value -= 1
}

function nextPage() {
	if (currentPage.value < totalPages.value) currentPage.value += 1
}

function ensureExpEntry(it: LinkItem) {
	if (!expEditor.value[it.id]) {
		expEditor.value[it.id] = { days: 0, hours: 0, open: false }
	}
}

function openCustom(it: LinkItem) {
	ensureExpEntry(it)
	expEditor.value[it.id].open = true

	if (it.expiresAt) {
		const ms = Math.max(0, it.expiresAt - Date.now())
		let days = Math.floor(ms / 86400e3)
		let hours = Math.ceil((ms % 86400e3) / 3600e3) // round up remainder to hours

		// carry if hours rounded to 24
		if (hours >= 24) { days += 1; hours = 0 }

		// if there's any time left but < 1h, show 1 hour
		if (days === 0 && hours === 0 && ms > 0) hours = 1

		expEditor.value[it.id].days = days
		expEditor.value[it.id].hours = hours
	} else {
		expEditor.value[it.id].days = 0
		expEditor.value[it.id].hours = 0
	}
}


function closeCustom(it: LinkItem) {
	if (!expEditor.value[it.id]) return
	expEditor.value[it.id].open = false
}

async function applyCustom(it: LinkItem, opts?: { forceNever?: boolean }) {
	ensureExpEntry(it)

	let { days, hours } = expEditor.value[it.id]

	// If this was triggered by the Never button, override to 0/0
	if (opts?.forceNever) {
		days = 0
		hours = 0
	}

	days = Number.isFinite(days) ? Number(days) : 0
	hours = Number.isFinite(hours) ? Number(hours) : 0

	const totalHours = days * 24 + hours
	const isNever = opts?.forceNever || totalHours <= 0

	const baseMs = nowMs.value
	const newExp = isNever ? null : baseMs + totalHours * 3600e3

	try {
		await patchLink(it, { expiresAtMs: newExp })
		it.expiresAt = newExp

		// keep the editor in sync
		ensureExpEntry(it)
		expEditor.value[it.id].days = days
		expEditor.value[it.id].hours = hours

		closeCustom(it)

		if (isNever) {
			pushNotification(
				new Notification(
					'Expiry Cleared',
					'This link will no longer expire automatically.',
					'success',
					8000,
				),
			)
		} else {
			pushNotification(
				new Notification(
					'Expiry Updated',
					`Expiry updated to ${days} day${days === 1 ? '' : 's'} and ${hours} hour${hours === 1 ? '' : 's'}.`,
					'success',
					8000,
				),
			)
		}
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		const level: 'error' | 'denied' =
			/forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'

		const title = isNever ? 'Failed to Clear Expiry' : 'Failed to Update Expiry'

		pushNotification(
			new Notification(
				title,
				msg,
				level,
				8000,
			),
		)
	}
}

async function makeNever(it: LinkItem) {
	// reuse applyCustom, but keep Never-specific messages
	await applyCustom(it, { forceNever: true })
}


function toDateUTC(ts: unknown): Date | null {
	if (ts == null) return null;

	if (ts instanceof Date) return Number.isFinite(ts.getTime()) ? ts : null;

	if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+$/.test(ts.trim()))) {
		const n = Number(ts);
		const ms = n < 1e12 ? n * 1000 : n; // seconds → ms
		const d = new Date(ms);
		return Number.isFinite(d.getTime()) ? d : null;
	}

	const s = String(ts).trim();

	// If it's already ISO with timezone, just parse it
	if (/[zZ]$|[+\-]\d{2}:\d{2}$/.test(s)) return new Date(s);

	// If it looks like "YYYY-MM-DD HH:mm:ss" from SQLite, treat as UTC
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
		return new Date(s.replace(' ', 'T') + 'Z');
	}

	// Fallback attempt
	const d = new Date(s);
	return Number.isFinite(d.getTime()) ? d : null;
}

const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatLocal(ts: unknown, opts: Intl.DateTimeFormatOptions) {
	const d = toDateUTC(ts);
	if (!d) return '—';
	const merged = { timeZone: userTZ, ...opts };
	if (opts.timeStyle) merged.hour12 = hour12.value;
	return new Intl.DateTimeFormat(undefined, merged).format(d);
}

</script>

<style scoped>
.manage-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.7rem;
	padding: 0.55rem 0.4rem 0.75rem;
}

.manage-heading h3 {
	font-size: 1.06rem;
	font-weight: 700;
	line-height: 1.2;
}

.manage-heading p {
	margin-top: 0.14rem;
	font-size: 0.8rem;
}

.manage-metrics {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.manage-surface {
	border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 28%, #50505e);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, white 3%, transparent);
}

.manage-toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	margin-bottom: 0.75rem;
}

.manage-table-wrap {
	border-radius: 0.72rem;
	border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 22%, #4a4b57);
	background:
		var(--btn-primary-fill) top / 100% 2.6rem no-repeat,
		color-mix(in srgb, black 24%, transparent);
	position: relative;
}

.manage-table {
	width: 100%;
	min-width: 1180px;
	table-layout: fixed;
	border-spacing: 0;
	margin: 0;
}

.manage-table-wrap thead tr {
	position: sticky;
	top: 0;
	z-index: 2;
	backdrop-filter: blur(6px);
}

.manage-table-head-row {
	background: var(--btn-primary-fill);
	color: #ffffff;
}

.manage-table-head-row button {
	color: inherit;
}

.manage-table-head-row > th {
	border-top: 0;
}

.manage-table-head-row > th:first-child {
	border-left: 0;
}

.manage-table-head-row > th:last-child {
	border-right: 0;
}

@media (max-width: 980px) {
	.manage-header {
		padding-top: 0.25rem;
	}
}

/* ── Thumbnail cells ──────────────────────────────── */
.thumb-cell {
	width: 64px;
	height: 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	overflow: hidden;
	background: color-mix(in srgb, var(--btn-primary-bg) 12%, transparent);
}

.thumb-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	border-radius: 4px;
}

.thumb-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 14px;
	opacity: 0.7;
	border-radius: 4px;
}

.thumb-icon--video {
	background: color-mix(in srgb, #10b981 18%, transparent);
}

.thumb-icon--image {
	background: color-mix(in srgb, #6366f1 18%, transparent);
}

.thumb-icon--audio {
	background: color-mix(in srgb, #f59e0b 18%, transparent);
}

.thumb-icon--upload {
	background: color-mix(in srgb, #3b82f6 18%, transparent);
}

.thumb-icon--file {
	background: color-mix(in srgb, #6b7280 18%, transparent);
}

.thumb-col {
	width: 76px;
}

.thumb-td {
	width: 76px;
	min-width: 76px;
	max-width: 76px;
}
</style>
