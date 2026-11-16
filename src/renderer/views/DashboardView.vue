<template>
	<FlowCard variant="plain" class="dashboard-shell overflow-y-auto h-full min-h-0">
		<template #header>
			<div class="dashboard-top">
				<div class="dashboard-intro">
					<template v-if="activeProject">
						<nav class="dashboard-crumbs" aria-label="Breadcrumb">
							<button type="button" class="dashboard-crumb-link" @click="backToProjects">Projects</button>
							<span aria-hidden="true">›</span>
						</nav>
						<div class="flex items-center gap-2 min-w-0">
							<h2 class="dashboard-title truncate">{{ activeProject.name }}</h2>
							<span v-if="activeProject.archived" class="flow-chip flow-chip--muted text-xs shrink-0">Archived</span>
							<span v-if="activeProject.is_disabled && !activeProject.archived" class="flow-chip flow-chip--danger text-xs shrink-0">Disabled</span>
						</div>
						<p class="dashboard-subtitle truncate" :title="activeProject.root_dir">
							Project folder: <span class="font-mono">{{ activeProject.root_dir }}</span>
							<template v-if="activeProject.description"> · {{ activeProject.description }}</template>
						</p>
					</template>
					<template v-else>
						<h2 class="dashboard-title">Projects</h2>
						<p class="dashboard-subtitle">Each project is a folder on your server. Open one to share files with clients or collect their uploads.</p>
					</template>
				</div>

				<div v-if="activeProject" class="dashboard-drop-hint" data-tour="quick-share-hint">
					<ArrowUpTrayIcon class="dashboard-drop-hint-icon" aria-hidden="true" />
					<div class="min-w-0">
						<p class="dashboard-drop-hint-title">Quick Share: drag files onto this window</p>
						<p class="dashboard-drop-hint-copy">Drop files from your computer anywhere here to upload them into this project and get a share link in one step.</p>
					</div>
				</div>

				<div class="dashboard-utility button-group-row">
					<button v-if="activeProject" @click="goToManageUsers" data-tour="manage-users" class="btn btn-secondary px-5 py-2.5">Client Access</button>
					<button @click="leaveServer" class="btn btn-dismiss px-5 py-2.5">Log Out</button>
				</div>
			</div>

			<div v-if="showUnlicensedBanner && !isPremiumActive" class="dashboard-license-banner">
				<div class="dashboard-license-copy">
					{{ unlicensedBannerMessage }}
				</div>
				<button type="button" class="btn btn-primary h-fit" @click="goToUpgrade">Go Pro</button>
				<button type="button" class="btn btn-secondary h-fit text-xs px-2 py-1" @click="dismissBanner">✕</button>
			</div>

			<div v-if="activeProject" class="dashboard-actions" data-tour="action-cards">
				<button @click="goToCreateLink" class="btn btn-primary dashboard-action" data-tour="create-link">
					<span class="dashboard-action-title">Create Link</span>
					<span class="dashboard-action-copy">Send a client a link to review files, upload files to you, or both.</span>
				</button>
				<button @click="goToUploadFiles" class="btn btn-primary dashboard-action" data-tour="upload-files">
					<span class="dashboard-action-title">Add Files</span>
					<span class="dashboard-action-copy">Upload videos, images, audio, documents and other files from your computer into this project's folder on the server.</span>
				</button>
			</div>
		</template>

		<!-- ═══════════ Project List View ═══════════ -->
		<div v-if="!activeProject" class="dashboard-content-wrap" data-tour="project-list">
			<div class="flex items-center justify-between gap-3 mb-3 px-1">
				<label class="flex items-center gap-1.5 cursor-pointer select-none">
					<input type="checkbox" v-model="showArchivedProjects" class="styled-checkbox" />
					<span class="text-xs text-muted">Show archived projects</span>
				</label>
				<button class="btn btn-primary text-sm px-4 py-2" data-tour="new-project" @click="showCreateProjectModal = true">+ New Project</button>
			</div>

			<div v-if="projectsLoading" class="flex items-center justify-center py-8">
				<span class="text-sm text-muted">Loading projects…</span>
			</div>

			<FlowEmpty v-else-if="projects.length === 0" title="No projects yet" class="py-12"
				description="A project is a folder on your server for one job or production. Create one to start sharing files with clients.">
				<template #icon><FolderIcon /></template>
				<template #actions>
					<button class="btn btn-primary px-6 py-3 text-base font-semibold" @click="showCreateProjectModal = true">+ New Project</button>
				</template>
			</FlowEmpty>

			<div v-else>
				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
					<div
						v-for="project in pagedProjects"
						:key="`${project._connectionId || 'local'}-${project.id}`"
						class="project-card panel rounded-xl p-4 cursor-pointer border border-default bg-default"
						:class="{ 'opacity-60': project.archived, 'opacity-70': project.is_disabled && !project.archived }"
						@click="openProject(project)"
					>
						<div class="flex items-start justify-between gap-2 mb-2">
							<div class="flex items-center gap-2 min-w-0">
								<h4 class="font-semibold text-sm truncate" :class="{ 'text-muted': project.is_disabled }">{{ project.name }}</h4>
								<span v-if="project.is_disabled" class="flow-chip flow-chip--danger text-xs shrink-0">DISABLED</span>
								<span v-if="project.archived" class="flow-chip flow-chip--muted text-xs shrink-0">Archived</span>
							</div>
							<div class="flex items-center gap-1 shrink-0" @click.stop>
								<button
									class="btn btn-secondary px-2 py-1 text-xs"
									title="Edit project name, folder, and notes"
									@click="openEditProjectFromCard(project)"
								>Edit</button>
								<button
									v-if="!project.archived && !project.is_disabled"
									class="btn btn-danger px-2 py-1 text-xs"
									title="Disable this project and all its links"
									@click="confirmCardDisable(project)"
								>Disable</button>
								<button
									v-if="!project.archived && project.is_disabled"
									class="btn btn-success px-2 py-1 text-xs"
									title="Enable this project and re-enable all links"
									@click="confirmCardEnable(project)"
								>Enable</button>
								<button
									v-if="!project.archived"
									class="btn btn-warning px-2 py-1 text-xs"
									title="Deactivate all links and hide this project"
									@click="confirmCardArchive(project)"
								>Archive</button>
								<button
									v-if="project.archived"
									class="btn btn-success px-2 py-1 text-xs"
									title="Restore project and re-enable links"
									@click="confirmCardUnarchive(project)"
								>Unarchive</button>
								<button
									class="btn btn-danger px-2 py-1 text-xs"
									title="Permanently delete this project"
									@click="confirmCardDelete(project)"
								>Delete</button>
							</div>
						</div>
						<div class="flex flex-row items-end gap-1.5 mb-2">
							<span class="flow-chip flow-chip--neutral text-xs">Total Links: {{ project.link_count ?? 0 }}</span>
							<span class="flow-chip flow-chip--success text-xs">Active {{ project.active_count ?? 0 }}</span>
							<span class="flow-chip flow-chip--warning text-xs">Expired {{ project.expired_count ?? 0 }}</span>
							<span class="flow-chip flow-chip--danger text-xs">Disabled {{ project.disabled_count ?? 0 }}</span>
						</div>
						<div v-if="project._serverName" class="text-xs text-muted mb-1">Server: {{ project._serverName }}</div>
						<div class="text-xs truncate" :title="project.root_dir">Folder: {{ project.root_dir }}</div>
						<p v-if="project.description" class="text-xs line-clamp-2 mb-2 opacity-80">{{ project.description }}</p>
					</div>
				</div>

				<!-- Project Pagination -->
				<div v-if="projectTotalPages > 1" class="mt-3 flex items-center justify-between gap-2 text-sm px-1">
					<div class="text-muted">
						Showing {{ projectPageStart }}-{{ projectPageEnd }} of {{ projects.length }} projects
					</div>
					<div class="flex items-center gap-2">
						<button class="btn btn-secondary px-3 py-1" :disabled="projectPage <= 1" @click="projectPage--">Previous</button>
						<span>Page {{ projectPage }} / {{ projectTotalPages }}</span>
						<button class="btn btn-secondary px-3 py-1" :disabled="projectPage >= projectTotalPages" @click="projectPage++">Next</button>
					</div>
				</div>
			</div>

			<!-- ═══════════ Unassigned links (collapsible, only when some exist) ═══════════ -->
			<div v-if="unassignedCount" class="mt-6">
				<button
					class="flex items-center gap-2 w-full text-left px-1 py-2 rounded-md hover:bg-white/5 transition-colors"
					@click="unassignedOpen = !unassignedOpen"
				>
					<svg class="w-4 h-4 text-muted transition-transform" :class="{ 'rotate-90': unassignedOpen }" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
					</svg>
					<h3 class="text-base font-semibold">Unassigned Links</h3>
					<span class="text-xs text-muted">({{ unassignedCount }} link{{ unassignedCount === 1 ? '' : 's' }} not in any project)</span>
				</button>
				<div v-show="unassignedOpen" class="mt-2">
					<ManageLinks projectId="none" key="unassigned" :tourActive="tourShowDemoLinks" @rows-changed="fetchUnassignedCount"/>
				</div>
			</div>
		</div>

		<!-- ═══════════ Project Detail View (Links) ═══════════ -->
		<div v-else class="dashboard-content-wrap" data-tour="manage-links">
			<div class="flex items-center justify-between gap-2 mb-2 px-1">
				<h3 class="text-base font-semibold">Links</h3>
				<div class="button-group-row text-xs">
					<button class="btn btn-secondary" @click="startEditProject">Edit Project</button>
					<button class="btn btn-dismiss" @click="backToProjects">Back to Projects</button>
				</div>
			</div>

			<ManageLinks :projectId="activeProject.id" :key="activeProject.id" :tourActive="tourShowDemoLinks"/>
		</div>
	</FlowCard>

	<SettingsModal v-if="showSettings" :initialSection="settingsInitialSection" @close="showSettings = false" />
	<AddUsersModal v-model="usersModalOpen" :apiFetch="apiFetch" />
	<CreateProjectModal v-model="showCreateProjectModal" @created="onProjectCreated" />

	<!-- Edit Project Modal -->
	<FlowModal :model-value="!!(showEditProjectModal && actionTarget)" :title="editModalTitle"
		:size="editModalConfirm ? 'md' : 'xl'" hide-close @close="closeEditModal">
		<template v-if="actionTarget">

				<!-- Default: Edit Form -->
				<template v-if="!editModalConfirm">
					<form @submit.prevent="saveProject" class="flex flex-col gap-4">
						<FlowField label="Project Name" required>
							<template #default="{ id }">
							<input
								:id="id"
								v-model="editProjectName"
								type="text"
								class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
								required
							/>
							</template>
						</FlowField>
						<FlowField label="Project Folder">
							<FolderPicker
								:key="editKey"
								v-model="editProjectRoot"
								:apiFetch="apiFetch"
								useCase="upload"
								subtitle="Change the folder for this project."
								:auto-detect-roots="true"
								:allow-entire-tree="true"
								:is-root-user="isRootUser"
								:startDir="editProjectRoot"
								v-model:project="editProjectPickerBase"
								v-model:dest="editProjectRoot"
							/>
							<FolderSpaceNotice class="mt-2" :path="editProjectRoot" :apiFetch="apiFetch" :showDataNote="false" />
						</FlowField>
						<FlowField label="Notes" optional>
							<template #default="{ id }">
							<textarea
								:id="id"
								v-model="editProjectDescription"
								class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none"
								rows="2"
								placeholder="Brief description…"
							/>
							</template>
						</FlowField>
						
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<button v-if="!actionTarget?.archived" type="button"
									class="btn btn-warning px-3 py-2 text-sm"
									title="Deactivate all links and hide the project from the default view. You can unarchive it later."
									@click="editModalConfirm = 'archive'">Archive</button>
								<button v-if="actionTarget?.archived" type="button"
									class="btn btn-success px-3 py-2 text-sm"
									title="Restore the project and re-enable all previously disabled links."
									@click="editModalConfirm = 'unarchive'">Unarchive</button>
							</div>
							<button type="button" class="btn btn-danger px-3 py-2 text-sm"
								title="Permanently remove the project. Links will be unlinked but not deleted."
								@click="editModalConfirm = 'delete'; resetProjectDeleteState(); loadProjectDeletePreview(actionTarget!)">Delete Project</button>
						</div>

						<hr class="border-default" />
						<div class="flex items-center justify-end gap-2">
							<button type="button" class="btn btn-dismiss px-4 py-2"
								@click="closeEditModal">Cancel</button>
							<button type="submit" class="btn btn-primary px-4 py-2"
								:disabled="!editProjectName.trim() || !editProjectRoot.trim() || savingProject">
								{{ savingProject ? 'Saving…' : 'Save' }}
							</button>
						</div>
					</form>
				</template>

				<!-- Confirm: Archive -->
				<template v-else-if="editModalConfirm === 'archive'">
					<FlowNotice tone="warning" class="mb-4">
						<p class="text-sm font-medium mb-2">This will deactivate and hide the project:</p>
						<ul class="text-sm list-disc list-inside space-y-1">
							<li>All active links will be disabled immediately</li>
							<li>The project will be hidden from the default view</li>
							<li>No files or links are deleted</li>
							<li>You can unarchive the project at any time to restore it</li>
						</ul>
					</FlowNotice>
					<p class="text-sm text-default mb-4">Archive <strong>{{ actionTarget.name }}</strong>?</p>
					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-dismiss px-4 py-2" @click="editModalConfirm = null">Back</button>
						<button class="btn btn-warning px-4 py-2" @click="archiveProject">Archive</button>
					</div>
				</template>

				<!-- Confirm: Unarchive -->
				<template v-else-if="editModalConfirm === 'unarchive'">
					<FlowNotice tone="success" class="mb-4">
						<p class="text-sm font-medium mb-2">This will restore the project:</p>
						<ul class="text-sm list-disc list-inside space-y-1">
							<li>The project will reappear in the default view</li>
							<li>All previously disabled links will be re-enabled</li>
							<li>Expired links will remain expired</li>
						</ul>
					</FlowNotice>
					<p class="text-sm text-default mb-4">Unarchive <strong>{{ actionTarget.name }}</strong>?</p>
					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-dismiss px-4 py-2" @click="editModalConfirm = null">Back</button>
						<button class="btn btn-success px-4 py-2" @click="unarchiveProject">Unarchive</button>
					</div>
				</template>

				<!-- Confirm: Delete -->
				<template v-else-if="editModalConfirm === 'delete'">
					<FlowNotice tone="danger" class="mb-4">
						<p class="text-sm font-medium mb-2">This action is irreversible and will permanently destroy:</p>
						<ul class="text-sm list-disc list-inside space-y-1">
							<li>The project and all its metadata</li>
							<li>All links will be unlinked from this project (unless you choose to delete them below)</li>
						</ul>
					</FlowNotice>

					<div class="border border-default rounded-lg p-3 mb-4 space-y-3">
						<p class="text-sm font-medium">Optional: Delete links and files</p>

						<div v-if="projectDeletePreviewLoading" class="text-xs text-default flex items-center gap-2">
							<span class="inline-block w-3 h-3 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
							Loading file info...
						</div>

						<template v-if="projectDeletePreview && !projectDeletePreviewLoading">
							<label class="flex items-start gap-2 cursor-pointer select-none">
								<input type="checkbox" v-model="projectDeleteLinks" class="styled-checkbox mt-0.5" />
								<div>
									<span class="text-sm">Delete all {{ projectDeletePreview.summary.totalLinks }} link(s) in this project</span>
									<p class="text-xs text-default">Permanently removes all links, their activity history, and access permissions</p>
								</div>
							</label>

							<template v-if="projectDeleteLinks && projectDeletePreview.summary.totalFiles > 0">
								<div class="text-xs text-default space-y-1 ml-5">
									<p>{{ projectDeletePreview.summary.totalFiles }} file(s) across all links</p>
									<p v-if="projectDeletePreview.summary.sharedFiles > 0" class="text-flow-warning">
										{{ projectDeletePreview.summary.sharedFiles }} file(s) shared with links outside this project — will be kept
									</p>
								</div>

								<label class="flex items-start gap-2 cursor-pointer select-none ml-5">
									<input type="checkbox" v-model="projectDeleteGenerated" class="styled-checkbox mt-0.5" />
									<div>
										<span class="text-sm">Delete generated files</span>
										<p class="text-xs text-default">
											Transcodes, proxy videos, HLS streams, watermarked images
											({{ formatBytes(projectDeletePreview.summary.totalGeneratedBytes) }})
										</p>
									</div>
								</label>

								<label class="flex items-start gap-2 cursor-pointer select-none ml-5">
									<input type="checkbox" v-model="projectDeleteOriginals" class="styled-checkbox mt-0.5" />
									<div>
										<span class="text-sm text-flow-danger font-medium">Delete original source files</span>
										<p class="text-xs text-flow-danger">
											The actual media files on disk. Cannot be recovered.
											({{ formatBytes(projectDeletePreview.summary.totalOriginalBytes) }})
										</p>
									</div>
								</label>

								<div v-if="projectDeleteOriginals" class="p-2 rounded flow-tone-danger border ml-5">
									<p class="text-xs text-flow-danger font-medium">
										Danger: this will permanently delete the original source files from disk.
									</p>
									<div v-if="projectDeletePreview.files.filter((f: any) => !f.sharedWithOtherLinks).length > 0"
										class="mt-2 max-h-24 overflow-y-auto">
										<p class="text-xs text-default mb-1">Files that will be deleted:</p>
										<ul class="text-xs text-flow-danger list-disc list-inside">
											<li v-for="f in projectDeletePreview.files.filter((f: any) => !f.sharedWithOtherLinks)"
												:key="f.id" class="truncate">
												{{ f.relPath }} ({{ formatBytes(f.originalBytes) }})
											</li>
										</ul>
									</div>
								</div>
							</template>
						</template>
					</div>

					<template v-if="projectDeleteGenerated || projectDeleteOriginals">
						<label class="block text-sm text-default mb-1">
							Type <strong class="text-flow-danger">DELETE</strong> to confirm:
						</label>
						<input v-model="projectDeleteConfirmText" type="text"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-flow-danger bg-default mb-4"
							placeholder="DELETE" autocomplete="off" />
					</template>

					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-dismiss px-4 py-2" @click="editModalConfirm = null">Back</button>
						<button class="btn btn-danger px-4 py-2"
							:disabled="(projectDeleteGenerated || projectDeleteOriginals) && projectDeleteConfirmText !== 'DELETE'"
							@click="deleteProject">Delete Permanently</button>
					</div>
				</template>

		</template>
	</FlowModal>

	<!-- Card-level Disable Confirmation Modal -->
	<FlowModal :model-value="!!(cardActionProject && cardAction === 'disable')" title="Disable Project" size="sm" hide-close @close="clearCardAction()">
				<FlowNotice tone="danger" class="mb-4">
					<p class="text-sm font-medium mb-2">This will disable the project and all its links:</p>
					<ul class="text-sm list-disc list-inside space-y-1">
						<li>All active links will be disabled immediately</li>
						<li>The project will appear greyed out with a DISABLED badge</li>
						<li>No files or links are deleted</li>
						<li>You can re-enable the project at any time</li>
					</ul>
				</FlowNotice>
				<p class="text-sm text-default mb-4">Disable <strong>{{ cardActionProject.name }}</strong>?</p>
				<template #footer>
					<button class="btn btn-dismiss px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-danger px-4 py-2" @click="disableProject">Disable</button>
				</template>
	</FlowModal>

	<!-- Card-level Archive Confirmation Modal (project list view) -->
	<FlowModal :model-value="!!(cardActionProject && cardAction === 'archive')" title="Archive Project" size="sm" hide-close @close="clearCardAction()">
				<FlowNotice tone="warning" class="mb-4">
					<p class="text-sm font-medium mb-2">This will deactivate and hide the project:</p>
					<ul class="text-sm list-disc list-inside space-y-1">
						<li>All active links will be disabled immediately</li>
						<li>The project will be hidden from the default view</li>
						<li>No files or links are deleted</li>
						<li>You can unarchive the project at any time to restore it</li>
					</ul>
				</FlowNotice>
				<p class="text-sm text-default mb-4">Archive <strong>{{ cardActionProject.name }}</strong>?</p>
				<template #footer>
					<button class="btn btn-dismiss px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-warning px-4 py-2" @click="archiveProject">Archive</button>
				</template>
	</FlowModal>

	<!-- Card-level Unarchive Confirmation Modal -->
	<FlowModal :model-value="!!(cardActionProject && cardAction === 'unarchive')" title="Unarchive Project" size="sm" hide-close @close="clearCardAction()">
				<FlowNotice tone="success" class="mb-4">
					<p class="text-sm font-medium mb-2">This will restore the project:</p>
					<ul class="text-sm list-disc list-inside space-y-1">
						<li>The project will reappear in the default view</li>
						<li>All previously disabled links will be re-enabled</li>
						<li>Expired links will remain expired</li>
					</ul>
				</FlowNotice>
				<p class="text-sm text-default mb-4">Unarchive <strong>{{ cardActionProject.name }}</strong>?</p>
				<template #footer>
					<button class="btn btn-dismiss px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-success px-4 py-2" @click="unarchiveProject">Unarchive</button>
				</template>
	</FlowModal>

	<!-- Card-level Delete Confirmation Modal -->
	<FlowModal :model-value="!!(cardActionProject && cardAction === 'delete')" title="Delete Project" size="md" hide-close @close="clearCardAction()">
				<FlowNotice tone="danger" class="mb-4">
					<p class="text-sm font-medium mb-2">This action is irreversible and will permanently destroy:</p>
					<ul class="text-sm list-disc list-inside space-y-1">
						<li>The project and all its metadata</li>
						<li>All links will be unlinked from this project (unless you choose to delete them below)</li>
					</ul>
				</FlowNotice>

				<p class="text-sm text-default mb-3">
					Deleting <strong>{{ cardActionProject.name }}</strong>
				</p>

				<div class="border border-default rounded-lg p-3 mb-4 space-y-3">
					<p class="text-sm font-medium">Optional: Delete links and files</p>

					<div v-if="projectDeletePreviewLoading" class="text-xs text-default flex items-center gap-2">
						<span class="inline-block w-3 h-3 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
						Loading file info...
					</div>

					<template v-if="projectDeletePreview && !projectDeletePreviewLoading">
						<label class="flex items-start gap-2 cursor-pointer select-none">
							<input type="checkbox" v-model="projectDeleteLinks" class="styled-checkbox mt-0.5" />
							<div>
								<span class="text-sm">Delete all {{ projectDeletePreview.summary.totalLinks }} link(s) in this project</span>
								<p class="text-xs text-default">Permanently removes all links, their activity history, and access permissions</p>
							</div>
						</label>

						<template v-if="projectDeleteLinks && projectDeletePreview.summary.totalFiles > 0">
							<div class="text-xs text-default space-y-1 ml-5">
								<p v-if="projectNothingToDelete" class="text-flow-warning">
									All files are used by links outside this project, so they'll be kept.
								</p>
								<template v-else>
									<p>{{ projectDeletePreview.summary.totalFiles }} file(s) across all links</p>
									<p v-if="projectDeletePreview.summary.sharedFiles > 0" class="text-flow-warning">
										{{ projectDeletePreview.summary.sharedFiles }} file(s) shared with links outside this project — will be kept
									</p>
								</template>
							</div>

							<label class="flex items-start gap-2 select-none ml-5"
								:class="projectNothingToDelete ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'">
								<input type="checkbox" v-model="projectDeleteGenerated" :disabled="projectNothingToDelete"
									class="styled-checkbox mt-0.5" />
								<div>
									<span class="text-sm">Delete generated files</span>
									<p class="text-xs text-default">
										Transcodes, proxy videos, HLS streams, watermarked images<template v-if="!projectNothingToDelete">
										({{ formatBytes(projectDeletePreview.summary.totalGeneratedBytes) }})</template>
									</p>
								</div>
							</label>

							<label class="flex items-start gap-2 select-none ml-5"
								:class="projectNothingToDelete ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'">
								<input type="checkbox" v-model="projectDeleteOriginals" :disabled="projectNothingToDelete"
									class="styled-checkbox mt-0.5" />
								<div>
									<span class="text-sm text-flow-danger font-medium">Delete original source files</span>
									<p class="text-xs text-flow-danger">
										The actual media files on disk. Cannot be recovered.<template v-if="!projectNothingToDelete">
										({{ formatBytes(projectDeletePreview.summary.totalOriginalBytes) }})</template>
									</p>
								</div>
							</label>

							<div v-if="projectDeleteOriginals" class="p-2 rounded flow-tone-danger border ml-5">
								<p class="text-xs text-flow-danger font-medium">
									Danger: this will permanently delete the original source files from disk.
								</p>
								<div v-if="projectDeletePreview.files.filter((f: any) => !f.sharedWithOtherLinks).length > 0"
									class="mt-2 max-h-24 overflow-y-auto">
									<p class="text-xs text-default mb-1">Files that will be deleted:</p>
									<ul class="text-xs text-flow-danger list-disc list-inside">
										<li v-for="f in projectDeletePreview.files.filter((f: any) => !f.sharedWithOtherLinks)"
											:key="f.id" class="truncate">
											{{ f.relPath }} ({{ formatBytes(f.originalBytes) }})
										</li>
									</ul>
								</div>
							</div>
						</template>
					</template>
				</div>

				<template v-if="projectDeleteGenerated || projectDeleteOriginals">
					<label class="block text-sm text-default mb-1">
						Type <strong class="text-flow-danger">DELETE</strong> to confirm:
					</label>
					<input v-model="projectDeleteConfirmText" type="text"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-flow-danger bg-default mb-4"
						placeholder="DELETE" autocomplete="off" />
				</template>

				<template #footer>
					<button class="btn btn-dismiss px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-danger px-4 py-2"
						:disabled="(projectDeleteGenerated || projectDeleteOriginals) && projectDeleteConfirmText !== 'DELETE'"
						@click="deleteProject">Delete Permanently</button>
				</template>
	</FlowModal>
