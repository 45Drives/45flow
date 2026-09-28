<template>
	<div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
		<div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
			<div class="grid w-full grid-cols-1 gap-4 text-xl min-w-0">
				<CardContainer class="w-full bg-well rounded-md shadow-xl min-w-0">
					<div class="ss-toned-panel flex flex-col gap-3 text-left min-w-0 p-3">
						<!-- Header -->
						<div class="flex items-center justify-between gap-3 min-w-0">
							<div>
								<h2 class="text-xl font-semibold">Create Link</h2>
								<p class="text-sm opacity-80 -mt-0.5">
									Create a combined link for uploading and/or sharing files.
								</p>
							</div>
							<button class="btn btn-secondary px-4 py-2 text-sm" @click="goBack">Back</button>
						</div>

						<div v-if="initializing" class="border-t border-default pt-6 pb-4">
							<div class="flex flex-col items-center justify-center gap-3 text-center min-h-[16rem]">
								<span class="inline-block w-7 h-7 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
								<div>
									<p class="text-base font-medium">Loading Create Link...</p>
									<p class="text-sm text-default">Resolving project and folder context.</p>
								</div>
							</div>
						</div>

						<template v-else>

						<!-- ══════ Section: Project & Capabilities ══════ -->
						<section class="border-t border-default pt-3" data-tour="create-link-capabilities">
							<div class="flex flex-wrap items-start gap-6">
								<!-- Project selector -->
								<div v-if="projectModeEnabled" class="flex flex-col gap-2 min-w-[220px]" data-tour="create-link-project">
									<h3 class="text-base font-semibold">Project</h3>
									<div class="flex flex-wrap items-center gap-2">
										<select
											v-model="selectedProjectId"
											class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-sm min-w-[200px]"
											@change="onProjectChange"
										>
											<option :value="null">— No project —</option>
											<option v-for="p in projects" :key="p.id" :value="p.id">
												{{ p.name }}
											</option>
										</select>
										<button type="button" class="btn btn-secondary text-sm px-3 py-1.5" @click="showNewProjectModal = true">
											+ New Project
										</button>
									</div>
									<p v-if="selectedProject" class="text-xs text-default truncate">
										Root: {{ selectedProject.root_dir }}
									</p>
								</div>

								<!-- Link Title -->
								<div class="flex flex-col gap-2 flex-1 min-w-[220px]">
									<h3 class="text-base font-semibold">Link Title</h3>
									<input
										type="text"
										v-model.trim="opts.linkTitle.value"
										class="input-textlike border rounded-lg px-3 py-2 w-full text-sm"
										placeholder="Optional title for the shared link"
									/>
								</div>
							</div>
						</section>

						<!-- ══════ Section: Upload & Share Columns ══════ -->
						<section class="border-t border-default pt-3" data-tour="create-link-upload-dest">
							<div class="create-link-capability-grid">
								<!-- ─── Upload Destination Column ─── -->
								<div
									class="flex flex-col rounded-lg border p-3 transition-all text-sm min-w-0 overflow-hidden"
									:class="opts.uploadEnabled.value
										? 'border-default bg-default/40'
										: 'border-default/50 bg-well/30'"
								>
									<label class="inline-flex items-center gap-2 select-none cursor-pointer font-semibold text-sm pointer-events-auto mb-1">
										<input type="checkbox" v-model="opts.uploadEnabled.value" class="proxy-quality-checkbox" />
										<span>Upload Destination</span>
									</label>
									<p class="text-xs text-default mb-2">Check this to send a client a link where <strong>they</strong> upload files to you (e.g. footage, assets). You do not need to also check "Files to Share / Review" — turn on <strong>Auto-share uploaded files</strong> in Link Options below if you want them to immediately view/download what they just sent.</p>

									<template v-if="opts.uploadEnabled.value">
										<FolderPicker
											:key="uploadPickerKey"
											v-model="uploadDest"
											:apiFetch="apiFetch"
											useCase="upload"
											subtitle=""
											:auto-detect-roots="false"
											:allow-entire-tree="false"
											:hide-project-controls="true"
											:startDir="fileBrowserBase || undefined"
											v-model:project="uploadProjectBase"
											v-model:dest="uploadDest"
											:uploadLink="true"
											:compact="true"
										/>
									</template>
									<div v-else class="flex flex-1 items-center justify-center opacity-50 text-sm italic py-8">
										Enable to choose where reviewers can upload files.
									</div>
								</div>

								<!-- ─── Share / Review Column ─── -->
								<div
									class="flex flex-col rounded-lg border p-3 transition-all text-sm min-w-0 overflow-hidden"
									:class="opts.shareEnabled.value
										? 'border-default bg-default/40'
										: 'border-default/50 bg-well/30'"
									data-tour="create-link-share-files"
								>
									<label class="inline-flex items-center gap-2 select-none cursor-pointer font-semibold text-sm pointer-events-auto mb-1">
										<input type="checkbox" v-model="opts.shareEnabled.value" class="proxy-quality-checkbox" />
										<span>Files to Share / Review</span>
									</label>
									<p class="text-xs text-default mb-2">Check this to send a client a link where <strong>they</strong> view or download files you pick below. Check a folder's box to include everything inside it.</p>

									<template v-if="opts.shareEnabled.value">
										<FileExplorer
											:apiFetch="apiFetch"
											:modelValue="shareFiles"
											@add="onShareAdd"
											@remove="onShareRemove"
											@error="onShareExplorerError"
											:startDir="fileBrowserBase"
											:compact="true"
										/>

										<!-- Selected files -->
										<div v-if="shareFiles.length" class="mt-2 border border-default p-0.5 rounded bg-accent min-w-0">
											<div class="flex flex-wrap items-center justify-between gap-2 px-2 py-1 min-w-0">
												<div class="text-sm font-semibold">
													Selected <span class="text-default">({{ shareFiles.length }})</span>
												</div>
												<div class="flex flex-wrap items-center gap-2">
													<button class="btn btn-secondary text-xs px-2 py-1" @click="showSelected = !showSelected">
														{{ showSelected ? 'Hide' : 'Show' }}
													</button>
													<button class="btn btn-danger text-xs px-2 py-1" @click="shareFiles = []">Clear</button>
												</div>
											</div>

											<div v-show="showSelected" class="max-h-40 overflow-auto min-w-0">
												<div v-for="group in groupedShareFiles" :key="group.dir" class="border-t border-default">
													<div v-if="group.files.length > 1" class="grid items-center grid-cols-[minmax(0,1fr)_auto] min-w-0 bg-well/30">
														<div class="px-3 py-1.5 min-w-0 flex items-center gap-1.5" :title="group.dir">
															<span aria-hidden="true">📁</span>
															<span class="truncate font-medium text-default min-w-0">{{ group.dir.split('/').pop() || group.dir }}/</span>
															<span class="text-default shrink-0">({{ group.files.length }} files)</span>
														</div>
														<button class="btn btn-danger m-1.5 px-2 py-1" @click="removeShareGroup(group.files)" title="Remove entire folder">✕</button>
													</div>
													<div v-for="f in group.files" :key="f"
														class="grid items-center grid-cols-[minmax(0,1fr)_auto] border-t border-default first:border-t-0 text-sm min-w-0">
														<div class="relative px-3 py-2 rounded-md bg-default min-w-0" :class="{ 'ml-4': group.files.length > 1 }">
															<span aria-hidden="true"
																class="pointer-events-none absolute inset-0 rounded-md bg-green-500/50 animate-pulse z-0"></span>
															<span class="truncate block text-default relative z-10 min-w-0">{{ group.files.length > 1 ? f.split('/').pop() : f }}</span>
														</div>
														<button class="btn btn-danger m-2 px-2 py-1" @click="removeShareFile(f)" title="Remove">✕</button>
													</div>
												</div>
											</div>
										</div>
									</template>
									<div v-else class="flex flex-1 items-center justify-center opacity-50 text-sm italic py-8">
										Enable to select files for sharing or review.
									</div>
								</div>
							</div>

							<p v-if="!opts.uploadEnabled.value && !opts.shareEnabled.value" class="text-sm italic font-bold text-red-400 mt-2 justify-self-center">
								At least one capability must be enabled.
							</p>
						</section>

						<!-- ══════ Section: Link Options ══════ -->
						<section class="border-t border-default pt-3" data-tour="create-link-options">
							<h3 class="text-base font-semibold mb-2">Link Options</h3>
							<CommonLinkControls>
								<template #expiry>
									<div class="flex flex-col gap-3 min-w-0">
										<div class="flex items-center gap-3 min-w-0">
											<label class="font-semibold whitespace-nowrap shrink-0">Expires in:</label>
											<div class="flex items-center gap-2 min-w-0 flex-1">
												<input
													type="number"
													min="1"
													step="1"
													v-model.number="opts.expiresValue.value"
													class="input-textlike border rounded px-3 py-2 w-24"
												/>
												<select v-model="opts.expiresUnit.value" class="input-textlike border rounded px-3 py-2 w-32">
													<option value="hours">hours</option>
													<option value="days">days</option>
													<option value="weeks">weeks</option>
												</select>
											</div>
										</div>
										<div class="flex flex-nowrap gap-1 text-xs min-w-0">
											<button type="button" class="btn btn-secondary w-20" @click="opts.setPreset(1, 'hours')">1 hour</button>
											<button type="button" class="btn btn-secondary w-20" @click="opts.setPreset(1, 'days')">1 day</button>
											<button type="button" class="btn btn-secondary w-20" @click="opts.setPreset(1, 'weeks')">1 week</button>
											<button type="button" class="btn btn-secondary w-20" @click="opts.setNever()">Never</button>
										</div>
									</div>
								</template>

								<template #title>
									<div class="flex flex-col gap-2 min-w-0" :class="{ 'opacity-40 pointer-events-none': !opts.uploadEnabled.value }">
										<span class="font-semibold sm:whitespace-nowrap">After Upload</span>
										<template v-if="opts.uploadEnabled.value">
											<label class="flex items-start gap-2 select-none cursor-pointer min-w-0">
												<input
													type="checkbox"
													v-model="autoShareUploads"
													class="proxy-quality-checkbox mt-0.5 shrink-0"
												/>
												<div class="min-w-0">
													<div class="text-sm font-medium">Auto-share uploaded files</div>
													<div class="text-xs text-default">
														<template v-if="opts.shareEnabled.value">Automatically add new uploads to this link's shared files.</template>
														<template v-else>Let this same link switch to view/download mode for each file right after they upload it — no need to enable "Files to Share / Review" or send a second link.</template>
													</div>
												</div>
											</label>
											<label class="flex items-start gap-2 select-none cursor-pointer min-w-0">
												<input
													type="checkbox"
													v-model="autoWatermarkUploads"
													class="proxy-quality-checkbox mt-0.5 shrink-0"
												/>
												<div class="min-w-0">
													<div class="text-sm font-medium">Auto-watermark uploads</div>
													<div class="text-xs text-default">
														Apply this link's watermark settings to new uploads.
													</div>
												</div>
											</label>
											<label class="flex items-start gap-2 select-none cursor-pointer min-w-0">
												<input
													type="checkbox"
													v-model="autoTranscodeUploads"
													class="proxy-quality-checkbox mt-0.5 shrink-0"
												/>
												<div class="min-w-0">
													<div class="text-sm font-medium">Auto-transcode uploads</div>
													<div class="text-xs text-default">
														Automatically generate review-copy proxies (server-side) for each video uploaded to this link.
													</div>
												</div>
											</label>
											<div v-if="autoTranscodeUploads" class="ml-6 flex flex-col gap-1">
												<span class="text-xs font-medium text-default">Proxy resolution</span>
												<div class="flex flex-wrap gap-x-3 gap-y-1">
													<label class="inline-flex items-center gap-2 text-sm">
														<input type="checkbox" class="proxy-quality-checkbox" value="720p"
															:checked="autoTranscodeProxyQualities.includes('720p')"
															@change="toggleAutoTranscodeQuality('720p', ($event.target as HTMLInputElement).checked)" />
														<span>720p</span>
													</label>
													<label class="inline-flex items-center gap-2 text-sm">
														<input type="checkbox" class="proxy-quality-checkbox" value="1080p"
															:checked="autoTranscodeProxyQualities.includes('1080p')"
															@change="toggleAutoTranscodeQuality('1080p', ($event.target as HTMLInputElement).checked)" />
														<span>1080p</span>
													</label>
													<label class="inline-flex items-center gap-2 text-sm">
														<input type="checkbox" class="proxy-quality-checkbox" value="original"
															:checked="autoTranscodeProxyQualities.includes('original')"
															@change="toggleAutoTranscodeQuality('original', ($event.target as HTMLInputElement).checked)" />
														<span>Full Res</span>
													</label>
												</div>
											</div>
										</template>
										<p v-else class="text-xs text-default italic">
											Enable "Upload Destination" above to configure what happens after a client uploads a file.
										</p>
									</div>
								</template>

								<template #access>
									<div class="flex flex-col gap-1 min-w-0">
										<div class="flex flex-wrap items-center gap-3 min-w-0">
											<span class="font-semibold sm:whitespace-nowrap">Network Access:</span>
											<div class="flex flex-wrap gap-2 min-w-0" role="radiogroup" aria-label="Network Access">
												<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition border border-default bg-default hover:bg-well/40">
													<input type="radio" name="create-link-access-network" :value="false" v-model="opts.usePublicBase.value" class="h-4 w-4" />
													<span class="text-sm truncate">Share Locally (Over LAN)</span>
												</label>
												<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition border border-default bg-default hover:bg-well/40">
													<input type="radio" name="create-link-access-network" :value="true" v-model="opts.usePublicBase.value" class="h-4 w-4" />
													<span class="text-sm truncate">Share Externally (Over Internet)</span>
												</label>
											</div>
										</div>
										<p class="text-xs text-default">
											External sharing needs working port forwarding.
										</p>
									</div>
								</template>

								<template #accessExtra>
									<div v-if="opts.usePublicBase.value" class="flex flex-col gap-3 min-w-0">
										<CheckPortForwarding :apiFetch="apiFetch" endpoint="/api/forwarding/check" :autoCheckOnMount="false" :showDetails="true" />
									</div>
								</template>

								<template #after>
									<div class="border-t border-default mt-2 pt-2 min-w-0">
										<LinkAccessMode
											v-model="opts.accessMode.value"
											v-model:password="opts.password.value"
											v-model:showPassword="opts.showPassword.value"
											v-model:allowOpenComments="opts.allowOpenComments.value"
											:accessCount="opts.accessCount.value"
											:accessSatisfied="opts.accessSatisfied.value"
											radioName="create-link-access-mode"
											wrapperClass="ss-toned-panel min-w-0 p-3"
											@openUserModal="showAccessModal = true"
											@openCategoriesModal="showCategoriesModal = true"
										/>
									</div>
								</template>
							</CommonLinkControls>
						</section>

						<!-- ══════ Section: Media Options (video/image watermark, proxy) ══════ -->
						<section v-if="opts.shareEnabled.value && hasMediaSelected" class="border-t border-default pt-3" data-tour="create-link-media-options">
							<h3 class="text-base font-semibold mb-2">{{ hasVideoSelected && hasImageSelected ? 'Media Options' : hasVideoSelected ? 'Video Options' : 'Image Options' }}</h3>
							<VideoOptionsPanel
								v-model:proxyQualities="proxyQualities"
								v-model:watermarkEnabled="watermarkEnabled"
								v-model:selectedExistingWatermark="selectedExistingWatermark"
								v-model:showDefaultWatermarks="showDefaultWatermarks"
								:watermarkFile="watermarkFile"
								:existingWatermarkFiles="existingWatermarkFiles"
								:defaultWatermarks="validDefaultWatermarks"
								:effectiveWatermarkPreviewUrl="effectiveWatermarkPreviewUrl"
								:effectiveWatermarkName="effectiveWatermarkName"
								:usingExistingWatermark="usingExistingWatermark"
								:showHeading="false"
								:watermarkLabel="hasVideoSelected && hasImageSelected ? 'Watermark Media' : hasVideoSelected ? 'Watermark Videos' : 'Watermark Images'"
								:pickButtonLabel="usingExistingWatermark ? 'Replace...' : 'Browse...'"
								:hideProxyQualities="!hasVideoSelected"
								@pickWatermark="pickWatermark"
								@clearWatermark="clearWatermark"
								@refreshWatermarks="loadExistingWatermarks"
							/>

							<!-- Transcoding mode hint -->
							<div v-if="hasVideoSelected" class="text-xs text-default flex items-center gap-1.5 mt-2">
								<template v-if="clientTranscodeEnabled">
									<span class="text-green-600 dark:text-green-400">✓</span>
									<span>Client-side transcoding: <strong class="text-default">Enabled</strong> — files will be streamed from the server and transcoded locally</span>
								</template>
								<template v-else>
									<span class="text-blue-500 dark:text-blue-400">ⓘ</span>
									<span>Transcoding will be handled by the server (files are already uploaded)</span>
								</template>
							</div>

							<!-- Existing watermark info message -->
							<p v-if="existingFileWatermarkMessage && watermarkEnabled" class="text-xs text-emerald-500 mt-1.5 flex items-center gap-1.5">
								<svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								{{ existingFileWatermarkMessage }}
								<span v-if="watermarkUnchanged" class="text-default">(no re-encode needed)</span>
							</p>

							<!-- Watermark Customizer (premium) or basic preview (free) -->
							<div v-if="watermarkEnabled && (watermarkFile || selectedExistingWatermark)" class="mt-3 border-t border-default pt-3">
								<WatermarkCustomizer v-if="isPremiumActive"
									v-model="watermarkSettings"
									:watermarkPreviewUrl="effectiveWatermarkPreviewUrl"
								/>
								<WatermarkPreview v-else
									:previewUrl="effectiveWatermarkPreviewUrl"
									label="Watermark (bottom-right)"
								/>
							</div>
						</section>

						<!-- ══════ Section: Watermark for Uploads (only when auto-watermark is on and no media is selected) ══════ -->
						<section v-else-if="opts.uploadEnabled.value && autoWatermarkUploads" class="border-t border-default pt-3" data-tour="create-link-upload-watermark">
							<h3 class="text-base font-semibold mb-2">Watermark for Uploads</h3>
							<p class="text-xs text-default mb-2">This watermark will be applied automatically to new uploads.</p>
							<VideoOptionsPanel
								v-model:proxyQualities="uploadWatermarkProxyQualitiesDummy"
								v-model:watermarkEnabled="watermarkEnabled"
								v-model:selectedExistingWatermark="selectedExistingWatermark"
								v-model:showDefaultWatermarks="showDefaultWatermarks"
								:watermarkFile="watermarkFile"
								:existingWatermarkFiles="existingWatermarkFiles"
								:defaultWatermarks="validDefaultWatermarks"
								:effectiveWatermarkPreviewUrl="effectiveWatermarkPreviewUrl"
								:effectiveWatermarkName="effectiveWatermarkName"
								:usingExistingWatermark="usingExistingWatermark"
								:showHeading="false"
								watermarkLabel="Watermark"
								:pickButtonLabel="usingExistingWatermark ? 'Replace...' : 'Browse...'"
								:hideProxyQualities="true"
								:hideWatermarkToggle="true"
								@pickWatermark="pickWatermark"
								@clearWatermark="clearWatermark"
								@refreshWatermarks="loadExistingWatermarks"
							/>

							<div v-if="watermarkEnabled && (watermarkFile || selectedExistingWatermark)" class="mt-3 border-t border-default pt-3">
								<WatermarkCustomizer v-if="isPremiumActive"
									v-model="watermarkSettings"
									:watermarkPreviewUrl="effectiveWatermarkPreviewUrl"
								/>
								<WatermarkPreview v-else
									:previewUrl="effectiveWatermarkPreviewUrl"
									label="Watermark (bottom-right)"
								/>
							</div>
						</section>

						<!-- ══════ Generate Button ══════ -->
						<section class="border-t border-default pt-4">
							<div v-if="error" class="p-3 rounded bg-red-900/30 text-default border border-red-800 mb-3 text-sm text-center">
								{{ error }}
							</div>

							<div class="flex flex-wrap gap-2 w-full min-w-0">
								<button class="btn btn-secondary" :disabled="loading" @click="resetAll">
									Reset
								</button>
								<button
									data-tour="create-link-generate-btn"
									class="btn btn-primary flex-1 min-w-[14rem]"
									:disabled="!canGenerate || loading"
									@click="generateLink"
									title="Create a Flow link with the selected options"
								>
									<span v-if="loading" class="inline-flex items-center gap-2">
										<span class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										Generating…
									</span>
									<span v-else>Generate Flow link</span>
								</button>
							</div>
							<div v-if="opts.shareEnabled.value && shareFiles.length === 0" class="text-xs text-red-400 mt-2">
								Select at least one file to generate a share link.
							</div>

							<div v-if="resultUrl" class="p-3 border rounded flex flex-col items-center mt-1 min-w-0">
								<code class="max-w-full break-all">{{ resultUrl }}</code>
								<div class="flex flex-wrap gap-2 mt-2">
									<button class="btn btn-secondary" @click="copyResult">Copy</button>
									<button class="btn btn-primary" @click="openResult">Open</button>
								</div>
							</div>
						</section>
						</template>
					</div>
				</CardContainer>
				<div class="button-group-row col-span-1 min-w-0">
					<button @click="goBack" class="btn btn-danger justify-start">
						Return to Dashboard
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- New Project Modal -->
	<Teleport to="body">
		<div v-if="showNewProjectModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showNewProjectModal = false">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
				<h3 class="text-lg font-semibold mb-4">Create New Project</h3>
				<form @submit.prevent="createProject" class="flex flex-col gap-4">
					<div>
						<label class="block text-sm font-medium mb-1">Project Name</label>
						<input
							v-model="newProjectName"
							type="text"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
							placeholder="My Video Project"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Project Root Directory</label>
						<FolderPicker
							v-model="newProjectRoot"
							:apiFetch="apiFetch"
							useCase="upload"
							subtitle="Choose the root directory for this project."
							:auto-detect-roots="true"
							:allow-entire-tree="true"
							:is-root-user="isRootUser"
							v-model:project="newProjectPickerBase"
							v-model:dest="newProjectRoot"
						/>
					</div>
					<div class="flex items-center justify-end gap-2 mt-2">
						<button type="button" class="btn btn-secondary px-4 py-2" @click="showNewProjectModal = false">Cancel</button>
						<button type="submit" class="btn btn-primary px-4 py-2" :disabled="!newProjectName.trim() || !newProjectRoot.trim() || creatingProject">
							{{ creatingProject ? 'Creating…' : 'Create' }}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Teleport>

	<!-- Outputs Exist Modal -->
	<ConfirmDeleteModal
		v-model="showOutputsExistModal"
		title="Outputs Already Exist"
		message="Transcode outputs (stream/review copies) already exist for one or more selected files. Overwrite to restart output generation, or Generate Link to keep existing/in-progress outputs."
		confirmText="Overwrite"
		cancelText="Generate Link"
		:danger="false"
		:closeIsCancel="false"
		@confirm="resolveOutputsExist('overwrite')"
		@cancel="resolveOutputsExist('keep')"
		@close="resolveOutputsExist('cancel')"
	/>

	<!-- Add Users Modal -->
	<AddUsersModal
		v-model="showAccessModal"
		:apiFetch="apiFetch"
		roleHint="view"
		:preselected="opts.accessUsers.value.map(c => ({
			id: c.id,
			username: c.username || '',
			name: c.name,
			user_email: c.user_email,
			display_color: c.display_color,
			role_id: c.role_id ?? undefined,
			role_name: c.role_name ?? undefined,
		}))"
		:preselectedGroups="opts.accessGroups.value"
		@apply="onApplyUsers"
	/>

	<!-- Category Management Modal (staged — the link does not exist yet) -->
	<CategoryManagementModal
		:is-open="showCategoriesModal"
		staged
		:categories="opts.stagedCommentCategories.value"
		@close="showCategoriesModal = false"
		@categories-updated="opts.stagedCommentCategories.value = $event"
	/>
