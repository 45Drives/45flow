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
				<span class="ss-chip ss-chip--danger">Disabled {{ linkSummary.disabled }}</span>
				<span v-if="linkSummary.archived" class="ss-chip ss-chip--muted">
					Archived {{ linkSummary.archived }}
				</span>
			</div>
		</div>

		<div class="manage-surface p-2 bg-well rounded-md min-w-0 flex flex-col relative">
			<Transition enter-active-class="transition-all duration-200 ease-out"
				enter-from-class="opacity-0 -translate-y-2" enter-to-class="opacity-100 translate-y-0"
				leave-active-class="transition-all duration-150 ease-in"
				leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-2">
				<div v-if="selectedIds.size > 0" class="bulk-actions-bar">
					<div class="bulk-actions-count">
						<span>{{ selectedIds.size }} selected</span>
					</div>

					<div class="bulk-actions-buttons">
						<button v-if="selectionHasDisabled" class="btn btn-success bulk-action-btn" @click="bulkEnable">
							Enable
						</button>

						<button v-if="selectionHasEnabled" class="btn btn-danger bulk-action-btn" @click="bulkDisable">
							Disable
						</button>

						<button class="btn btn-primary bulk-action-btn" @click="bulkEditExpiry">
							Edit Expiry
						</button>

						<button class="btn btn-primary bulk-action-btn" @click="openBulkMoveToProject">
							Move to Project
						</button>

						<button class="btn btn-warning bulk-action-btn" @click="bulkArchive">
							Archive
						</button>

						<button class="btn btn-delete bulk-action-btn" @click="bulkDeleteOpen = true">
							Delete
						</button>

						<button class="btn btn-secondary bulk-action-btn bulk-action-clear" @click="clearSelection">
							Clear
						</button>
					</div>
				</div>
			</Transition>

			<div data-tour="manage-links-toolbar" class="manage-toolbar">
				<input v-model="q" type="search" placeholder="Search title, directory, file..."
					class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-default manage-search-input" />

				<select v-model="typeFilter"
					class="px-3 py-2 border border-default rounded-lg bg-default manage-filter-select">
					<option value="">All types</option>
					<option value="upload">Upload</option>
					<option value="review">Review</option>
					<option value="combined">Review + Upload</option>
				</select>

				<select v-model="statusFilter"
					class="px-3 py-2 border border-default rounded-lg bg-default manage-filter-select">
					<option value="">All status</option>
					<option value="active">Active</option>
					<option value="expired">Expired</option>
					<option value="disabled">Disabled</option>
				</select>

				<label class="flex items-center gap-1.5 cursor-pointer select-none">
					<input type="checkbox" v-model="showArchived" class="styled-checkbox" />
					<span class="text-xs text-muted whitespace-nowrap">Show Archived</span>
				</label>

				<button class="btn btn-secondary px-4 py-2 manage-refresh-btn" @click="refresh" :disabled="loading">
					{{ loading ? 'Refreshing...' : 'Refresh' }}
				</button>
			</div>

			<div v-if="error"
				class="p-3 rounded bg-red-900/30 text-default border border-red-800 mb-3 text-center items-center justify-self-center">
				{{ error }}
			</div>

			<div data-tour="manage-links-table"
				class="manage-table-wrap overflow-x-auto min-w-0 overscroll-x-contain touch-pan-x">

				<table class="manage-table text-sm border-collapse">
					<colgroup>
						<col class="select-col" />
						<col class="thumb-col" />
						<col class="title-col" />
						<col class="type-col" />
						<col class="link-col" />
						<col class="expires-col" />
						<col class="status-col" />
						<col class="access-col" />
						<col class="created-col" />
						<col class="server-col" />
						<col class="actions-col" />
					</colgroup>

					<thead>
						<tr class="manage-table-head-row border-b border-default">
							<th class="p-1 border border-default select-cell cursor-pointer" @click="toggleSelectAll">
								<input type="checkbox" class="input-checkbox pointer-events-none" :checked="allPageSelected"
									:indeterminate="somePageSelected && !allPageSelected" />
							</th>

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
							<td colspan="11" class="p-0 border border-default">
								<div class="w-full min-h-[140px] flex items-center justify-center">
									<div
										class="flex items-center gap-3 px-4 py-3 rounded-lg bg-default/60 border border-default shadow-sm">
										<span
											class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										<div class="flex flex-col leading-tight">
											<div class="text-sm font-semibold text-default">Loading links</div>
											<div class="text-xs text-muted">Fetching latest data...</div>
										</div>
									</div>
								</div>
							</td>
						</tr>

						<tr v-else-if="filteredRows.length === 0 && !showingDemoData">
							<td colspan="11"
								class="px-2 py-4 text-center text-default font-bold border border-default align-middle whitespace-nowrap">
								No links found.
							</td>
						</tr>

						<tr v-else-if="showingDemoData" v-for="it in DEMO_LINKS" :key="'demo-' + it.id" data-tour-demo
							class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default h-12 opacity-80">
							<td class="p-1 border border-default align-middle text-center select-cell">
								<input type="checkbox" class="input-checkbox" disabled />
							</td>

							<td class="p-1 border border-default align-middle thumb-td">
								<div class="thumb-cell">
									<div class="thumb-placeholder" :class="thumbIconClass(it)">
										<component :is="thumbIconComponent(it)" class="w-5 h-5" />
									</div>
								</div>
							</td>

							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center justify-between gap-2">
									<span class="font-medium block truncate title-text">
										{{ it.title || fallbackTitle(it) }}
									</span>
									<span data-tour="manage-links-edit-title" class="text-xs text-blue-500 shrink-0">
										Edit Title
									</span>
								</div>
							</td>

							<td class="p-1.5 border border-default align-middle whitespace-nowrap">
								<div class="capability-stack">
									<span class="capability-pill"
										:class="hasShareCap(it) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-well/50 text-muted/40'">
										Review
									</span>
									<span class="capability-pill"
										:class="hasUploadCap(it) ? 'bg-blue-500/20 text-blue-400' : 'bg-well/50 text-muted/40'">
										Upload
									</span>
								</div>
							</td>

							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center gap-2 justify-between">
									<span class="block truncate link-text">{{ it.url }}</span>
									<span data-tour="manage-links-copy"
										class="text-blue-500 text-xs shrink-0">Copy</span>
								</div>
							</td>

							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center gap-2">
									<div class="truncate" :class="expiresClass(it)">{{ expiresLabel(it) }}</div>
									<span data-tour="manage-links-edit-expiry"
										class="btn btn-primary table-mini-btn ml-auto">Edit</span>
								</div>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="status-chip bg-default dark:bg-well/75"
									:class="statusChipClass(statusOf(it))">
									{{ statusOf(it).toUpperCase() }}
								</span>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="status-chip bg-default dark:bg-well/75" :class="accessChipClass(it)">
									{{ accessLabel(it) }}
								</span>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col leading-tight">
									<div>{{ formatLocal(it.createdAt, { dateStyle: 'medium' }) }}</div>
									<div class="text-xs text-muted">{{ formatLocal(it.createdAt, { timeStyle: 'short' })
										}}</div>
								</div>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="text-xs text-muted">Demo Server</span>
							</td>

							<td data-tour="manage-links-actions"
								class="p-1.5 border border-default align-middle actions-cell">
								<div class="actions-grid">
									<span class="btn btn-secondary table-action-btn">Details</span>
									<span class="btn btn-primary table-action-btn">Open</span>
									<span class="btn btn-danger table-action-btn">Disable</span>
								</div>
							</td>
						</tr>

						<tr v-for="it in pagedRows" :key="'link-' + it.id" v-else
							class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default h-12"
							:class="{ 'bg-blue-500/10': selectedIds.has(it.id), 'opacity-50': it.archived }">
							<td class="p-1 border border-default align-middle text-center select-cell cursor-pointer" @click="toggleSelect(it)">
								<input type="checkbox" class="input-checkbox pointer-events-none" :checked="selectedIds.has(it.id)" />
							</td>

							<td class="p-1 border border-default align-middle thumb-td">
								<div class="thumb-cell">
									<img v-if="hasThumbnail(it)" :src="thumbSrc(it)" class="thumb-img" />
									<div v-else class="thumb-placeholder" :class="thumbIconClass(it)">
										<component :is="thumbIconComponent(it)" class="w-5 h-5" />
									</div>
								</div>
							</td>

							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div v-if="editingId !== it.id" class="min-w-0 flex items-center justify-between gap-2">
									<span :title="it.title || fallbackTitle(it)"
										class="font-medium cursor-pointer hover:underline block truncate title-text"
										@click="openDetails(it)">
										{{ it.title || fallbackTitle(it) }}
									</span>

									<button class="text-xs text-blue-500 hover:underline shrink-0"
										@click="startEdit(it)">
										Edit Title
									</button>
								</div>

								<div v-else class="title-edit-row">
									<input v-model="editTitle" class="input-textlike title-edit-input" />
									<button class="btn btn-secondary table-mini-btn"
										@click="saveTitle(it)">Save</button>
									<button class="btn btn-danger table-mini-btn" @click="cancelEdit">Cancel</button>
								</div>
							</td>

							<td class="p-1.5 border border-default align-middle whitespace-nowrap">
								<div class="capability-stack">
									<span class="capability-pill"
										:class="hasShareCap(it) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-well/50 text-muted/40'">
										Review
									</span>
									<span class="capability-pill"
										:class="hasUploadCap(it) ? 'bg-blue-500/20 text-blue-400' : 'bg-well/50 text-muted/40'">
										Upload
									</span>
								</div>
							</td>

							<td class="p-2 border border-default align-middle overflow-hidden min-w-0">
								<div class="min-w-0 flex items-center gap-2 justify-between">
									<a :href="it.url" target="_blank" rel="noopener" :title="it.url"
										class="hover:underline block truncate link-text">
										{{ it.url }}
									</a>

									<button class="text-blue-500 hover:underline text-xs shrink-0"
										@click="copy(it.url)">
										Copy
									</button>
								</div>
							</td>

							<!-- Expires -->
							<td class="p-2 border border-default align-middle overflow-hidden min-w-0 expires-cell">
								<div v-if="!expEditor[it.id]?.open" class="min-w-0 flex items-center gap-2">
									<div class="truncate" :class="expiresClass(it)">
										{{ expiresLabel(it) }}
									</div>

									<button class="btn btn-primary table-mini-btn ml-auto" @click="openCustom(it)">
										Edit
									</button>
								</div>

								<div v-else class="expiry-editor">
									<div class="expiry-fields-stack">
										<label class="expiry-field-row">
											<span>Days</span>
											<input type="number" min="0" class="input-textlike expiry-input"
												v-model.number="expEditor[it.id].days" />
										</label>

										<label class="expiry-field-row">
											<span>Hours</span>
											<input type="number" min="0" class="input-textlike expiry-input"
												v-model.number="expEditor[it.id].hours" />
										</label>
									</div>

									<button class="btn btn-primary expiry-wide-btn" @click="makeNever(it)">
										Never
									</button>

									<div class="expiry-action-row">
										<button class="btn btn-success expiry-action-btn" @click="applyCustom(it)">
											Apply
										</button>

										<button class="btn btn-danger expiry-action-btn" @click="closeCustom(it)">
											Cancel
										</button>
									</div>
								</div>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex items-center gap-1.5">
									<span class="status-chip bg-default dark:bg-well/75"
										:class="statusChipClass(statusOf(it))">
										{{ statusOf(it) === 'archived' ? (it.expiresAt && it.expiresAt <= Date.now() ? 'EXPIRED' : (it.isDisabled ? 'DISABLED' : 'ACTIVE')) : statusOf(it).toUpperCase() }}
									</span>
									<span v-if="it.archived" class="ss-chip ss-chip--muted text-xs shrink-0">ARCHIVED</span>
								</div>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<span class="status-chip bg-default dark:bg-well/75" :class="accessChipClass(it)"
									:title="accessDetail(it)">
									{{ accessLabel(it) }}
								</span>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col leading-tight">
									<div>{{ formatLocal(it.createdAt, { dateStyle: 'medium' }) }}</div>
									<div class="text-xs text-muted">{{ formatLocal(it.createdAt, { timeStyle: 'short' })
										}}</div>
								</div>
							</td>

							<td class="p-2 border border-default align-middle whitespace-nowrap">
								<div class="flex flex-col leading-tight min-w-0">
									<div class="text-xs font-medium truncate"
										:title="(it as any)._serverName || 'Unknown'">
										{{ (it as any)._serverName || 'Unknown' }}
									</div>
									<div class="text-xs text-muted truncate" :title="(it as any)._serverIp || ''">
										{{ (it as any)._serverIp || '' }}
									</div>
								</div>
							</td>

							<td class="p-1.5 border border-default align-middle actions-cell">
								<div class="actions-grid">
									<button class="btn btn-secondary table-action-btn" @click="openDetails(it)">
										Details
									</button>

									<button :disabled="isDisabled(it)" class="btn btn-primary table-action-btn"
										@click="viewLink(it)">
										Open
									</button>

									<button class="btn table-action-btn"
										:class="statusOf(it) === 'disabled' ? 'btn-success' : 'btn-danger'"
										@click="toggleDisable(it)">
										{{ statusOf(it) === 'disabled' ? 'Enable' : 'Disable' }}
									</button>

									<button class="btn table-action-btn" :class="it.archived ? 'btn-success' : 'btn-warning'" @click="toggleArchive(it)">
										{{ it.archived ? 'Unarchive' : 'Archive' }}
									</button>

									<button class="btn btn-delete table-action-btn actions-delete-btn"
										@click="confirmDelete(it)">
										Delete
									</button>
								</div>
							</td>
						</tr>

						<tr v-for="n in emptyRowCount" :key="`empty-${n}`" class="h-12">
							<td colspan="11" class="p-0 bg-well">&nbsp;</td>
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

	<LinkDetailsModal v-model="showModal" :link="current" :apiFetch="apiFetch" @updated="applyLinkPatch" @requestDelete="onRequestDeleteFromDetails" />

	<Teleport to="body">
		<div v-if="linkToDelete" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
			@click.self="cancelDelete">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto text-default bg-accent">
				<div class="flex items-center gap-2 mb-3">
					<span class="text-red-500 dark:text-red-400 text-xl">!</span>
					<h3 class="text-lg font-semibold text-red-600 dark:text-red-400">Permanently Delete Link</h3>
				</div>

				<div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 mb-4">
					<p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
						This action is irreversible and will permanently destroy:
					</p>
					<ul class="text-sm text-red-600 dark:text-red-300/80 list-disc list-inside space-y-1">
						<li>The share/upload link, which will no longer be accessible to anyone</li>
						<li>All activity history and access logs</li>
						<li>All user access permissions</li>
					</ul>
				</div>

				<p class="text-sm text-default mb-3">
					Deleting <strong>{{ linkToDelete?.title || 'Untitled' }}</strong>
				</p>

				<div class="border border-default rounded-lg p-3 mb-4 space-y-3">
					<p class="text-sm font-medium">Optional: Clean up associated files</p>

					<div v-if="deletePreviewLoading" class="text-xs text-default flex items-center gap-2">
						<span
							class="inline-block w-3 h-3 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
						Loading file info...
					</div>

					<template v-if="deletePreview && !deletePreviewLoading">
						<div class="text-xs text-default space-y-1">
							<p>{{ deletePreview.summary.totalFiles }} file(s) associated with this link</p>
							<p v-if="deletePreview.summary.sharedFiles > 0" class="text-amber-600 dark:text-amber-400">
								{{ deletePreview.summary.sharedFiles }} file(s) shared with other links and will be kept
							</p>
						</div>

						<label class="flex items-start gap-2 cursor-pointer select-none">
							<input type="checkbox" v-model="deleteGeneratedFiles" class="styled-checkbox mt-0.5" />
							<div>
								<span class="text-sm">Delete generated files</span>
								<p class="text-xs text-default">
									Transcodes, proxy videos, HLS streams, watermarked images
									({{ formatBytes(deletePreview.summary.totalGeneratedBytes) }})
								</p>
								<p v-if="deletePreview.summary.totalGeneratedBytes > 0" class="text-xs text-green-600 dark:text-green-400">
									Frees up {{ formatBytes(deletePreview.summary.totalGeneratedBytes) }} of disk space
								</p>
							</div>
						</label>

						<label class="flex items-start gap-2 cursor-pointer select-none">
							<input type="checkbox" v-model="deleteOriginalFiles" class="styled-checkbox mt-0.5" />
							<div>
								<span class="text-sm text-red-600 dark:text-red-400 font-medium">Delete original source files</span>
								<p class="text-xs text-red-500 dark:text-red-300/80">
									The actual media files on disk. Cannot be recovered.
									({{ formatBytes(deletePreview.summary.totalOriginalBytes) }})
								</p>
							</div>
						</label>

						<div v-if="deleteOriginalFiles" class="p-2 rounded bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
							<p class="text-xs text-red-700 dark:text-red-300 font-medium">
								Danger: this will permanently delete the original files from disk.
							</p>
							<p class="text-xs text-red-600 dark:text-red-200/70 mt-1">
								These are your source media files. Once deleted, they cannot be recovered unless you
								have a separate backup.
							</p>

							<div v-if="deletePreview.files.filter((f: any) => !f.sharedWithOtherLinks).length > 0"
								class="mt-2 max-h-24 overflow-y-auto">
								<p class="text-xs text-default mb-1">Files that will be deleted:</p>
								<ul class="text-xs text-red-600 dark:text-red-200/70 list-disc list-inside">
									<li v-for="f in deletePreview.files.filter((f: any) => !f.sharedWithOtherLinks)"
										:key="f.id" class="truncate">
										{{ f.relPath }} ({{ formatBytes(f.originalBytes) }})
									</li>
								</ul>
							</div>
						</div>
					</template>
				</div>

				<template v-if="deleteGeneratedFiles || deleteOriginalFiles">
					<label class="block text-sm text-default mb-1">
						Type <strong class="text-red-600 dark:text-red-400">DELETE</strong> to confirm:
					</label>

					<input v-model="deleteLinkConfirmText" type="text"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-default mb-4"
						placeholder="DELETE" autocomplete="off" />
				</template>

				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="cancelDelete">
						Cancel
					</button>
					<button
						class="btn btn-delete px-4 py-2"
						:disabled="(deleteGeneratedFiles || deleteOriginalFiles) && deleteLinkConfirmText !== 'DELETE'" @click="deleteLink">
						Delete Permanently
					</button>
				</div>
			</div>
		</div>
	</Teleport>

	<Teleport to="body">
		<div v-if="bulkExpiryOpen" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
			@click.self="cancelBulkExpiry">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 bg-accent text-default">
				<h3 class="text-lg font-semibold mb-4 text-default">Set Expiry for {{ selectedIds.size }} Links</h3>

				<div class="flex flex-col gap-3 mb-4">
					<label class="flex items-center gap-2 text-default">
						<span class="text-sm w-12">Days</span>
						<input type="number" min="0" v-model.number="bulkExpiryDays"
							class="input-textlike px-3 py-2 w-24" />
					</label>

					<label class="flex items-center gap-2 text-default">
						<span class="text-sm w-12">Hours</span>
						<input type="number" min="0" max="23" v-model.number="bulkExpiryHours"
							class="input-textlike px-3 py-2 w-24" />
					</label>

					<p class="text-xs text-muted">Sets expiry to the specified duration from now.</p>
				</div>

				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="cancelBulkExpiry">Cancel</button>
					<button class="btn btn-primary px-4 py-2" @click="applyBulkExpiry({ never: true })">Never</button>
					<button class="btn btn-primary px-4 py-2" @click="applyBulkExpiry()">Apply</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Bulk Delete Confirmation Modal -->
	<Teleport to="body">
		<div v-if="bulkDeleteOpen" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
			@click.self="cancelBulkDelete">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-accent text-default">
				<div class="flex items-center gap-2 mb-3">
					<span class="text-red-500 dark:text-red-400 text-xl">!</span>
					<h3 class="text-lg font-semibold text-red-600 dark:text-red-400">Delete {{ selectedIds.size }} Links</h3>
				</div>

				<div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 mb-4">
					<p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
						This action is irreversible and will permanently destroy:
					</p>
					<ul class="text-sm text-red-600 dark:text-red-300/80 list-disc list-inside space-y-1">
						<li>All {{ selectedIds.size }} selected links</li>
						<li>All activity history and access logs for each link</li>
						<li>All user access permissions</li>
					</ul>
				</div>

				<div class="border border-default rounded-lg p-3 mb-4 space-y-3">
					<p class="text-sm font-medium">Optional: Clean up associated files</p>

					<label class="flex items-start gap-2 cursor-pointer select-none">
						<input type="checkbox" v-model="bulkDeleteGenerated" class="styled-checkbox mt-0.5" />
						<div>
							<span class="text-sm">Delete generated files</span>
							<p class="text-xs text-default">Transcodes, proxy videos, HLS streams, watermarked images</p>
						</div>
					</label>

					<label class="flex items-start gap-2 cursor-pointer select-none">
						<input type="checkbox" v-model="bulkDeleteOriginals" class="styled-checkbox mt-0.5" />
						<div>
							<span class="text-sm text-red-600 dark:text-red-400 font-medium">Delete original source files</span>
							<p class="text-xs text-red-500 dark:text-red-300/80">
								The actual media files on disk. Cannot be recovered.
							</p>
						</div>
					</label>

					<div v-if="bulkDeleteOriginals" class="p-2 rounded bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
						<p class="text-xs text-red-700 dark:text-red-300 font-medium">
							Danger: original source files will be permanently deleted for each link where they are not shared with other links.
						</p>
					</div>
				</div>

				<template v-if="bulkDeleteGenerated || bulkDeleteOriginals">
					<label class="block text-sm text-default mb-1">
						Type <strong class="text-red-600 dark:text-red-400">DELETE</strong> to confirm:
					</label>
					<input v-model="bulkDeleteConfirmText" type="text"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-default mb-4"
						placeholder="DELETE" autocomplete="off" />
				</template>

				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="cancelBulkDelete">Cancel</button>
					<button class="btn btn-delete px-4 py-2"
						:disabled="(bulkDeleteGenerated || bulkDeleteOriginals) && bulkDeleteConfirmText !== 'DELETE'"
						@click="executeBulkDelete">
						Delete {{ selectedIds.size }} Links
					</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Bulk Move to Project Modal -->
	<Teleport to="body">
		<div v-if="bulkMoveProjectOpen" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
			@click.self="cancelBulkMoveProject">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 bg-accent text-default">
				<h3 class="text-lg font-semibold mb-4 text-default">Move {{ selectedIds.size }} Link{{ selectedIds.size !== 1 ? 's' : '' }} to Project</h3>

				<div v-if="bulkMoveProjectsLoading" class="flex items-center gap-2 text-sm text-muted mb-4">
					<span class="inline-block w-3 h-3 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
					Loading projects...
				</div>

				<template v-else>
					<select v-model="bulkMoveTargetProjectId"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-default bg-default mb-4">
						<option :value="null">— Unassigned —</option>
						<option v-for="proj in bulkMoveProjects" :key="proj.id" :value="proj.id">{{ proj.name }}</option>
					</select>
				</template>

				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="cancelBulkMoveProject">Cancel</button>
					<button class="btn btn-primary px-4 py-2"
						:disabled="bulkMoveProjectsLoading"
						@click="executeBulkMoveProject">
						Move
					</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Single Link Archive Confirmation Modal -->
	<Teleport to="body">
		<div v-if="linkToArchive" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
			@click.self="linkToArchive = null">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 text-default bg-accent">
				<h3 class="text-lg font-semibold mb-2 text-orange-600 dark:text-orange-400">Archive Link</h3>
				<div class="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 mb-4">
					<p class="text-sm text-orange-700 dark:text-orange-300 font-medium mb-2">This will deactivate and hide the link:</p>
					<ul class="text-sm text-orange-600 dark:text-orange-300/80 list-disc list-inside space-y-1">
						<li>The link will be disabled immediately and no longer accessible</li>
						<li>It will be hidden from the default view</li>
						<li>No files are deleted</li>
						<li>You can unarchive the link at any time to restore it</li>
					</ul>
				</div>
				<p class="text-sm text-default mb-4">Archive <strong>{{ linkToArchive?.title || 'Untitled' }}</strong>?</p>
				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="linkToArchive = null">Cancel</button>
					<button class="btn btn-warning px-4 py-2" @click="executeArchiveLink">Archive</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Bulk Archive Confirmation Modal -->
	<Teleport to="body">
		<div v-if="bulkArchiveOpen" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
			@click.self="bulkArchiveOpen = false">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 text-default bg-accent">
				<h3 class="text-lg font-semibold mb-2 text-orange-600 dark:text-orange-400">Archive {{ selectedIds.size }} Links</h3>
				<div class="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 mb-4">
					<p class="text-sm text-orange-700 dark:text-orange-300 font-medium mb-2">This will deactivate and hide the selected links:</p>
					<ul class="text-sm text-orange-600 dark:text-orange-300/80 list-disc list-inside space-y-1">
						<li>All {{ selectedIds.size }} links will be disabled immediately</li>
						<li>They will be hidden from the default view</li>
						<li>No files are deleted</li>
						<li>You can unarchive them at any time to restore access</li>
					</ul>
				</div>
				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="bulkArchiveOpen = false">Cancel</button>
					<button class="btn btn-warning px-4 py-2" @click="executeBulkArchive">Archive {{ selectedIds.size }} Links</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>
	
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApi, apiFetchAll } from '../composables/useApi'
import { useConnections } from '../composables/useConnections'
import { useServerFilter } from '../composables/useServerFilter'
import { useLinkRefreshSignal } from '../composables/useLinkRefresh'
import { Notification } from '@45drives/houston-common-ui'
import { pushNotification } from '../composables/useNotificationQueue'
import { appLog } from '../composables/useLog'
import LinkDetailsModal from "../components/modals/LinkDetailsModal.vue"
import type { LinkItem, LinkType, Status } from '../typings/electron'
import { useTime } from '../composables/useTime'
import { useTimeFormat } from '../composables/useTimeFormat'
import { useLinkListDefault } from '../composables/useLinkListDefault'
import { FilmIcon, PhotoIcon, MusicalNoteIcon, ArrowUpTrayIcon, DocumentIcon } from '@heroicons/vue/24/outline'
type SortKey = 'title' | 'type' | 'url' | 'expires' | 'status' | 'access' | 'created'
type SortDir = 'asc' | 'desc'