</template>

<script setup lang="ts">
import FlowCard from '../ui/FlowCard.vue'
import FlowModal from '../ui/FlowModal.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import FlowField from '../ui/FlowField.vue'
import FlowEmpty from '../ui/FlowEmpty.vue'
import { ArrowUpTrayIcon, FolderIcon } from '@heroicons/vue/24/outline'
import { Notification } from '@45drives/houston-common-ui'
import { useHeader } from '../composables/useHeader'
import { useResilientNav } from '../composables/useResilientNav'
import { pushNotification } from '../composables/useNotificationQueue'
import ManageLinks from './ManageLinks.vue'
import SettingsModal from '../components/modals/SettingsModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import CreateProjectModal from '../components/modals/CreateProjectModal.vue'
import FolderPicker from '../components/FolderPicker.vue'
import FolderSpaceNotice from '../components/FolderSpaceNotice.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import { useTransferProgress } from '../composables/useTransferProgress'
import { clearLastSession } from '../composables/useSessionPersistence'
import { useConnections } from '../composables/useConnections'
import { useServerFilter } from '../composables/useServerFilter'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import { useActiveProject } from '../composables/useActiveProject'
import { startEmailProblemAlerts } from '../composables/useEmailProblemAlerts'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import { useThemeFromAlias } from '../composables/useThemeFromAlias'
import { signOutSession } from '../web-session'
import { revokeDesktopSession } from '../desktop-session'
const isWeb = window.electron?.isWeb === true