</template>

<style scoped>
.create-link-capability-grid {
	display: grid;
	grid-template-columns: minmax(20rem, 0.8fr) minmax(0, 1.2fr);
	gap: 1rem;
	align-items: stretch;
	min-width: 0;
}

@media (max-width: 1280px) {
	.create-link-capability-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CardContainer } from '@45drives/houston-common-ui'
import { Notification } from '@45drives/houston-common-ui'
import { useApi } from '../composables/useApi'
import { useResilientNav } from '../composables/useResilientNav'
import { useLinkOptions } from '../composables/useLinkOptions'
import { useHeader } from '../composables/useHeader'
import { pushNotification } from '../composables/useNotificationQueue'
import { signalLinkCreated } from '../composables/useLinkRefresh'
import { useConnections } from '../composables/useConnections'
import { useActiveProject } from '../composables/useActiveProject'
import { useProjectMode } from '../composables/useProjectMode'
import { useTransferProgress } from '../composables/useTransferProgress'
import { useRemoteTranscode } from '../composables/useRemoteTranscode'
import { useClientTranscode } from '../composables/useClientTranscode'
import FolderPicker from '../components/FolderPicker.vue'
import FileExplorer from '../components/FileExplorer.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import LinkAccessMode from '../components/LinkAccessMode.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import VideoOptionsPanel from '../components/VideoOptionsPanel.vue'
import WatermarkCustomizer from '../components/WatermarkCustomizer.vue'
import WatermarkPreview from '../components/WatermarkPreview.vue'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import CategoryManagementModal from '../components/modals/CategoryManagementModal.vue'
import { useCommentCategories } from '../composables/useCommentCategories'
import { DEFAULT_45FLOW_WATERMARKS, createDefaultWatermarkSettings, type WatermarkSettings, type Default45FlowWatermark } from '../types/watermark'

