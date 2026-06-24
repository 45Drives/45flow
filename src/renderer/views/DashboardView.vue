<template>
	<CardContainer class="dashboard-shell overflow-y-auto h-full min-h-0">
		<template #header>
			<div class="dashboard-top">
				<div class="dashboard-intro">
					<h2 class="dashboard-title">Control Center</h2>
					<p class="dashboard-subtitle">Create links, monitor activity, and manage access from one place.</p>
				</div>

				<div class="dashboard-utility button-group-row">
					<button @click="goToManageUsers" data-tour="manage-users" class="btn btn-secondary px-5 py-2.5">Manage Access</button>
					<button @click="goToLogs" data-tour="view-logs" class="btn btn-secondary px-5 py-2.5">View Logs</button>
					<button @click="goToSettings" data-tour="settings" class="btn btn-secondary px-5 py-2.5">Settings</button>
					<button @click="leaveServer" class="btn btn-danger px-5 py-2.5">Log Out</button>
				</div>
			</div>

			<div v-if="showUnlicensedBanner && !isPremiumActive" class="dashboard-license-banner">
				<div class="dashboard-license-copy">
					{{ unlicensedBannerMessage }}
				</div>
				<button type="button" class="btn btn-primary h-fit" @click="goToUpgrade">Go Pro</button>
				<button type="button" class="btn btn-secondary h-fit text-xs px-2 py-1" @click="dismissBanner">✕</button>
			</div>

			<div class="dashboard-actions" data-tour="action-cards">
				<button @click="goToCreateLink" class="btn btn-primary dashboard-action" data-tour="create-link">
					<span class="dashboard-action-title">Create Link</span>
					<span class="dashboard-action-copy">Create a shareable link for users to upload or review.</span>
				</button>
				<button @click="goToUploadFiles" class="btn btn-primary dashboard-action" data-tour="upload-files">
					<span class="dashboard-action-title">Upload Files</span>
					<span class="dashboard-action-copy">Send files from this workstation to the server.</span>
				</button>
			</div>
		</template>

		<!-- ═══════════ Flat Links View (Project Mode OFF) ═══════════ -->
		<div v-if="!projectModeEnabled" class="dashboard-content-wrap" data-tour="manage-links">
			<ManageLinks :tourActive="tourShowDemoLinks"/>
		</div>

		<!-- ═══════════ Project List View ═══════════ -->
		<div v-else-if="!activeProject" class="dashboard-content-wrap" data-tour="project-list">
			<div class="flex items-center justify-between gap-3 mb-3 px-1">
				<h3 class="text-base font-semibold">Projects</h3>
				<div class="flex items-center gap-3">
					<label class="flex items-center gap-1.5 cursor-pointer select-none">
						<input type="checkbox" v-model="showArchivedProjects" class="styled-checkbox" />
						<span class="text-xs text-muted">Show Archived</span>
					</label>
					<button class="btn btn-secondary text-xs px-3 py-1.5" @click="showCreateProjectModal = true">+ New Project</button>
				</div>
			</div>

			<div v-if="projectsLoading" class="flex items-center justify-center py-8">
				<span class="text-sm text-muted">Loading projects…</span>
			</div>

			<div v-else-if="projects.length === 0" class="flex flex-col items-center justify-center py-12 gap-3">
				<p class="text-muted text-sm">No projects yet. Create your first project to get started.</p>
				<button class="btn btn-primary px-4 py-2 text-sm" @click="showCreateProjectModal = true">Create Project</button>
			</div>

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
								<span v-if="project.is_disabled" class="ss-chip ss-chip--danger text-xs shrink-0">DISABLED</span>
								<span v-if="project.archived" class="ss-chip ss-chip--muted text-xs shrink-0">Archived</span>
							</div>
							<div class="flex items-center gap-1 shrink-0" @click.stop>
								<button
									class="btn btn-secondary px-2 py-1 text-xs"
									title="Edit project name, directory, and description"
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
							<span class="ss-chip ss-chip--neutral text-xs">Total Links: {{ project.link_count ?? 0 }}</span>
							<span class="ss-chip ss-chip--success text-xs">Active {{ project.active_count ?? 0 }}</span>
							<span class="ss-chip ss-chip--warning text-xs">Expired {{ project.expired_count ?? 0 }}</span>
							<span class="ss-chip ss-chip--danger text-xs">Disabled {{ project.disabled_count ?? 0 }}</span>
						</div>
						<div v-if="project._serverName" class="text-xs text-muted mb-1">Server: {{ project._serverName }}</div>
						<div class="text-xs truncate" :title="project.root_dir">Directory: {{ project.root_dir }}</div>
						<p v-if="project.description" class="text-xs line-clamp-2 mb-2">Description: {{ project.description }}</p>
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

			<!-- ═══════════ Unassigned Links (collapsible) ═══════════ -->
			<div class="mt-6">
				<button
					class="flex items-center gap-2 w-full text-left px-1 py-2 rounded-md hover:bg-white/5 transition-colors"
					@click="unassignedOpen = !unassignedOpen"
				>
					<svg class="w-4 h-4 text-muted transition-transform" :class="{ 'rotate-90': unassignedOpen }" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
					</svg>
					<h3 class="text-base font-semibold">Unassigned Links</h3>
					<span class="text-xs text-muted">(links not assigned to any project)</span>
				</button>
				<div v-show="unassignedOpen" class="mt-2">
					<ManageLinks projectId="none" key="unassigned" :tourActive="tourShowDemoLinks"/>
				</div>
			</div>
		</div>

		<!-- ═══════════ Project Detail View (Links) ═══════════ -->
		<div v-else class="dashboard-content-wrap" data-tour="manage-links">
			<!-- Breadcrumb -->
			<div class="flex items-center gap-2 mb-3 px-1">
				<button class="text-sm text-primary hover:underline cursor-pointer" @click="backToProjects">Projects</button>
				<span class="text-muted text-sm">›</span>
				<span class="text-sm font-semibold truncate">{{ activeProject.name }}</span>
				<span v-if="activeProject.archived" class="ss-chip ss-chip--muted text-xs">Archived</span>
				<div class="button-group-row ml-auto text-xs">
					<button class="btn btn-secondary" @click="startEditProject">Edit Project</button>
					<button class="btn btn-danger" @click="backToProjects">Close</button>
				</div>
			</div>
			<div class="flex flex-row justify-start text-default border-b border-default">
				<p class="text-xs mb-3 px-1 truncate" :title="activeProject.root_dir">Directory: {{ activeProject.root_dir }}</p>
				<p v-if="activeProject.description" class="text-xs mb-1 px-1">|</p>
				<p v-if="activeProject.description" class="text-xs mb-1 px-1">Description: {{ activeProject.description }}</p>
			</div>

			<ManageLinks :projectId="activeProject.id" :key="activeProject.id" :tourActive="tourShowDemoLinks"/>
		</div>
	</CardContainer>

	<SettingsModal v-if="showSettings" :initialSection="settingsInitialSection" @close="showSettings = false" />
	<LogViewModal v-if="showLogs" @close="showLogs = false" />
	<AddUsersModal v-model="usersModalOpen" :apiFetch="apiFetch" />
	<CreateProjectModal v-model="showCreateProjectModal" @created="onProjectCreated" />

	<!-- Edit Project Modal -->
	<Teleport to="body">
		<div v-if="showEditProjectModal && activeProject" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-default" @click.self="closeEditModal">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-4xl mx-4 bg-accent">

				<!-- Default: Edit Form -->
				<template v-if="!editModalConfirm">
					<h3 class="text-lg font-semibold mb-4">Edit Project</h3>
					<form @submit.prevent="saveProject" class="flex flex-col gap-4">
						<div>
							<label class="block text-sm font-medium mb-1">Project Name</label>
							<input
								v-model="editProjectName"
								type="text"
								class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
								required
							/>
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Project Root Directory</label>
							<FolderPicker
								:key="editKey"
								v-model="editProjectRoot"
								:apiFetch="apiFetch"
								useCase="upload"
								subtitle="Change the root directory for this project."
								:auto-detect-roots="true"
								:allow-entire-tree="true"
								:startDir="editProjectRoot"
								v-model:project="editProjectPickerBase"
								v-model:dest="editProjectRoot"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Description (optional)</label>
							<textarea
								v-model="editProjectDescription"
								class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none"
								rows="2"
								placeholder="Brief description…"
							/>
						</div>
						
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<button v-if="!activeProject?.archived" type="button"
									class="btn btn-warning px-3 py-2 text-sm"
									title="Deactivate all links and hide the project from the default view. You can unarchive it later."
									@click="editModalConfirm = 'archive'">Archive</button>
								<button v-if="activeProject?.archived" type="button"
									class="btn btn-success px-3 py-2 text-sm"
									title="Restore the project and re-enable all previously disabled links."
									@click="editModalConfirm = 'unarchive'">Unarchive</button>
							</div>
							<button type="button" class="btn btn-danger px-3 py-2 text-sm"
								title="Permanently remove the project. Links will be unlinked but not deleted."
								@click="editModalConfirm = 'delete'; resetProjectDeleteState(); loadProjectDeletePreview(activeProject!)">Delete Project</button>
						</div>

						<hr class="border-default" />
						<div class="flex items-center justify-end gap-2">
							<button type="button" class="btn btn-secondary px-4 py-2"
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
					<h3 class="text-lg font-semibold mb-2 text-orange-600 dark:text-orange-400">Archive Project</h3>
					<div class="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 mb-4">
						<p class="text-sm text-orange-700 dark:text-orange-300 font-medium mb-2">This will deactivate and hide the project:</p>
						<ul class="text-sm text-orange-600 dark:text-orange-300/80 list-disc list-inside space-y-1">
							<li>All active links will be disabled immediately</li>
							<li>The project will be hidden from the default view</li>
							<li>No files or links are deleted</li>
							<li>You can unarchive the project at any time to restore it</li>
						</ul>
					</div>
					<p class="text-sm text-default mb-4">Archive <strong>{{ activeProject.name }}</strong>?</p>
					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-secondary px-4 py-2" @click="editModalConfirm = null">Back</button>
						<button class="btn btn-warning px-4 py-2" @click="archiveProject">Archive</button>
					</div>
				</template>

				<!-- Confirm: Unarchive -->
				<template v-else-if="editModalConfirm === 'unarchive'">
					<h3 class="text-lg font-semibold mb-2 text-green-600 dark:text-green-400">Unarchive Project</h3>
					<div class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-800 mb-4">
						<p class="text-sm text-green-700 dark:text-green-300 font-medium mb-2">This will restore the project:</p>
						<ul class="text-sm text-green-600 dark:text-green-300/80 list-disc list-inside space-y-1">
							<li>The project will reappear in the default view</li>
							<li>All previously disabled links will be re-enabled</li>
							<li>Expired links will remain expired</li>
						</ul>
					</div>
					<p class="text-sm text-default mb-4">Unarchive <strong>{{ activeProject.name }}</strong>?</p>
					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-secondary px-4 py-2" @click="editModalConfirm = null">Back</button>
						<button class="btn btn-success px-4 py-2" @click="unarchiveProject">Unarchive</button>
					</div>
				</template>

				<!-- Confirm: Delete -->
				<template v-else-if="editModalConfirm === 'delete'">
					<h3 class="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">Delete Project</h3>
					<div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 mb-4">
						<p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">This action is irreversible and will permanently destroy:</p>
						<ul class="text-sm text-red-600 dark:text-red-300/80 list-disc list-inside space-y-1">
							<li>The project and all its metadata</li>
							<li>All links will be unlinked from this project (unless you choose to delete them below)</li>
						</ul>
					</div>

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
									<p v-if="projectDeletePreview.summary.sharedFiles > 0" class="text-amber-600 dark:text-amber-400">
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
										<span class="text-sm text-red-600 dark:text-red-400 font-medium">Delete original source files</span>
										<p class="text-xs text-red-500 dark:text-red-300/80">
											The actual media files on disk. Cannot be recovered.
											({{ formatBytes(projectDeletePreview.summary.totalOriginalBytes) }})
										</p>
									</div>
								</label>

								<div v-if="projectDeleteOriginals" class="p-2 rounded bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 ml-5">
									<p class="text-xs text-red-700 dark:text-red-300 font-medium">
										Danger: this will permanently delete the original source files from disk.
									</p>
									<div v-if="projectDeletePreview.files.filter((f: any) => !f.sharedWithOtherLinks).length > 0"
										class="mt-2 max-h-24 overflow-y-auto">
										<p class="text-xs text-default mb-1">Files that will be deleted:</p>
										<ul class="text-xs text-red-600 dark:text-red-200/70 list-disc list-inside">
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

					<label class="block text-sm text-default mb-1">
						Type <strong class="text-red-600 dark:text-red-400">DELETE</strong> to confirm:
					</label>
					<input v-model="projectDeleteConfirmText" type="text"
						class="input-textlike w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-default mb-4"
						placeholder="DELETE" autocomplete="off" />

					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-secondary px-4 py-2" @click="editModalConfirm = null">Back</button>
						<button class="btn btn-primary px-4 py-2 bg-red-600! hover:bg-red-500!"
							:disabled="projectDeleteConfirmText !== 'DELETE'"
							@click="deleteProject">Delete Permanently</button>
					</div>
				</template>

			</div>
		</div>
	</Teleport>

	<!-- Card-level Disable Confirmation Modal -->
	<Teleport to="body">
		<div v-if="cardActionProject && cardAction === 'disable'" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50" @click.self="clearCardAction()">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 text-default bg-accent">
				<h3 class="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">Disable Project</h3>
				<div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 mb-4">
					<p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">This will disable the project and all its links:</p>
					<ul class="text-sm text-red-600 dark:text-red-300/80 list-disc list-inside space-y-1">
						<li>All active links will be disabled immediately</li>
						<li>The project will appear greyed out with a DISABLED badge</li>
						<li>No files or links are deleted</li>
						<li>You can re-enable the project at any time</li>
					</ul>
				</div>
				<p class="text-sm text-default mb-4">Disable <strong>{{ cardActionProject.name }}</strong>?</p>
				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-danger px-4 py-2" @click="disableProject">Disable</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Card-level Archive Confirmation Modal (project list view) -->
	<Teleport to="body">
		<div v-if="cardActionProject && cardAction === 'archive'" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50" @click.self="clearCardAction()">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 text-default bg-accent">
				<h3 class="text-lg font-semibold mb-2 text-orange-600 dark:text-orange-400">Archive Project</h3>
				<div class="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 mb-4">
					<p class="text-sm text-orange-700 dark:text-orange-300 font-medium mb-2">This will deactivate and hide the project:</p>
					<ul class="text-sm text-orange-600 dark:text-orange-300/80 list-disc list-inside space-y-1">
						<li>All active links will be disabled immediately</li>
						<li>The project will be hidden from the default view</li>
						<li>No files or links are deleted</li>
						<li>You can unarchive the project at any time to restore it</li>
					</ul>
				</div>
				<p class="text-sm text-default mb-4">Archive <strong>{{ cardActionProject.name }}</strong>?</p>
				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-warning px-4 py-2" @click="archiveProject">Archive</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Card-level Unarchive Confirmation Modal -->
	<Teleport to="body">
		<div v-if="cardActionProject && cardAction === 'unarchive'" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50" @click.self="clearCardAction()">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 text-default bg-accent">
				<h3 class="text-lg font-semibold mb-2 text-green-600 dark:text-green-400">Unarchive Project</h3>
				<div class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-800 mb-4">
					<p class="text-sm text-green-700 dark:text-green-300 font-medium mb-2">This will restore the project:</p>
					<ul class="text-sm text-green-600 dark:text-green-300/80 list-disc list-inside space-y-1">
						<li>The project will reappear in the default view</li>
						<li>All previously disabled links will be re-enabled</li>
						<li>Expired links will remain expired</li>
					</ul>
				</div>
				<p class="text-sm text-default mb-4">Unarchive <strong>{{ cardActionProject.name }}</strong>?</p>
				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-success px-4 py-2" @click="unarchiveProject">Unarchive</button>
				</div>
			</div>
		</div>
	</Teleport>

	<!-- Card-level Delete Confirmation Modal -->
	<Teleport to="body">
		<div v-if="cardActionProject && cardAction === 'delete'" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50" @click.self="clearCardAction()">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto text-default bg-accent">
				<h3 class="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">Delete Project</h3>
				<div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 mb-4">
					<p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">This action is irreversible and will permanently destroy:</p>
					<ul class="text-sm text-red-600 dark:text-red-300/80 list-disc list-inside space-y-1">
						<li>The project and all its metadata</li>
						<li>All links will be unlinked from this project (unless you choose to delete them below)</li>
					</ul>
				</div>

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
								<p>{{ projectDeletePreview.summary.totalFiles }} file(s) across all links</p>
								<p v-if="projectDeletePreview.summary.sharedFiles > 0" class="text-amber-600 dark:text-amber-400">
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
									<span class="text-sm text-red-600 dark:text-red-400 font-medium">Delete original source files</span>
									<p class="text-xs text-red-500 dark:text-red-300/80">
										The actual media files on disk. Cannot be recovered.
										({{ formatBytes(projectDeletePreview.summary.totalOriginalBytes) }})
									</p>
								</div>
							</label>

							<div v-if="projectDeleteOriginals" class="p-2 rounded bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 ml-5">
								<p class="text-xs text-red-700 dark:text-red-300 font-medium">
									Danger: this will permanently delete the original source files from disk.
								</p>
								<div v-if="projectDeletePreview.files.filter((f: any) => !f.sharedWithOtherLinks).length > 0"
									class="mt-2 max-h-24 overflow-y-auto">
									<p class="text-xs text-default mb-1">Files that will be deleted:</p>
									<ul class="text-xs text-red-600 dark:text-red-200/70 list-disc list-inside">
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

				<label class="block text-sm text-default mb-1">
					Type <strong class="text-red-600 dark:text-red-400">DELETE</strong> to confirm:
				</label>
				<input v-model="projectDeleteConfirmText" type="text"
					class="input-textlike w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-default mb-4"
					placeholder="DELETE" autocomplete="off" />

				<div class="flex items-center justify-end gap-2">
					<button class="btn btn-secondary px-4 py-2" @click="clearCardAction()">Cancel</button>
					<button class="btn btn-primary px-4 py-2 bg-red-600! hover:bg-red-500!"
						:disabled="projectDeleteConfirmText !== 'DELETE'"
						@click="deleteProject">Delete Permanently</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { CardContainer } from '@45drives/houston-common-ui'