useHeader('Dashboard')
const { to } = useResilientNav()
const { apiFetch, apiFetchAll } = useApi()
const transfer = useTransferProgress()
const { activeConnection, updateConnection, setActive } = useConnections()
const isRootUser = computed(() => activeConnection.value?.username === 'root')
const { selectedFilter, filteredConnections, setFilter } = useServerFilter()
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()
const { activeProject: globalActiveProject, setActiveProject: setGlobalActiveProject } = useActiveProject()
const { isPremiumActive, startBackgroundCheck, stopBackgroundCheck, checkLicenseInBackground } = useLicenseStatus()
const { setCustomThemeEnabled, setCustomThemeColors } = useThemeFromAlias()

// Start background license polling while dashboard is mounted
startBackgroundCheck()
onUnmounted(() => stopBackgroundCheck())

// C3: notify (and fill the bell) when an email from any link isn't delivered.
let stopEmailAlerts: (() => void) | null = null
watch(() => activeConnection.value?.connectionId, (id) => {
	stopEmailAlerts?.()
	stopEmailAlerts = id ? startEmailProblemAlerts(apiFetch, id) : null
}, { immediate: true })
onUnmounted(() => stopEmailAlerts?.())

// ── License Banner ──
// Show banner only when server WAS licensed but background check detects it's now unlicensed
const showUnlicensedBanner = ref(false)
const unlicensedBannerMessage = ref('')
const wasPreviouslyLicensed = ref(activeConnection.value?.licensed ?? false)