useHeader('Create Link')
const route = useRoute()
const { apiFetch, meta } = useApi()
const { to } = useResilientNav()
const { activeConnection } = useConnections()
const isRootUser = computed(() => activeConnection.value?.username === 'root')
const { activeProject: globalActiveProject } = useActiveProject()
const { projectModeEnabled } = useProjectMode()
const transfer = useTransferProgress()
const { runRemoteTranscode } = useRemoteTranscode()
const { enabled: clientTranscodeEnabled } = useClientTranscode()
const opts = useLinkOptions()

const { isPremiumActive } = useLicenseStatus()
const { getDefaultCategories } = useCommentCategories()

const showAccessModal = ref(false)
const showCategoriesModal = ref(false)
let draftLinkToken = ''

function onApplyUsers(users: any[], groups?: any[]) {
	opts.accessUsers.value = users.map(u => {
		const username = (u.username || '').trim()
		const name = (u.name || username).trim()
		const user_email = u.user_email?.trim() || undefined
		return {
			key: `${name}|${user_email || ''}|${username}`,
			id: u.id,
			username,
			name,
			user_email,
			display_color: u.display_color,
			role_id: u.role_id ?? null,
			role_name: u.role_name ?? null,
		}
	})
	opts.accessGroups.value = groups || []
}