import { Notification } from '@45drives/houston-common-ui'
import { useHeader } from '../composables/useHeader'
import { useResilientNav } from '../composables/useResilientNav'
import { pushNotification } from '../composables/useNotificationQueue'
import ManageLinks from './ManageLinks.vue'
import SettingsModal from '../components/modals/SettingsModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import LogViewModal from '../components/modals/LogViewModal.vue'
import CreateProjectModal from '../components/modals/CreateProjectModal.vue'
import FolderPicker from '../components/FolderPicker.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useApi, apiFetchAll } from '../composables/useApi'
import { useTransferProgress } from '../composables/useTransferProgress'
import { clearLastSession } from '../composables/useSessionPersistence'
import { useConnections } from '../composables/useConnections'
import { useServerFilter } from '../composables/useServerFilter'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import { useActiveProject } from '../composables/useActiveProject'
import { useProjectMode } from '../composables/useProjectMode'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import { useThemeFromAlias } from '../composables/useThemeFromAlias'

useHeader('Dashboard')
const { to } = useResilientNav()
const { apiFetch } = useApi()
const transfer = useTransferProgress()
const { activeConnection, updateConnection, setActive } = useConnections()
const { selectedFilter, filteredConnections, setFilter } = useServerFilter()
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()
const { activeProject: globalActiveProject, setActiveProject: setGlobalActiveProject } = useActiveProject()
const { projectModeEnabled } = useProjectMode()
const { isPremiumActive, startBackgroundCheck, stopBackgroundCheck, checkLicenseInBackground } = useLicenseStatus()
const { setCustomThemeEnabled, setCustomThemeColors } = useThemeFromAlias()