watch(isPremiumActive, (nowLicensed, wasLicensed) => {
	if (!nowLicensed && wasPreviouslyLicensed.value) {
		const conn = activeConnection.value
		showUnlicensedBanner.value = true
		unlicensedBannerMessage.value =
			`Connected to ${conn?.name || conn?.serverIp || 'server'}, but the server license has expired or been revoked. Premium features are disabled until re-activated.`
	} else if (nowLicensed) {
		showUnlicensedBanner.value = false
		unlicensedBannerMessage.value = ''
	}
	if (nowLicensed) wasPreviouslyLicensed.value = true
})

// ── Projects ──
interface Project {
	id: number
	name: string
	root_dir: string
	description: string | null
	archived: number
	is_disabled: number
	link_count: number
	active_count: number
	expired_count: number
	disabled_count: number
	_serverName?: string
	_serverIp?: string
	_connectionId?: string
}

const projects = ref<Project[]>([])
const projectsLoading = ref(true)
const activeProject = ref<Project | null>(null)
const showArchivedProjects = ref(false)

const showCreateProjectModal = ref(false)

// Unassigned links disclosure
const unassignedOpen = ref(false)
const unassignedCount = ref<number | null>(null)

async function fetchUnassignedCount() {
	try {
		const data = await apiFetch('/api/links?project_id=none&limit=1&offset=0')
		unassignedCount.value = typeof data?.total === 'number' ? data.total : null
	} catch {
		unassignedCount.value = null
	}
}