// ── Projects ──
interface Project { id: number; name: string; root_dir: string; description: string | null; link_count: number }
const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = computed(() => projects.value.find(p => p.id === selectedProjectId.value) || null)
const showNewProjectModal = ref(false)
const newProjectName = ref('')
const newProjectRoot = ref('')
const newProjectPickerBase = ref('')
const creatingProject = ref(false)

// ── Upload ──
const uploadDest = ref('')
const uploadProjectBase = ref('')
const uploadPickerKey = ref(0)
const autoShareUploads = ref(false)
const autoWatermarkUploads = ref(false)
const autoTranscodeUploads = ref(false)
const autoTranscodeProxyQualities = ref<string[]>(['720p'])
function toggleAutoTranscodeQuality(quality: string, checked: boolean) {
	const set = new Set(autoTranscodeProxyQualities.value)
	if (checked) set.add(quality)
	else set.delete(quality)
	autoTranscodeProxyQualities.value = Array.from(set)
}

// ── Share ──
const shareFiles = ref<string[]>([])
const configuredRoot = ref('')
const fileBrowserBase = computed(() => selectedProject.value?.root_dir || configuredRoot.value || '')
const showSelected = ref(false)

// ── Video / Watermark ──
const proxyQualities = ref<string[]>(['original'])
const uploadWatermarkProxyQualitiesDummy = ref<string[]>([]) // unused; VideoOptionsPanel requires the prop but this panel hides that column
const watermarkEnabled = ref(false)
const watermarkFile = ref<{ path: string; name: string; size: number; dataUrl?: string | null } | null>(null)
const selectedExistingWatermark = ref('')
const showDefaultWatermarks = ref(false)
const existingWatermarkFiles = ref<string[]>([])
const validDefaultWatermarks = ref<Default45FlowWatermark[]>([])
const existingWatermarkPreviewUrl = ref<string | null>(null)
const watermarkSettings = ref<WatermarkSettings>(createDefaultWatermarkSettings())

const effectiveWatermarkPreviewUrl = computed<string>(() =>
	watermarkFile.value?.dataUrl || existingWatermarkPreviewUrl.value || ''
)
const effectiveWatermarkName = computed(() => {
	if (watermarkFile.value?.name) return watermarkFile.value.name
	if (selectedExistingWatermark.value) {
		const builtin = validDefaultWatermarks.value.find(w => w.path === selectedExistingWatermark.value)
		if (builtin) return builtin.name
		return selectedExistingWatermark.value.split('/').pop() || ''
	}
	return ''
})
const usingExistingWatermark = computed(() => !watermarkFile.value && !!selectedExistingWatermark.value)

// ── Pre-existing watermark detection (files that already have watermarks applied) ──
const existingFileWatermark = ref<{
	watermarkFile: string
	watermarkSettings: WatermarkSettings | null
} | null>(null)
const existingFileWatermarkMessage = ref('')
const watermarkUnchanged = computed(() => {
	if (!existingFileWatermark.value) return false
	const origFile = existingFileWatermark.value.watermarkFile
	const origSettings = existingFileWatermark.value.watermarkSettings
	const curFile = watermarkFile.value?.path || selectedExistingWatermark.value || ''
	if (!curFile || curFile !== origFile) return false
	if (!origSettings) return true // same file, no settings to compare
	const cur = watermarkSettings.value
	return (
		cur.scale === origSettings.scale &&
		cur.opacity === origSettings.opacity &&
		cur.rotation === origSettings.rotation &&
		cur.position.x === origSettings.position.x &&
		cur.position.y === origSettings.position.y &&
		cur.position.xUnit === origSettings.position.xUnit &&
		cur.position.yUnit === origSettings.position.yUnit &&
		cur.position.anchor === origSettings.position.anchor
	)
})