const props = withDefaults(defineProps<{ tourActive?: boolean; projectId?: number | string | null }>(), { tourActive: false, projectId: null })

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
const { selectedFilter, filteredConnections } = useServerFilter()

async function refresh() {
	loading.value = true
	error.value = null
	
	try {
		const qs = new URLSearchParams()
		const trimQ = q.value.trim()
		if (trimQ) qs.set('q', trimQ)
		if (typeFilter.value && typeFilter.value !== 'review') qs.set('type', typeFilter.value)
		if (statusFilter.value) qs.set('status', statusFilter.value)
		if (showArchived.value) qs.set('includeArchived', '1')
		if (fetchLimit.value) qs.set('limit', String(fetchLimit.value))
		if (props.projectId) qs.set('project_id', String(props.projectId))

		const path = `/api/links?${qs.toString()}`

		// Multi-server fetch when filter is 'all', multiple servers connected, and not in a specific project
		if (selectedFilter.value === 'all' && filteredConnections.value.length > 1 && !props.projectId) {
			const results = await apiFetchAll<{ items: LinkItem[] }>(filteredConnections.value, path)
			const allLinks: LinkItem[] = []
			for (const r of results) {
				if (r.success && r.data?.items) {
					for (const link of r.data.items) {
						allLinks.push({
							...link,
							_serverName: r.serverName,
							_serverIp: r.serverIp,
							_connectionId: r.connectionId,
						} as any)
					}
				}
			}
			rows.value = allLinks
		} else {
			// Single-server fetch (active connection)
			if (!activeConnection.value) {
				throw new Error('No active server connection')
			}
			const data = await apiFetch(path) as { items: LinkItem[] }
			rows.value = (data?.items || []).map((link: LinkItem) => ({
				...link,
				_serverName: activeConnection.value!.name,
				_serverIp: activeConnection.value!.serverIp,
				_connectionId: activeConnection.value!.connectionId
			}))
		}
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
	let archived = 0

	for (const it of rows.value) {
		const status = statusOf(it)
		if (status === 'active') active += 1
		else if (status === 'expired') expired += 1
		else if (status === 'archived') archived += 1
		else disabled += 1
	}

	return {
		total: rows.value.length,
		active,
		expired,
		disabled,
		archived,
	}
})