// Project pagination
const projectPageSize = 9
const projectPage = ref(1)
const projectTotalPages = computed(() => Math.max(1, Math.ceil(projects.value.length / projectPageSize)))
const pagedProjects = computed(() => {
	const start = (projectPage.value - 1) * projectPageSize
	return projects.value.slice(start, start + projectPageSize)
})
const projectPageStart = computed(() => projects.value.length ? (projectPage.value - 1) * projectPageSize + 1 : 0)
const projectPageEnd = computed(() => Math.min(projectPage.value * projectPageSize, projects.value.length))

const showEditProjectModal = ref(false)
const editProjectName = ref('')
const editProjectRoot = ref('')
const editProjectPickerBase = ref('')
const editProjectDescription = ref('')
const savingProject = ref(false)
const editKey = ref(0)

async function fetchProjects() {
	// Deleting a project without its links leaves them unassigned, so recount on every reload.
	void fetchUnassignedCount()
	projectsLoading.value = true
	const archiveParam = showArchivedProjects.value ? '?includeArchived=1' : ''
	try {
		if (selectedFilter.value === 'all' && filteredConnections.value.length > 1) {
			const results = await apiFetchAll<{ projects: Project[] }>(filteredConnections.value, `/api/projects${archiveParam}`)
			const allProjects: Project[] = []
			for (const r of results) {
				if (r.success && r.data?.projects) {
					for (const p of r.data.projects) {
						allProjects.push({
							...p,
							_serverName: r.serverName,
							_serverIp: r.serverIp,
							_connectionId: r.connectionId,
						})
					}
				}
			}
			projects.value = allProjects
		} else {
			const data = await apiFetch(`/api/projects${archiveParam}`)
			projects.value = (data.projects || []).map((p: Project) => ({
				...p,
				_serverName: activeConnection.value?.name,
				_serverIp: activeConnection.value?.serverIp,
				_connectionId: activeConnection.value?.connectionId,
			}))
		}
	} catch {
		projects.value = []
	} finally {
		projectsLoading.value = false
	}
}