const videoExts = new Set([
	'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
	'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
	'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
	'r3d', 'braw', 'ari', 'cine', 'dav', 'crm', 'nraw', 'cdx', 'prores',
	'mod', 'tod', 'mj2', 'qt', 'dv', 'hevc', 'h264', 'h265',
	'vp8', 'vp9', 'av1', 'dnxhd',
])

const imageExts = new Set([
	'jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif',
	'avif', 'heic', 'heif', 'jp2', 'jxl', 'svg',
])

const hasVideoSelected = computed(() =>
	shareFiles.value.some(f => {
		const ext = (f.split('.').pop() || '').toLowerCase()
		return videoExts.has(ext)
	})
)

const hasImageSelected = computed(() =>
	shareFiles.value.some(f => {
		const ext = (f.split('.').pop() || '').toLowerCase()
		return imageExts.has(ext)
	})
)

const hasMediaSelected = computed(() => hasVideoSelected.value || hasImageSelected.value)

// ── State ──
const loading = ref(false)
const initializing = ref(true)
const error = ref<string | null>(null)
const resultUrl = ref('')

// ── Computed ──
const canGenerate = computed(() => {
	if (!opts.uploadEnabled.value && !opts.shareEnabled.value) return false
	if (opts.passwordRequired.value) return false
	if (!opts.accessSatisfied.value) return false
	if (opts.uploadEnabled.value && !uploadDest.value.trim()) return false
	if (opts.shareEnabled.value && shareFiles.value.length === 0) return false
	return true
})

// ── Methods ──
function onProjectChange() {
	opts.projectId.value = selectedProjectId.value
	const root = selectedProject.value?.root_dir || configuredRoot.value || ''
	uploadProjectBase.value = root
	uploadDest.value = root
	uploadPickerKey.value++
}

function onShareAdd(paths: string[]) {
	const base = fileBrowserBase.value
	paths.forEach(p => {
		let full = p
		if (base && !p.startsWith('/')) {
			full = `/${base.replace(/^\/+/, '')}/${p.replace(/^\/+/, '')}`.replace(/\/+/g, '/')
		} else if (!p.startsWith('/')) {
			full = '/' + p
		}
		if (!shareFiles.value.includes(full)) shareFiles.value.push(full)
	})
}

function onShareRemove(paths: string[]) {
	shareFiles.value = shareFiles.value.filter(f => !paths.includes(f))
}

function onShareExplorerError(message: string) {
	pushNotification(new Notification('Selection Failed', message, 'error', 8000))
}

function removeShareFile(f: string) {
	shareFiles.value = shareFiles.value.filter(x => x !== f)
}

// Groups shareFiles by parent directory so a fully-selected folder shows as one
// unit (folder header + its files) instead of a flat list of unrelated paths.
const groupedShareFiles = computed(() => {
	const groups = new Map<string, string[]>()
	for (const f of shareFiles.value) {
		const idx = f.lastIndexOf('/')
		const dir = idx > 0 ? f.slice(0, idx) : '/'
		if (!groups.has(dir)) groups.set(dir, [])
		groups.get(dir)!.push(f)
	}
	return Array.from(groups.entries())
		.map(([dir, files]) => ({ dir, files }))
		.sort((a, b) => a.dir.localeCompare(b.dir))
})

function removeShareGroup(files: string[]) {
	shareFiles.value = shareFiles.value.filter(f => !files.includes(f))
}