onMounted(refresh);

const { linkVersion } = useLinkRefreshSignal()
watch(linkVersion, () => refresh())

// Refresh when active connection or server filter changes
watch(activeConnection, () => refresh())
watch(selectedFilter, () => refresh())

/* ------------------- multi-select ------------------- */
const selectedIds = ref<Set<string | number>>(new Set())

const allPageSelected = computed(() => {
	if (pagedRows.value.length === 0) return false
	return pagedRows.value.every(r => selectedIds.value.has(r.id))
})

const somePageSelected = computed(() => {
	return pagedRows.value.some(r => selectedIds.value.has(r.id))
})

function toggleSelect(it: LinkItem) {
	const s = new Set(selectedIds.value)
	if (s.has(it.id)) s.delete(it.id)
	else s.add(it.id)
	selectedIds.value = s
}

function toggleSelectAll() {
	if (allPageSelected.value) {
		// Deselect all on current page
		const s = new Set(selectedIds.value)
		for (const r of pagedRows.value) s.delete(r.id)
		selectedIds.value = s
	} else {
		// Select all on current page
		const s = new Set(selectedIds.value)
		for (const r of pagedRows.value) s.add(r.id)
		selectedIds.value = s
	}
}

function clearSelection() {
	selectedIds.value = new Set()
}