watch(showArchivedProjects, () => fetchProjects())

/** Sync the theme picker's custom branding button with the server's branding state */
async function syncBrandingTheme() {
	if (!isPremiumActive.value) {
		setCustomThemeEnabled(false)
		return
	}
	try {
		const data = await apiFetch('/api/branding')
		setCustomThemeEnabled(!!data.enabled)
		if (data.customPrimary || data.customSecondary) {
			setCustomThemeColors({
				primary: data.customPrimary || '#6366f1',
				secondary: data.customSecondary || '#8b5cf6',
			})
		}
	} catch {
		// Non-critical — leave current state
	}
}

function openProject(project: Project) {
	// If opening a project from a different server (All Servers mode), switch to that server first
	if (project._connectionId && project._connectionId !== activeConnection.value?.connectionId) {
		setFilter(project._connectionId)
		setActive(project._connectionId)
	}
	activeProject.value = project
}

function backToProjects() {
	activeProject.value = null
	fetchProjects()
}

watch(activeProject, (p) => {
	setGlobalActiveProject(p)
	if (p) refreshProjectLinkStatus()
	else {
		projectHasActiveLinks.value = false
		projectHasDisabledLinks.value = false
	}
})

// Close active project when switching servers (projects are server-specific)
watch(activeConnection, (newConn, oldConn) => {
	// Only close if actually switching between different servers
	if (oldConn && newConn && oldConn.connectionId !== newConn.connectionId) {
		if (activeProject.value) {
			activeProject.value = null
		}
	}
})

function onProjectCreated(project: any) {
	fetchProjects().then(() => {
		const created = projects.value.find(p => p.id === project?.id)
		if (created) openProject(created)
	})
}

function startEditProject() {
	if (!activeProject.value) return
	editProjectName.value = activeProject.value.name
	editProjectRoot.value = activeProject.value.root_dir
	editProjectPickerBase.value = activeProject.value.root_dir
	editProjectDescription.value = activeProject.value.description || ''
	editKey.value++
	editModalConfirm.value = null
	showEditProjectModal.value = true
}

async function saveProject() {
	const target = actionTarget.value
	if (!target || !editProjectName.value.trim() || !editProjectRoot.value.trim()) return
	savingProject.value = true
	try {
		await apiFetch(`/api/projects/${target.id}`, {
			method: 'PATCH',
			body: JSON.stringify({
				name: editProjectName.value.trim(),
				rootDir: editProjectRoot.value.trim(),
				description: editProjectDescription.value.trim() || null,
			}),
		})
		if (activeProject.value && activeProject.value.id === target.id) {
			activeProject.value = {
				...activeProject.value,
				name: editProjectName.value.trim(),
				root_dir: editProjectRoot.value.trim(),
				description: editProjectDescription.value.trim() || null,
			}
		}
		closeEditModal()
		pushNotification(new Notification('Project Updated', '', 'success', 4000))
		await fetchProjects()
	} catch (e: any) {
		pushNotification(new Notification('Failed to update project', e?.message || '', 'error', 8000))
	} finally {
		savingProject.value = false
	}
}

// ── Project Lifecycle ──
const editModalConfirm = ref<'archive' | 'unarchive' | 'delete' | null>(null)

// For card-level actions (project list view)
const cardActionProject = ref<Project | null>(null)
const cardAction = ref<'archive' | 'unarchive' | 'delete' | 'disable' | null>(null)

const projectHasActiveLinks = ref(false)
const projectHasDisabledLinks = ref(false)