// Start background license polling while dashboard is mounted
startBackgroundCheck()
onUnmounted(() => stopBackgroundCheck())

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

// Clear active project when project mode is disabled
watch(projectModeEnabled, (enabled) => {
	if (!enabled) {
		activeProject.value = null
		setGlobalActiveProject(null)
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
	if (!activeProject.value || !editProjectName.value.trim() || !editProjectRoot.value.trim()) return
	savingProject.value = true
	try {
		await apiFetch(`/api/projects/${activeProject.value.id}`, {
			method: 'PATCH',
			body: JSON.stringify({
				name: editProjectName.value.trim(),
				rootDir: editProjectRoot.value.trim(),
				description: editProjectDescription.value.trim() || null,
			}),
		})
		activeProject.value = {
			...activeProject.value,
			name: editProjectName.value.trim(),
			root_dir: editProjectRoot.value.trim(),
			description: editProjectDescription.value.trim() || null,
		}
		showEditProjectModal.value = false
		pushNotification(new Notification('Project Updated', '', 'success', 4000))
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
	activeProject.value = project
	startEditProject()
}

function clearCardAction() {
	cardActionProject.value = null
	cardAction.value = null
	resetProjectDeleteState()
}

function closeEditModal() {
	showEditProjectModal.value = false
	editModalConfirm.value = null
	resetProjectDeleteState()
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
		target: '[data-tour="action-cards"]',
		message: 'These are your main actions: create a Link for sharing/uploading, or upload files directly from your workstation.',
	},
	{
		target: '[data-tour="project-list"]',
		message: 'Your projects appear here. Each project organizes links under a shared root directory. Click a project to see its links.\n\nTip: If you prefer a flat list without project grouping, you can disable Project Mode in Settings → Preferences.',
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
const leaveServer = () => {
	if (activeConnection.value) {
		updateConnection(activeConnection.value.connectionId, {
			status: 'disconnected',
			lastError: 'User logged out'
		})
	}
	clearLastSession()
	to('server-selection')
}

const showSettings = ref(false)
const settingsInitialSection = ref<string | undefined>(undefined)
const goToSettings = () => { settingsInitialSection.value = undefined; showSettings.value = true }
const goToUpgrade = () => { settingsInitialSection.value = 'upgrade'; showSettings.value = true }
const dismissBanner = () => { showUnlicensedBanner.value = false }

const showLogs = ref(false)
const goToLogs = () => { showLogs.value = true }

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