function getSelectedLinks(): LinkItem[] {
	return rows.value.filter(r => selectedIds.value.has(r.id))
}

const selectionHasDisabled = computed(() => getSelectedLinks().some(l => l.isDisabled))
const selectionHasEnabled = computed(() => getSelectedLinks().some(l => !l.isDisabled))

async function bulkEnable() {
	const links = getSelectedLinks()
	let success = 0
	let failed = 0
	for (const link of links) {
		try {
			await patchLink(link, { isDisabled: false })
			link.isDisabled = false
			success++
		} catch { failed++ }
	}
	clearSelection()
	pushNotification(new Notification(
		'Bulk Enable',
		`${success} link${success !== 1 ? 's' : ''} enabled${failed ? `, ${failed} failed` : ''}.`,
		failed ? 'warning' : 'success',
		8000,
	))
}

async function bulkDisable() {
	const links = getSelectedLinks()
	let success = 0
	let failed = 0
	for (const link of links) {
		try {
			await patchLink(link, { isDisabled: true })
			link.isDisabled = true
			success++
		} catch { failed++ }
	}
	clearSelection()
	pushNotification(new Notification(
		'Bulk Disable',
		`${success} link${success !== 1 ? 's' : ''} disabled${failed ? `, ${failed} failed` : ''}.`,
		failed ? 'warning' : 'success',
		8000,
	))
}