async function refreshProjectLinkStatus() {
	if (!activeProject.value) return
	try {
		const data = await apiFetch(`/api/projects/${activeProject.value.id}/links`)
		const links: any[] = data.links || []
		projectHasActiveLinks.value = links.some((l: any) => !l.is_disabled)
		projectHasDisabledLinks.value = links.some((l: any) => !!l.is_disabled)
	} catch {
		projectHasActiveLinks.value = false
		projectHasDisabledLinks.value = false
	}
}

// The "actionTarget" is whichever project the action acts on
const actionTarget = computed(() => activeProject.value || cardActionProject.value)

function confirmCardArchive(project: Project) {
	cardActionProject.value = project
	cardAction.value = 'archive'
}
function confirmCardUnarchive(project: Project) {
	cardActionProject.value = project
	cardAction.value = 'unarchive'
}
function confirmCardDelete(project: Project) {
	cardActionProject.value = project
	cardAction.value = 'delete'
	resetProjectDeleteState()
	loadProjectDeletePreview(project)
}
function confirmCardDisable(project: Project) {
	cardActionProject.value = project
	cardAction.value = 'disable'
}
async function disableProject() {
	const project = actionTarget.value
	if (!project) return
	try {
		await apiFetch(`/api/projects/${project.id}/close`, { method: 'POST' })
		pushNotification(new Notification('Project Disabled', `"${project.name}" and all its links have been disabled.`, 'success', 4000))
		clearCardAction()
		await fetchProjects()
	} catch (e: any) {
		pushNotification(new Notification('Failed to disable project', e?.message || '', 'error', 8000))
	}
}
async function confirmCardEnable(project: Project) {
	try {
		await apiFetch(`/api/projects/${project.id}/reopen`, { method: 'POST' })
		pushNotification(new Notification('Project Enabled', `"${project.name}" and all its links have been re-enabled.`, 'success', 4000))
		await fetchProjects()
	} catch (e: any) {
		pushNotification(new Notification('Failed to enable project', e?.message || '', 'error', 8000))
	}
}
function openEditProjectFromCard(project: Project) {
	cardActionProject.value = project
	editProjectName.value = project.name
	editProjectRoot.value = project.root_dir
	editProjectPickerBase.value = project.root_dir
	editProjectDescription.value = project.description || ''
	editKey.value++
	editModalConfirm.value = null
	showEditProjectModal.value = true
}

function clearCardAction() {
	cardActionProject.value = null
	cardAction.value = null
	resetProjectDeleteState()
}

const editModalTitle = computed(() => ({
	archive: 'Archive Project',
	unarchive: 'Unarchive Project',
	delete: 'Delete Project',
} as Record<string, string>)[editModalConfirm.value ?? ''] ?? 'Edit Project')

function closeEditModal() {
	showEditProjectModal.value = false
	editModalConfirm.value = null
	resetProjectDeleteState()
	cardActionProject.value = null
	cardAction.value = null
}

// ── Project Delete Preview ──
const projectDeletePreview = ref<any>(null)
const projectDeletePreviewLoading = ref(false)
const projectDeleteLinks = ref(false)
const projectDeleteGenerated = ref(false)
const projectDeleteOriginals = ref(false)
const projectDeleteConfirmText = ref('')

function resetProjectDeleteState() {
	projectDeletePreview.value = null
	projectDeletePreviewLoading.value = false
	projectDeleteLinks.value = false
	projectDeleteGenerated.value = false
	projectDeleteOriginals.value = false
	projectDeleteConfirmText.value = ''
}

async function loadProjectDeletePreview(project: Project) {
	projectDeletePreviewLoading.value = true
	try {
		const data = await apiFetch(`/api/projects/${project.id}/delete-preview`)
		projectDeletePreview.value = data
	} catch {
		projectDeletePreview.value = null
	} finally {
		projectDeletePreviewLoading.value = false
	}
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

const projectNothingToDelete = computed(() => {
	const s = projectDeletePreview.value?.summary
	return !!s && s.totalFiles > 0 && s.deletableFiles === 0
})

async function archiveProject() {
	const target = actionTarget.value
	if (!target) return
	try {
		// Disable all active links first, then archive
		await apiFetch(`/api/projects/${target.id}/close`, { method: 'POST' })
		await apiFetch(`/api/projects/${target.id}`, { method: 'DELETE' })
		editModalConfirm.value = null
		showEditProjectModal.value = false
		clearCardAction()
		pushNotification(new Notification('Project Archived', `${target.name} has been archived. All links disabled.`, 'success', 4000))
		if (activeProject.value) backToProjects()
		else await fetchProjects()
	} catch (e: any) {
		pushNotification(new Notification('Failed to archive project', e?.message || '', 'error', 8000))
	}
}

async function unarchiveProject() {
	const target = actionTarget.value
	if (!target) return
	try {
		// Unarchive then re-enable links
		await apiFetch(`/api/projects/${target.id}/unarchive`, { method: 'POST' })
		await apiFetch(`/api/projects/${target.id}/reopen`, { method: 'POST' })
		editModalConfirm.value = null
		showEditProjectModal.value = false
		clearCardAction()
		if (activeProject.value) {
			activeProject.value = { ...activeProject.value, archived: 0 }
			await refreshProjectLinkStatus()
		}
		pushNotification(new Notification('Project Unarchived', `${target.name} is active again. Links re-enabled.`, 'success', 4000))
		if (!activeProject.value) await fetchProjects()
	} catch (e: any) {
		pushNotification(new Notification('Failed to unarchive project', e?.message || '', 'error', 8000))
	}
}

async function deleteProject() {
	const target = actionTarget.value
	if (!target) return
	try {
		const qs = new URLSearchParams({ hard: '1' })
		if (projectDeleteLinks.value) qs.set('deleteLinks', '1')
		if (projectDeleteGenerated.value) qs.set('deleteGenerated', '1')
		if (projectDeleteOriginals.value) qs.set('deleteOriginals', '1')
		await apiFetch(`/api/projects/${target.id}?${qs.toString()}`, { method: 'DELETE' })
		editModalConfirm.value = null
		showEditProjectModal.value = false
		clearCardAction()
		const extra = projectDeleteLinks.value ? ' Links and associated files removed.' : ''
		pushNotification(new Notification('Project Deleted', `The project has been permanently deleted.${extra}`, 'success', 4000))
		if (activeProject.value) backToProjects()
		else await fetchProjects()
	} catch (e: any) {
		pushNotification(new Notification('Failed to delete project', e?.message || '', 'error', 8000))
	}
}

// ── Tour ──
const tourShowDemoLinks = ref(false)

const dashboardTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="flow-logo"]',
		message: 'Welcome to 45Flow!\n\nTip: You can drag and drop files anywhere onto the app to open Quick Share — the fastest way to upload and share files.\n\nLet\'s explore the dashboard.',
		beforeShow: () => { transfer.setOpen(false) },
	},
	...(isPremiumActive.value ? [{
		target: '[data-tour="connection-switcher"]',
		message: 'This is your Active Server selector.\n\n45Flow Pro can connect to multiple servers at once. The server shown here is where your actions will take effect. Use the dropdown to switch between connected servers.',
	}] : [{
		target: '[data-tour="connection-switcher"]',
		message: 'This shows your connected server.\n\nThe server displayed here is where all your actions take effect.',
	}]),
	{
		target: '[data-tour="project-list"]',
		message: 'Your projects live here. Each project is a folder on your server for one job or production.\n\nOpen a project to create links for clients, add files, and manage who has access.',
	},
	{
		target: '[data-tour="new-project"]',
		message: 'Start something new with + New Project.\n\nYou\'ll pick (or create) the folder on the server that holds the project\'s media.',
	},
])