// ── Watermark ──
async function loadExistingWatermarks() {
	try {
		const wmDir = '.45flow/watermarks'
		let serverWatermarks: string[] = []
		try {
			const data = await apiFetch(`/api/files?dir=${encodeURIComponent(wmDir)}`, { method: 'GET' })
			const entries = Array.isArray(data?.entries) ? data.entries : []
			serverWatermarks = entries
				.filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
				.map((e: any) => `${wmDir}/${String(e.name).trim()}`)
				.sort((a: string, b: string) => a.localeCompare(b))
		} catch { /* no user watermarks dir yet */ }

		const base = meta.value.apiBase ?? ''
		const token = meta.value.token ?? ''
		const builtinChecks = await Promise.allSettled(
			DEFAULT_45FLOW_WATERMARKS.map(async (wm) => {
				const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(wm.path)}`
				const res = await fetch(url, { method: 'HEAD', headers: { 'Authorization': `Bearer ${token}` } })
				return res.ok ? wm : null
			})
		)
		validDefaultWatermarks.value = builtinChecks
			.filter((r): r is PromiseFulfilledResult<Default45FlowWatermark> => r.status === 'fulfilled' && r.value !== null)
			.map(r => r.value)

		existingWatermarkFiles.value = serverWatermarks

		const allFiles = [...serverWatermarks, ...validDefaultWatermarks.value.map(w => w.path)]
		if (!selectedExistingWatermark.value && allFiles.length) {
			const last = localStorage.getItem('45flow-last-watermark')
			if (last && allFiles.includes(last)) {
				selectedExistingWatermark.value = last
			} else if (allFiles.length) {
				selectedExistingWatermark.value = allFiles[0]
			}
		}
	} catch {
		existingWatermarkFiles.value = []
		validDefaultWatermarks.value = []
	}
}

function pickWatermark() {
	window.electron.pickWatermark().then(f => {
		if (f) {
			watermarkFile.value = f
			selectedExistingWatermark.value = ''
		}
	})
}

function clearWatermark() {
	watermarkFile.value = null
	selectedExistingWatermark.value = ''
	existingWatermarkPreviewUrl.value = null
}

// ── Watermark upload helpers ──
function resolveWatermarkDirRel() {
	// Watermarks are stored at .45flow/watermarks/ relative to the effective share root
	// (the server uses the configured root as its effective root, so no pool prefix needed)
	return '.45flow/watermarks'
}

function resolveWatermarkRelPath() {
	const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
	if (!name) return ''
	return `${resolveWatermarkDirRel()}/${name}`
}

function resolveWatermarkPathForApi(idOrPath: string) {
	const builtin = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === idOrPath)
	if (builtin) return builtin.path
	return idOrPath
}

// Resolves the currently-picked watermark (existing server file, built-in, or a
// newly-browsed local file) into the path the API expects, uploading it first if needed.
async function resolveWatermarkFilePathForApi(): Promise<{ ok: boolean; wmFilePath: string; error?: string }> {
	const selectedServerWatermark = String(selectedExistingWatermark.value || '').trim()
	if (selectedServerWatermark) {
		return { ok: true, wmFilePath: resolveWatermarkPathForApi(selectedServerWatermark) }
	}
	if (watermarkFile.value) {
		const up = await uploadWatermarkToServer()
		if (!up.ok) return { ok: false, wmFilePath: '', error: up.error || 'Watermark upload failed' }
		return { ok: true, wmFilePath: up.relPath || resolveWatermarkRelPath() || watermarkFile.value.name }
	}
	return { ok: true, wmFilePath: '' }
}

async function serverFileExists(relPath: string) {
	const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	if (!clean) return false
	const idx = clean.lastIndexOf('/')
	const dir = idx >= 0 ? clean.slice(0, idx) : ''
	const name = idx >= 0 ? clean.slice(idx + 1) : clean
	if (!name) return false
	try {
		const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dir || '.')}`, { method: 'GET' })
		const entries = Array.isArray(data?.entries) ? data.entries : []
		return entries.some((e: any) => !e?.isDir && String(e?.name || '') === name)
	} catch {
		return false
	}
}

async function ensureServerDirExists(dir: string) {
	const clean = String(dir || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	try {
		await apiFetch(`/api/files?dir=${encodeURIComponent(clean || '.')}&dirsOnly=1&ensure=1`, { method: 'GET' })
		return true
	} catch {
		return false
	}
}

async function uploadWatermarkToServer(): Promise<{ ok: boolean; relPath?: string; error?: string }> {
	if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }

	// Check if watermark already exists on server
	const existingRelPath = resolveWatermarkRelPath()
	if (existingRelPath && await serverFileExists(existingRelPath)) {
		return { ok: true, relPath: existingRelPath }
	}

	// Upload via HTTP
	const destDir = `/${resolveWatermarkDirRel()}`
	const ensured = await ensureServerDirExists(destDir)
	if (!ensured) return { ok: false, error: 'failed to prepare remote watermark directory' }

	const { done } = await window.electron.httpUploadStart({
		src: watermarkFile.value.path,
		apiBase: meta.value.apiBase || '',
		apiToken: meta.value.token || '',
		dest: destDir,
	})
	const res = await done
	if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' }
	return { ok: true, relPath: resolveWatermarkRelPath() }
}

async function fetchWatermarkPreview(relPath: string) {
	try {
		const base = meta.value.apiBase ?? ''
		const token = meta.value.token ?? ''
		const builtin = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === relPath || wm.path === relPath)
		const previewPath = builtin ? builtin.path : relPath
		const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(previewPath)}`
		const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
		if (!res.ok) { existingWatermarkPreviewUrl.value = null; return }
		const blob = await res.blob()
		existingWatermarkPreviewUrl.value = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	} catch {
		existingWatermarkPreviewUrl.value = null
	}
}

watch(selectedExistingWatermark, (v) => {
	if (v) fetchWatermarkPreview(v)
	else existingWatermarkPreviewUrl.value = null
})

// ── Detect pre-existing watermarks on selected files ──
async function checkExistingWatermarkInfo() {
	const paths = shareFiles.value
	if (paths.length === 0) {
		existingFileWatermark.value = null
		existingFileWatermarkMessage.value = ''
		return
	}
	try {
		const data = await apiFetch('/api/files/watermark-info', {
			method: 'POST',
			body: JSON.stringify({ filePaths: paths }),
		})
		const files: any[] = data?.files || []
		if (files.length === 0) {
			existingFileWatermark.value = null
			existingFileWatermarkMessage.value = ''
			return
		}
		// Use the first file's watermark info as the reference
		const first = files[0]
		existingFileWatermark.value = {
			watermarkFile: first.watermarkFile || '',
			watermarkSettings: first.watermarkSettings || null,
		}
		// Auto-enable watermark toggle and load existing settings
		watermarkEnabled.value = true
		if (first.watermarkFile) {
			selectedExistingWatermark.value = first.watermarkFile
			void fetchWatermarkPreview(first.watermarkFile)
		}
		if (first.watermarkSettings) {
			watermarkSettings.value = {
				position: {
					x: first.watermarkSettings.position?.x ?? 3,
					y: first.watermarkSettings.position?.y ?? 3,
					xUnit: first.watermarkSettings.position?.xUnit ?? '%',
					yUnit: first.watermarkSettings.position?.yUnit ?? '%',
					anchor: first.watermarkSettings.position?.anchor ?? 'bottom-right',
				},
				scale: first.watermarkSettings.scale ?? 35,
				opacity: first.watermarkSettings.opacity ?? 70,
				rotation: first.watermarkSettings.rotation ?? 0,
			}
		}
		const wmName = (first.watermarkFile || '').split('/').pop() || 'watermark'
		const count = files.length
		existingFileWatermarkMessage.value = count === paths.length
			? `${count === 1 ? 'File already has' : 'All files already have'} watermark: ${wmName}`
			: `${count} of ${paths.length} file${paths.length > 1 ? 's' : ''} already watermarked with: ${wmName}`
	} catch {
		existingFileWatermark.value = null
		existingFileWatermarkMessage.value = ''
	}
}

watch(shareFiles, () => {
	void checkExistingWatermarkInfo()
}, { deep: true })

watch(showDefaultWatermarks, () => {
	void loadExistingWatermarks()
})

// The "Watermark for Uploads" panel has no toggle of its own — the checkbox IS
// the toggle, as long as Media Options isn't already governing watermarkEnabled.
watch(autoWatermarkUploads, (checked) => {
	if (opts.shareEnabled.value && hasMediaSelected.value) return
	watermarkEnabled.value = checked
})

watch(configuredRoot, () => {
	void loadExistingWatermarks()
})

// ── Outputs Exist Dialog ──
const showOutputsExistModal = ref(false)
let outputsExistResolver: ((action: 'overwrite' | 'keep' | 'cancel') => void) | null = null

function showOutputsExistPrompt(): Promise<'overwrite' | 'keep' | 'cancel'> {
	showOutputsExistModal.value = true
	return new Promise(resolve => { outputsExistResolver = resolve })
}

function resolveOutputsExist(action: 'overwrite' | 'keep' | 'cancel') {
	if (outputsExistResolver) {
		outputsExistResolver(action)
		outputsExistResolver = null
	}
	showOutputsExistModal.value = false
}

async function fetchProjects() {
	try {
		const data = await apiFetch('/api/projects')
		projects.value = data.projects || []
	} catch {}
}

async function createProject() {
	if (!newProjectName.value.trim() || !newProjectRoot.value.trim()) return
	creatingProject.value = true
	try {
		const data = await apiFetch('/api/projects', {
			method: 'POST',
			body: JSON.stringify({
				name: newProjectName.value.trim(),
				rootDir: newProjectRoot.value.trim(),
			}),
		})
		showNewProjectModal.value = false
		newProjectName.value = ''
		newProjectRoot.value = ''
		await fetchProjects()
		if (data?.project?.id) {
			selectedProjectId.value = data.project.id
			onProjectChange()
		}
	} catch (e: any) {
		pushNotification(new Notification('Failed to create project', e?.message || '', 'error', 8000))
	} finally {
		creatingProject.value = false
	}
}

async function generateLink() {
	if (opts.uploadEnabled.value && autoTranscodeUploads.value && autoTranscodeProxyQualities.value.length === 0) {
		error.value = 'Select at least one proxy resolution for auto-transcode.'
		return
	}

	loading.value = true
	error.value = null
	resultUrl.value = ''

	try {
		const optionsBody = opts.buildOptionsBody()
		const body: any = { ...optionsBody }

		body.uploadEnabled = opts.uploadEnabled.value
		body.shareEnabled = opts.shareEnabled.value

		// Seed the default set when comments are on and the user never customised categories.
		if (body.allowComments && !body.commentCategories) {
			body.commentCategories = getDefaultCategories()
		}

		if (opts.uploadEnabled.value && uploadDest.value.trim()) {
			body.uploadDir = '/' + uploadDest.value.replace(/^\/+/, '')
			body.autoShareUploads = autoShareUploads.value
			body.autoWatermarkUploads = autoWatermarkUploads.value
			body.autoTranscodeUploads = autoTranscodeUploads.value
			if (autoTranscodeUploads.value) {
				body.autoTranscodeProxyQualities = autoTranscodeProxyQualities.value.slice()
			}
		}

		let watermarkConfigured = false

		if (opts.shareEnabled.value) {
			const wantsProxy = hasVideoSelected.value && proxyQualities.value.length > 0
			body.generateReviewProxy = wantsProxy
			body.hls = hasVideoSelected.value

			if (wantsProxy) {
				body.proxyQualities = proxyQualities.value.slice()
			}

			if (hasMediaSelected.value && watermarkEnabled.value) {
				body.watermark = true

				const resolved = await resolveWatermarkFilePathForApi()
				if (!resolved.ok) {
					error.value = resolved.error || 'Watermark upload failed'
					loading.value = false
					return
				}
				if (resolved.wmFilePath) body.watermarkFile = resolved.wmFilePath

				// Premium: Include watermark customization settings (only when licensed)
				if (isPremiumActive.value) {
					body.watermarkSettings = { ...watermarkSettings.value }
				}

				// If watermark is unchanged from what's already on the files, tell server to keep existing
				if (watermarkUnchanged.value) {
					body.useExistingWatermarkOnly = true
				}
				watermarkConfigured = true
			}

			if (shareFiles.value.length === 1) body.filePath = shareFiles.value[0]
			else body.filePaths = shareFiles.value.slice()

			// When client-side transcoding is enabled for video, tell the server
			// to client-claim the transcode jobs so the server worker doesn't steal them
			if (clientTranscodeEnabled.value && hasVideoSelected.value) {
				body.clientTranscode = true
			}
		}

		// Auto-watermark uploads: send the watermark config configured in the
		// "Watermark for Uploads" panel when no media is currently selected to share.
		if (opts.uploadEnabled.value && autoWatermarkUploads.value && watermarkEnabled.value && !watermarkConfigured) {
			const resolved = await resolveWatermarkFilePathForApi()
			if (!resolved.ok) {
				error.value = resolved.error || 'Watermark upload failed'
				loading.value = false
				return
			}
			if (resolved.wmFilePath) {
				body.watermark = true
				body.watermarkFile = resolved.wmFilePath
				if (isPremiumActive.value) {
					body.watermarkSettings = { ...watermarkSettings.value }
				}
			}
		}

		const doRequest = () => apiFetch('/api/magic-link', {
			method: 'POST',
			body: JSON.stringify(body),
			timeoutMs: 5 * 60 * 1000,
		})

		let data: any
		try {
			data = await doRequest()
		} catch (e: any) {
			if (e?.status === 409 && (
				String(e?.message || '').includes('outputs_exist') ||
				String(e?.message || '').includes('hls_exists') ||
				String(e?.message || '').includes('watermark_exists')
			)) {
				const action = await showOutputsExistPrompt()
				if (action === 'overwrite') {
					body.overwrite = true
					data = await doRequest()
				} else if (action === 'keep') {
					body.keepExistingOutputs = true
					body.overwrite = false
					data = await doRequest()
					pushNotification(new Notification('Existing Outputs Kept', 'Link created using existing transcode outputs.', 'info', 6000))
				} else {
					loading.value = false
					return
				}
			} else {
				throw e
			}
		}

		resultUrl.value = data.viewUrl || data.url || ''
		draftLinkToken = extractLinkToken(data)

		// ── Start transcode tracking in TransferDock ──
		if (hasMediaSelected.value) {
			const token = extractLinkToken(data)
			const fileRecords: any[] = Array.isArray(data?.files) ? data.files : []
			const transcodeRecords: any[] = Array.isArray(data?.transcodes) ? data.transcodes : []
			const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)

			const jobInfo: Record<number, { queuedKinds: string[]; activeKinds: string[] }> = {}
			for (const rec of transcodeRecords) {
				const vId = Number(rec?.assetVersionId)
				if (!Number.isFinite(vId) || vId <= 0) continue
				jobInfo[vId] = {
					queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
					activeKinds: Array.isArray(rec?.jobs?.activeKinds) ? rec.jobs.activeKinds : [],
				}
			}

			// ── Remote client-side transcoding ──────────────────────────────
			// When client-side transcoding is enabled, claim queued video transcode
			// jobs and run them using local hardware via streaming source input.
			// The client's FFmpeg reads the source file over HTTP (Range requests),
			// transcodes locally using GPU/CPU, then uploads outputs back.
			const useRemoteClientTranscode = clientTranscodeEnabled.value && hasVideoSelected.value
			const remoteTranscodePromises: Promise<any>[] = []
			if (useRemoteClientTranscode) {
				// Download watermark once (shared across all files)
				let localWatermarkPath: string | null = null
				const wmRelPath = body.watermarkFile ? String(body.watermarkFile) : ''
				if (wmRelPath && watermarkEnabled.value) {
					try {
						localWatermarkPath = await window.electron.downloadWatermark({
							apiBase: meta.value.apiBase || '',
							token: meta.value.token || '',
							relPath: wmRelPath,
						})
					} catch (e: any) {
						console.warn('[create-link] watermark download for remote transcode failed:', e?.message)
					}
				}

				for (const rec of fileRecords) {
					const assetVersionId = Number(rec?.assetVersionId ?? 0)
					if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) continue

					const info = jobInfo[assetVersionId]
					const hlsQueued = info?.queuedKinds?.includes('hls') || info?.activeKinds?.includes('hls')
					const proxyQueued = info?.queuedKinds?.includes('proxy_mp4') || info?.activeKinds?.includes('proxy_mp4')
					const isVideo = !!(rec?.mime || '').startsWith('video/')

					if (isVideo && (hlsQueued || proxyQueued)) {
						const displayName = rec?.name || rec?.path || 'File'
						const filePath = rec?.path || rec?.name || 'File'
						const remoteContext = {
							source: 'link' as const,
							groupId,
							file: filePath,
							linkUrl: resultUrl.value,
							linkTitle: opts.linkTitle.value || undefined,
						}

						// Fire-and-forget: remote transcode runs in background, progress
						// tracked via dock polling tasks created inside runRemoteTranscode
						const transcodeP = runRemoteTranscode({
							assetVersionId,
							filename: displayName,
							proxyQualities: proxyQualities.value.slice(),
							generateHls: hlsQueued,
							watermarkPath: localWatermarkPath,
							watermarkSettings: isPremiumActive.value ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
							skipWatermarkCleanup: true, // cleanup after all files done
							apiBase: meta.value.apiBase || '',
							apiToken: meta.value.token || '',
							apiFetch,
							context: remoteContext,
						}).then(result => {
							if (result.ok) {
								console.log(`[create-link] remote client transcode done: ${displayName}`)
							} else if (!result.cancelled) {
								console.warn(`[create-link] remote client transcode failed: ${displayName}`, result.error)
								pushNotification(new Notification(
									'Transcode Failed',
									`${displayName}: ${result.error || 'Unknown client transcode error'}.`,
									'warning', 8000
								))
							}
						}).catch(() => {})
						remoteTranscodePromises.push(transcodeP)

						// Mark these kinds as handled so we don't also create server polling tasks
						if (info) {
							info.queuedKinds = info.queuedKinds.filter(k => k !== 'hls' && k !== 'proxy_mp4')
							info.activeKinds = info.activeKinds.filter(k => k !== 'hls' && k !== 'proxy_mp4')
						}
					}
				}

				// Cleanup watermark temp after ALL remote transcodes finish (not a blind timer)
				if (localWatermarkPath && remoteTranscodePromises.length) {
					Promise.allSettled(remoteTranscodePromises).then(() => {
						window.electron.cleanupWatermarkTemp(localWatermarkPath!).catch(() => {})
					})
				} else if (localWatermarkPath) {
					window.electron.cleanupWatermarkTemp(localWatermarkPath).catch(() => {})
				}
			}

			// ── Server-side transcode tracking (for non-client-transcoded files) ──
			for (const rec of fileRecords) {
				const fileId = Number(rec?.id ?? rec?.fileId ?? rec?.file_id)
				const assetVersionId = Number(rec?.assetVersionId ?? 0)
				if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) continue

				const info = jobInfo[assetVersionId]
				const hlsActive = info?.activeKinds?.includes('hls') || info?.queuedKinds?.includes('hls')
				const proxyActive = info?.activeKinds?.includes('proxy_mp4') || info?.queuedKinds?.includes('proxy_mp4')
				const canUsePlayback = !!token && Number.isFinite(fileId) && fileId > 0
				const playbackPath = canUsePlayback
					? `/api/token/${encodeURIComponent(token)}/files/${encodeURIComponent(String(fileId))}/playback/${encodeURIComponent(String(assetVersionId))}?prefer=auto&audit=0`
					: ''
				const filePath = rec?.path || rec?.name || 'File'
				const displayName = rec?.name || rec?.path || 'File'
				const context = {
					source: 'link' as const,
					groupId,
					file: filePath,
					linkUrl: resultUrl.value,
					linkTitle: opts.linkTitle.value || undefined
				}

				if (hlsActive && canUsePlayback && !transfer.hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind: 'hls' })) {
					transfer.startPlaybackTranscodeTask({
						title: `Transcoding: ${displayName}`,
						detail: 'HLS stream',
						intervalMs: 1500,
						jobKind: 'hls',
						context,
						assetVersionId,
						fetchSnapshot: async () => {
							const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
							const j = payload?.transcodes?.hls || payload?.transcodes?.HLS || null
							return {
								status: j?.status ?? payload?.hlsStatus ?? payload?.status,
								progress: j?.progress ?? payload?.hlsProgress ?? 0,
								etaSeconds: j?.eta_seconds ?? null,
								speedX: j?.speed_x ?? null,
							}
						}
					})
				}

				if (proxyActive && canUsePlayback && !transfer.hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind: 'proxy_mp4' })) {
					transfer.startPlaybackTranscodeTask({
						title: `Transcoding: ${displayName}`,
						detail: 'Review copy',
						intervalMs: 1500,
						jobKind: 'proxy_mp4',
						context,
						assetVersionId,
						fetchSnapshot: async () => {
							const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
							const j = payload?.transcodes?.proxy_mp4 || payload?.transcodes?.proxy || null
							return {
								status: j?.status ?? payload?.proxyStatus ?? payload?.status,
								progress: j?.progress ?? payload?.proxyProgress ?? 0,
								etaSeconds: j?.eta_seconds ?? null,
								speedX: j?.speed_x ?? null,
								qualityOrder: j?.quality_order ?? j?.qualityOrder,
								activeQuality: j?.active_quality ?? j?.activeQuality,
								perQualityProgress: j?.per_quality_progress ?? j?.perQualityProgress,
							}
						}
					})
				}

				// Track watermark_image jobs for image files
				const wmImgActive = info?.activeKinds?.includes('watermark_image') || info?.queuedKinds?.includes('watermark_image')
				if (wmImgActive && canUsePlayback && !transfer.hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind: 'watermark_image' })) {
					transfer.startPlaybackTranscodeTask({
						title: `Watermarking: ${displayName}`,
						detail: 'Image watermark',
						intervalMs: 1500,
						jobKind: 'watermark_image',
						context,
						assetVersionId,
						fetchSnapshot: async () => {
							const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
							const j = payload?.transcodes?.watermark_image || null
							return {
								status: j?.status ?? 'queued',
								progress: j?.progress ?? 0,
								etaSeconds: j?.eta_seconds ?? null,
								speedX: null,
							}
						}
					})
				}
			}
		}

		signalLinkCreated()
		pushNotification(new Notification('Link Created', 'Your link has been generated successfully.', 'success', 6000))
	} catch (e: any) {
		error.value = e?.message || 'Failed to generate link'
		pushNotification(new Notification('Link Generation Failed', error.value!, 'error', 8000))
	} finally {
		loading.value = false
	}
}

function copyResult() {
	if (resultUrl.value) {
		navigator.clipboard.writeText(resultUrl.value)
		pushNotification(new Notification('Copied!', 'Link copied to clipboard.', 'success', 4000))
	}
}

function extractLinkToken(data: any): string {
	const direct = String(data?.token || '').trim()
	if (direct) return direct
	const u = String(data?.viewUrl || '').trim()
	if (!u) return ''
	const parts = u.split('/').filter(Boolean)
	return parts[parts.length - 1] || ''
}

function openResult() {
	if (resultUrl.value) window.open(resultUrl.value, '_blank')
}

function resetAll() {
	opts.resetOptions()
	uploadDest.value = ''
	uploadProjectBase.value = ''
	autoShareUploads.value = false
	autoWatermarkUploads.value = false
	autoTranscodeUploads.value = false
	autoTranscodeProxyQualities.value = ['720p']
	shareFiles.value = []
	proxyQualities.value = ['original']
	watermarkEnabled.value = false
	watermarkSettings.value = createDefaultWatermarkSettings()
	resultUrl.value = ''
	error.value = null
	selectedProjectId.value = null
}

function goBack() {
	to('dashboard')
}

// ── Guided Tour ──
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const createLinkTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="create-link-capabilities"]',
		message: 'Welcome to Create Link!\n\nThis screen lets you create a combined link with Upload, Share/Review, or both capabilities in a single URL.\n\nUse the checkboxes to toggle Upload (clients send files) and Share/Review (clients view files). Enable both for a combined link.',
	},
	{
		target: '[data-tour="create-link-project"]',
		message: 'Select a project to scope the link.\n\nThis sets the root directory for browsing and uploading. Choose "No project" to use the server\'s default root instead.\n\nYou can also create a new project inline.',
		beforeShow: () => { /* only shows if projectMode is enabled */ },
	},
	{
		target: '[data-tour="create-link-upload-dest"]',
		message: 'When Upload is enabled, pick the destination folder on the server.\n\nClients who access this link will upload files to this directory.',
		beforeShow: () => { opts.uploadEnabled.value = true },
	},
	{
		target: '[data-tour="create-link-share-files"]',
		message: 'When Share/Review is enabled, browse and select files to include in the link.\n\nRecipients will be able to view, stream, and download these files.',
		beforeShow: () => { opts.shareEnabled.value = true },
	},
	{
		target: '[data-tour="create-link-options"]',
		message: 'Configure link settings: expiry time, title, network access (Local or External), and access mode (open, password, or invited users/groups).\n\nIf comments are enabled for open/password access, you can also define Comment Categories to organize review feedback.\n\nThese apply to the entire link regardless of capabilities.',
	},
	{
		target: '[data-tour="create-link-media-options"]',
		message: isPremiumActive.value
			? 'When sharing video or image files, media options appear here.\n\nFor video: choose review copy qualities (720p, 1080p, full-res) and toggle watermarks. A streaming version (HLS) is also generated for smooth browser playback.\nFor images: toggle watermark overlays to protect your content.\n\nWatermarks support PNG, JPG, and SVG with full customization — position, size, opacity, and tiling (Pro).'
			: 'When sharing video or image files, media options appear here.\n\nFor video: choose review copy qualities (720p, 1080p, full-res) and toggle watermarks. A streaming version (HLS) is also generated for smooth browser playback.\nFor images: toggle watermark overlays to protect your content.\n\nA basic watermark is applied at bottom-right. Upgrade to Pro for full customization of position, size, and opacity.',
		beforeShow: () => { opts.shareEnabled.value = true },
	},
	{
		target: '[data-tour="create-link-generate-btn"]',
		message: 'Click here to generate your Flow link.\n\nThe resulting URL handles both upload and review in one link — share it with your collaborators.',
	},
])

onMounted(async () => {
	try {
		// Fetch settings first so configuredRoot is set before watermark dir resolution
		await Promise.all([
			apiFetch('/api/settings').then(s => {
				if (s?.projectRoot) configuredRoot.value = String(s.projectRoot).trim()
			}).catch(() => {}),
			opts.loadLinkDefaults(),
			fetchProjects(),
		])
		await loadExistingWatermarks()
		// Auto-select project from query param (passed from Dashboard)
		const qProjectId = Number(route.query.projectId)
		if (qProjectId && projects.value.some(p => p.id === qProjectId)) {
			selectedProjectId.value = qProjectId
			onProjectChange()
		} else if (globalActiveProject.value && projects.value.some(p => p.id === globalActiveProject.value!.id)) {
			// Auto-select from global active project
			selectedProjectId.value = globalActiveProject.value.id
			onProjectChange()
		}
	} finally {
		initializing.value = false
	}

	// Guided tour
	if (!onboarding.value.createLinkTourDone) {
		setTimeout(() => {
			requestTour('create-link', createLinkTourSteps.value, () => markDone('createLinkTourDone'))
		}, 500)
	}
})
</script>