async function bulkArchive() {
	bulkArchiveOpen.value = true
}

async function executeBulkArchive() {
	bulkArchiveOpen.value = false
	const links = getSelectedLinks()
	let success = 0
	let failed = 0
	for (const link of links) {
		try {
			await apiFetch(`/api/links/${link.id}/archive`, { method: 'POST' })
			link.archived = true
			link.isDisabled = true
			success++
		} catch { failed++ }
	}
	clearSelection()
	pushNotification(new Notification(
		'Bulk Archive',
		`${success} link${success !== 1 ? 's' : ''} archived${failed ? `, ${failed} failed` : ''}.`,
		failed ? 'warning' : 'success',
		8000,
	))
}

// Bulk expiry editor
const bulkExpiryOpen = ref(false)
const bulkExpiryDays = ref(7)
const bulkExpiryHours = ref(0)

function bulkEditExpiry() {
	bulkExpiryOpen.value = true
	bulkExpiryDays.value = 7
	bulkExpiryHours.value = 0
}

async function applyBulkExpiry(opts?: { never?: boolean }) {
	const links = getSelectedLinks()
	const totalHours = bulkExpiryDays.value * 24 + bulkExpiryHours.value
	const isNever = opts?.never || totalHours <= 0
	const newExp = isNever ? null : Date.now() + totalHours * 3600e3

	let success = 0
	let failed = 0
	for (const link of links) {
		try {
			await patchLink(link, { expiresAtMs: newExp })
			link.expiresAt = newExp
			success++
		} catch { failed++ }
	}

	bulkExpiryOpen.value = false
	clearSelection()
	pushNotification(new Notification(
		'Bulk Expiry Update',
		isNever
			? `${success} link${success !== 1 ? 's' : ''} set to never expire${failed ? `, ${failed} failed` : ''}.`
			: `${success} link${success !== 1 ? 's' : ''} updated${failed ? `, ${failed} failed` : ''}.`,
		failed ? 'warning' : 'success',
		8000,
	))
}