// ── Lifecycle ──
onMounted(async () => {
	transfer.restoreActiveTranscodes(apiFetch)
	transfer.restorePersistedUploads()
	void checkLicenseInBackground()
	await fetchProjects()
	syncBrandingTheme()

	// Restore active project from global state after projects list is available
	if (!activeProject.value && globalActiveProject.value) {
		const match = projects.value.find(p => p.id === globalActiveProject.value!.id)
		if (match) activeProject.value = match
	}

	if (!onboarding.value.dashboardTourDone) {
		setTimeout(() => {
			requestTour('dashboard', dashboardTourSteps.value, () => markDone('dashboardTourDone'))
		}, 500)
	}
})

watch(() => activeConnection.value?.connectionId, () => {
	void checkLicenseInBackground()
	fetchProjects() // Reload projects when switching servers
})

// Reload projects when server filter changes (e.g. "All Servers")
watch(selectedFilter, () => {
	fetchProjects()
})

// ── Navigation ──
const leaveServer = async () => {
	if (isWeb) await signOutSession()
	const connection = activeConnection.value
	// Revoke on the server so the token stops working immediately, not just on this machine.
	if (!isWeb && connection) await revokeDesktopSession(connection.baseUrl, connection.token)
	if (connection) {
		await useConnections().clearConnectionCredentials(connection.connectionId)
		updateConnection(connection.connectionId, {
			status: 'disconnected',
			lastError: 'User logged out'
		})
	}
	clearLastSession()
	to('server-selection')
}

const showSettings = ref(false)
const settingsInitialSection = ref<string | undefined>(undefined)
const goToUpgrade = () => { settingsInitialSection.value = 'upgrade'; showSettings.value = true }
const dismissBanner = () => { showUnlicensedBanner.value = false }

const usersModalOpen = ref(false)
const goToManageUsers = () => { usersModalOpen.value = true }

const goToUploadFiles = () => { to('upload-file') }
const goToCreateLink = () => { to('create-link', undefined, activeProject.value ? { projectId: String(activeProject.value.id) } : undefined) }
</script>

<style scoped>
.dashboard-shell {
	--local-border: color-mix(in srgb, var(--btn-primary-bg) 28%, #545463);
	background: color-mix(in srgb, var(--ui-panel-bg) 0%, transparent) !important;
}

.dashboard-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem;
	justify-content: space-between;
	margin-bottom: 0.9rem;
}

.dashboard-intro {
	min-width: 0;
}

.dashboard-title {
	font-size: 1.3rem;
	line-height: 1.2;
	font-weight: 700;
}

.dashboard-subtitle {
	margin-top: 0.2rem;
	font-size: 0.9rem;
	opacity: 0.95;
}

.dashboard-drop-hint {
	flex: 1 1 18rem;
	display: flex;
	align-items: center;
	gap: 0.75rem;
	min-width: 0;
	max-width: 44rem;
	padding: 0.6rem 0.9rem;
	border: 1px dashed currentColor;
	border-radius: 0.6rem;
	opacity: 0.85;
}

.dashboard-drop-hint-icon {
	width: 1.6rem;
	height: 1.6rem;
	flex-shrink: 0;
}

.dashboard-drop-hint-title {
	font-size: 0.85rem;
	font-weight: 600;
}

.dashboard-drop-hint-copy {
	font-size: 0.75rem;
	opacity: 0.85;
}

.dashboard-utility {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.dashboard-actions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.95rem;
}

.dashboard-license-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.65rem 0.8rem;
	margin-bottom: 0.8rem;
	border: 1px solid color-mix(in srgb, #d97706 45%, var(--local-border));
	border-radius: 0.72rem;
	background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.dashboard-license-copy {
	font-size: 0.82rem;
	line-height: 1.35;
	opacity: 0.95;
}

.dashboard-action {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	text-align: left;
	gap: 0.25rem;
	padding: 0.8rem 0.95rem;
	border: 1px solid var(--local-border);
	border-radius: 0.72rem;
}

.dashboard-action-title {
	font-size: 0.95rem;
	font-weight: 700;
	line-height: 1.25;
}

.dashboard-action-copy {
	font-size: 0.76rem;
	line-height: 1.3;
	opacity: 0.86;
}

.dashboard-content-wrap {
	border: 1px solid var(--local-border);
	border-radius: 0.85rem;
	padding: 0.65rem;
	background: color-mix(in srgb, var(--btn-primary-bg) 8%, transparent);
}

.project-card {
	display: flex;
	flex-direction: column;
	transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.project-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	border-color: var(--btn-primary-bg);
}

.line-clamp-2 {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

@media (max-width: 780px) {
	.dashboard-actions {
		grid-template-columns: minmax(0, 1fr);
	}

	.dashboard-title {
		font-size: 1.15rem;
	}
}
</style>