function cancelBulkExpiry() {
	bulkExpiryOpen.value = false
}

// Bulk delete
const bulkDeleteOpen = ref(false)
const bulkDeleteGenerated = ref(false)
const bulkDeleteOriginals = ref(false)
const bulkDeleteConfirmText = ref('')

function cancelBulkDelete() {
	bulkDeleteOpen.value = false
	bulkDeleteGenerated.value = false
	bulkDeleteOriginals.value = false
	bulkDeleteConfirmText.value = ''
}

async function executeBulkDelete() {
	const links = getSelectedLinks()
	let success = 0
	let failed = 0
	const deletedIds = new Set<number | string>()
	for (const link of links) {
		try {
			const qs = new URLSearchParams()
			if (bulkDeleteGenerated.value) qs.set('deleteGenerated', '1')
			if (bulkDeleteOriginals.value) qs.set('deleteOriginals', '1')
			const qsStr = qs.toString() ? `?${qs.toString()}` : ''
			await apiFetch(`/api/links/${link.id}${qsStr}`, { method: 'DELETE' })
			deletedIds.add(link.id)
			success++
		} catch { failed++ }
	}
	rows.value = rows.value.filter(r => !deletedIds.has(r.id))
	cancelBulkDelete()
	clearSelection()
	pushNotification(new Notification(
		'Bulk Delete',
		`${success} link${success !== 1 ? 's' : ''} permanently deleted${failed ? `, ${failed} failed` : ''}.`,
		failed ? 'warning' : 'success',
		8000,
	))
}

// Bulk move to project
const bulkMoveProjectOpen = ref(false)
const bulkMoveProjects = ref<{ id: number; name: string }[]>([])
const bulkMoveProjectsLoading = ref(false)
const bulkMoveTargetProjectId = ref<number | null>(null)

async function openBulkMoveToProject() {
	bulkMoveProjectOpen.value = true
	bulkMoveTargetProjectId.value = null
	bulkMoveProjectsLoading.value = true
	try {
		const data = await apiFetch('/api/projects')
		bulkMoveProjects.value = (data?.projects || []).map((p: any) => ({ id: p.id, name: p.name }))
	} catch {
		bulkMoveProjects.value = []
	} finally {
		bulkMoveProjectsLoading.value = false
	}
}

function cancelBulkMoveProject() {
	bulkMoveProjectOpen.value = false
	bulkMoveTargetProjectId.value = null
}

async function executeBulkMoveProject() {
	const links = getSelectedLinks()
	let success = 0
	let failed = 0
	for (const link of links) {
		try {
			await patchLink(link, { projectId: bulkMoveTargetProjectId.value })
			;(link as any).project_id = bulkMoveTargetProjectId.value
			success++
		} catch { failed++ }
	}
	cancelBulkMoveProject()
	clearSelection()
	const targetName = bulkMoveTargetProjectId.value
		? bulkMoveProjects.value.find(p => p.id === bulkMoveTargetProjectId.value)?.name || 'project'
		: 'Unassigned'
	pushNotification(new Notification(
		'Move to Project',
		`${success} link${success !== 1 ? 's' : ''} moved to ${targetName}${failed ? `, ${failed} failed` : ''}.`,
		failed ? 'warning' : 'success',
		8000,
	))
	// Refresh to reflect project changes
	await refresh()
}

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

const { linkListDefault } = useLinkListDefault()

/* ------------------- state ------------------- */
const loading = ref(false)
const error = ref<string | null>(null)
const rows = ref<LinkItem[]>([])
const q = ref('')
const typeFilter = ref<'' | LinkType | 'review'>('')
const statusFilter = ref<'' | Status>(linkListDefault.value)
const showArchived = ref(false)
const fetchLimit = ref(200)
const pageSize = ref(10)
const currentPage = ref(1)
const sortKey = ref<SortKey>('expires')
const sortDir = ref<SortDir>('desc')

watch([q, typeFilter, statusFilter], () => {
	currentPage.value = 1
	refresh()
})
watch(showArchived, () => {
	currentPage.value = 1
	refresh()
})
watch([sortKey, sortDir], () => {
	currentPage.value = 1
})

// Clear multi-select when filters change
watch([q, typeFilter, statusFilter, showArchived], () => {
	selectedIds.value = new Set()
})

// Prune selected IDs when rows change (e.g. after bulk delete)
watch(rows, () => {
	if (selectedIds.value.size === 0) return
	const validIds = new Set(rows.value.map(r => r.id))
	const pruned = new Set([...selectedIds.value].filter(id => validIds.has(id)))
	if (pruned.size !== selectedIds.value.size) {
		selectedIds.value = pruned
	}
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

function thumbIconComponent(it: LinkItem) {
	if (it.type === 'upload') return ArrowUpTrayIcon
	const firstFile = it.target?.files?.[0]
	if (!firstFile?.mime) return DocumentIcon
	if (firstFile.mime.startsWith('video/')) return FilmIcon
	if (firstFile.mime.startsWith('image/')) return PhotoIcon
	if (firstFile.mime.startsWith('audio/')) return MusicalNoteIcon
	return DocumentIcon
}

function isDisabled(it: LinkItem) {
	return !!(it.isDisabled)
}

function statusOf(it: LinkItem): Status {
	if (it.archived) return 'archived'
	if (it.isDisabled) return 'disabled'
	if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
	return 'active'
}

function statusChipClass(s: Status) {
	return s === 'active'
		? 'text-green-500'
		: s === 'expired'
			? 'text-amber-500'
			: s === 'archived'
				? 'text-purple-400'
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

async function toggleArchive(it: LinkItem) {
	if (!it.archived) {
		// Show confirmation modal before archiving
		linkToArchive.value = it
		return
	}
	// Unarchive directly (non-destructive restore)
	try {
		await apiFetch(`/api/links/${it.id}/unarchive`, { method: 'POST' })
		it.archived = false
		pushNotification(
			new Notification(
				'Link Unarchived',
				'The link has been restored. It is still disabled — enable it to make it accessible again.',
				'success',
				8000,
			)
		)
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		pushNotification(
			new Notification('Failed to Update Link', msg, 'error', 8000)
		)
	}
}

function viewLink(it: LinkItem) {
	const anyIt: any = it as any
	const u = anyIt.url
	if (u) window.open(u, '_blank', 'noopener,noreferrer')
}

/* ------------------- archive link ------------------- */
const linkToArchive = ref<LinkItem | null>(null)
const bulkArchiveOpen = ref(false)

async function executeArchiveLink() {
	const it = linkToArchive.value
	if (!it) return
	linkToArchive.value = null
	try {
		await apiFetch(`/api/links/${it.id}/archive`, { method: 'POST' })
		it.archived = true
		it.isDisabled = true
		pushNotification(
			new Notification(
				'Link Archived',
				'The link has been archived and hidden from normal views.',
				'success',
				8000,
			)
		)
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		pushNotification(
			new Notification('Failed to Archive Link', msg, 'error', 8000)
		)
	}
}

/* ------------------- delete link ------------------- */
const linkToDelete = ref<LinkItem | null>(null)
const deleteLinkConfirmText = ref('')
const deleteGeneratedFiles = ref(false)
const deleteOriginalFiles = ref(false)
const deletePreview = ref<any>(null)
const deletePreviewLoading = ref(false)

function confirmDelete(it: LinkItem) {
	linkToDelete.value = it
	deleteGeneratedFiles.value = false
	deleteOriginalFiles.value = false
	deleteLinkConfirmText.value = ''
	deletePreview.value = null
	loadDeletePreview(it)
}

function onRequestDeleteFromDetails(link: LinkItem) {
	showModal.value = false
	confirmDelete(link)
}

function cancelDelete() {
	linkToDelete.value = null
	deleteLinkConfirmText.value = ''
	deleteGeneratedFiles.value = false
	deleteOriginalFiles.value = false
	deletePreview.value = null
}

async function loadDeletePreview(it: LinkItem) {
	deletePreviewLoading.value = true
	try {
		const data = await apiFetch(`/api/links/${it.id}/delete-preview`)
		deletePreview.value = data
	} catch {
		deletePreview.value = null
	} finally {
		deletePreviewLoading.value = false
	}
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

async function deleteLink() {
	if (!linkToDelete.value) return
	try {
		const qs = new URLSearchParams()
		if (deleteGeneratedFiles.value) qs.set('deleteGenerated', '1')
		if (deleteOriginalFiles.value) qs.set('deleteOriginals', '1')
		const qsStr = qs.toString() ? `?${qs.toString()}` : ''
		await apiFetch(`/api/links/${linkToDelete.value.id}${qsStr}`, { method: 'DELETE' })
		rows.value = rows.value.filter(r => r.id !== linkToDelete.value!.id)
		linkToDelete.value = null
		deleteLinkConfirmText.value = ''
		deleteGeneratedFiles.value = false
		deleteOriginalFiles.value = false
		deletePreview.value = null
		pushNotification(
			new Notification('Link Deleted', 'The link has been permanently deleted.', 'success', 8000)
		)
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		pushNotification(
			new Notification('Failed to Delete Link', msg, 'error', 8000)
		)
		linkToDelete.value = null
		deleteLinkConfirmText.value = ''
	}
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
		.filter(r => {
			if (!typeFilter.value) return true
			if (typeFilter.value === 'review') return r.type === 'download' || r.type === 'collection'
			return r.type === typeFilter.value
		})
		.filter(r => {
			// Hide archived unless showArchived is checked
			if (r.archived && !showArchived.value) return false
			const s = statusOf(r)
			if (statusFilter.value) {
				// When a status filter is set, match non-archived status
				if (r.archived) return true // already shown via showArchived
				return s === statusFilter.value
			}
			return true
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
@media (max-width: 900px) {
	.bulk-actions-bar {
		align-items: flex-start;
		flex-direction: column;
	}

	.bulk-actions-buttons {
		justify-content: flex-start;
		width: 100%;
	}

	.bulk-action-btn {
		flex: 1 1 auto;
		min-width: 6.5rem;
	}
}

.bulk-actions-bar {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	min-height: 3.25rem;
	padding: 0.5rem 0.65rem;
	border-radius: 0.65rem 0.65rem 0 0;
	background: var(--btn-primary-fill);
	box-shadow:
		inset 0 -1px 0 color-mix(in srgb, white 18%, transparent),
		0 2px 8px rgb(0 0 0 / 18%);
}

.bulk-actions-count {
	display: inline-flex;
	align-items: center;
	min-width: max-content;
	color: #ffffff;
	font-size: 0.82rem;
	font-weight: 700;
	line-height: 1;
	white-space: nowrap;
}

.bulk-actions-buttons {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 0.4rem;
	min-width: 0;
}

.bulk-action-btn {
	height: 2rem;
	min-height: 2rem;
	padding: 0 0.75rem;
	border-radius: 0.45rem;
	font-size: 0.76rem;
	font-weight: 700;
	line-height: 1;
	white-space: nowrap;
}

.bulk-action-clear {
	color: #fecaca;
}

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
	align-items: center;
	gap: 0.45rem;
	margin-bottom: 0.75rem;
}

.manage-search-input {
	width: 13rem;
	min-width: 10rem;
	flex: 0 1 13rem;
}

.manage-filter-select {
	min-width: 9rem;
	flex: 0 0 auto;
}

.manage-refresh-btn {
	margin-left: auto;
	flex: 0 0 auto;
}

.manage-table-wrap {
	border-radius: 0.72rem;
	border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 22%, #4a4b57);
	background: color-mix(in srgb, black 24%, transparent);
	position: relative;
}

.manage-table {
	width: 100%;
	min-width: 1260px;
	table-layout: fixed;
	border-spacing: 0;
	margin: 0;
}

.manage-table th,
.manage-table td {
	min-width: 0;
}

.manage-table td {
	vertical-align: middle;
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

.manage-table-head-row>th {
	border-top: 0;
}

.manage-table-head-row>th:first-child {
	border-left: 0;
}

.manage-table-head-row>th:last-child {
	border-right: 0;
}

.select-col {
	width: 36px;
}

.thumb-col {
	width: 72px;
}

.title-col {
	width: auto;
}

.type-col {
	width: 86px;
}

.link-col {
	width: 250px;
}

.expires-col {
	width: 150px;
}

.status-col {
	width: 82px;
}

.access-col {
	width: 88px;
}

.created-col {
	width: 118px;
}

.server-col {
	width: 120px;
}

.actions-col {
	width: 230px;
}

.select-cell {
	width: 36px;
	min-width: 36px;
	max-width: 36px;
	text-align: center;
	padding-left: 0.25rem;
	padding-right: 0.25rem;
}

.thumb-cell {
	width: 56px;
	height: 36px;
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

.thumb-td {
	width: 72px;
	min-width: 72px;
	max-width: 72px;
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

.title-text {
	max-width: 24ch;
}

.link-text {
	max-width: 22ch;
}

.title-edit-row {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	min-width: 0;
}

.title-edit-input {
	height: 2rem;
	width: 100%;
	min-width: 0;
	padding: 0 0.5rem;
	border-radius: 0.375rem;
	border: 2px solid var(--btn-primary-bg, #3b82f6);
	background: var(--bg-well);
}

.capability-stack {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.capability-pill {
	padding: 0.125rem 0.45rem;
	border-radius: 999px;
	font-size: 0.625rem;
	font-weight: 700;
	line-height: 1.1;
	text-align: center;
}

.status-chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0.125rem 0.5rem;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	line-height: 1.2;
	white-space: nowrap;
}

.table-mini-btn {
	height: 1.8rem;
	min-height: 1.8rem;
	padding: 0 0.5rem;
	border-radius: 0.375rem;
	font-size: 0.72rem;
	line-height: 1;
	white-space: nowrap;
}

.expires-cell {
	white-space: normal;
}

.expiry-editor {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	min-width: 0;
	font-size: 0.75rem;
}

.expiry-fields-stack {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	min-width: 0;
}

.expiry-field-row {
	display: grid;
	grid-template-columns: 3rem minmax(0, 1fr);
	align-items: center;
	gap: 0.35rem;
	min-width: 0;
}

.expiry-field-row span {
	font-size: 0.7rem;
	opacity: 0.75;
	white-space: nowrap;
}

.expiry-input {
	width: 100%;
	min-width: 0;
	height: 1.75rem;
	padding: 0 0.4rem;
	text-align: left;
}

.expiry-wide-btn {
	width: 100%;
	height: 1.75rem;
	min-height: 1.75rem;
	padding: 0 0.4rem;
	border-radius: 0.375rem;
	font-size: 0.72rem;
	line-height: 1;
	white-space: nowrap;
}

.expiry-action-row {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.3rem;
}

.expiry-action-btn {
	height: 1.75rem;
	min-height: 1.75rem;
	padding: 0 0.4rem;
	border-radius: 0.375rem;
	font-size: 0.72rem;
	line-height: 1;
	white-space: nowrap;
}

.actions-cell {
	white-space: normal;
}

.actions-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.35rem;
	align-items: center;
}

.table-action-btn {
	height: 1.9rem;
	min-height: 1.9rem;
	padding: 0 0.45rem;
	border-radius: 0.375rem;
	font-size: 0.76rem;
	line-height: 1;
	white-space: nowrap;
}

.actions-delete-btn {
	grid-column: 1 / -1;
}

@media (min-width: 1400px) {
	.manage-table {
		min-width: 1360px;
	}

	.title-text {
		max-width: 34ch;
	}

	.link-text {
		max-width: 30ch;
	}
}

@media (max-width: 980px) {
	.manage-header {
		padding-top: 0.25rem;
	}

	.manage-toolbar {
		align-items: stretch;
	}

	.manage-search-input,
	.manage-filter-select,
	.manage-refresh-btn {
		width: 100%;
		flex: 1 1 100%;
		margin-left: 0;
	}
}
</style>
