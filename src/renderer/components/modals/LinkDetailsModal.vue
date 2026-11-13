<template>
  <FlowModal :model-value="modelValue" size="xl" surface="default" class="h-[min(48rem,calc(100vh-2rem))]"
    :header-attrs="{ 'data-tour': 'link-details-header' }" :description="headerDescription"
    flush body-class="flex flex-col !overflow-hidden text-sm text-left" footer-class="justify-between"
    :before-close="confirmDiscard" @close="close">
      <template #title>
        <span class="block truncate" :title="displayTitle || undefined">
          {{ editMode ? `Edit ${displayTitle}` : displayTitle }}
        </span>
      </template>
      <template v-if="!editMode" #header-actions>
          <button v-if="isPremiumActive" class="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
            :disabled="!link" @click="commentsModalOpen = true">
            <ChatBubbleLeftRightIcon class="w-4 h-4" aria-hidden="true" />
            Comments
          </button>
          <button class="btn btn-primary flex items-center gap-2 whitespace-nowrap" :disabled="!link" @click="beginEdit()">
            <PencilSquareIcon class="w-4 h-4" aria-hidden="true" />
            Edit
          </button>
      </template>

      <!-- ═══ View ═══════════════════════════════════════════ -->
      <template v-if="!editMode">
        <!-- Summary: the link itself and the facts people look for first -->
        <div class="ld-summary" data-tour="link-details-meta">
          <div v-if="link?.thumbnailUrl" class="ld-thumb" aria-hidden="true">
            <img v-if="thumbnailSrc" :src="thumbnailSrc" alt="" class="w-full h-full object-cover" />
            <span v-else class="text-xs text-muted">{{ thumbnailFailed ? 'No preview' : 'Loading…' }}</span>
          </div>
          <div class="min-w-0 flex-1 flex flex-col gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <FlowChip v-if="link" :tone="statusTone" dot>{{ statusLabel }}</FlowChip>
              <div class="ld-url">
                <LinkIcon class="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />
                <a v-if="primaryUrl" :href="primaryUrl" target="_blank" rel="noopener" class="truncate hover:underline" :title="primaryUrl">{{ primaryUrl }}</a>
                <span v-else class="text-muted">No link address yet</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm whitespace-nowrap" :disabled="!primaryUrl" @click="copyPrimaryUrl">
                {{ urlCopied ? 'Copied' : 'Copy link' }}
              </button>
            </div>
            <dl class="ld-facts">
              <div>
                <dt>Who can open it</dt>
                <dd>{{ currentAccessSummary }}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>
                  {{ link?.expiresAt ? formatDate(link.expiresAt) : 'Never' }}
                  <span v-if="expiresRelative" class="ld-facts__aside">{{ expiresRelative }}</span>
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{{ link ? formatDate(link.createdAt) : '—' }}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd class="truncate" :title="link?.project_name || undefined">{{ link?.project_name || 'None' }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="flow-tabs px-6 shrink-0" role="tablist" aria-label="Link details">
          <button v-for="t in viewTabs" :key="t.key" :id="`ld-tab-${t.key}`" type="button" class="flow-tab" role="tab"
            :aria-selected="activeTab === t.key" :aria-controls="`ld-panel-${t.key}`" :tabindex="activeTab === t.key ? 0 : -1"
            :data-tour="t.tour" @click="activeTab = t.key" @keydown="onTabKeydown">
            {{ t.label }}
            <span v-if="t.count !== null" class="flow-tab__count">{{ t.count }}</span>
          </button>
        </div>

        <div :id="`ld-panel-${activeTab}`" class="flex-1 min-h-0 overflow-y-auto px-6 py-5" role="tabpanel"
          :aria-labelledby="`ld-tab-${activeTab}`" tabindex="0">

          <!-- Overview -->
          <div v-if="activeTab === 'overview'" data-tour="link-details-config">
            <p class="flow-subhead flow-subhead--first">Who can open it</p>
            <div class="flow-group">
              <DetailRow label="Access" :description="accessModeHelp">{{ accessModeName }}</DetailRow>
              <DetailRow v-if="currentAccessMode === 'open' && supportsComments" label="Comments"
                description="Viewers can leave review comments.">
                {{ link?.allow_comments ? 'Allowed' : 'Off' }}
              </DetailRow>
            </div>
            <div v-if="currentAccessMode === 'restricted'" class="mt-3">
              <LinkAccessList :users="access" :groups="accessGroupRows" :loading="accessLoading" />
            </div>
            <template v-if="link?.id">
              <p class="flow-subhead">Invite by email</p>
              <EmailInvitationPanel :key="link.id" :link-id="link.id" :api-fetch="apiFetch" :people="invitePeople"
                :email-off="egress.isOff('smtp')" />
            </template>

            <template v-if="hasShareCapability">
              <p class="flow-subhead">Shared files</p>
              <div class="flow-group">
                <DetailRow label="Files" :description="reviewFilesPath ? `From ${reviewFilesPath}` : ''">
                  <button type="button" class="ld-link" @click="activeTab = 'files'">{{ pluralize(displayFiles.length, 'file') }}</button>
                </DetailRow>
              </div>
            </template>

            <template v-if="hasUploadCapability">
              <p class="flow-subhead">Uploads</p>
              <div class="flow-group">
                <DetailRow label="Saves to">
                  <code class="ld-path" :title="uploadDirectoryPath || undefined">{{ uploadDirectoryPath || 'Not set' }}</code>
                </DetailRow>
                <template v-if="hasShareCapability">
                  <DetailRow label="Add uploads to shared files">{{ link?.auto_share_uploads ? 'On' : 'Off' }}</DetailRow>
                  <DetailRow label="Watermark uploads">{{ link?.auto_watermark_uploads ? 'On' : 'Off' }}</DetailRow>
                </template>
                <DetailRow v-if="isPremiumActive && !uploadSpecError" label="File requirements" :description="savedUploadSpecSummary">
                  {{ !hasAnySpecRule(savedUploadSpec) ? 'Off' : savedUploadSpec?.action === 'flag' ? 'Flag mismatches' : 'Reject mismatches' }}
                </DetailRow>
                <DetailRow label="Proxy files for uploads">
                  {{ link?.auto_transcode_uploads ? qualityList(link?.auto_transcode_proxy_qualities?.length ? link.auto_transcode_proxy_qualities : ['720p']) : 'Off' }}
                </DetailRow>
              </div>
            </template>

            <p class="flow-subhead">Playback and watermark</p>
            <div class="flow-group">
              <DetailRow label="Proxy files" description="Playback copies made for reviewers.">
                {{ currentGenerateReviewProxy && currentProxyQualities.length ? qualityList(currentProxyQualities) : 'Off' }}
              </DetailRow>
              <DetailRow label="Watermark">
                <span v-if="currentWatermark" class="truncate" :title="currentWatermarkFile || undefined">
                  On<template v-if="currentWatermarkFile"> · {{ fileNameOf(currentWatermarkFile) }}</template>
                </span>
                <span v-else>Off</span>
              </DetailRow>
            </div>

            <p class="flow-subhead">Notes</p>
            <p v-if="link?.notes" class="ld-notes">{{ link.notes }}</p>
            <p v-else class="text-sm text-muted">No notes. Use Edit to add some for your team.</p>

            <div class="flow-group ld-danger mt-8">
              <DetailRow label="Delete this link" description="Permanently delete this link and all associated data.">
                <button type="button" class="btn btn-danger btn-sm" :disabled="!link" @click="emit('requestDelete', link!)">Delete link</button>
              </DetailRow>
            </div>
          </div>

          <!-- Files -->
          <div v-else-if="activeTab === 'files'">
            <p class="text-xs text-muted mb-3">{{ filesCaption }}</p>
            <div v-if="detailsLoading" class="text-sm text-muted py-6 text-center">Loading files…</div>
            <FlowEmpty v-else-if="!displayFiles.length" compact title="No files yet"
              :description="hasUploadCapability && !hasShareCapability ? 'Files clients upload through this link will show here.' : 'Use Edit to add files to this link.'" />
            <template v-else>
              <FlowNotice v-if="usingFallbackFiles" tone="warning" size="sm" class="mb-3">
                Showing the basic file list. Full file details aren't available right now.
              </FlowNotice>
              <div class="flow-table-wrap">
                <table class="flow-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th class="flow-table__num">Size</th>
                      <th>Type</th>
                      <template v-if="showUploadColumns">
                        <th>Uploaded by</th>
                        <th>From</th>
                        <th>When</th>
                      </template>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="f in displayFiles" :key="f.key">
                      <td class="max-w-[22rem]"><span class="block truncate font-medium" :title="f.relPath || f.name">{{ f.name }}</span></td>
                      <td class="flow-table__num">{{ fmtBytes(f.size) }}</td>
                      <td class="text-muted whitespace-nowrap">{{ f.mime || '—' }}</td>
                      <template v-if="showUploadColumns">
                        <td>{{ f.uploader_label || '—' }}</td>
                        <td class="whitespace-nowrap text-muted">{{ f.ip || '—' }}</td>
                        <td class="whitespace-nowrap">{{ f.ts ? formatDate(f.ts) : '—' }}</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <!-- Processing (proxy files / HLS / image watermarks); hides itself when nothing was requested -->
            <LinkTranscodeStatus v-if="link && link.type !== 'upload'" class="mt-6"
              :link-id="link.id" :api-fetch="props.apiFetch" :reload-signal="transcodeStatusReload" />
            <LinkRecipientCopies v-if="isPremiumActive && link?.id && link.type !== 'upload' && link.access_mode === 'restricted'"
              :key="`recipient-copies-${link.id}`" class="mt-6" :link-id="link.id" :link-title="link.title || ''"
              :api-fetch="props.apiFetch" />
          </div>

          <!-- Review (C2 approvals) -->
          <div v-else-if="activeTab === 'review'">
            <LinkReviewPanel :state="linkReview.state.value" :loading="linkReview.loading.value"
              :error="linkReview.error.value" :link-access-mode="currentAccessMode" :users="access" :hour12="hour12"
              :exporting="reviewExporting"
              @edit="beginEdit('access')" @change-approver="editApprover" @export="exportReview" />
          </div>

          <!-- Activity -->
          <div v-else-if="activeTab === 'activity'">
            <LinkEmailsPanel v-if="link?.id" :key="`emails-${link.id}`" :link-id="link.id" :api-fetch="props.apiFetch" :hour12="hour12" />
            <div class="flex flex-wrap items-center gap-2 mb-3">
              <select v-model="activityTypeFilter" aria-label="Filter by action" class="input-textlike px-2 py-1.5 text-sm">
                <option value="all">All actions</option>
                <option v-for="t in activityTypes" :key="t" :value="t">{{ activityTypeLabel(t) }}</option>
              </select>
              <div class="relative flex-1 min-w-[14rem]">
                <MagnifyingGlassIcon class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60" aria-hidden="true" />
                <input v-model.trim="activitySearch" type="search" aria-label="Search activity"
                  class="input-textlike w-full pl-8 pr-3 py-1.5 text-sm" placeholder="Search by person, IP address or details" />
              </div>
              <span v-if="!detailsLoading" class="text-xs text-muted whitespace-nowrap">
                {{ filteredAuditActivity.length === auditActivity.length ? pluralize(auditActivity.length, 'event') : `${filteredAuditActivity.length} of ${auditActivity.length}` }}
              </span>
            </div>

            <div v-if="detailsLoading" class="text-sm text-muted py-6 text-center">Loading activity…</div>
            <FlowEmpty v-else-if="!auditActivity.length" compact title="No activity yet"
              description="Views, downloads, uploads and changes to this link will show here." />
            <FlowEmpty v-else-if="!filteredAuditActivity.length" compact title="Nothing matches" description="Try a different action or search." />
            <div v-else class="flow-table-wrap">
              <table class="flow-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Who</th>
                    <th>From</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(a, idx) in filteredAuditActivity" :key="`${a.ts_ms}:${a.type}:${idx}`">
                    <td class="whitespace-nowrap">{{ formatTs(a.ts_ms) }}</td>
                    <td class="whitespace-nowrap font-medium">{{ activityTypeLabel(a.type) }}</td>
                    <td>{{ actorLabel(a) }}</td>
                    <td class="text-muted">{{ sourceLabel(a) }}</td>
                    <td class="min-w-[14rem]">
                      <div>{{ activitySummary(a) }}</div>
                      <details v-if="hasActivityDetails(a)" class="mt-1">
                        <summary class="cursor-pointer text-xs text-muted">More</summary>
                        <pre class="mt-1 text-xs whitespace-pre-wrap">{{ activityDetailsPretty(a) }}</pre>
                      </details>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Versions -->
          <div v-else-if="activeTab === 'versions'">
            <FlowEmpty v-if="versionFileChoices.length === 0" compact title="No versions"
              description="None of the files on this link have saved versions." />
            <template v-else>
              <div class="flex flex-wrap items-end gap-2 mb-2">
                <label class="flex flex-col gap-1 flex-1 min-w-[16rem]">
                  <span class="text-xs font-medium text-muted">File</span>
                  <select v-model="selectedVersionFileId" class="input-textlike px-2 py-1.5 text-sm w-full">
                    <option v-for="f in versionFileChoices" :key="f.id" :value="f.id">{{ f.name }}</option>
                  </select>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="versionsLoading || !selectedVersionFileId" @click="refreshVersions">
                  {{ versionsLoading ? 'Refreshing…' : 'Refresh' }}
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs">
                <label class="inline-flex items-center gap-2 cursor-pointer">
                  <input v-model="restoreBackup" type="checkbox" class="styled-checkbox" />
                  Back up the current file before restoring
                </label>
                <label class="inline-flex items-center gap-2 cursor-pointer">
                  <input v-model="showExtraFiles" type="checkbox" class="styled-checkbox" />
                  Show extra files (proxy files, HLS, snapshots)
                </label>
              </div>

              <FlowNotice v-if="versionsError" tone="danger" size="sm" class="mb-3">{{ versionsError }}</FlowNotice>

              <div class="flow-table-wrap">
                <table class="flow-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Created</th>
                      <th>Snapshot</th>
                      <th class="flow-table__num">Size</th>
                      <th v-if="showReviewColumn">Review</th>
                      <th class="text-right"><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="versionsLoading">
                      <td :colspan="showReviewColumn ? 6 : 5" class="text-center text-muted py-5">Loading…</td>
                    </tr>
                    <tr v-else-if="versions.length === 0">
                      <td :colspan="showReviewColumn ? 6 : 5" class="text-center text-muted py-5">No versions found for this file.</td>
                    </tr>
                    <template v-else v-for="v in versions" :key="`v-${v.asset_version_id}`">
                      <tr>
                        <td class="font-semibold">v{{ v.version_index }}</td>
                        <td class="whitespace-nowrap">{{ v.created_at ? formatDate(v.created_at) : '—' }}</td>
                        <td class="text-muted max-w-[16rem]"><span class="block truncate" :title="v.snapshot_rel || undefined">{{ snapshotName(v.snapshot_rel) }}</span></td>
                        <td class="flow-table__num">{{ fmtBytes(v.snapshot_size_bytes) }}</td>
                        <td v-if="showReviewColumn" class="whitespace-nowrap">
                          <FlowChip v-if="versionReviewState(v.asset_version_id)" size="sm"
                            :tone="reviewStateView(versionReviewState(v.asset_version_id)!).tone"
                            :dot="reviewStateView(versionReviewState(v.asset_version_id)!).dot"
                            :title="versionReviewState(v.asset_version_id) === 'superseded' ? `Was: ${reviewStateView(reviewByVersion.get(Number(v.asset_version_id)) || '').label}` : undefined">
                            {{ reviewStateView(versionReviewState(v.asset_version_id)!).label }}
                          </FlowChip>
                          <span v-else class="text-muted">—</span>
                        </td>
                        <td class="text-right whitespace-nowrap">
                          <button type="button" class="btn btn-secondary btn-xs" @click="restoreVersion(v)">Restore</button>
                          <button type="button" class="btn btn-danger btn-xs ml-1.5" :disabled="versions.length <= 1"
                            :title="versions.length <= 1 ? 'The only version can\'t be deleted' : undefined" @click="deleteVersion(v)">Delete</button>
                        </td>
                      </tr>
                      <tr v-if="showExtraFiles" class="ld-extra-row">
                        <td :colspan="showReviewColumn ? 6 : 5">
                          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <span class="text-xs font-semibold">Extra files for v{{ v.version_index }}</span>
                            <div class="flex flex-wrap items-center gap-1.5">
                              <button type="button" class="btn btn-secondary btn-xs" :disabled="!hasAnyExtraPath(v)" @click="copyAllExtraPaths(v)">Copy all paths</button>
                              <button v-if="clientTranscodeEnabled && isSelectedFileVideo" type="button" class="btn btn-secondary btn-xs"
                                :disabled="isRemoteTranscodingCheck(v.asset_version_id)" @click="startRemoteTranscodeForVersion(v)">
                                {{ isRemoteTranscodingCheck(v.asset_version_id) ? 'Transcoding…' : 'Transcode with local hardware' }}
                              </button>
                              <button type="button" class="btn btn-danger btn-xs" :disabled="isDeletingArtifacts(v, 'transcodes')" @click="deleteVersionArtifacts(v, 'transcodes')">
                                {{ isDeletingArtifacts(v, 'transcodes') ? 'Deleting…' : 'Delete proxy files/HLS' }}
                              </button>
                              <button type="button" class="btn btn-danger btn-xs" :disabled="isDeletingArtifacts(v, 'snapshot')" @click="deleteVersionArtifacts(v, 'snapshot')">
                                {{ isDeletingArtifacts(v, 'snapshot') ? 'Deleting…' : 'Delete snapshot' }}
                              </button>
                              <button type="button" class="btn btn-danger btn-xs" :disabled="isDeletingArtifacts(v, 'all')" @click="deleteVersionArtifacts(v, 'all')">
                                {{ isDeletingArtifacts(v, 'all') ? 'Deleting…' : 'Delete all extra' }}
                              </button>
                            </div>
                          </div>
                          <div class="grid gap-1 text-xs font-mono break-all">
                            <div v-if="artifactLoading(v)" class="text-muted">Loading files…</div>
                            <div v-else-if="artifactError(v)" class="text-flow-danger">{{ artifactError(v) }}</div>
                            <template v-else-if="artifactFileNodes(v).length">
                              <div v-for="f in artifactFileNodes(v)" :key="`artifact-file-${v.asset_version_id}-${f.rel_path}`"
                                class="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-0.5">
                                <span class="truncate" :style="{ paddingLeft: `${Math.min(f.depth, 8) * 12}px` }" :title="f.rel_path">└─ {{ f.name }}</span>
                                <span class="text-muted">{{ fmtBytes(f.size) }}</span>
                                <button type="button" class="btn btn-secondary btn-xs" @click="copyExtraPath('Artifact file', f.rel_path)">Copy</button>
                              </div>
                            </template>
                            <template v-else>
                              <div class="text-muted font-sans">No extra files on disk. Known folders:</div>
                              <div v-for="folder in fallbackFolderRows(v)" :key="`artifact-folder-${v.asset_version_id}-${folder.rel_path}`"
                                class="grid grid-cols-[10rem_1fr_auto] gap-2 items-center">
                                <span class="text-muted font-sans">{{ folder.label }}</span>
                                <span>{{ folder.rel_path || '—' }}</span>
                                <button type="button" class="btn btn-secondary btn-xs" :disabled="!folder.rel_path" @click="copyExtraPath(folder.label, folder.rel_path)">Copy</button>
                              </div>
                            </template>
                            <div class="grid grid-cols-[10rem_1fr_auto] gap-2 items-center pt-1">
                              <span class="text-muted font-sans">Proxy files</span>
                              <span>{{ proxyPatternRelPath(v) || '—' }}</span>
                              <button type="button" class="btn btn-secondary btn-xs" :disabled="!proxyPatternRelPath(v)" @click="copyExtraPath('Proxy files pattern', proxyPatternRelPath(v))">Copy</button>
                            </div>
                            <div class="grid grid-cols-[10rem_1fr_auto] gap-2 items-center">
                              <span class="text-muted font-sans">HLS folder</span>
                              <span>{{ hlsFolderRelPath(v) || '—' }}</span>
                              <button type="button" class="btn btn-secondary btn-xs" :disabled="!hlsFolderRelPath(v)" @click="copyExtraPath('HLS folder', hlsFolderRelPath(v))">Copy</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- ═══ Edit ═══════════════════════════════════════════ -->
      <template v-else>
        <div class="flow-tabs px-6 pt-3 shrink-0" role="tablist" aria-label="Edit link">
          <button v-for="t in editTabs" :key="t.key" :id="`ld-edit-tab-${t.key}`" type="button" class="flow-tab" role="tab"
            :aria-selected="editTab === t.key" :aria-controls="`ld-edit-panel-${t.key}`" :tabindex="editTab === t.key ? 0 : -1"
            @click="editTab = t.key" @keydown="onEditTabKeydown">
            {{ t.label }}
            <span v-if="t.problem" class="flow-dot flow-dot--danger" aria-hidden="true" />
            <span v-if="t.problem" class="sr-only">(needs attention)</span>
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-6 py-5" data-tour="link-details-config">
          <div>
            <div v-show="editTab === 'details'" id="ld-edit-panel-details" role="tabpanel" aria-labelledby="ld-edit-tab-details">
              <p class="flow-subhead flow-subhead--first">Details</p>
              <div class="flow-group">
                <DetailRow label="Title" for-id="ld-edit-title">
                  <input id="ld-edit-title" v-model="draftTitle" type="text" class="input-textlike px-2 py-1 text-sm w-72"
                    :placeholder="link ? fallbackTitle(link) : ''" />
                </DetailRow>
                <DetailRow label="Project" for-id="ld-edit-project">
                  <select id="ld-edit-project" v-model="draftProjectId" class="input-textlike px-2 py-1 text-sm w-72">
                    <option :value="null">None</option>
                    <option v-if="draftProjectId != null && !availableProjects.some(p => p.id === draftProjectId)" :value="draftProjectId">
                      {{ link?.project_name || 'Current project' }}
                    </option>
                    <option v-for="proj in availableProjects" :key="proj.id" :value="proj.id">{{ proj.name }}</option>
                  </select>
                </DetailRow>
                <DetailRow label="Notes" description="Internal notes for your team." for-id="ld-edit-notes" stacked>
                  <textarea id="ld-edit-notes" v-model="draftNotes" rows="3" class="input-textlike w-full px-3 py-2 text-sm"></textarea>
                </DetailRow>
              </div>

              <p class="flow-subhead">What this link does</p>
              <div class="flow-group">
                <DetailRow label="Review" description="Share files for clients to view.">
                  <template v-if="draftShareEnabled" #summary>
                    <span v-if="draftFilePaths.length" class="block truncate" :title="sharedFilesDir">
                      {{ pluralize(draftFilePaths.length, 'file') }} from <code>{{ sharedFilesDir }}</code>
                    </span>
                    <span v-else>No files chosen yet.</span>
                  </template>
                  <button v-if="draftShareEnabled" type="button" class="btn btn-xs whitespace-nowrap"
                    :class="draftFilePaths.length ? 'btn-secondary' : 'btn-primary'" @click="openFilesEditor">
                    {{ draftFilePaths.length ? 'Manage files…' : 'Choose files to share' }}
                  </button>
                  <FlowSwitch :model-value="draftShareEnabled" label="Review" @update:model-value="setDraftShare" />
                </DetailRow>
                <DetailRow label="Upload" description="Let clients send you files.">
                  <template v-if="draftUploadEnabled" #summary>
                    <span v-if="!uploadDirMissing" class="block truncate" :title="draftUploadDir">
                      Uploads go to <code>{{ draftUploadDir }}</code>
                    </span>
                    <span v-else>No upload folder chosen yet.</span>
                  </template>
                  <button v-if="draftUploadEnabled" type="button" class="btn btn-xs whitespace-nowrap"
                    :class="uploadDirMissing ? 'btn-primary' : 'btn-secondary'" @click="goToUploadFolder">
                    {{ uploadDirMissing ? 'Select upload location' : 'Change…' }}
                  </button>
                  <FlowSwitch :model-value="draftUploadEnabled" label="Upload" @update:model-value="setDraftUpload" />
                </DetailRow>
              </div>
              <FlowNotice v-if="!draftShareEnabled && !draftUploadEnabled" tone="danger" size="sm" class="mt-2">
                Turn on Review, Upload or both.
              </FlowNotice>
            </div>

            <div v-show="editTab === 'access'" id="ld-edit-panel-access" role="tabpanel" aria-labelledby="ld-edit-tab-access">
              <p class="flow-subhead flow-subhead--first">Who can open it</p>
              <ul class="flow-list" role="radiogroup" aria-label="Who can open this link">
                <li v-for="opt in accessChoices" :key="opt.value">
                  <label class="flow-list__row flow-list__row--interactive !items-start"
                    :class="{ 'flow-list__row--selected': accessChoice === opt.value }">
                    <input type="radio" name="ld-access-choice" class="mt-0.5" :value="opt.value"
                      :checked="accessChoice === opt.value" @change="accessChoice = opt.value" />
                    <span class="min-w-0">
                      <span class="block text-sm font-medium">{{ opt.label }}</span>
                      <span class="block flow-list__meta">{{ opt.help }}</span>
                    </span>
                  </label>
                </li>
              </ul>

              <div v-if="accessChoice === 'open_password' || (accessChoice !== 'restricted' && supportsComments)" class="flow-group mt-3">
                <DetailRow v-if="accessChoice === 'open_password'" :label="openPasswordRequired ? 'New password' : 'Password'"
                  :description="openPasswordRequired ? 'Leave blank to keep the current password.' : 'Share it with the people you send the link to.'"
                  for-id="ld-edit-password">
                  <input id="ld-edit-password" v-model.trim="draftPassword" type="password" autocomplete="new-password"
                    class="input-textlike px-2 py-1 text-sm w-56" :placeholder="openPasswordRequired ? 'Unchanged' : 'Enter a password'" />
                </DetailRow>
                <DetailRow v-if="supportsComments" label="Allow comments" description="Viewers can leave review comments.">
                  <button v-if="draftAllowComments" type="button" class="btn btn-secondary btn-xs whitespace-nowrap"
                    :disabled="!effectiveToken || !link?.id" @click="categoryManagementOpen = true">Comment categories…</button>
                  <FlowSwitch v-model="draftAllowComments" label="Allow comments" />
                </DetailRow>
              </div>
              <FlowNotice v-if="mustProvidePassword" tone="danger" size="sm" class="mt-2">
                Enter a password, or choose a different access option.
              </FlowNotice>

              <template v-if="accessChoice === 'restricted'">
                <div class="flex items-center justify-between gap-2 mt-4 mb-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">Invited</p>
                    <p class="text-xs text-muted">Changes here are saved when you click Save &amp; close.</p>
                  </div>
                  <button type="button" class="btn btn-primary btn-sm whitespace-nowrap" @click="openAccessModal">Invite clients…</button>
                </div>
                <LinkAccessList :users="editAccessUsers" :groups="editAccessGroups" :loading="accessLoading" editable
                  @remove-user="removeAccess" @remove-team="removeGroupAccess"
                  @undo-user="undoRemoveAccess" @undo-team="undoRemoveGroupAccess" />
                <FlowNotice v-if="!accessSatisfied" tone="danger" size="sm" class="mt-2">
                  Invite at least one client or team, or choose a different access option.
                </FlowNotice>
                <div v-if="canChooseApprover" id="ld-edit-approver-row" class="flow-group mt-3 scroll-mt-4">
                  <DetailRow label="Who approves" for-id="ld-edit-approver"
                    description="Only this person can approve, request changes or reject files.">
                    <select id="ld-edit-approver" v-model="draftApproverId"
                      class="input-textlike pl-2 pr-8 py-1 text-sm min-w-[10rem] max-w-[14rem]">
                      <option :value="null" class="bg-default text-default">No approver</option>
                      <option v-for="o in approverChoices" :key="o.id" :value="o.id" class="bg-default text-default">{{ o.label }}</option>
                    </select>
                  </DetailRow>
                </div>
              </template>
            </div>

            <div v-if="draftShareEnabled" v-show="editTab === 'files'" id="ld-edit-panel-files" role="tabpanel" aria-labelledby="ld-edit-tab-files">
              <p class="flow-subhead flow-subhead--first">Shared files</p>
              <div class="flow-group">
                <DetailRow :label="`${pluralize(draftFilePaths.length, 'file')} selected`"
                  :description="filesDirty ? 'Changed. Saved when you click Save & close.' : ''">
                  <button type="button" class="btn btn-secondary btn-sm" @click="openFilesEditor">Manage files…</button>
                </DetailRow>
                <div v-if="draftFilePaths.length" class="py-2">
                  <button type="button" class="ld-link text-xs" :aria-expanded="fileListExpanded" @click="fileListExpanded = !fileListExpanded">
                    {{ fileListExpanded ? 'Hide the file list' : 'Show the file list' }}
                  </button>
                  <ul v-if="fileListExpanded" class="ld-paths">
                    <li v-for="(p, i) in draftFilePaths" :key="p + ':' + i" class="truncate" :title="p"><code>{{ p }}</code></li>
                  </ul>
                </div>
              </div>
              <FlowNotice v-if="!draftFilePaths.length" tone="warning" size="sm" class="mt-2">
                No files selected. Use Manage files… to choose some.
              </FlowNotice>
            </div>

            <div v-if="draftUploadEnabled" v-show="editTab === 'uploads'" id="ld-edit-panel-uploads" role="tabpanel" aria-labelledby="ld-edit-tab-uploads">
              <p class="flow-subhead flow-subhead--first">Uploads</p>
              <div class="flow-group">
                <DetailRow label="Save uploads to" description="The folder on your server where uploaded files go." stacked>
                  <PathInput v-model="draftUploadDir" :apiFetch="apiFetch" :dirsOnly="true" />
                  <p v-if="uploadDirDirty" class="text-xs text-muted mt-1">
                    Currently <code>{{ currentUploadDir || 'not set' }}</code>. Changes when you save.
                  </p>
                </DetailRow>
                <template v-if="draftShareEnabled">
                  <DetailRow label="Add uploads to shared files" description="Uploaded files appear in this link's shared files.">
                    <FlowSwitch v-model="draftAutoShareUploads" label="Add uploads to shared files" />
                  </DetailRow>
                  <DetailRow label="Watermark uploads"
                    :description="link?.watermark ? 'Apply this link\'s watermark to files uploaded through it.' : 'This link has no watermark configured.'">
                    <FlowSwitch v-model="draftAutoWatermarkUploads" label="Watermark uploads" :disabled="!link?.watermark" />
                  </DetailRow>
                </template>
                <DetailRow label="Proxy files for uploads" description="The server makes proxy files for each video uploaded through this link.">
                  <FlowSwitch v-model="draftAutoTranscodeUploads" label="Proxy files for uploads" />
                </DetailRow>
                <DetailRow v-if="draftAutoTranscodeUploads" label="Upload proxy qualities">
                  <div class="flex flex-wrap justify-end gap-x-4 gap-y-1">
                    <label v-for="q in proxyQualityChoices" :key="`auto-${q}`" class="inline-flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" class="styled-checkbox" :value="q" :checked="draftAutoTranscodeProxyQualities.includes(q)"
                        @change="toggleDraftAutoTranscodeQuality(q, ($event.target as HTMLInputElement).checked)" />
                      {{ qualityLabel(q) }}
                    </label>
                  </div>
                </DetailRow>
              </div>
              <FlowNotice v-if="uploadDirMissing" tone="danger" size="sm" class="mt-2">Choose a folder for uploads.</FlowNotice>
              <template v-if="isPremiumActive">
                <p class="flow-subhead">File requirements</p>
                <FlowNotice v-if="uploadSpecError" tone="warning" size="sm">{{ uploadSpecError }}</FlowNotice>
                <p v-else-if="!link?.upload_enabled" class="text-xs text-muted">Save the link with uploads turned on, then set file requirements here.</p>
                <div v-else class="flow-group">
                  <div class="py-3">
                    <UploadSpecRulesEditor v-model="draftUploadSpec" :disabled="saving"
                      @update:invalid="(v) => (uploadSpecInvalid = v)" />
                  </div>
                </div>
              </template>
            </div>

            <div v-show="editTab === 'playback'" id="ld-edit-panel-playback" role="tabpanel" aria-labelledby="ld-edit-tab-playback">
              <p class="flow-subhead flow-subhead--first">Playback and watermark</p>
              <div class="flow-group">
                <DetailRow label="Proxy files" description="Playback copies made for reviewers.">
                  <FlowSwitch v-model="draftGenerateReviewProxy" label="Proxy files" />
                </DetailRow>
                <DetailRow v-if="draftGenerateReviewProxy" label="Qualities">
                  <div class="flex flex-wrap justify-end gap-x-4 gap-y-1">
                    <label v-for="q in proxyQualityChoices" :key="q" class="inline-flex items-center gap-2 cursor-pointer">
                      <input v-model="draftProxyQualities" type="checkbox" class="styled-checkbox" :value="q" />
                      {{ qualityLabel(q) }}
                    </label>
                  </div>
                </DetailRow>
                <DetailRow label="Watermark" :description="watermarkEditHelp">
                  <button v-if="draftWatermarkEnabled" type="button" class="btn btn-secondary btn-xs whitespace-nowrap" @click="openWatermarkConfigModal">Configure…</button>
                  <FlowSwitch v-model="draftWatermarkEnabled" label="Watermark" :disabled="linkHasVideoFiles && !draftGenerateReviewProxy" />
                </DetailRow>
                <DetailRow v-if="draftShareEnabled && (draftGenerateReviewProxy || draftWatermarkEnabled)" label="Reprocess proxy files"
                  :description="`Regenerates proxy files and streams with the settings above. ${clientTranscodeEnabled ? 'Uses this computer\'s hardware (client-side transcoding is on).' : 'The server does the processing.'}`">
                  <button type="button" class="btn btn-secondary btn-sm whitespace-nowrap" :disabled="reprocessingMedia" @click="reprocessMedia()">
                    {{ reprocessingMedia ? 'Processing…' : 'Reprocess' }}
                  </button>
                </DetailRow>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-if="editMode" #footer>
        <div class="min-w-0 mr-auto text-sm" aria-live="polite">
          <template v-if="editProblem">
            <span class="text-flow-danger">{{ editProblem }}</span>
            <button v-if="editProblems[0].tab !== editTab" type="button" class="ld-link text-xs ml-2"
              @click="editTab = editProblems[0].tab">Go to {{ editTabLabel(editProblems[0].tab) }}</button>
          </template>
          <span v-else-if="hasUnsavedChanges" class="inline-flex items-center gap-2 font-medium">
            <span class="flow-dot flow-dot--warning" aria-hidden="true" />You have unsaved changes
          </span>
          <span v-else class="text-xs text-muted">Changes apply to the live link when you save.</span>
        </div>
        <div class="flex items-center gap-2" data-tour="link-details-save">
          <button type="button" class="btn btn-dismiss" :disabled="saving" @click="cancelEdit">Cancel</button>
          <button type="button" class="btn btn-success" :disabled="saveDisabled" @click="saveAll">{{ saving ? 'Saving…' : 'Save & close' }}</button>
        </div>
      </template>
  </FlowModal>

  <template v-if="modelValue">
      <AddUsersModal
        v-model="accessModalOpen"
        :apiFetch="apiFetch"
        :link="link || undefined"
        :roleHint="link?.type === 'upload' ? 'upload' : 'view'"
        :preselected="draftAccess.map(a => ({
          id: a.user_id > 0 ? a.user_id : undefined,
          username: a.user_name || '',
          name: a.name || '',
          user_email: a.user_email || '',
          display_color: a.display_color || '',
          role_id: a.role_id ?? a.role?.id ?? undefined,
          role_name: a.role_name ?? a.role?.name ?? undefined,
        }))"
        :preselectedGroups="draftGroups.map((g: any) => ({
          id: g.group_id,
          role_id: g.role_id ?? g.role?.id ?? null,
          role_name: g.role_name ?? g.role?.name ?? null,
        }))"
        @apply="mergeAccessFromModal"
      />
      <EditLinkFilesModal v-model="filesEditorOpen" :apiFetch="apiFetch"
        :initialPaths="draftFilePaths"
        :base="linkProjectBase" :startDir="linkStartDir" @apply="onApplyFilePaths" />

      <!-- Comments modal -->
      <CommentsReviewModal v-model="commentsModalOpen" :link="link" />

      <!-- Category Management Modal -->
      <CategoryManagementModal
        :is-open="categoryManagementOpen"
        :token="effectiveToken"
        :link-id="Number(link?.id)"
        :categories="linkCategories"
        @close="categoryManagementOpen = false"
        @categories-updated="onCategoriesUpdated"
      />

      <!-- Watermark Customization Modal -->
      <FlowModal :model-value="watermarkConfigModalOpen" title="Configure Watermark" size="xl" @close="watermarkConfigModalOpen = false">
          
          <!-- Watermark file selection -->
          <div class="mb-4 space-y-2 p-4 border border-default rounded-lg bg-default/20">
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold">Watermark File Name</label>
              <input
                v-model.trim="draftWatermarkFile"
                placeholder="e.g. watermark.png"
                class="input-textlike border rounded px-3 py-2 w-full"
              />
              <p class="text-xs opacity-70">
                Use an existing file name already available on the server.
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <select
                  v-model="draftWatermarkFile"
                  class="input-textlike border rounded px-2 py-1 text-sm min-w-[20rem]"
                >
                  <option value="">Select existing watermark file…</option>
                  <optgroup v-if="showDefaultWatermarksForEdit && validDefaultWatermarksForEdit.length && existingWatermarkFilesForEdit.length" label="Client Uploads">
                    <option v-for="wm in existingWatermarkFilesForEdit" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
                  </optgroup>
                  <template v-else-if="existingWatermarkFilesForEdit.length">
                    <option v-for="wm in existingWatermarkFilesForEdit" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
                  </template>
                  <optgroup v-if="showDefaultWatermarksForEdit && validDefaultWatermarksForEdit.length" label="45Flow Defaults">
                    <option v-for="wm in validDefaultWatermarksForEdit" :key="wm.id" :value="wm.path">{{ wm.name }}</option>
                  </optgroup>
                </select>
                <button type="button" class="btn btn-secondary px-2 py-1 text-xs" @click="loadExistingWatermarkFilesForEdit">
                  Refresh
                </button>
              </div>
              <div class="flex items-center gap-2 mb-2">
                <input type="checkbox" id="show-default-watermarks-edit" v-model="showDefaultWatermarksForEdit" @change="loadExistingWatermarkFilesForEdit" class="input-checkbox h-4 w-4 m-0" />
                <label for="show-default-watermarks-edit" class="text-sm cursor-pointer">Show default watermarks</label>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn btn-secondary" @click="pickLocalWatermark">
                  Choose Local Image
                </button>
                <span class="text-xs opacity-80">
                  {{ draftWatermarkLocalFile ? draftWatermarkLocalFile.name : 'No local file selected' }}
                </span>
                <button
                  v-if="draftWatermarkLocalFile"
                  type="button"
                  class="btn btn-danger px-2 py-1 text-xs"
                  @click="clearLocalWatermark"
                >
                  Clear
                </button>
              </div>
              <p v-if="draftWatermarkLocalFile" class="text-xs opacity-70">
                Selected local file will be uploaded on save and used as watermark.
              </p>
            </div>
          </div>

          <!-- Watermark Customizer (premium) or basic preview (free) -->
          <template v-if="draftWatermarkFile || draftWatermarkLocalFile">
            <WatermarkCustomizer v-if="isPremiumActive"
              v-model="draftWatermarkSettings"
              :watermarkPreviewUrl="watermarkPreviewUrl || null"
            />
            <WatermarkPreview v-else
              :previewUrl="watermarkPreviewUrl || ''"
              label="Watermark (bottom-right)"
            />
          </template>
          <div v-else class="p-4 text-center text-sm opacity-70">
            Select a watermark file to configure customization settings.
          </div>
          
          <!-- Save/Regenerate Actions -->
          <template v-if="draftWatermarkFile || draftWatermarkLocalFile" #footer>
            <button class="btn btn-dismiss" @click="cancelWatermarkConfig">Cancel</button>
            <button class="btn btn-primary" @click="saveWatermarkConfig">
              Apply Settings
            </button>
          </template>
      </FlowModal>
  </template>
</template>

<!-- Inline sub-components -->
<script lang="ts">
import { defineComponent, h } from 'vue'

// One label/value row inside a .flow-group; `stacked` puts the value under the label.
const DetailRow = defineComponent({
  props: {
    label: { type: String, required: true },
    description: { type: String, default: '' },
    forId: { type: String, default: '' },
    stacked: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => {
      const labelEl = h(props.forId ? 'label' : 'div', {
        class: 'block text-sm font-medium text-default',
        ...(props.forId ? { for: props.forId } : {}),
      }, props.label)
      const head = h('div', { class: 'min-w-0' }, [
        labelEl,
        props.description ? h('div', { class: 'text-xs text-accent mt-0.5' }, props.description) : null,
        slots.summary ? h('div', { class: 'text-xs text-default mt-1 min-w-0' }, slots.summary()) : null,
      ])
      if (props.stacked) {
        return h('div', { class: 'py-3 flex flex-col gap-2' }, [head, h('div', { class: 'min-w-0' }, slots.default?.())])
      }
      return h('div', { class: 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 items-center py-3' }, [
        head,
        h('div', { class: 'flex items-center justify-end gap-2 min-w-0 max-w-[24rem] text-sm text-right' }, slots.default?.()),
      ])
    }
  },
})
</script>

<script setup lang="ts">
import { writeClipboard } from '../../clipboard'
import { computed, inject, nextTick, ref, watch, toRaw } from 'vue'
import { useTimeFormat } from '../../composables/useTimeFormat'
import { ChatBubbleLeftRightIcon, LinkIcon, MagnifyingGlassIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'
import AddUsersModal from './AddUsersModal.vue'
import EditLinkFilesModal from './EditLinkFilesModal.vue'
import CommentsReviewModal from './CommentsReviewModal.vue'
import CategoryManagementModal from './CategoryManagementModal.vue'
import PathInput from '../PathInput.vue'
import UploadSpecRulesEditor from '../UploadSpecRulesEditor.vue'
import { describeSpecRules, hasAnySpecRule, withSpecDefaults, type UploadSpecRules } from '../../utils/uploadSpec'
import LinkTranscodeStatus from '../LinkTranscodeStatus.vue'
import LinkRecipientCopies from '../LinkRecipientCopies.vue'
import EmailInvitationPanel from '../EmailInvitationPanel.vue'
import LinkReviewPanel from '../LinkReviewPanel.vue'
import LinkEmailsPanel from '../LinkEmailsPanel.vue'
import { useEgressSwitches } from '../../composables/useEgressSwitches'
import { useLinkReview } from '../../composables/useLinkReview'
import { reviewStateView } from '../../utils/reviewStatus'
import WatermarkCustomizer from '../WatermarkCustomizer.vue'
import WatermarkPreview from '../WatermarkPreview.vue'
import type { LinkItem, AccessRow, Status, ExistingUser } from '../../typings/electron'
import type { WatermarkSettings, Default45FlowWatermark } from '../../types/watermark'
import { createDefaultWatermarkSettings, DEFAULT_45FLOW_WATERMARKS } from '../../types/watermark'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { useTransferProgress } from '../../composables/useTransferProgress'
import { useExternalAddressReadiness, describeExternalAddressNotReady, resolveCopyUrl } from '../../composables/useExternalAddressReadiness'
import { useConnections } from '../../composables/useConnections'
import { useLicenseStatus } from '../../composables/useLicenseStatus'
import { useRemoteTranscode } from '../../composables/useRemoteTranscode'
import { useClientTranscode } from '../../composables/useClientTranscode'
import { useCommentCategories } from '../../composables/useCommentCategories'
import { connectionMetaInjectionKey } from '../../keys/injection-keys'
import { useTourManager, type TourStep } from '../../composables/useTourManager'
import { useOnboarding } from '../../composables/useOnboarding'
import FlowModal from '../../ui/FlowModal.vue'
import FlowChip from '../../ui/FlowChip.vue'
import FlowEmpty from '../../ui/FlowEmpty.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import FlowSwitch from '../../ui/FlowSwitch.vue'
import LinkAccessList from '../access/LinkAccessList.vue'

const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()
const { isPremiumActive } = useLicenseStatus()
const { runRemoteTranscode, isRemoteTranscoding: isRemoteTranscodingCheck } = useRemoteTranscode()
const { enabled: clientTranscodeEnabled } = useClientTranscode()

const linkDetailsTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="link-details-header"]',
		message: isPremiumActive.value
			? 'This is Link Details.\n\nClick "Edit" to change the link, "Comments" to review, categorize and export feedback (Pro), or "Close" when done.'
			: 'This is Link Details.\n\nClick "Edit" to change the link, or "Close" when done.',
	},
	{
		target: '[data-tour="link-details-meta"]',
		message: 'The top of the window shows whether the link is active, its address, who can open it, and when it was created and expires.\n\nClick "Copy link" to copy the address.',
	},
	{
		target: '[data-tour="link-details-config"]',
		message: 'Overview sums up the link: who can open it (and who is invited), its shared files, where uploads are saved, its proxy files and watermark, and your notes.\n\nYou can also delete the link from the bottom of this tab.',
	},
	{
		target: '[data-tour="link-details-files"]',
		message: 'Files lists every file on the link and the progress of any proxy files being made.\n\nFor review links these are the files people can open. For upload links these are the files people have sent you.',
	},
	{
		target: '[data-tour="link-details-activity"]',
		message: isPremiumActive.value
			? 'Activity is a log of everything that happened on this link: views, downloads, uploads, comments and changes.\n\nFilter by action or search to find something.'
			: 'Activity is a log of everything that happened on this link: views, downloads, uploads and changes.\n\nFilter by action or search to find something.',
	},
])

const linkDetailsEditTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="link-details-config"]',
		message: isPremiumActive.value
			? 'You are editing the link. Use the tabs to move between its settings.\n\nDetails: title, project, notes and whether it is for review, upload or both. Access: who can open it. Files and Uploads: what it shares and where uploads go, with file requirements for uploads. Playback: proxy files and watermark, with full position, size and opacity controls.\n\nA red dot marks a tab that needs attention before you can save.'
			: 'You are editing the link. Use the tabs to move between its settings.\n\nDetails: title, project, notes and whether it is for review, upload or both. Access: who can open it. Files and Uploads: what it shares and where uploads go. Playback: proxy files and watermark.\n\nA red dot marks a tab that needs attention before you can save.',
	},
	{
		target: '[data-tour="link-details-save"]',
		message: 'Click "Save & close" when you are done, or "Cancel" to go back without saving.\n\nChanges apply to the live link as soon as you save. Anything blocking the save is shown on the left.',
	},
])

let _detailsTourTriggered = false
let _editTourTriggered = false

const props = defineProps<{
  modelValue: boolean
  link: LinkItem | null
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'updated', payload: Partial<LinkItem> & { id: LinkItem['id'] }): void
  (e: 'requestDelete', link: LinkItem): void
}>()

// Tour: trigger on first open
watch(() => props.modelValue, (open) => {
	if (open && !_detailsTourTriggered && !onboarding.value.linkDetailsTourDone) {
		_detailsTourTriggered = true
		setTimeout(() => {
			requestTour('link-details', linkDetailsTourSteps.value, () => markDone('linkDetailsTourDone'))
		}, 400)
	}
})

const transfer = useTransferProgress()
const { checkExternalAddressReady } = useExternalAddressReadiness()
const { activeConnection, connections } = useConnections()
const connectionMeta = inject(connectionMetaInjectionKey, null)


const thumbnailSrc = ref('')
const transcodeStatusReload = ref(0)
const thumbnailLoading = ref(false)
const thumbnailFailed = ref(false)
watch(() => props.link?.thumbnailUrl, async (url) => {
  thumbnailSrc.value = ''
  thumbnailLoading.value = false
  thumbnailFailed.value = false
  if (!url) return
  thumbnailLoading.value = true
  try {
    // Use the link's own connection, not the active connection
    const linkConnectionId = (props.link as any)?._connectionId
    const linkConnection = connections.find(c => c.connectionId === linkConnectionId)
    
    // Fall back to active connection if link's connection not found
    const base = linkConnection?.baseUrl || connectionMeta?.value?.apiBase || ''
    const token = linkConnection?.token || connectionMeta?.value?.token || ''
    
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${base}${url}`, { headers })
    if (!res.ok) {
      thumbnailFailed.value = true
      thumbnailLoading.value = false
      return
    }
    const blob = await res.blob()
    thumbnailSrc.value = URL.createObjectURL(blob)
    thumbnailLoading.value = false
  } catch {
    thumbnailFailed.value = true
    thumbnailLoading.value = false
  }
}, { immediate: true })

const detailsLoading = ref(false)
const files = ref<any[]>([])
type AuditActivityRow = {
  type: string
  ts_ms: number
  actor_user_id: number | null
  actor_user_name: string | null
  actor_ip: string | null
  actor_user_agent: string | null
  details: any
}
const auditActivity = ref<AuditActivityRow[]>([])
const activityTypeFilter = ref('all')
const activitySearch = ref('')
const access = ref<AccessRow[]>([])
const accessGroupRows = ref<any[]>([])
// Edit mode works on copies; Save & close replaces the link's access with these.
const draftAccess = ref<AccessRow[]>([])
const draftGroups = ref<any[]>([])
// Once the user edits the draft, server refreshes stop overwriting it.
const accessTouched = ref(false)
const accessLoading = ref(false)
const accessModalOpen = ref(false)
const commentsModalOpen = ref(false)
const categoryManagementOpen = ref(false)
const linkCategories = ref<Array<{ id: number; name: string; color: string | null }>>([])

const { getCategoriesForLink } = useCommentCategories()
const versionsLoading = ref(false)
const versionsError = ref<string | null>(null)
const versions = ref<any[]>([])
const selectedVersionFileId = ref<number | null>(null)
const restoreBackup = ref(true)
const showExtraFiles = ref(false)
const deletingArtifactKeys = ref<Set<string>>(new Set())
const detailsToken = ref('')
let suppressVersionWatch = false
const proxyQualityChoices = ['720p', '1080p', 'original'] as const

const versionFileById = computed(() => {
  const map = new Map<number, any>()
  for (const f of files.value) {
    const id = toNumericFileId(f?.id)
    if (!id) continue
    map.set(id, f)
  }
  return map
})

const editMode = ref(false)
const saving = ref(false)
const reprocessingMedia = ref(false)
const mediaWasReprocessed = ref(false)

const hasUnsavedChanges = computed(() => {
  if (!editMode.value || !props.link) return false
  if (mediaWasReprocessed.value) return true
  if ((draftTitle.value || '') !== (props.link.title || '')) return true
  if ((draftNotes.value || '') !== (((props.link as any).notes) || '')) return true
  if (draftAccessMode.value !== (props.link.access_mode || 'open')) return true
  if (!!draftUploadEnabled.value !== !!props.link.upload_enabled) return true
  if (!!draftShareEnabled.value !== !!props.link.share_enabled) return true
  if (!!draftAutoShareUploads.value !== !!props.link.auto_share_uploads) return true
  if (!!draftAutoWatermarkUploads.value !== !!props.link.auto_watermark_uploads) return true
  if (!!draftAutoTranscodeUploads.value !== !!props.link.auto_transcode_uploads) return true
  if (draftAutoTranscodeUploads.value && JSON.stringify([...draftAutoTranscodeProxyQualities.value].sort()) !== JSON.stringify([...(props.link.auto_transcode_proxy_qualities || [])].sort())) return true
  if ((draftProjectId.value ?? null) !== ((props.link as any).project_id ?? null)) return true
  const linkAccessMode = props.link.access_mode || 'open'
  const seedComments = (props.link?.type !== 'upload' && linkAccessMode !== 'restricted')
    ? !!(props.link.allow_comments ?? true)
    : false
  if (!!draftAllowComments.value !== seedComments) return true
  if (mediaSettingsDirty.value) return true
  if (draftShareEnabled.value && filesDirty.value) return true
  if (draftUploadEnabled.value && uploadDirDirty.value) return true
  const hadPassword = (props.link.auth_mode || '') === 'password' || !!props.link.passwordRequired
  if (draftUsePassword.value !== hadPassword) return true
  if (draftUsePassword.value && draftPassword.value.trim().length > 0) return true
  if (accessEditsPending.value) return true
  if (approverDirty.value) return true
  if (uploadSpecDirty.value) return true
  return false
})

const capabilitiesSatisfied = computed(() => {
  if (!editMode.value) return true
  // At least one capability must be enabled
  if (!draftUploadEnabled.value && !draftShareEnabled.value) return false
  // If share is enabled, files must be selected
  if (draftShareEnabled.value && draftFilePaths.value.length === 0) return false
  // If upload is enabled, destination directory must be set
  if (uploadDirMissing.value) return false
  if (canEditUploadSpec.value && uploadSpecInvalid.value) return false
  return true
})

// Paths here are share-relative, so "/" is the share root and is a valid destination.
const uploadDirMissing = computed(() =>
  draftUploadEnabled.value && !draftUploadDir.value.trim()
)

const saveDisabled = computed(() =>
  saving.value ||
  (editMode.value && (!accessSatisfied.value || !passwordSatisfied.value || !capabilitiesSatisfied.value || !hasUnsavedChanges.value))
)

const draftTitle = ref('')
const draftNotes = ref('')
const draftAccessMode = ref<'open' | 'restricted'>('open')
const draftAllowComments = ref(true)
const draftUsePassword = ref(false)
const draftPassword = ref('')
const draftUploadEnabled = ref(false)
const draftShareEnabled = ref(true)
const draftAutoShareUploads = ref(false)
const draftAutoWatermarkUploads = ref(false)
const draftAutoTranscodeUploads = ref(false)
const draftAutoTranscodeProxyQualities = ref<string[]>(['720p'])
function toggleDraftAutoTranscodeQuality(quality: string, checked: boolean) {
  const set = new Set(draftAutoTranscodeProxyQualities.value)
  if (checked) set.add(quality)
  else set.delete(quality)
  draftAutoTranscodeProxyQualities.value = Array.from(set)
}
const draftProjectId = ref<number | null>(null)

// Email can be switched off on the server; say so before anyone tries to send.
const egress = useEgressSwitches((url, opts) => props.apiFetch(url, opts))
watch(() => props.link?.id, (id) => { if (id) void egress.load() }, { immediate: true })

// File requirements for uploads (Pro). Saved separately through /upload-spec.
const savedUploadSpec = ref<UploadSpecRules | null>(null)
const draftUploadSpec = ref<UploadSpecRules | null>(null)
const uploadSpecInvalid = ref(false)
const uploadSpecError = ref('')
const canEditUploadSpec = computed(() => isPremiumActive.value && draftUploadEnabled.value && !uploadSpecError.value)
function specKey(r: UploadSpecRules | null) {
  return hasAnySpecRule(r) ? JSON.stringify(r) : 'null'
}
const uploadSpecDirty = computed(() => canEditUploadSpec.value && specKey(draftUploadSpec.value) !== specKey(savedUploadSpec.value))
async function loadUploadSpec() {
  uploadSpecError.value = ''
  savedUploadSpec.value = null
  draftUploadSpec.value = null
  if (!props.link?.id || !isPremiumActive.value || !props.link.upload_enabled) return
  try {
    const data = await props.apiFetch(`/api/links/${props.link.id}/upload-spec`, { exposeServerMessage: true })
    savedUploadSpec.value = withSpecDefaults(data?.rules)
    draftUploadSpec.value = withSpecDefaults(data?.rules)
  } catch (e: any) {
    uploadSpecError.value = e?.status === 404
      ? 'This server does not support file requirements yet. Update the Broadcaster.'
      : `Couldn't load file requirements: ${e?.message || 'unknown error'}`
  }
}
const savedUploadSpecSummary = computed(() => describeSpecRules(savedUploadSpec.value).map(p => p.value).join(' · '))
watch([() => props.modelValue, () => props.link?.id, isPremiumActive], ([open, id]) => {
  if (open && id && !editMode.value) void loadUploadSpec()
}, { immediate: true })
const availableProjects = ref<{ id: number; name: string }[]>([])
const draftGenerateReviewProxy = ref(false)
const draftProxyQualities = ref<string[]>([])
const originalProxyQualities = ref<string[]>([])
const draftWatermarkEnabled = ref(false)
const draftWatermarkFile = ref('')
const originalWatermarkFile = ref('')
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }
const draftWatermarkLocalFile = ref<LocalFile | null>(null)
const draftWatermarkSettings = ref<WatermarkSettings>(createDefaultWatermarkSettings())
const watermarkConfigModalOpen = ref(false)
const showDefaultWatermarksForEdit = ref(true)
const existingWatermarkFilesForEdit = ref<string[]>([])
const validDefaultWatermarksForEdit = ref<Default45FlowWatermark[]>([])
const existingWatermarkPreviewUrlForEdit = ref<string | null>(null)

const watermarkPreviewUrl = computed(() =>
  draftWatermarkLocalFile.value?.dataUrl || existingWatermarkPreviewUrlForEdit.value || null
)

const filesEditorOpen = ref(false)
const fileListExpanded = ref(false)
const draftFilePaths = ref<string[]>([])
const originalFilePaths = ref<string[]>([])
const configuredProjectRootForEdit = ref('')
const draftUploadDir = ref('')
const originalUploadDir = ref('')

const isDownloadish = computed(() => props.link?.type === 'download' || props.link?.type === 'collection')

const reviewFilesPath = computed(() => {
  const target = (props.link as any)?.target
  const files = target?.files || draftFilePaths.value
  if (Array.isArray(files) && files.length === 1) {
    const f = files[0]
    return f?.relPath || f?.path || f?.p || f?.name || ''
  }
  if (Array.isArray(files) && files.length > 1) {
    const first = files[0]
    const p = first?.relPath || first?.path || first?.p || ''
    if (p) {
      const dir = p.replace(/\\/g, '/').replace(/\/[^/]+$/, '')
      return dir || '/'
    }
  }
  return ''
})

const uploadDirectoryPath = computed(() => currentUploadDir.value || '')
const supportsComments = computed(() => props.link?.type !== 'upload')
// Invited people for "Send to people on this link" in the email section.
const invitePeople = computed(() => currentAccessMode.value === 'restricted'
  ? access.value.filter(a => !a.is_disabled && !a.is_deleted)
      .map(a => ({ name: a.name, user_name: a.user_name, email: a.user_email }))
  : [])
const supportsPassword = computed(() => effectiveAccessMode.value === 'open')
const currentAccessMode = computed<'open' | 'restricted'>(() => props.link?.access_mode || 'open')
const effectiveAccessMode = computed<'open' | 'restricted'>(() =>
  editMode.value ? draftAccessMode.value : currentAccessMode.value
)
const restrictAccess = computed({
  get: () => draftAccessMode.value === 'restricted',
  set: (v: boolean) => {
    draftAccessMode.value = v ? 'restricted' : 'open'
  },
})
const accessSatisfied = computed(() => {
  if (effectiveAccessMode.value !== 'restricted') return true
  return editMode.value
    ? draftAccess.value.length > 0 || draftGroups.value.length > 0
    : access.value.length > 0 || accessGroupRows.value.length > 0
})

function seedDraftAccess() {
  draftAccess.value = access.value.map(a => ({ ...a }))
  draftGroups.value = accessGroupRows.value.map((g: any) => ({ ...g }))
  accessTouched.value = false
}

function roleKey(r: any) {
  return String(r?.role_id ?? r?.role?.id ?? r?.role_name ?? r?.role?.name ?? '')
}
function accessSignature(users: AccessRow[], groups: any[]) {
  const u = users.map(a => `u${a.user_id > 0 ? a.user_id : a.user_name}:${roleKey(a)}`).sort()
  const g = groups.map((x: any) => `g${x.group_id}:${roleKey(x)}`).sort()
  return [...u, ...g].join('|')
}
const accessDirty = computed(() =>
  accessSignature(draftAccess.value, draftGroups.value) !== accessSignature(access.value, accessGroupRows.value)
)
// Invite changes only count (and only get saved) while invite-only is chosen, matching what's on screen.
const accessEditsPending = computed(() => editMode.value && draftAccessMode.value === 'restricted' && accessDirty.value)

type PendingState = 'added' | 'removed' | 'changed' | undefined
function pendingState(serverRow: any, draftRow: any): PendingState {
  if (!serverRow) return 'added'
  if (!draftRow) return 'removed'
  return roleKey(serverRow) !== roleKey(draftRow) ? 'changed' : undefined
}
const editAccessUsers = computed(() => {
  const serverById = new Map(access.value.map(a => [a.user_id, a]))
  const draftIds = new Set(draftAccess.value.map(a => a.user_id))
  return [
    ...draftAccess.value.map(a => ({ ...a, pending: pendingState(serverById.get(a.user_id), a) })),
    ...access.value.filter(a => !draftIds.has(a.user_id)).map(a => ({ ...a, pending: 'removed' as const })),
  ]
})
const editAccessGroups = computed(() => {
  const serverById = new Map(accessGroupRows.value.map((g: any) => [g.group_id, g]))
  const draftIds = new Set(draftGroups.value.map((g: any) => g.group_id))
  return [
    ...draftGroups.value.map((g: any) => ({ ...g, pending: pendingState(serverById.get(g.group_id), g) })),
    ...accessGroupRows.value.filter((g: any) => !draftIds.has(g.group_id)).map((g: any) => ({ ...g, pending: 'removed' as const })),
  ]
})

// Unified access list: direct users + group members (deduped, direct takes priority)
const unifiedAccessList = computed(() => {
  const rows: Array<{
    user_id: number
    user_name: string
    name: string
    display_color: string | null
    role_name: string | null
    granted_at: string | null
    is_disabled: boolean
    source: 'direct' | 'group'
    source_label: string
    source_color: string | null
    group_id?: number
  }> = []

  const seen = new Set<number>()

  // Direct users first
  for (const u of access.value) {
    seen.add(u.user_id)
    rows.push({
      user_id: u.user_id,
      user_name: u.user_name || '',
      name: u.name || '',
      display_color: u.display_color ?? null,
      role_name: u.role_name || u.role?.name || null,
      granted_at: u.granted_at ?? null,
      is_disabled: !!u.is_disabled,
      source: 'direct',
      source_label: 'Direct',
      source_color: null,
    })
  }

  // Group members (skip if already direct)
  for (const g of accessGroupRows.value) {
    const members = g.members || []
    for (const m of members) {
      if (seen.has(m.user_id)) continue
      seen.add(m.user_id)
      rows.push({
        user_id: m.user_id,
        user_name: m.user_name || '',
        name: m.name || '',
        display_color: m.display_color ?? null,
        role_name: g.role_name || g.role?.name || null,
        granted_at: g.granted_at ?? null,
        is_disabled: false,
        source: 'group',
        source_label: g.group_name || 'Group',
        source_color: g.group_color ?? null,
        group_id: g.group_id,
      })
    }
  }

  return rows
})

const openPasswordRequired = computed(() =>
  effectiveAccessMode.value === 'open' &&
  ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
)
const mustProvidePassword = computed(() =>
  editMode.value &&
  supportsPassword.value &&
  draftUsePassword.value &&
  !openPasswordRequired.value &&
  !draftPassword.value.trim()
)
const passwordSatisfied = computed(() => !mustProvidePassword.value)
const openPasswordEnabled = computed(() =>
  editMode.value ? (supportsPassword.value && draftUsePassword.value) : openPasswordRequired.value
)
const accessModeOpenLabel = computed(() => (openPasswordEnabled.value ? 'Open (password required)' : 'Open'))
const accessModeSummary = computed(() => {
  if (effectiveAccessMode.value === 'restricted') return 'Invited clients & teams'
  return accessModeOpenLabel.value
})
const currentAccessSummary = computed(() => {
  if (currentAccessMode.value === 'restricted') {
    const parts: string[] = []
    if (access.value.length) parts.push(pluralize(access.value.length, 'client'))
    if (accessGroupRows.value.length) parts.push(pluralize(accessGroupRows.value.length, 'team'))
    return parts.length ? `Invited: ${parts.join(', ')}` : 'Only invited clients'
  }
  if ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired) {
    return 'Anyone with the link + password'
  }
  return 'Anyone with the link'
})
const versionFileChoices = computed(() => {
  return files.value
    .map((f: any) => {
      const id = toNumericFileId(f?.id)
      if (!id) return null
      return { id, name: f?.name || f?.relPath || `File ${id}` }
    })
    .filter(Boolean) as Array<{ id: number; name: string }>
})

const fallbackLinkFiles = computed(() => {
  const src = Array.isArray(props.link?.target?.files) ? props.link?.target?.files : []
  return src.map((f: any, idx: number) => ({
    key: `fallback-${idx}`,
    id: f?.id ?? null,
    name: f?.name || `File ${idx + 1}`,
    size: typeof f?.size === 'number' ? f.size : null,
    mime: f?.mime || null,
    uploader_label: null,
    ip: null,
    ts: null,
    relPath: f?.path ?? f?.relPath ?? f?.p ?? null,
  }))
})

const displayFiles = computed(() => (files.value.length ? files.value : fallbackLinkFiles.value))
const usingFallbackFiles = computed(() => !detailsLoading.value && files.value.length === 0 && fallbackLinkFiles.value.length > 0)
const linkHasVideoFiles = computed(() => displayFiles.value.some(isVideoishFile))

// Absolute share root (e.g. "/tank") so upload destinations display like the create form.
const shareRootPath = ref('')
async function loadShareRoot() {
  try {
    const s = await props.apiFetch('/api/settings')
    shareRootPath.value = typeof s?.projectRoot === 'string' ? s.projectRoot.trim().replace(/\/+$/, '') : ''
  } catch {
    shareRootPath.value = ''
  }
}

const currentUploadDir = computed(() => {
  const it = props.link
  if (!it) return ''
  const raw = it.target?.dirRel ?? (it as any).dirRel
  // null/undefined means no destination is set; an empty dirRel is the share root.
  if (typeof raw !== 'string') return ''
  const rel = raw.trim().replace(/^\/+|\/+$/g, '')
  const root = shareRootPath.value
  if (!root) return rel ? `/${rel}` : '/'
  return rel ? `${root}/${rel}` : `${root}/`
})

// Re-seed an untouched upload destination once the share root is known.
watch(currentUploadDir, (next, prev) => {
  if (draftUploadDir.value === prev && originalUploadDir.value === prev) {
    draftUploadDir.value = next
    originalUploadDir.value = next
  }
})

const primaryUrl = computed(() => {
  const it: any = props.link
  return (it?.url || it?.viewUrl || '') as string
})

// Token can arrive from the details fetch, the link row, or the share URL itself.
const effectiveToken = computed(() => {
  if (detailsToken.value) return detailsToken.value
  const fromLink = String((props.link as any)?.token || '').trim()
  if (fromLink) return fromLink
  const m = String(primaryUrl.value || '').match(/\/link\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : ''
})

const downloadUrl = computed(() => {
  const it: any = props.link
  return (it?.downloadUrl || '') as string
})

const currentGenerateReviewProxy = computed(() => !!(props.link?.generateReviewProxy))
const currentProxyQualities = computed(() => normalizeQualities(props.link?.proxyQualities))
const currentWatermark = computed(() => !!(props.link?.watermark))
const currentWatermarkFile = computed(() => String(props.link?.watermarkFile || '').trim())
const mediaSettingsDirty = computed(() => {
  if (!!draftGenerateReviewProxy.value !== currentGenerateReviewProxy.value) return true
  if (!sameValues(normalizeQualities(draftProxyQualities.value), originalProxyQualities.value)) return true
  if (!sameValues(normalizeQualities(draftProxyQualities.value), originalProxyQualities.value)) return true
  if (!!draftWatermarkEnabled.value !== currentWatermark.value) return true
  if ((draftWatermarkFile.value || '').trim() !== (originalWatermarkFile.value || currentWatermarkFile.value)) return true
  if ((draftWatermarkFile.value || '').trim() !== (originalWatermarkFile.value || currentWatermarkFile.value)) return true
  if (draftWatermarkLocalFile.value) return true
  return false
})


function canonPaths(arr: string[]) {
  return (arr || [])
    .map(normalizeAbs)
    .filter(Boolean)
    .slice()
    .sort()
}

function normalizeQualities(v: any): string[] {
  if (!Array.isArray(v)) return []
  const allowed = new Set(proxyQualityChoices)
  const out: string[] = []
  for (const q of v) {
    const s = String(q || '').trim()
    if (!s || !allowed.has(s as any)) continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

function sameValues(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const as = [...a].sort()
  const bs = [...b].sort()
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false
  return true
}

function assignMediaSettingsFromSource(src: any) {
  if (!src || typeof src !== 'object' || !props.link) return
  const target: any = props.link as any

  const mediaPrefs = src.mediaPrefs ?? src.media_prefs
  if (mediaPrefs && typeof mediaPrefs === 'object') {
    const prefProxy = mediaPrefs.prefer_proxies ?? mediaPrefs.preferProxies
    if (typeof prefProxy === 'boolean') target.generateReviewProxy = prefProxy

    const allowOriginal = mediaPrefs.allow_original_download ?? mediaPrefs.allowOriginalDownload
    if (typeof allowOriginal === 'boolean') target.watermark = !allowOriginal
  }

  const prefProxy = src.prefer_proxies ?? src.preferProxies
  if (typeof prefProxy === 'boolean') target.generateReviewProxy = prefProxy

  const allowOriginal = src.allow_original_download ?? src.allowOriginalDownload
  if (typeof allowOriginal === 'boolean') target.watermark = !allowOriginal

  const proxyVal = src.generateReviewProxy ?? src.generate_review_proxy
  if (typeof proxyVal === 'boolean') target.generateReviewProxy = proxyVal

  const proxyQualities = normalizeQualities(src.proxyQualities ?? src.proxy_qualities)
  if (proxyQualities.length || Array.isArray(src.proxyQualities) || Array.isArray(src.proxy_qualities)) {
    target.proxyQualities = proxyQualities
  }

  const wmVal = src.watermark
  if (typeof wmVal === 'boolean') target.watermark = wmVal

  const wmFile = src.watermarkFile ?? src.watermark_file
  if (wmFile != null) target.watermarkFile = String(wmFile || '')

  const wmSettings = src.watermarkSettings ?? src.watermark_settings
  if (wmSettings && typeof wmSettings === 'object') target.watermarkSettings = wmSettings
}

const _videoExts = new Set([
  'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
  'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
  'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
  'r3d', 'braw', 'ari', 'cine', 'dav',
])
function isVideoishFile(f: any) {
  const mime = String(f?.mime || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  // MXF and other cinema formats use application/* mimes
  if (['application/mxf', 'application/x-mxf', 'application/x-smpte-mxf'].includes(mime)) return true
  const name = String(f?.name || f?.relPath || '').toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() || '' : ''
  return _videoExts.has(ext)
}

function isJobActiveish(status: any) {
  const s = String(status || '').toLowerCase()
  return s === 'queued' || s === 'running' || s === 'processing' || s === 'pending' || s === 'started'
}

async function analyzeMediaNeedsForPaths(opts: {
  paths: string[]
  wantsProxy: boolean
  wantsHls: boolean
  proxyQualities: string[]
}) {
  const missingPaths: string[] = []
  const trackingPaths: string[] = []
  if (!detailsToken.value) {
    return { missingPaths: opts.paths.slice(), trackingPaths: opts.paths.slice() }
  }

  const byPath = new Map<string, any>()
  for (const f of files.value) {
    const p = normalizeAbs(String(f?.relPath ?? f?.path ?? f?.p ?? ''))
    if (p) byPath.set(p, f)
  }

  for (const absPath of opts.paths) {
    const f = byPath.get(normalizeAbs(absPath))
    const fileId = toNumericFileId(f?.id)
    if (!fileId) {
      missingPaths.push(absPath)
      trackingPaths.push(absPath)
      continue
    }
    try {
      const playback = await props.apiFetch(
        `/api/token/${encodeURIComponent(detailsToken.value)}/files/${encodeURIComponent(String(fileId))}/playback?prefer=auto&audit=0`,
        { suppressAuthRedirect: true }
      )

      const tx = playback?.transcodes || {}
      const proxyNode = tx?.proxy_mp4 ?? tx?.proxy ?? null
      const hlsNode = tx?.hls ?? tx?.HLS ?? null

      const hasProxy = !!(playback?.hasProxy || proxyNode?.status === 'done')
      const hasHls = !!(playback?.hasHls || hlsNode?.status === 'done')
      const proxyActive = isJobActiveish(proxyNode?.status)
      const hlsActive = isJobActiveish(hlsNode?.status)

      const existingQualities = new Set(normalizeQualities(playback?.proxyQualities))
      const requiredProxyReady = !opts.wantsProxy || opts.proxyQualities.every((q) => existingQualities.has(q))

      const needsProxy = opts.wantsProxy && !requiredProxyReady && !proxyActive
      const needsHls = opts.wantsHls && !hasHls && !hlsActive

      if (needsProxy || needsHls) missingPaths.push(absPath)
      if (needsProxy || needsHls || proxyActive || hlsActive) trackingPaths.push(absPath)
    } catch {
      // If playback probe fails, be conservative and request/track processing.
      missingPaths.push(absPath)
      trackingPaths.push(absPath)
    }
  }

  return {
    missingPaths: Array.from(new Set(missingPaths)),
    trackingPaths: Array.from(new Set(trackingPaths)),
  }
}

async function hydrateMediaSettingsFromArtifacts() {
  if (!props.link) return
  if (!detailsToken.value) return
  if (!Array.isArray(files.value) || files.value.length === 0) return
  if (statusOf(props.link) !== 'active') return

  const accessMode = props.link.access_mode || 'open'
  const authMode = props.link.auth_mode || (props.link.passwordRequired ? 'password' : 'none')
  const requiresViewerAuth =
    accessMode === 'restricted' ||
    (accessMode === 'open' && authMode === 'password')
  if (requiresViewerAuth) return

  const candidateIds = files.value
    .filter(isVideoishFile)
    .map((f: any) => toNumericFileId(f?.id))
    .filter((n: number | null): n is number => !!n)

  if (!candidateIds.length) return

  let foundProxy = false
  let foundWatermark = false
  const mergedQualities = new Set<string>(normalizeQualities((props.link as any)?.proxyQualities))

  // Keep requests bounded while still sampling enough files for mixed collections.
  const maxChecks = Math.min(candidateIds.length, 12)
  for (let i = 0; i < maxChecks; i++) {
    const fileId = candidateIds[i]
    try {
      const data = await props.apiFetch(
        `/api/token/${encodeURIComponent(detailsToken.value)}/files/${encodeURIComponent(String(fileId))}/playback?prefer=auto&audit=0`,
        { suppressAuthRedirect: true }
      )

      if (data?.hasProxy || data?.hasHls || (Array.isArray(data?.proxyQualities) && data.proxyQualities.length)) {
        foundProxy = true
      }
      if (data?.watermarkEnabled) foundWatermark = true

      for (const q of normalizeQualities(data?.proxyQualities)) mergedQualities.add(q)

      if (foundProxy && foundWatermark && mergedQualities.size > 0) break
    } catch {
      // Non-fatal; continue sampling.
    }
  }

  const target: any = props.link as any
  if (foundProxy) target.generateReviewProxy = true
  if (mergedQualities.size) target.proxyQualities = Array.from(mergedQualities)
  if (foundWatermark) target.watermark = true
}

async function fetchAvailableProjects() {
  try {
    const data = await props.apiFetch('/api/projects')
    availableProjects.value = (data?.projects || []).map((p: any) => ({ id: p.id, name: p.name }))
  } catch {
    availableProjects.value = []
  }
}

function seedDraftMediaSettings() {
  draftGenerateReviewProxy.value = currentGenerateReviewProxy.value
  draftProxyQualities.value = currentProxyQualities.value.length
    ? currentProxyQualities.value.slice()
    : (draftGenerateReviewProxy.value ? ['720p'] : [])
  originalProxyQualities.value = draftProxyQualities.value.slice()
  originalProxyQualities.value = draftProxyQualities.value.slice()
  draftWatermarkEnabled.value = currentWatermark.value
  draftWatermarkFile.value = currentWatermarkFile.value
  originalWatermarkFile.value = currentWatermarkFile.value
  originalWatermarkFile.value = currentWatermarkFile.value
  draftWatermarkLocalFile.value = null
  // Initialize watermark settings from stored link data
  const storedSettings = (props.link as any)?.watermarkSettings
  if (storedSettings && typeof storedSettings === 'object' && storedSettings.position) {
    draftWatermarkSettings.value = JSON.parse(JSON.stringify(storedSettings))
  } else {
    draftWatermarkSettings.value = createDefaultWatermarkSettings()
  }
}

function pickLocalWatermark() {
  window.electron.pickWatermark().then((f: { path: string; name: string; size: number; dataUrl?: string | null } | null) => {
    if (!f) return
    draftWatermarkLocalFile.value = f
    draftWatermarkFile.value = f.name
  })
}

function clearLocalWatermark() {
  draftWatermarkLocalFile.value = null
}

async function openWatermarkConfigModal() {
  // Wait for details fetch to finish so watermarkFile/watermarkSettings are available
  if (detailsLoading.value) {
    await new Promise<void>(resolve => {
      const stop = watch(detailsLoading, (loading) => {
        if (!loading) { stop(); resolve() }
      }, { immediate: true })
    })
  }
  // Ensure watermark file is synced from link details (handles case where details loaded after beginEdit)
  if (!draftWatermarkFile.value && currentWatermarkFile.value) {
    draftWatermarkFile.value = currentWatermarkFile.value
    originalWatermarkFile.value = currentWatermarkFile.value
  }
  // Initialize with stored settings from the link if available, otherwise defaults
  const storedSettings = (props.link as any)?.watermarkSettings
  if (storedSettings && typeof storedSettings === 'object' && storedSettings.position) {
    draftWatermarkSettings.value = JSON.parse(JSON.stringify(storedSettings))
  } else {
    draftWatermarkSettings.value = createDefaultWatermarkSettings()
  }
  watermarkConfigModalOpen.value = true
  // Refresh available watermark files and preview when modal opens
  void loadExistingWatermarkFilesForEdit()
  if (draftWatermarkFile.value && !draftWatermarkLocalFile.value) {
    fetchWatermarkPreviewForEdit(draftWatermarkFile.value)
  }
}

function cancelWatermarkConfig() {
  watermarkConfigModalOpen.value = false
  // Reset to current values
  draftWatermarkFile.value = currentWatermarkFile.value
  draftWatermarkLocalFile.value = null
  // Restore stored settings from the link if available
  const storedSettings = (props.link as any)?.watermarkSettings
  if (storedSettings && typeof storedSettings === 'object' && storedSettings.position) {
    draftWatermarkSettings.value = JSON.parse(JSON.stringify(storedSettings))
  } else {
    draftWatermarkSettings.value = createDefaultWatermarkSettings()
  }
}

async function saveWatermarkConfig() {
  // Apply the watermark settings to the draft state
  // User will need to click the main "Save All" button to persist
  draftWatermarkEnabled.value = true
  
  watermarkConfigModalOpen.value = false
  
  pushNotification(
    new Notification(
      'Watermark Configuration Applied',
      'Click "Save & Close" to persist changes and regenerate outputs',
      'info',
      4000
    )
  )
}

async function fetchWatermarkPreviewForEdit(relPath: string) {
  try {
    const base = connectionMeta?.value?.apiBase ?? ''
    const token = connectionMeta?.value?.token ?? ''
    const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(relPath)}`
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) { existingWatermarkPreviewUrlForEdit.value = null; return }
    const blob = await res.blob()
    existingWatermarkPreviewUrlForEdit.value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    existingWatermarkPreviewUrlForEdit.value = null
  }
}

watch(() => draftWatermarkFile.value, (v) => {
  if (!v || draftWatermarkLocalFile.value) {
    existingWatermarkPreviewUrlForEdit.value = null
    return
  }
  fetchWatermarkPreviewForEdit(v)
})

// Auto-open file selector when share capability is enabled on a link that didn't have it
watch(() => draftShareEnabled.value, async (enabled, wasEnabled) => {
  if (!editMode.value || !props.link) return
  const wasShareEnabled = !!props.link.share_enabled
  // Only trigger if we're enabling share and it was previously disabled
  if (enabled && !wasShareEnabled && wasEnabled === false) {
    // If no files selected, try to auto-populate with project files
    if (draftFilePaths.value.length === 0) {
      const projectRootDir = props.link.project_root_dir
      if (projectRootDir?.trim()) {
        // Fetch all files from the project directory
        try {
          const data = await props.apiFetch(`/api/files?dir=${encodeURIComponent(projectRootDir)}`, { method: 'GET' })
          const entries = Array.isArray(data?.entries) ? data.entries : []
          const filePaths = entries
            .filter((e: any) => !e?.isDir && e?.path)
            .map((e: any) => {
              const p = String(e.path || '').trim()
              return p.startsWith('/') ? p : '/' + p
            })
            .filter(Boolean)
          
          if (filePaths.length > 0) {
            draftFilePaths.value = filePaths
            originalFilePaths.value = [] // Keep original as empty since we're adding new files
            return // Don't open modal if we auto-populated
          }
        } catch (e) {
          console.warn('Failed to auto-populate project files:', e)
        }
      }
      
      // If no project or failed to load, open the files editor
      setTimeout(() => {
        filesEditorOpen.value = true
      }, 100)
    }
  }
})

// Seed an upload folder when upload capability is enabled on a link that didn't have it
watch(() => draftUploadEnabled.value, (enabled, wasEnabled) => {
  if (!editMode.value || !props.link) return
  const wasUploadEnabled = !!props.link.upload_enabled
  // Only trigger if we're enabling upload and it was previously disabled
  if (enabled && !wasUploadEnabled && wasEnabled === false) {
    // If no upload directory set, set a sensible default
    if (!draftUploadDir.value.trim()) {
      // Prefer project root directory (reliable absolute path)
      const projectRootDir = (props.link as any).project_root_dir
      if (projectRootDir?.trim()) {
        draftUploadDir.value = projectRootDir
      } else if (draftFilePaths.value.length > 0) {
        // Extract parent directory from first shared file (never use file path as dir)
        const firstPath = draftFilePaths.value[0]
        const dirMatch = firstPath.match(/^(.+)\/[^/]+$/)
        if (dirMatch) {
          draftUploadDir.value = dirMatch[1] + '/'
        }
      }
    }
  }
})


async function loadExistingWatermarkFilesForEdit() {
  try {
    // Fetch configured project root for central watermark storage
    if (!configuredProjectRootForEdit.value) {
      try {
        const settings = await props.apiFetch('/api/settings')
        if (settings?.projectRoot) {
          configuredProjectRootForEdit.value = String(settings.projectRoot).trim()
        }
      } catch {}
    }
    const dirRel = resolveWatermarkDirRelForEdit()
    const [dirData, globalData] = await Promise.all([
      props.apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`, { method: 'GET' }).catch(() => null),
      props.apiFetch('/api/files/watermarks', { method: 'GET' }).catch(() => null),
    ])
    const dirEntries = Array.isArray(dirData?.entries) ? dirData.entries : []
    const dirWatermarks = dirEntries
      .filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
      .map((e: any) => resolveWatermarkRelPathForEdit(String(e.name).trim()))
    const globalWatermarks = Array.isArray(globalData?.watermarks) ? globalData.watermarks : []
    const serverWatermarks = [...new Set([...dirWatermarks, ...globalWatermarks])].sort()
    
    // Check which built-in watermarks actually exist on the server
    const base = connectionMeta?.value?.apiBase ?? ''
    const token = connectionMeta?.value?.token ?? ''
    const builtinChecks = await Promise.allSettled(
      DEFAULT_45FLOW_WATERMARKS.map(async (wm) => {
        const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(wm.path)}`
        const res = await fetch(url, { method: 'HEAD', headers: { 'Authorization': `Bearer ${token}` } })
        return res.ok ? wm : null
      })
    )
    validDefaultWatermarksForEdit.value = builtinChecks
      .filter((r): r is PromiseFulfilledResult<Default45FlowWatermark> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
    
    existingWatermarkFilesForEdit.value = serverWatermarks
    
    // Auto-select: prefer current watermark from link metadata (what's actually in the video),
    // then fall back to localStorage last-used
    const allFiles = [...serverWatermarks, ...validDefaultWatermarksForEdit.value.map(w => w.path)]
    if (!draftWatermarkLocalFile.value && !draftWatermarkFile.value) {
      const detected = currentWatermarkFile.value
      if (detected && allFiles.includes(detected)) {
        draftWatermarkFile.value = detected
        originalWatermarkFile.value = detected
        return
      }

      try {
        const lastUsed = localStorage.getItem('45flow-last-watermark')
        if (lastUsed && allFiles.includes(lastUsed)) {
          draftWatermarkFile.value = lastUsed
          originalWatermarkFile.value = lastUsed
        }
      } catch { /* ignore storage errors */ }
    }
  } catch {
    existingWatermarkFilesForEdit.value = []
    validDefaultWatermarksForEdit.value = []
  }
}

function rootOfServerPath(p: string) {
  const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!clean) return '/'
  const first = clean.split('/').filter(Boolean)[0] || ''
  return first ? `/${first}` : '/'
}

function resolveWatermarkStorageRootForEdit() {
  // Use central configured project root if available
  if (configuredProjectRootForEdit.value) {
    const abs = configuredProjectRootForEdit.value
    const rel = abs === '/' ? '' : abs.replace(/^\/+/, '')
    return { abs, rel }
  }
  const fromDraft = draftFilePaths.value[0] || ''
  const fromOriginal = originalFilePaths.value[0] || ''
  const fromFiles = String(files.value[0]?.relPath ?? files.value[0]?.path ?? files.value[0]?.p ?? '')
  const root = rootOfServerPath(fromDraft || fromOriginal || fromFiles)
  let abs = String(root || '/').replace(/\\/g, '/').trim()
  if (!abs) abs = '/'
  if (!abs.startsWith('/')) abs = '/' + abs
  abs = abs.replace(/\/+$/, '') || '/'
  const rel = abs === '/' ? '' : abs.replace(/^\/+/, '')
  return { abs, rel }
}

function resolveWatermarkDirRelForEdit() {
  const { rel } = resolveWatermarkStorageRootForEdit()
  return rel ? `${rel}/.45flow/watermarks` : '.45flow/watermarks'
}

function resolveWatermarkUploadDirForEdit() {
  return `/${resolveWatermarkDirRelForEdit()}`
}

function resolveWatermarkRelPathForEdit(name: string) {
  const cleanName = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!cleanName) return ''
  return `${resolveWatermarkDirRelForEdit()}/${cleanName}`
}

async function ensureServerDirExistsForEdit(dir: string) {
  const clean = String(dir || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  try {
    await props.apiFetch(`/api/files?dir=${encodeURIComponent(clean || '.')}&dirsOnly=1&ensure=1`, { method: 'GET' })
    return true
  } catch {
    return false
  }
}

async function uploadDraftLocalWatermark() {
  if (!draftWatermarkLocalFile.value) return { ok: false, error: 'no local watermark selected' as string }
  if (!draftWatermarkLocalFile.value?.path) return { ok: false, error: 'no local watermark file selected' as string }

  const destDir = resolveWatermarkUploadDirForEdit()
  const ensured = await ensureServerDirExistsForEdit(destDir)
  if (!ensured) return { ok: false, error: 'failed to prepare remote watermark directory' as string }

  const { done } = await window.electron.httpUploadStart({
    src: draftWatermarkLocalFile.value.path,
    apiBase: connectionMeta?.value?.apiBase || '',
    apiToken: connectionMeta?.value?.token || '',
    dest: destDir,
  })
  const res = await done
  if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' as string }
  return { ok: true, relPath: resolveWatermarkRelPathForEdit(draftWatermarkLocalFile.value.name) }
}

function computeAddedPaths(next: string[], prev: string[]) {
  const prevSet = new Set(canonPaths(prev))
  return canonPaths(next).filter(p => !prevSet.has(p))
}

const filesDirty = computed(() => {
  const a = canonPaths(draftFilePaths.value)
  const b = canonPaths(originalFilePaths.value)
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
  return false
})

const addedFilePaths = computed(() => computeAddedPaths(draftFilePaths.value, originalFilePaths.value))

const uploadDirDirty = computed(() => (draftUploadDir.value || '') !== (originalUploadDir.value || ''))
const activityTypes = computed(() => {
  return Array.from(new Set(auditActivity.value.map(a => String(a?.type || '').trim()).filter(Boolean))).sort()
})
const filteredAuditActivity = computed(() => {
  const type = activityTypeFilter.value
  const q = activitySearch.value.trim().toLowerCase()
  return auditActivity.value.filter((a) => {
    if (type !== 'all' && a.type !== type) return false
    if (!q) return true
    const hay = [
      a.type,
      activityTypeLabel(a.type),
      actorLabel(a),
      sourceLabel(a),
      activitySummary(a),
      safeStringify(a.details),
    ].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

function normalizeAbs(p: string) {
  const s = (p || '').trim()
  if (!s) return ''
  return s.startsWith('/') ? s : '/' + s.replace(/^\/+/, '')
}

function inferBaseFromPaths(paths: string[]) {
  const first = (paths || []).map(normalizeAbs).find(Boolean)
  if (!first) return ''
  const seg = first.split('/').filter(Boolean)[0]
  return seg ? '/' + seg : ''
}

const linkProjectBase = computed(() => {
  // Use project_root_dir from the link if available
  const projectRoot = (props.link as any)?.project_root_dir
  if (projectRoot?.trim()) return projectRoot.trim()

  // Fallback: infer from existing draft paths or detail files
  return inferBaseFromPaths(draftFilePaths.value.length ? draftFilePaths.value : originalFilePaths.value)
})

const linkStartDir = computed(() => linkProjectBase.value || '/')

function close() {
  emit('update:modelValue', false)
}

function openAccessModal() {
  accessModalOpen.value = true
}

const hasShareCapability = computed(() => !!props.link?.share_enabled)
const hasUploadCapability = computed(() => !!props.link?.upload_enabled)

const STATUS_LABELS: Record<Status, string> = { active: 'Active', expired: 'Expired', disabled: 'Disabled', archived: 'Archived' }
const statusLabel = computed(() => (props.link ? STATUS_LABELS[statusOf(props.link)] : ''))
const statusTone = computed(() => {
  if (!props.link) return 'muted' as const
  const s = statusOf(props.link)
  return s === 'active' ? 'success' as const : s === 'expired' ? 'warning' as const : 'muted' as const
})

const displayTitle = computed(() => (props.link ? (props.link.title || fallbackTitle(props.link)) : 'Link'))
const headerDescription = computed(() => {
  if (editMode.value) return 'Changes apply to the live link when you save.'
  if (hasShareCapability.value && hasUploadCapability.value) return 'Review and upload link'
  if (hasUploadCapability.value) return 'Upload link'
  return 'Review link'
})

type ViewTab = 'overview' | 'files' | 'review' | 'activity' | 'versions'
const activeTab = ref<ViewTab>('overview')
const viewTabs = computed(() => [
  { key: 'overview' as const, label: 'Overview', count: null, tour: undefined },
  { key: 'files' as const, label: 'Files', count: detailsLoading.value ? null : displayFiles.value.length, tour: 'link-details-files' },
  ...(hasShareCapability.value ? [{ key: 'review' as const, label: 'Review', count: reviewAttentionCount.value, tour: undefined }] : []),
  { key: 'activity' as const, label: 'Activity', count: detailsLoading.value ? null : auditActivity.value.length, tour: 'link-details-activity' },
  { key: 'versions' as const, label: 'Versions', count: null, tour: undefined },
])

// ── Review (C2) ─────────────────────────────────────────────────────────
const linkReview = useLinkReview(computed(() => props.link?.id), (url, opts) => props.apiFetch(url, opts))
// Files whose current version still needs a decision, shown on the tab.
const reviewAttentionCount = computed(() => {
  const st = linkReview.state.value
  if (!st || st.accessMode !== 'restricted' || !st.approver) return null
  const n = st.files.filter(f => f.status !== 'approved').length
  return n || null
})
// Latest decision per version for the Versions tab, plus which version is current.
const reviewByVersion = computed(() => {
  const map = new Map<number, string>()
  for (const d of linkReview.state.value?.history ?? []) {
    if (!map.has(d.assetVersionId)) map.set(d.assetVersionId, d.decision)
  }
  return map
})
const currentVersionIds = computed(() => new Set(
  (linkReview.state.value?.files ?? []).map(f => f.currentAssetVersionId).filter((v): v is number => v != null)
))
const showReviewColumn = computed(() => !!linkReview.state.value && linkReview.state.value.accessMode === 'restricted')

// The approver is picked in Edit next to the invites and saved with them; the Review tab only shows it.
const serverApproverId = computed(() => linkReview.state.value?.approver?.user_id ?? null)
const draftApproverId = ref<number | null>(null)
// Older servers have no review routes (state stays null), so there is nothing to pick.
const canChooseApprover = computed(() =>
  editMode.value && !!linkReview.state.value && draftShareEnabled.value && draftAccessMode.value === 'restricted'
)
const approverChoices = computed(() => {
  const opts = draftAccess.value
    .filter(a => a.user_id > 0 && !a.is_disabled && !a.is_deleted)
    .map(a => ({ id: a.user_id, label: a.name || a.user_name || `Client ${a.user_id}` }))
  const current = linkReview.state.value?.approver
  // Keep an approver who was already removed from the link visible, so the change is explicit.
  if (current && draftApproverId.value === current.user_id && !opts.some(o => o.id === current.user_id)
    && !access.value.some(a => a.user_id === current.user_id)) {
    opts.unshift({ id: current.user_id, label: `${current.name || current.user_name || 'Approver'} (no longer invited)` })
  }
  return opts
})
const approverDirty = computed(() => canChooseApprover.value && draftApproverId.value !== serverApproverId.value)
// Follow the server value until the user picks something else.
watch(serverApproverId, (id, old) => { if (draftApproverId.value === old) draftApproverId.value = id })
// Removing the approver from the invite list also clears them as approver.
watch(() => draftAccess.value.map(a => a.user_id), (ids) => {
  if (draftApproverId.value != null && access.value.some(a => a.user_id === draftApproverId.value) && !ids.includes(draftApproverId.value)) {
    draftApproverId.value = null
  }
})
function versionReviewState(assetVersionId: number) {
  const decision = reviewByVersion.value.get(Number(assetVersionId))
  if (!currentVersionIds.value.has(Number(assetVersionId))) return decision ? 'superseded' : null
  return decision || 'pending'
}
watch(
  [() => props.modelValue, () => props.link?.id, () => hasShareCapability.value],
  ([open, id, share]) => {
    if (open && id && share) linkReview.load()
    else linkReview.reset()
  },
  { immediate: true }
)
watch(activeTab, (tab) => {
  if ((tab === 'review' || tab === 'versions') && props.modelValue && hasShareCapability.value) linkReview.load()
})
function nextTabKey<K extends string>(e: KeyboardEvent, keys: K[], current: K, idPrefix: string): K | null {
  const i = keys.indexOf(current)
  let next = -1
  if (e.key === 'ArrowRight') next = (i + 1) % keys.length
  else if (e.key === 'ArrowLeft') next = (i - 1 + keys.length) % keys.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = keys.length - 1
  if (next < 0) return null
  e.preventDefault()
  nextTick(() => document.getElementById(`${idPrefix}${keys[next]}`)?.focus())
  return keys[next]
}
function onTabKeydown(e: KeyboardEvent) {
  const key = nextTabKey(e, viewTabs.value.map(t => t.key), activeTab.value, 'ld-tab-')
  if (key) activeTab.value = key
}

const urlCopied = ref(false)
let urlCopiedTimer: ReturnType<typeof setTimeout> | null = null
async function copyPrimaryUrl() {
  if (!primaryUrl.value) return
  if (!(await copy(primaryUrl.value))) return
  urlCopied.value = true
  if (urlCopiedTimer) clearTimeout(urlCopiedTimer)
  urlCopiedTimer = setTimeout(() => { urlCopied.value = false }, 1600)
}

function formatDate(v: number | string) {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { hour12: hour12.value })
}
const expiresRelative = computed(() => {
  const at = Number(props.link?.expiresAt || 0)
  if (!at) return ''
  const days = Math.round((at - Date.now()) / 86400000)
  if (days === 0) return at > Date.now() ? 'today' : 'earlier today'
  return days > 0 ? `in ${pluralize(days, 'day')}` : `${pluralize(-days, 'day')} ago`
})

function pluralize(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
const QUALITY_LABELS: Record<string, string> = { '720p': '720p', '1080p': '1080p', original: 'Full Res (MP4)' }
function qualityLabel(q: string) {
  return QUALITY_LABELS[q] || q
}
function qualityList(qs: string[]) {
  return qs.map(qualityLabel).join(', ')
}
function fileNameOf(p: string) {
  return String(p || '').split('/').pop() || p
}

const accessModeName = computed(() => {
  if (currentAccessMode.value === 'restricted') return 'Only invited clients & teams'
  return openPasswordRequired.value ? 'Anyone with the link + password' : 'Anyone with the link'
})
const accessModeHelp = computed(() => {
  if (currentAccessMode.value === 'restricted') return 'Clients sign in with their own login. Roles set what they can do.'
  return openPasswordRequired.value ? 'One shared password for everyone.' : 'No sign-in required.'
})

const filesCaption = computed(() => {
  if (hasShareCapability.value && hasUploadCapability.value) return 'Files shared on this link and files clients have uploaded through it.'
  if (hasUploadCapability.value) return 'Files clients have uploaded through this link.'
  return 'Files people can open from this link.'
})
const showUploadColumns = computed(() =>
  props.link?.type === 'upload' || displayFiles.value.some((f: any) => f?.uploader_label || f?.ts)
)

// Edit: the three access options match the create-link flow (LinkAccessMode.vue).
type AccessChoice = 'restricted' | 'open' | 'open_password'
const accessChoices: Array<{ value: AccessChoice; label: string; help: string }> = [
  { value: 'restricted', label: 'Only invited clients & teams', help: 'Sign in with their own login. Roles set what they can do.' },
  { value: 'open_password', label: 'Anyone with the link + password', help: 'One shared password for everyone.' },
  { value: 'open', label: 'Anyone with the link', help: 'No sign-in required.' },
]
const accessChoice = computed<AccessChoice>({
  get: () => (draftAccessMode.value === 'restricted' ? 'restricted' : draftUsePassword.value ? 'open_password' : 'open'),
  set: (v) => {
    draftAccessMode.value = v === 'restricted' ? 'restricted' : 'open'
    draftUsePassword.value = v === 'open_password'
  },
})

const watermarkEditHelp = computed(() => {
  if (linkHasVideoFiles.value && !draftGenerateReviewProxy.value) return 'Turn on proxy files to watermark videos.'
  if (draftWatermarkEnabled.value) {
    const name = draftWatermarkLocalFile.value?.name || fileNameOf(draftWatermarkFile.value)
    return name ? `Using ${name}.` : 'Click Configure… to choose an image.'
  }
  return 'Place an image over shared media.'
})

// What's stopping a save and which edit tab fixes it. The first is shown in the footer; every tab with one gets a dot.
const editProblems = computed<{ tab: EditTab; message: string }[]>(() => {
  if (!editMode.value) return []
  const out: { tab: EditTab; message: string }[] = []
  if (!draftShareEnabled.value && !draftUploadEnabled.value) out.push({ tab: 'details', message: 'Turn on Review, Upload or both.' })
  if (draftShareEnabled.value && draftFilePaths.value.length === 0) out.push({ tab: 'files', message: 'Choose at least one file to share.' })
  if (uploadDirMissing.value) out.push({ tab: 'uploads', message: 'Choose a folder for uploads.' })
  if (canEditUploadSpec.value && uploadSpecInvalid.value) out.push({ tab: 'uploads', message: 'Fix the file requirements.' })
  if (!accessSatisfied.value) out.push({ tab: 'access', message: 'Invite at least one client or team.' })
  if (!passwordSatisfied.value) out.push({ tab: 'access', message: 'Enter a password.' })
  return out
})
const editProblem = computed(() => editProblems.value[0]?.message || '')

type EditTab = 'details' | 'access' | 'files' | 'uploads' | 'playback'
const editTab = ref<EditTab>('details')
const editTabs = computed(() => {
  const needsAttention = new Set(editProblems.value.map(p => p.tab))
  const tabs: { key: EditTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'access', label: 'Access' },
    ...(draftShareEnabled.value ? [{ key: 'files' as const, label: 'Files' }] : []),
    ...(draftUploadEnabled.value ? [{ key: 'uploads' as const, label: 'Uploads' }] : []),
    { key: 'playback', label: 'Playback' },
  ]
  return tabs.map(t => ({ ...t, problem: needsAttention.has(t.key) }))
})
// Turning Review or Upload off removes its tab; don't leave the panel blank.
watch(editTabs, (tabs) => {
  if (!tabs.some(t => t.key === editTab.value)) editTab.value = 'details'
})
function onEditTabKeydown(e: KeyboardEvent) {
  const key = nextTabKey(e, editTabs.value.map(t => t.key), editTab.value, 'ld-edit-tab-')
  if (key) editTab.value = key
}
// Switching Review or Upload on takes you to the tab where it is set up.
function setDraftShare(on: boolean) {
  draftShareEnabled.value = on
  if (on) editTab.value = 'files'
}
function setDraftUpload(on: boolean) {
  draftUploadEnabled.value = on
  if (on) void goToUploadFolder()
}
async function goToUploadFolder() {
  editTab.value = 'uploads'
  await nextTick()
  document.querySelector<HTMLInputElement>('#ld-edit-panel-uploads input')?.focus()
}
// Deepest folder holding every shared path, for the Review summary.
const sharedFilesDir = computed(() => {
  const dirs = draftFilePaths.value.map(p => p.replace(/\/+$/, '').split('/').slice(0, -1))
  let common = dirs[0] || []
  for (const d of dirs) {
    let i = 0
    while (i < common.length && common[i] === d[i]) i++
    common = common.slice(0, i)
  }
  const dir = common.join('/').replace(/\/*$/, '/') || '/'
  // Shared paths are relative to the share root; show them absolute like the upload folder.
  const root = shareRootPath.value
  return root && !dir.startsWith(`${root}/`) ? `${root}${dir}` : dir
})
function editTabLabel(tab: EditTab) {
  return editTabs.value.find(t => t.key === tab)?.label || ''
}

function confirmDiscard() {
  if (!editMode.value || saving.value || !hasUnsavedChanges.value) return true
  return window.confirm('You have unsaved changes to this link. Close and lose them?')
}
function statusOf(it: LinkItem): Status {
  if (it.isDisabled) return 'disabled'
  if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
  return 'active'
}
function fallbackTitle(it: LinkItem) {
  if (it.type === 'upload') return it.target?.dirRel || '(Upload)'
  const n = it.target?.files?.length || (it.type === 'download' ? 1 : 0)
  if (n === 1) return it.target?.files?.[0]?.name || '1 File'
  return `${n} Files`
}
async function copy(txt?: string | null): Promise<boolean> {
  if (!txt) return false
  if (txt === primaryUrl.value && (props.link as any)?.externalLink) {
    const { ready, reason, base } = await checkExternalAddressReady()
    if (!ready) {
      pushNotification(new Notification('External Address Not Ready', describeExternalAddressNotReady(reason), 'error', 8000))
      return false
    }
    // Freshen against the CURRENT server-authoritative public address —
    // primaryUrl is a prop set once by the caller and can be stale if the
    // configured hostname changed while this modal stayed open.
    txt = resolveCopyUrl(txt, base)
  }
  await writeClipboard(txt)
  return true
}

function fmtBytes(n?: number) {
  if (n === undefined || n === null) return '—'
  const k = 1024, u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n
  while (v >= k && i < u.length - 1) { v /= k; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

function snapshotName(rel?: string | null) {
  if (!rel) return '—'
  const parts = String(rel).split('/')
  return parts[parts.length - 1] || rel
}

function normalizeRelPathForDisplay(v: any) {
  const s = String(v || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  return s || ''
}

function snapshotRelPath(v: any) {
  return normalizeRelPathForDisplay(v?.snapshot_rel)
}

function snapshotDirRelPath(v: any) {
  const explicit = normalizeRelPathForDisplay(v?.snapshot_dir_rel)
  if (explicit) return explicit
  const rel = snapshotRelPath(v)
  if (!rel) return ''
  const idx = rel.lastIndexOf('/')
  return idx >= 0 ? rel.slice(0, idx) : ''
}

function transcodeDirRelPath(v: any) {
  const explicit = normalizeRelPathForDisplay(v?.transcode_dir_rel)
  if (explicit) return explicit

  const assetVersionId = Number(v?.asset_version_id)
  if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) return ''

  const fileId = selectedVersionFileId.value
  const selectedFile = fileId ? versionFileById.value.get(fileId) : null
  const fileRel = normalizeRelPathForDisplay(selectedFile?.relPath ?? selectedFile?.path ?? selectedFile?.p ?? '')
  const idx = fileRel.lastIndexOf('/')
  const sourceDir = idx >= 0 ? fileRel.slice(0, idx) : ''

  return sourceDir
    ? `${sourceDir}/.45flow/transcodes/${assetVersionId}`
    : `.45flow/transcodes/${assetVersionId}`
}

function proxyPatternRelPath(v: any) {
  const dir = transcodeDirRelPath(v)
  return dir ? `${dir}/proxy_*.mp4` : ''
}

function hlsFolderRelPath(v: any) {
  const dir = transcodeDirRelPath(v)
  return dir ? `${dir}/hls` : ''
}

function extraPathRows(v: any) {
  return [
    { label: 'Snapshot file', value: snapshotRelPath(v) },
    { label: 'Version folder', value: snapshotDirRelPath(v) },
    { label: 'Proxy File/HLS folder', value: transcodeDirRelPath(v) },
    { label: 'HLS folder', value: hlsFolderRelPath(v) },
    { label: 'Proxy files pattern', value: proxyPatternRelPath(v) },
  ].filter((row) => String(row.value || '').trim())
}

function hasAnyExtraPath(v: any) {
  return extraPathRows(v).length > 0
}

async function copyExtraPath(label: string, p: string) {
  const value = String(p || '').trim()
  if (!value) return
  try {
    await writeClipboard(value)
    pushNotification(new Notification('Path Copied', `${label} copied.`, 'success', 2500))
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e)
    pushNotification(new Notification('Copy Failed', msg, 'error', 5000))
  }
}

async function copyAllExtraPaths(v: any) {
  const rows = extraPathRows(v)
  if (!rows.length) return
  const text = rows.map((row) => `${row.label}: ${row.value}`).join('\n')
  try {
    await writeClipboard(text)
    pushNotification(new Notification('Paths Copied', `Copied ${rows.length} path(s).`, 'success', 3000))
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e)
    pushNotification(new Notification('Copy Failed', msg, 'error', 5000))
  }
}

type ArtifactDeleteTarget = 'snapshot' | 'transcodes' | 'all'

function artifactDeleteKey(v: any, target: ArtifactDeleteTarget) {
  return `${Number(v?.asset_version_id || 0)}:${target}`
}

function isDeletingArtifacts(v: any, target: ArtifactDeleteTarget) {
  return deletingArtifactKeys.value.has(artifactDeleteKey(v, target))
}

function artifactDeleteTitle(target: ArtifactDeleteTarget) {
  if (target === 'snapshot') return 'Delete Snapshot'
  if (target === 'transcodes') return 'Delete Proxy File/HLS'
  return 'Delete All Extra Files'
}

function artifactDeletePrompt(v: any, target: ArtifactDeleteTarget) {
  const ver = `v${v?.version_index ?? '?'}`
  if (target === 'snapshot') {
    return `Delete snapshot files for ${ver}?\n\nThis removes version snapshot files from disk and clears snapshot metadata for this version.`
  }
  if (target === 'transcodes') {
    return `Delete proxy file/HLS artifacts for ${ver}?\n\nThis removes generated proxy file/HLS files and clears transcode job state for this version.`
  }
  return `Delete all extra files for ${ver}?\n\nThis removes both snapshot files and proxy file/HLS artifacts for this version.`
}

async function deleteVersionArtifacts(v: any, target: ArtifactDeleteTarget) {
  if (!selectedVersionFileId.value) return
  if (!v?.asset_version_id) return
  const ok = confirm(artifactDeletePrompt(v, target))
  if (!ok) return

  const key = artifactDeleteKey(v, target)
  deletingArtifactKeys.value.add(key)

  try {
    const fileId = Number(selectedVersionFileId.value)
    const assetVersionId = Number(v.asset_version_id)
    const currentLinkId = Number(props.link?.id)
    const resp = await props.apiFetch(`/api/files/${fileId}/versions/${assetVersionId}/artifacts/delete`, {
      method: 'POST',
      body: JSON.stringify({
        target,
        linkId: Number.isFinite(currentLinkId) && currentLinkId > 0 ? currentLinkId : undefined,
      }),
    })

    await refreshVersions()
    pushNotification(
      new Notification(
        artifactDeleteTitle(target),
        `Removed ${Number(resp?.deleted_count || 0)} path(s).`,
        'success',
        5000
      )
    )
  } catch (e: any) {
    const code = String(e?.payload?.error || e?.response?.error || e?.error || '')
    const links = Array.isArray(e?.payload?.links) ? e.payload.links : (Array.isArray(e?.response?.links) ? e.response.links : [])
    const inUseMsg = code === 'artifacts_in_use_by_other_links'
      ? `Cannot delete artifacts: this file is used by ${links.length} other active share link(s).`
      : null
    const msg = inUseMsg || e?.message || e?.error || String(e)
    pushNotification(new Notification(`${artifactDeleteTitle(target)} Failed`, msg, 'error', 8000))
  } finally {
    deletingArtifactKeys.value.delete(key)
  }
}

// ── Remote client-side transcoding for existing server files ─────────────────

const selectedFile = computed(() => {
  if (!selectedVersionFileId.value) return null
  return files.value.find((f: any) => Number(f?.id) === selectedVersionFileId.value) || null
})

const isSelectedFileVideo = computed(() => {
  const mime = String(selectedFile.value?.mime || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  if (['application/mxf', 'application/x-mxf', 'application/x-smpte-mxf'].includes(mime)) return true
  return false
})

async function startRemoteTranscodeForVersion(v: any) {
  const assetVersionId = Number(v?.asset_version_id)
  if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) return

  const displayName = selectedFile.value?.name || selectedFile.value?.relPath || 'File'
  const apiBase = connectionMeta?.value?.apiBase || ''
  const apiToken = connectionMeta?.value?.token || ''

  // Download watermark if the link uses one
  let localWatermarkPath: string | null = null
  const linkWm = (props.link as any)?.target?.watermarkFile || (props.link as any)?.watermarkFile
  if (linkWm) {
    try {
      localWatermarkPath = await window.electron.downloadWatermark({
        apiBase,
        token: apiToken,
        relPath: String(linkWm),
      })
    } catch {}
  }

  // Determine proxy qualities from link config
  const linkQualities = (props.link as any)?.target?.proxyQualities
    || (props.link as any)?.proxyQualities
    || ['original']

  const result = await runRemoteTranscode({
    assetVersionId,
    filename: displayName,
    proxyQualities: Array.isArray(linkQualities) ? linkQualities.slice() : ['original'],
    generateHls: true,
    watermarkPath: localWatermarkPath,
    watermarkSettings: isPremiumActive.value ? JSON.parse(JSON.stringify((props.link as any)?.target?.watermarkSettings || null)) || undefined : undefined,
    apiBase,
    apiToken,
    apiFetch: props.apiFetch,
    context: {
      source: 'link' as const,
      file: displayName,
    },
  })

  if (localWatermarkPath) {
    window.electron.cleanupWatermarkTemp(localWatermarkPath).catch(() => {})
  }

  if (result.ok) {
    pushNotification(new Notification('Transcode Complete', `${displayName} transcoded successfully.`, 'success', 6000))
    await refreshVersions()
  } else if (!result.cancelled) {
    pushNotification(new Notification('Transcode Failed', `${displayName}: ${result.error || 'Unknown error'}`, 'error', 8000))
  }
}

function toNumericFileId(v: any) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function safeStringify(v: any) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return '' }
}

function normalizeAuditRow(v: any): AuditActivityRow {
  const ts = Number(v?.ts_ms ?? v?.occurred_at_ms ?? 0)
  const actorId = Number(v?.actor_user_id)
  return {
    type: String(v?.type || v?.activity_type || '').trim(),
    ts_ms: Number.isFinite(ts) && ts > 0 ? ts : 0,
    actor_user_id: Number.isFinite(actorId) && actorId > 0 ? actorId : null,
    actor_user_name: v?.actor_user_name ? String(v.actor_user_name) : null,
    actor_ip: v?.actor_ip ? String(v.actor_ip) : null,
    actor_user_agent: v?.actor_user_agent ? String(v.actor_user_agent) : null,
    details: v?.details ?? null,
  }
}

const ACTIVITY_REASON_LABELS: Record<string, string> = {
  disabled_or_expired: 'Link is disabled or expired',
  file_missing: 'File is missing',
  bad_file_id: 'Invalid file selected',
  bad_link_type: 'Link type mismatch',
  original_download_not_allowed: 'Original file downloads are disabled',
  original_stream_not_allowed: 'Original playback is disabled',
  watermark_transcode_pending: 'Waiting for watermarked transcode output',
  range_not_satisfiable: 'Invalid byte-range request',
  read_error: 'File read failed',
  bad_auth: 'Authentication failed',
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  link_created: 'Link created',
  link_enabled: 'Link enabled',
  link_disabled: 'Link disabled',
  access_denied: 'Access denied',
  title_changed: 'Title updated',
  notes_changed: 'Notes updated',
  expiry_changed: 'Expiry updated',
  files_changed: 'Files changed',
  link_type_changed: 'Link type changed',
  password_set: 'Password set',
  password_cleared: 'Password cleared',
  stream_started: 'Playback started',
  stream_ended: 'Playback ended',
  stream_failed: 'Playback failed',
  playback_resolved: 'Playback requested',
  playback_blocked: 'Playback blocked',
  download_started: 'Download started',
  download_ended: 'Download ended',
  download_failed: 'Download failed',
  download_416_bad_range: 'Download failed (bad range)',
  upload_started: 'Upload started',
  upload_completed: 'Upload completed',
  upload_failed: 'Upload failed',
  upload_aborted: 'Upload aborted',
  'upload.failed': 'Upload failed',
  'upload.aborted': 'Upload aborted',
  comment_created: 'Comment added',
  comment_reply: 'Comment reply added',
  comment_edited: 'Comment edited',
  comment_deleted: 'Comment deleted',
  annotation_created: 'Annotation added',
  annotation_edited: 'Annotation edited',
  annotation_deleted: 'Annotation deleted',
  link_viewed: 'Link accessed',
  auth_success: 'Authenticated',
  password_verified: 'Password verified',
}

function titleCaseWords(v: string) {
  return v
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

function activityTypeLabel(type: string) {
  const t = String(type || '').trim()
  if (!t) return 'Unknown'
  return ACTIVITY_TYPE_LABELS[t] || titleCaseWords(t.replace(/_/g, ' '))
}

function detailsObj(a: AuditActivityRow): Record<string, any> | null {
  const d = a.details
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  return d as Record<string, any>
}

function detailsValue(d: Record<string, any> | null, keys: string[]) {
  if (!d) return ''
  for (const k of keys) {
    const v = d[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function reasonLabel(reason?: string) {
  const key = String(reason || '').trim()
  if (!key) return ''
  return ACTIVITY_REASON_LABELS[key] || titleCaseWords(key.replace(/_/g, ' '))
}

function compactUserAgent(ua?: string | null) {
  const s = String(ua || '').trim()
  if (!s) return ''
  const low = s.toLowerCase()
  if (low.includes('edg/')) return 'Edge'
  if (low.includes('chrome/')) return 'Chrome'
  if (low.includes('firefox/')) return 'Firefox'
  if (low.includes('safari/') && !low.includes('chrome/')) return 'Safari'
  if (low.includes('curl/')) return 'curl'
  if (low.includes('vlc')) return 'VLC'
  return s.length > 36 ? `${s.slice(0, 36)}…` : s
}

const { hour12 } = useTimeFormat()

function formatTs(v: number) {
  if (!Number.isFinite(v) || v <= 0) return '—'
  return new Date(v).toLocaleString(undefined, { hour12: hour12.value })
}

function actorLabel(a: AuditActivityRow) {
  const d = detailsObj(a)
  if (a.actor_user_name) return a.actor_user_name
  const fromDetails = detailsValue(d, ['actor_user_name', 'user_name', 'username', 'uploader_name', 'name'])
  if (fromDetails) return fromDetails
  if (a.actor_user_id != null) return `user:${a.actor_user_id}`
  return 'Guest'
}

function sourceLabel(a: AuditActivityRow) {
  const d = detailsObj(a)
  const ip = a.actor_ip || detailsValue(d, ['actor_ip', 'ip', 'remote_ip', 'client_ip'])
  const agent = compactUserAgent(a.actor_user_agent || detailsValue(d, ['actor_user_agent', 'ua', 'user_agent']))
  if (ip && agent) return `${ip} • ${agent}`
  return ip || agent || '—'
}

function hasActivityDetails(a: AuditActivityRow) {
  if (a.details == null) return false
  if (typeof a.details === 'string') return a.details.trim().length > 0
  if (Array.isArray(a.details)) return a.details.length > 0
  if (typeof a.details === 'object') return Object.keys(a.details).length > 0
  return true
}

function activityDetailsPretty(a: AuditActivityRow) {
  if (a.details == null) return ''
  if (typeof a.details === 'string') return a.details
  try { return JSON.stringify(a.details, null, 2) } catch { return String(a.details) }
}

function activitySummary(a: AuditActivityRow) {
  const d = a.details
  if (typeof d === 'string' && d.trim()) return d
  if (d && typeof d === 'object') {
    const typed = d as Record<string, any>
    const reason = reasonLabel(typed.reason)
    if (reason) {
      const file = detailsValue(typed, ['filename', 'name'])
      const variant = detailsValue(typed, ['variant', 'requested_variant'])
      if (file && variant) return `${reason} (${variant}, ${file})`
      if (file) return `${reason} (${file})`
      return reason
    }

    if (a.type === 'download_started' || a.type === 'stream_started') {
      const file = detailsValue(typed, ['filename', 'name'])
      const variant = detailsValue(typed, ['variant'])
      if (file && variant) return `${file} (${variant})`
      if (file) return file
    }

    if (a.type === 'download_ended' || a.type === 'stream_ended') {
      const completed = typed.completed === true ? 'Completed' : (typed.completed === false ? 'Stopped early' : '')
      const bytes = Number(typed.bytes_sent)
      if (completed && Number.isFinite(bytes) && bytes >= 0) return `${completed} • ${fmtBytes(bytes)} sent`
      if (completed) return completed
    }

    if (a.type === 'playback_resolved' || a.type === 'playback_blocked') {
      const file = detailsValue(typed, ['filename', 'name'])
      const source = detailsValue(typed, ['source_type', 'source'])
      const prefer = detailsValue(typed, ['prefer', 'requested_prefer'])
      if (file && source && prefer) return `${file} (${source}, prefer=${prefer})`
      if (file && source) return `${file} (${source})`
      if (file) return file
    }

    if (a.type === 'files_changed') {
      const fromCount = Number(typed.from_count || 0)
      const toCount = Number(typed.to_count || 0)
      return `Files changed (${fromCount} -> ${toCount})`
    }

    if (a.type === 'expiry_changed') {
      const fromMs = Number(typed.from_ms)
      const toMs = Number(typed.to_ms)
      const from = Number.isFinite(fromMs) && fromMs > 0 ? new Date(fromMs).toLocaleString(undefined, { hour12: hour12.value }) : 'Never'
      const to = Number.isFinite(toMs) && toMs > 0 ? new Date(toMs).toLocaleString(undefined, { hour12: hour12.value }) : 'Never'
      return `${from} -> ${to}`
    }

    if (typeof d.message === 'string' && d.message.trim()) return d.message
    if (typeof d.reason === 'string' && d.reason.trim()) return d.reason
    if (typeof d.path === 'string' && d.path.trim()) return `path=${d.path}`
    if (typeof d.filename === 'string' && d.filename.trim()) return `file=${d.filename}`
    if (typeof d.target === 'string' && d.target.trim()) return `target=${d.target}`
    const keys = Object.keys(d).slice(0, 3)
    if (keys.length) return keys.map(k => `${k}=${String((d as any)[k])}`).join(' ')
  }
  return a.type || '—'
}

function extractJobInfoByVersion(data: any): Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> {
  const map: Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> = {}
  const t = data?.transcodes
  if (!Array.isArray(t)) return map

  for (const rec of t as any[]) {
    const vId = Number(rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id)
    if (!Number.isFinite(vId) || vId <= 0) continue

    map[vId] = {
      queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
      activeKinds: Array.isArray(rec?.jobs?.activeKinds) ? rec.jobs.activeKinds : [],
      skippedKinds: Array.isArray(rec?.jobs?.skippedKinds) ? rec.jobs.skippedKinds : [],
    }
  }
  return map
}

function filterVersionIdsByJobKind(
  versionIds: number[],
  jobInfo: Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }>,
  kind: string,
  unknownPolicy: 'queued' | 'skipped' = 'queued'
) {
  const queued: number[] = []
  const active: number[] = []
  const skipped: number[] = []

  for (const vId of versionIds) {
    const rec = jobInfo[vId]
    if (rec?.activeKinds?.includes(kind)) active.push(vId)
    else if (rec?.queuedKinds?.includes(kind)) queued.push(vId)
    else if (rec?.skippedKinds?.includes(kind)) skipped.push(vId)
    else {
      if (unknownPolicy === 'queued') queued.push(vId)
      else skipped.push(vId)
    }
  }

  return { queued, active, skipped }
}

function extractAssetVersionIdsFromLinkFilesResponse(data: any): number[] {
  const ids: number[] = []
  const push = (v: any) => {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) ids.push(n)
  }

  const t = data?.transcodes
  if (Array.isArray(t)) {
    for (const rec of t as any[]) {
      push(rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id)
    }
  } else if (t && typeof t === 'object') {
    for (const k of Object.keys(t)) {
      push((t as any)[k]?.assetVersionId ?? (t as any)[k]?.asset_version_id ?? (t as any)[k]?.assetVersion?.id)
    }
  }

  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null
  if (Array.isArray(files)) {
    for (const f of files) {
      push(f?.assetVersionId ?? f?.asset_version_id ?? f?.assetVersion?.id)
    }
  }

  push(data?.assetVersionId ?? data?.asset_version_id)
  return Array.from(new Set(ids))
}

function extractDbFileIdsFromLinkFilesResponse(data: any): number[] {
  const ids: number[] = []
  const push = (v: any) => {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) ids.push(n)
  }

  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null
  if (Array.isArray(files)) {
    for (const f of files) {
      push(f?.id ?? f?.fileId ?? f?.file_id ?? f?.file?.id)
    }
  }

  if (Array.isArray(data?.fileIds)) {
    for (const id of data.fileIds) push(id)
  }

  push(data?.file?.id ?? data?.fileId ?? data?.file_id)
  return Array.from(new Set(ids))
}

function extractPlaybackFileRecords(data: any): Array<{ fileId: number; path?: string; name?: string; mime?: string }> {
  const out: Array<{ fileId: number; path?: string; name?: string; mime?: string }> = []
  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null
  if (!Array.isArray(files)) return out

  for (const f of files) {
    const fileId = Number(f?.id ?? f?.fileId ?? f?.file_id ?? f?.file?.id)
    if (!Number.isFinite(fileId) || fileId <= 0) continue
    out.push({
      fileId,
      path: String(f?.path ?? f?.relPath ?? f?.p ?? '').trim() || undefined,
      name: String(f?.name ?? '').trim() || undefined,
      mime: String(f?.mime ?? '').trim() || undefined,
    })
  }
  return out
}

function mapAssetVersionToFileId(data: any): Map<number, number> {
  const out = new Map<number, number>()
  const push = (assetVersionId: any, fileId: any) => {
    const v = Number(assetVersionId)
    const f = Number(fileId)
    if (!Number.isFinite(v) || v <= 0) return
    if (!Number.isFinite(f) || f <= 0) return
    out.set(v, f)
  }

  const t = data?.transcodes
  if (Array.isArray(t)) {
    for (const rec of t as any[]) {
      push(rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id, rec?.fileId ?? rec?.file_id ?? rec?.file?.id ?? rec?.id)
    }
  } else if (t && typeof t === 'object') {
    for (const k of Object.keys(t)) {
      const rec = (t as any)[k]
      push(rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id, rec?.fileId ?? rec?.file_id ?? rec?.file?.id ?? rec?.id)
    }
  }

  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null
  if (Array.isArray(files)) {
    for (const f of files) {
      push(f?.assetVersionId ?? f?.asset_version_id ?? f?.assetVersion?.id, f?.id ?? f?.fileId ?? f?.file_id ?? f?.file?.id)
    }
  }

  return out
}

async function reprocessMedia() {
  const id = props.link?.id
  if (!id) return
  reprocessingMedia.value = true
  try {
    const nextProxyQualities = normalizeQualities(draftProxyQualities.value)
    const useClientTranscoding = clientTranscodeEnabled.value
    const body: any = {
      generateReviewProxy: !!draftGenerateReviewProxy.value,
      adaptiveHls: !!draftGenerateReviewProxy.value || !!draftWatermarkEnabled.value,
      proxyQualities: draftGenerateReviewProxy.value ? nextProxyQualities : [],
      watermark: !!draftWatermarkEnabled.value,
      watermarkFile: draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null,
      watermarkProxyQualities: draftWatermarkEnabled.value ? nextProxyQualities : [],
      watermarkSettings: draftWatermarkEnabled.value ? JSON.parse(JSON.stringify(draftWatermarkSettings.value)) : null,
      overwrite: true,
      ...(useClientTranscoding ? { clientTranscode: true } : {}),
    }
    const resp = await props.apiFetch(`/api/links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      timeoutMs: 5 * 60 * 1000,
    })
    mediaWasReprocessed.value = true
    // Sync original values so Save won't re-send the same media settings
    if (props.link) {
      const target = props.link as any
      target.generateReviewProxy = !!draftGenerateReviewProxy.value
      target.watermark = !!draftWatermarkEnabled.value
      target.watermarkFile = draftWatermarkFile.value.trim() || null
      target.watermarkSettings = draftWatermarkEnabled.value ? JSON.parse(JSON.stringify(draftWatermarkSettings.value)) : null
      target.proxyQualities = nextProxyQualities
    }
    originalProxyQualities.value = nextProxyQualities.slice()
    originalWatermarkFile.value = draftWatermarkFile.value.trim()
    if (resp?.hasTranscodes && useClientTranscoding) {
      // Client-side transcoding: run remote transcodes for each video file
      const apiBase = connectionMeta?.value?.apiBase || ''
      const apiToken = connectionMeta?.value?.token || ''
      const transcodeEntries: { assetVersionId: number; filename: string }[] = []
      const transcodes = Array.isArray(resp.transcodes) ? resp.transcodes : []
      for (const t of transcodes) {
        const avId = Number(t?.assetVersionId ?? t?.asset_version_id)
        if (!Number.isFinite(avId) || avId <= 0) continue
        // Only transcode files that actually have queued video jobs
        const queuedKinds: string[] = t?.jobs?.queuedKinds || []
        if (!queuedKinds.includes('proxy_mp4') && !queuedKinds.includes('hls')) continue
        // Find filename from files list
        const fileId = Number(t?.fileId ?? t?.file_id)
        const matchedFile = files.value.find((f: any) => Number(f?.id) === fileId)
        const filename = matchedFile?.name || matchedFile?.relPath || `asset-${avId}`
        transcodeEntries.push({ assetVersionId: avId, filename })
      }

      if (transcodeEntries.length) {
        // Download watermark once, shared across all transcodes
        let localWatermarkPath: string | null = null
        const linkWm = draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null
        if (linkWm) {
          try {
            localWatermarkPath = await window.electron.downloadWatermark({
              apiBase,
              token: apiToken,
              relPath: linkWm,
            })
          } catch {}
        }

        const wmSettings = draftWatermarkEnabled.value
          ? JSON.parse(JSON.stringify(draftWatermarkSettings.value)) : undefined

        // Fire off all remote transcodes (each gets its own semaphore slot)
        const promises = transcodeEntries.map((entry) =>
          runRemoteTranscode({
            assetVersionId: entry.assetVersionId,
            filename: entry.filename,
            proxyQualities: draftGenerateReviewProxy.value ? nextProxyQualities : ['original'],
            generateHls: true,
            watermarkPath: localWatermarkPath,
            watermarkSettings: isPremiumActive.value ? wmSettings : undefined,
            skipWatermarkCleanup: true,
            apiBase,
            apiToken,
            apiFetch: props.apiFetch,
            context: {
              source: 'link' as const,
              file: entry.filename,
            },
          })
        )

        pushNotification(
          new Notification(
            'Client-Side Reprocessing Started',
            `Transcoding ${transcodeEntries.length} file(s) using local hardware. Track progress in the Transfer Dock.`,
            'success',
            5000
          )
        )

        // Clean up watermark after all transcodes finish
        Promise.allSettled(promises).then(() => {
          if (localWatermarkPath) {
            window.electron.cleanupWatermarkTemp(localWatermarkPath).catch(() => {})
          }
          refreshVersions()
        })
      } else {
        pushNotification(
          new Notification(
            'Media Reprocessing',
            'Settings applied. No video files require client transcoding.',
            'info',
            5000
          )
        )
      }
    } else if (resp?.hasTranscodes) {
      startLinkTranscodeTracking({
        resp,
        wantsProxy: !!draftGenerateReviewProxy.value,
        wantsHls: true,
        addedPaths: draftFilePaths.value.slice(),
        proxyQualities: draftGenerateReviewProxy.value ? nextProxyQualities : [],
        suppressInfoNotifications: true,
      })
      pushNotification(
        new Notification(
          'Media Reprocessing Started',
          'Proxy files are being regenerated. Track progress in the Transfer Dock.',
          'success',
          5000
        )
      )
    } else {
      pushNotification(
        new Notification(
          'Media Reprocessing',
          'Settings applied. No video files require processing.',
          'info',
          5000
        )
      )
    }
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Failed to reprocess media'
    pushNotification(
      new Notification(
        'Media Reprocessing Failed',
        msg,
        'error',
        8000
      )
    )
  } finally {
    reprocessingMedia.value = false
  }
}
function startLinkTranscodeTracking(opts: {
  resp: any
  wantsProxy: boolean
  wantsHls: boolean
  addedPaths: string[]
  proxyQualities?: string[]
  suppressInfoNotifications?: boolean
}) {
  if (!opts.wantsProxy && !opts.wantsHls) return
  // console.log('[link-details:tracking] entry', {
  //   wantsProxy: opts.wantsProxy,
  //   wantsHls: opts.wantsHls,
  //   addedPaths: opts.addedPaths,
  //   respTranscodes: opts.resp?.transcodes,
  //   respFiles: opts.resp?.files,
  //   respItems: opts.resp?.items,
  // })

  const versionIds = extractAssetVersionIdsFromLinkFilesResponse(opts.resp)
  const linkTitle = (draftTitle.value || props.link?.title || (props.link ? fallbackTitle(props.link) : '') || '').trim()
  const versionToFileId = mapAssetVersionToFileId(opts.resp)
  const fileLabelById = new Map<number, string>()
  const allPaths = (opts.addedPaths || []).map((p) => normalizeAbs(p)).filter(Boolean)
  for (const f of files.value) {
    const id = toNumericFileId(f?.id)
    if (!id) continue
    const name = String(f?.name || '').trim()
    const rel = normalizeAbs(String(f?.relPath ?? f?.path ?? f?.p ?? ''))
    if (name) fileLabelById.set(id, name)
    else if (rel) fileLabelById.set(id, rel)
  }
  function fallbackFileLabel(assetVersionId: number): string {
    if (allPaths.length === 1) return allPaths[0]
    const fid = versionToFileId.get(assetVersionId)
    if (fid && fileLabelById.has(fid)) return String(fileLabelById.get(fid))
    return `asset version ${assetVersionId}`
  }
  function fallbackManyLabel(assetVersionIds: number[]): string {
    if (assetVersionIds.length === 1) return fallbackFileLabel(assetVersionIds[0])
    if (allPaths.length === 1) return allPaths[0]
    return `${assetVersionIds.length} file(s)`
  }
  const context = {
    source: 'link' as const,
    groupId: props.link?.id != null ? `link:${props.link.id}` : undefined,
    linkUrl: primaryUrl.value || undefined,
    linkTitle: linkTitle || undefined,
    file: opts.addedPaths.length === 1 ? opts.addedPaths[0] : undefined,
    files: opts.addedPaths.length > 1 ? opts.addedPaths.slice() : undefined,
    proxyQualities: opts.wantsProxy ? normalizeQualities(opts.proxyQualities) : [],
    connectionId: activeConnection.value?.connectionId,
  }
  // Per-file context: exclude `files` to avoid dedup matching all files in one task
  const perFileContext = (filePath: string) => ({
    source: context.source,
    groupId: context.groupId,
    linkUrl: context.linkUrl,
    linkTitle: context.linkTitle,
    file: filePath,
    proxyQualities: context.proxyQualities,
  })

  if (versionIds.length) {
    const jobInfo = extractJobInfoByVersion(opts.resp)
    const unknownPolicy =
      opts.resp?.keepExistingOutputs || opts.resp?.allowExistingOutputs ? 'skipped' : 'queued'
    // console.log('[link-details:tracking] version-based path', {
    //   versionIds,
    //   versionToFileId: Object.fromEntries(versionToFileId),
    //   fileLabelById: Object.fromEntries(fileLabelById),
    //   allPaths,
    //   jobInfo,
    //   unknownPolicy,
    //   detailsToken: detailsToken.value ? '(set)' : '(empty)',
    // })

    if (opts.wantsProxy) {
      const proxySplit = filterVersionIdsByJobKind(versionIds, jobInfo, 'proxy_mp4', unknownPolicy)
      const proxyCandidates = [...proxySplit.queued, ...proxySplit.active]
      const proxyActiveSplit = transfer.splitActiveTranscodeAssetVersions(proxyCandidates, 'proxy_mp4')
      const proxyToTrack = proxyActiveSplit.inactive
      // console.log('[link-details:tracking] proxy split', {
      //   proxySplit,
      //   proxyCandidates,
      //   proxyActiveSplit,
      //   proxyToTrack,
      // })

      if (proxyToTrack.length) {
        const fallbackIds: number[] = []
        for (const assetVersionId of proxyToTrack) {
            const fileId = versionToFileId.get(assetVersionId)
            // console.log('[link-details:tracking] proxy per-file', { assetVersionId, fileId, hasToken: !!detailsToken.value, label: fileId ? fileLabelById.get(fileId) : undefined })
            if (detailsToken.value && fileId) {
              const detailLabel = fileLabelById.get(fileId) || fallbackFileLabel(assetVersionId)
              const filePath = allPaths.find(p => p.endsWith(detailLabel)) || detailLabel
              const playbackPath = `/api/token/${encodeURIComponent(detailsToken.value)}/files/${encodeURIComponent(String(fileId))}/playback/${encodeURIComponent(String(assetVersionId))}?prefer=auto&audit=0`
              transfer.startPlaybackTranscodeTask({
                title: `Proxy File: ${detailLabel}`,
                detail: filePath,
                intervalMs: 1500,
                jobKind: 'proxy_mp4',
                assetVersionId,
                context: perFileContext(filePath),
              fetchSnapshot: async () => {
                const payload = await props.apiFetch(playbackPath, { suppressAuthRedirect: true })
                const j = payload?.transcodes?.proxy_mp4 || payload?.transcodes?.proxy || null
                return {
                  status: j?.status ?? payload?.proxyStatus ?? payload?.status,
                  progress: j?.progress ?? payload?.proxyProgress ?? 0,
                  etaSeconds: j?.eta_seconds ?? null,
                  speedX: j?.speed_x ?? null,
                  qualityOrder: j?.quality_order ?? j?.qualityOrder ?? payload?.quality_order ?? payload?.qualityOrder,
                  activeQuality: j?.active_quality ?? j?.activeQuality ?? payload?.active_quality ?? payload?.activeQuality,
                  perQualityProgress: j?.per_quality_progress ?? j?.perQualityProgress ?? payload?.per_quality_progress ?? payload?.perQualityProgress,
                  transcoder: j?.transcoder,
                  encoder: j?.encoder,
                }
              },
            })
          } else {
            fallbackIds.push(assetVersionId)
          }
        }

        if (fallbackIds.length) {
          // console.log('[link-details:tracking] proxy fallback ids', fallbackIds)
          for (const assetVersionId of fallbackIds) {
            const fallbackLabel = fallbackFileLabel(assetVersionId)
            const fallbackPath = allPaths.find(p => p.endsWith(fallbackLabel)) || fallbackLabel
            transfer.startAssetVersionTranscodeTask({
              apiFetch: props.apiFetch,
              assetVersionIds: [assetVersionId],
              title: `Proxy File: ${fallbackLabel}`,
              detail: fallbackPath,
              intervalMs: 1500,
              jobKind: 'proxy_mp4',
              context: perFileContext(fallbackPath),
            })
          }
        }
      }

      const proxyInProgressIds = Array.from(new Set([
        ...proxySplit.active,
        ...proxyActiveSplit.active,
      ]))

      if (proxyInProgressIds.length) {
        if (!opts.suppressInfoNotifications) {
          pushNotification(
            new Notification(
              'Proxy Files Already In Progress',
              `Proxy file generation is already in progress for ${proxyInProgressIds.length} item(s).`,
              'info',
              6000
            )
          )
        }
      } else if (proxySplit.skipped.length) {
        if (!opts.suppressInfoNotifications) {
          pushNotification(
            new Notification(
              'Proxy Files Already Available',
              `Proxy file generation was skipped for ${proxySplit.skipped.length} item(s) (already exists).`,
              'info',
              6000
            )
          )
        }
      }
    }

    if (opts.wantsHls) {
      const hlsSplit = filterVersionIdsByJobKind(versionIds, jobInfo, 'hls', unknownPolicy)
      const hlsCandidates = [...hlsSplit.queued, ...hlsSplit.active]
      const hlsActiveSplit = transfer.splitActiveTranscodeAssetVersions(hlsCandidates, 'hls')
      const hlsToTrack = hlsActiveSplit.inactive
      // console.log('[link-details:tracking] hls split', {
      //   hlsSplit,
      //   hlsCandidates,
      //   hlsActiveSplit,
      //   hlsToTrack,
      // })

      if (hlsToTrack.length) {
        const fallbackIds: number[] = []
        for (const assetVersionId of hlsToTrack) {
            const fileId = versionToFileId.get(assetVersionId)
            // console.log('[link-details:tracking] hls per-file', { assetVersionId, fileId, hasToken: !!detailsToken.value, label: fileId ? fileLabelById.get(fileId) : undefined })
            if (detailsToken.value && fileId) {
              const detailLabel = fileLabelById.get(fileId) || fallbackFileLabel(assetVersionId)
              const filePath = allPaths.find(p => p.endsWith(detailLabel)) || detailLabel
              const playbackPath = `/api/token/${encodeURIComponent(detailsToken.value)}/files/${encodeURIComponent(String(fileId))}/playback/${encodeURIComponent(String(assetVersionId))}?prefer=auto&audit=0`
              transfer.startPlaybackTranscodeTask({
                title: `Stream: ${detailLabel}`,
                detail: filePath,
                intervalMs: 1500,
                jobKind: 'hls',
                assetVersionId,
                context: perFileContext(filePath),
              fetchSnapshot: async () => {
                const payload = await props.apiFetch(playbackPath, { suppressAuthRedirect: true })
                const j = payload?.transcodes?.hls || payload?.transcodes?.HLS || null
                return {
                  status: j?.status ?? payload?.hlsStatus ?? payload?.status,
                  progress: j?.progress ?? payload?.hlsProgress ?? 0,
                  etaSeconds: j?.eta_seconds ?? null,
                  speedX: j?.speed_x ?? null,
                  transcoder: j?.transcoder,
                  encoder: j?.encoder,
                }
              },
            })
          } else {
            fallbackIds.push(assetVersionId)
          }
        }

        if (fallbackIds.length) {
          console.log('[link-details:tracking] hls fallback ids', fallbackIds)
          for (const assetVersionId of fallbackIds) {
            const fallbackLabel = fallbackFileLabel(assetVersionId)
            const fallbackPath = allPaths.find(p => p.endsWith(fallbackLabel)) || fallbackLabel
            transfer.startAssetVersionTranscodeTask({
              apiFetch: props.apiFetch,
              assetVersionIds: [assetVersionId],
              title: `Stream: ${fallbackLabel}`,
              detail: fallbackPath,
              intervalMs: 1500,
              jobKind: 'hls',
              context: perFileContext(fallbackPath),
            })
          }
        }
      }

      const hlsInProgressIds = Array.from(new Set([
        ...hlsSplit.active,
        ...hlsActiveSplit.active,
      ]))

      if (hlsInProgressIds.length) {
        if (!opts.suppressInfoNotifications) {
          pushNotification(
            new Notification(
              'Stream Already In Progress',
              `Browser stream generation is already in progress for ${hlsInProgressIds.length} item(s).`,
              'info',
              6000
            )
          )
        }
      } else if (hlsSplit.skipped.length) {
        if (!opts.suppressInfoNotifications) {
          pushNotification(
            new Notification(
              'Stream Already Available',
              `Browser stream generation was skipped for ${hlsSplit.skipped.length} item(s) (already exists).`,
              'info',
              6000
            )
          )
        }
      }
    }

    return
  }

  let fileIds = extractDbFileIdsFromLinkFilesResponse(opts.resp)
  if (!fileIds.length && detailsToken.value) {
    const byPath = new Map<string, number>()
    for (const f of files.value) {
      const id = toNumericFileId(f?.id)
      if (!id) continue
      const p = normalizeAbs(String(f?.relPath ?? f?.path ?? f?.p ?? ''))
      if (p) byPath.set(p, id)
    }
    const resolved = opts.addedPaths
      .map((p) => byPath.get(normalizeAbs(p)))
      .filter((n): n is number => Number.isFinite(n as number) && (n as number) > 0)
    fileIds = Array.from(new Set(resolved))
    // console.log('[link-details:tracking] resolved fileIds from paths fallback', {
    //   addedPaths: opts.addedPaths,
    //   resolvedFileIds: fileIds,
    // })
  }
  if (!fileIds.length) {
    // console.log('[link-details:tracking] no fileIds available for tracking', {
    //   responseKeys: Object.keys(opts.resp || {}),
    //   addedPaths: opts.addedPaths,
    // })
    return
  }

  if (detailsToken.value) {
    const records = extractPlaybackFileRecords(opts.resp)
    const recById = new Map(records.map(r => [r.fileId, r] as const))
    for (const f of files.value) {
      const id = toNumericFileId(f?.id)
      if (!id || recById.has(id)) continue
      recById.set(id, {
        fileId: id,
        path: String(f?.relPath ?? f?.path ?? f?.p ?? '').trim() || undefined,
        name: String(f?.name ?? '').trim() || undefined,
        mime: String(f?.mime ?? '').trim() || undefined,
      })
    }
    const idsToTrack = fileIds.filter((id) => {
      const rec = recById.get(id)
      if (!rec) return true
      const sample = { id: rec.fileId, relPath: rec.path, name: rec.name, mime: rec.mime }
      return isVideoishFile(sample)
    })
    if (!idsToTrack.length) return

    for (const fileId of idsToTrack) {
      const rec = recById.get(fileId)
      const filePath = rec?.path || rec?.name
      const fileLabel = rec?.name || filePath || `file ${fileId}`
      const baseContext = perFileContext(filePath || context.file || '')
      const playbackPath = `/api/token/${encodeURIComponent(detailsToken.value)}/files/${encodeURIComponent(String(fileId))}/playback?prefer=auto&audit=0`

      if (opts.wantsProxy) {
        transfer.startPlaybackTranscodeTask({
          title: `Proxy File: ${fileLabel}`,
          detail: filePath || undefined,
          intervalMs: 1500,
          jobKind: 'proxy_mp4',
          context: baseContext,
          fetchSnapshot: async () => {
            const payload = await props.apiFetch(playbackPath, { suppressAuthRedirect: true })
            const j = payload?.transcodes?.proxy_mp4 || payload?.transcodes?.proxy || null
            return {
              status: j?.status ?? payload?.proxyStatus ?? payload?.status,
              progress: j?.progress ?? payload?.proxyProgress ?? 0,
              etaSeconds: j?.eta_seconds ?? null,
              speedX: j?.speed_x ?? null,
              qualityOrder: j?.quality_order ?? j?.qualityOrder ?? payload?.quality_order ?? payload?.qualityOrder,
              activeQuality: j?.active_quality ?? j?.activeQuality ?? payload?.active_quality ?? payload?.activeQuality,
              perQualityProgress: j?.per_quality_progress ?? j?.perQualityProgress ?? payload?.per_quality_progress ?? payload?.perQualityProgress,
              transcoder: j?.transcoder,
              encoder: j?.encoder,
            }
          },
        })
      }

      if (opts.wantsHls) {
        transfer.startPlaybackTranscodeTask({
          title: `Stream: ${fileLabel}`,
          detail: filePath || undefined,
          intervalMs: 1500,
          jobKind: 'hls',
          context: baseContext,
          fetchSnapshot: async () => {
            const payload = await props.apiFetch(playbackPath, { suppressAuthRedirect: true })
            const j = payload?.transcodes?.hls || payload?.transcodes?.HLS || null
            return {
              status: j?.status ?? payload?.hlsStatus ?? payload?.status,
              progress: j?.progress ?? payload?.hlsProgress ?? 0,
              etaSeconds: j?.eta_seconds ?? null,
              speedX: j?.speed_x ?? null,
              transcoder: j?.transcoder,
              encoder: j?.encoder,
            }
          },
        })
      }
    }
    return
  }

  const jobKind = opts.wantsProxy && !opts.wantsHls
    ? 'proxy_mp4'
    : (opts.wantsHls && !opts.wantsProxy ? 'hls' : 'any')

  transfer.startTranscodeTask({
    apiFetch: props.apiFetch,
    fileIds,
    title: jobKind === 'proxy_mp4'
      ? 'Generating proxy files'
      : (jobKind === 'hls' ? 'Generating browser stream' : 'Generating transcodes'),
    detail: `Tracking ${fileIds.length} file(s)`,
    intervalMs: 1500,
    jobKind,
    context,
  })
}

function normalizeAccessRow(c: any): AccessRow {
  const rawId = c?.user_id ?? c?.userId
  const nId = Number(rawId)
  return {
    user_id: Number.isFinite(nId) ? nId : 0,
    user_name: c?.user_name ?? c?.userName,
    name: c?.name,
    user_email: c?.user_email ?? c?.userEmail,
    display_color: c?.display_color ?? null,
    role_id: c?.role_id ?? null,
    role_name: c?.role_name ?? null,
    role: c?.role ?? null,
    granted_at: c?.granted_at ?? c?.created_at ?? null,
    is_disabled: !!c?.is_disabled,
  }
}

function setAccessFromResponse(resp: any) {
  const rows =
    Array.isArray(resp?.users) ? resp.users :
    Array.isArray(resp?.commenters) ? resp.commenters :
    Array.isArray(resp?.items) ? resp.items :
    []
  access.value = rows.map(normalizeAccessRow)
  accessGroupRows.value = Array.isArray(resp?.groups) ? resp.groups : []
  if (!accessTouched.value) seedDraftAccess()
}

function selectDefaultVersionFile() {
  const choices = versionFileChoices.value
  if (!choices.length) {
    selectedVersionFileId.value = null
    versions.value = []
    return
  }
  if (!choices.some(c => c.id === selectedVersionFileId.value)) {
    selectedVersionFileId.value = choices[0].id
  }
}

// Add near your refs:
const noVersionsByFileId = ref<Set<number>>(new Set());
const artifactDataByVersionId = ref<Record<number, {
  loading: boolean
  loaded: boolean
  error: string | null
  files: Array<{ rel_path: string; size?: number | null; mtime_ms?: number | null; kind?: string }>
  folders: Array<{ rel_path: string; label?: string; exists?: boolean }>
}>>({})

function resetArtifactData() {
  artifactDataByVersionId.value = {}
}

function artifactState(v: any) {
  const versionId = Number(v?.asset_version_id)
  if (!Number.isFinite(versionId) || versionId <= 0) return null
  if (!artifactDataByVersionId.value[versionId]) {
    artifactDataByVersionId.value[versionId] = {
      loading: false,
      loaded: false,
      error: null,
      files: [],
      folders: [],
    }
  }
  return artifactDataByVersionId.value[versionId]
}

function artifactLoading(v: any) {
  return !!artifactState(v)?.loading
}

function artifactError(v: any) {
  return artifactState(v)?.error || ''
}

function artifactFileNodes(v: any) {
  const rows = Array.isArray(artifactState(v)?.files) ? artifactState(v)!.files : []
  return rows
    .filter((f) => String(f?.kind || '').toLowerCase() !== 'hls')
    .map((f) => {
      const rel = normalizeRelPathForDisplay(f?.rel_path)
      const parts = rel.split('/').filter(Boolean)
      const name = parts[parts.length - 1] || rel || 'file'
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
      return {
        rel_path: rel,
        name,
        dir,
        depth: Math.max(0, parts.length - 1),
        size: typeof f?.size === 'number' ? f.size : undefined,
      }
    })
    .filter((f) => !!f.rel_path)
    .sort((a, b) => a.rel_path.localeCompare(b.rel_path))
}

function fallbackFolderRows(v: any) {
  const fromApi = Array.isArray(artifactState(v)?.folders)
    ? artifactState(v)!.folders
      .map((f) => ({
        label: String(f?.label || 'Folder'),
        rel_path: normalizeRelPathForDisplay(f?.rel_path),
      }))
      .filter((f) => !!f.rel_path)
    : []
  if (fromApi.length) return fromApi

  return [
    { label: 'Version folder', rel_path: snapshotDirRelPath(v) },
    { label: 'Proxy/HLS folder', rel_path: transcodeDirRelPath(v) },
    { label: 'HLS folder', rel_path: hlsFolderRelPath(v) },
  ].filter((f) => !!f.rel_path)
}

async function loadArtifactsForVersion(v: any, opts?: { force?: boolean }) {
  if (!selectedVersionFileId.value) return
  const fileId = Number(selectedVersionFileId.value)
  const versionId = Number(v?.asset_version_id)
  if (!Number.isFinite(fileId) || fileId <= 0) return
  if (!Number.isFinite(versionId) || versionId <= 0) return

  const st = artifactState(v)
  if (!st) return
  if (st.loading) return
  if (st.loaded && !opts?.force) return

  st.loading = true
  st.error = null
  try {
    const resp = await props.apiFetch(`/api/files/${fileId}/versions/${versionId}/artifacts`)
    st.files = Array.isArray(resp?.files) ? resp.files : []
    st.folders = Array.isArray(resp?.folders) ? resp.folders : []
    st.loaded = true
  } catch (e: any) {
    st.error = e?.message || e?.error || String(e)
  } finally {
    st.loading = false
  }
}

async function loadArtifactsForVisibleVersions(opts?: { force?: boolean }) {
  if (!showExtraFiles.value) return
  for (const v of versions.value) {
    await loadArtifactsForVersion(v, opts)
  }
}

// Change loadVersions signature:
async function loadVersions(fileId: number, opts?: { force?: boolean }) {
  if (!fileId) return;

  // If we already know there are none, don't keep auto-checking
  if (!opts?.force && noVersionsByFileId.value.has(fileId)) {
    versions.value = [];
    versionsError.value = null;
    versionsLoading.value = false;
    return;
  }

  versionsLoading.value = true;
  versionsError.value = null;

  try {
    const resp = await props.apiFetch(`/api/files/${fileId}/versions`);
    const list = Array.isArray(resp?.versions) ? resp.versions : [];
    versions.value = list;
    resetArtifactData();

    if (list.length === 0) {
      // Sticky "none exist" so we don't keep re-fetching
      noVersionsByFileId.value.add(fileId);
    } else {
      // If versions appear later, clear the sticky empty
      noVersionsByFileId.value.delete(fileId);
    }
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e);

    // If we *already* know there are none, treat errors as non-fatal and keep UI calm
    if (noVersionsByFileId.value.has(fileId)) {
      versionsError.value = null;
      versions.value = [];
    } else {
      // Otherwise show the real error
      versionsError.value = msg;
      versions.value = [];
    }
  } finally {
    versionsLoading.value = false;
    if (showExtraFiles.value) await loadArtifactsForVisibleVersions()
  }
}

async function refreshVersions() {
  if (!selectedVersionFileId.value) return;
  // Force refresh overrides sticky-empty cache
  await loadVersions(selectedVersionFileId.value, { force: true });
}

watch(
  () => props.link?.id,
  () => {
    noVersionsByFileId.value = new Set();
    resetArtifactData();
  }
);

watch(
  () => [showExtraFiles.value, selectedVersionFileId.value, versions.value.length],
  async ([show]) => {
    if (!show) return
    await loadArtifactsForVisibleVersions()
  }
);

async function restoreVersion(v: any) {
  if (!selectedVersionFileId.value) return
  const fileId = selectedVersionFileId.value
  const f = versionFileById.value.get(fileId)
  const livePath = f?.relPath || f?.name || `file ${fileId}`
  const backupDir = `.45flow/backups/${fileId}/`
  const confirmLines = [
    `Restore version v${v?.version_index}?`,
    '',
    `Live file to overwrite: ${livePath}`,
    restoreBackup.value
      ? `Backup will be created under: ${backupDir} (timestamped filename)`
      : 'Backup will NOT be created.',
    '',
    'Proceed?'
  ]
  const ok = confirm(confirmLines.join('\n'))
  if (!ok) return

  try {
    const resp = await props.apiFetch(`/api/files/${selectedVersionFileId.value}/versions/${v.asset_version_id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ backup: restoreBackup.value }),
    })
    await refreshVersions()
    // Pick up newly queued transcode jobs in the Transfer Dock
    transfer.restoreActiveTranscodes(props.apiFetch)
    const backupNote = resp?.backup_rel ? ` Backup: ${resp.backup_rel}` : ''
    pushNotification(new Notification('Version Restored', `Restored v${v?.version_index}.${backupNote}`, 'success', 8000))
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e)
    pushNotification(new Notification('Restore Failed', msg, 'error', 8000))
  }
}

async function deleteVersion(v: any) {
  if (!selectedVersionFileId.value) return
  if (versions.value.length <= 1) return
  const ok = confirm(`Delete version v${v?.version_index}? This cannot be undone.`)
  if (!ok) return

  try {
    await props.apiFetch(`/api/files/${selectedVersionFileId.value}/versions/${v.asset_version_id}`, {
      method: 'DELETE',
    })
    await refreshVersions()
    pushNotification(new Notification('Version Deleted', `Deleted v${v?.version_index}.`, 'success', 6000))
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e)
    pushNotification(new Notification('Delete Failed', msg, 'error', 8000))
  }
}

async function fetchDetailsFor() {
  if (!props.link) return
  detailsLoading.value = true
  files.value = []
  auditActivity.value = []
  detailsToken.value = ''
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.link.id))}/details`)
    assignMediaSettingsFromSource(resp?.link)
    assignMediaSettingsFromSource(resp?.settings)
    assignMediaSettingsFromSource(resp)
    detailsToken.value = String(resp?.link?.token || resp?.token || '')
    files.value = (resp.files || []).map((f: any, idx: number) => ({
      key: `f${idx}`,
      ...f,
      uploader_label: f.uploader_name,
      relPath: f.relPath ?? f.path ?? f.p ?? null
    }))
    const rawAudit = Array.isArray(resp?.auditActivity) ? resp.auditActivity : []
    auditActivity.value = rawAudit
      .map(normalizeAuditRow)
      .filter((a: AuditActivityRow) => !!a.type || a.ts_ms > 0)

    setAccessFromResponse(resp)

    suppressVersionWatch = true
    selectDefaultVersionFile()
    suppressVersionWatch = false

    await hydrateMediaSettingsFromArtifacts()

    if (selectedVersionFileId.value) await loadVersions(selectedVersionFileId.value)

    // If user entered edit mode before details finished loading, re-seed watermark drafts
    // so that the Configure Watermark modal picks up the correct file and settings.
    if (editMode.value) {
      if (!draftWatermarkFile.value && currentWatermarkFile.value) {
        draftWatermarkFile.value = currentWatermarkFile.value
        originalWatermarkFile.value = currentWatermarkFile.value
      }
      if (!draftWatermarkEnabled.value && currentWatermark.value) {
        draftWatermarkEnabled.value = true
      }
      const freshSettings = (props.link as any)?.watermarkSettings
      if (freshSettings && typeof freshSettings === 'object' && freshSettings.position) {
        draftWatermarkSettings.value = JSON.parse(JSON.stringify(freshSettings))
      }
    }
  } catch {
    // Keep the modal usable even if details fetch fails; UI falls back to list-level file metadata.
    detailsToken.value = String(props.link?.token || '')
    files.value = []
    auditActivity.value = []
    versions.value = []
    selectedVersionFileId.value = null
  } finally {
    detailsLoading.value = false
    transcodeStatusReload.value++
  }
}

async function loadCategories() {
  if (!effectiveToken.value || !props.link?.id) return
  try {
    const categories = await getCategoriesForLink(effectiveToken.value, Number(props.link.id))
    linkCategories.value = categories || []
  } catch (err) {
    console.warn('[LinkDetails] Failed to load categories:', err)
  }
}

function onCategoriesUpdated(categories: Array<{ id: number; name: string; color: string | null }>) {
  linkCategories.value = categories
}

async function loadAccess() {
  if (!props.link) return
  accessLoading.value = true
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.link.id))}/access`)
    setAccessFromResponse(resp)
  } catch {
    access.value = []
  } finally {
    accessLoading.value = false
  }
}

function buildUsersPayload(users: Array<{ id?: number; username?: string; name?: string; user_email?: string; role_id?: number | null; role_name?: string | null }>) {
  return users
    .map(u => {
      const out: any = {}
      if (u.id != null) out.userId = u.id
      if (u.username) out.username = u.username
      if (u.user_email) out.user_email = u.user_email
      if (u.name) out.name = u.name
      if (u.role_id != null) out.roleId = u.role_id
      if (u.role_name) out.roleName = u.role_name
      return out
    })
    .filter(x => x.userId != null || x.username || x.user_email)
}

async function mergeAccess(users: Array<{ id?: number; username?: string; name?: string; user_email?: string; role_id?: number | null; role_name?: string | null }>) {
  if (!props.link) return
  const payload = { users: buildUsersPayload(users) }
  await props.apiFetch(`/api/links/${props.link.id}/access/merge`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  await loadAccess()
}

let tempUserId = 0

function mergeAccessFromModal(
  users: Array<{ id?: string | number; username: string; name?: string; user_email?: string; display_color?: string; role_id?: number | null; role_name?: string | null }>,
  groups?: Array<{ id: number; name?: string; member_count?: number; display_color?: string | null; role_id: number | null; role_name: string | null }>
) {
  const known = [...draftAccess.value, ...access.value]
  draftAccess.value = users.map(u => {
    const id = Number(u.id)
    const prev = Number.isFinite(id) && id > 0
      ? known.find(a => a.user_id === id)
      : known.find(a => a.user_name && a.user_name === u.username)
    return {
      ...(prev || {}),
      // New clients without an id yet get a temporary negative key; the server resolves them by username.
      user_id: Number.isFinite(id) && id > 0 ? id : (prev?.user_id ?? --tempUserId),
      user_name: u.username || prev?.user_name,
      name: u.name ?? prev?.name,
      user_email: u.user_email ?? prev?.user_email,
      display_color: u.display_color ?? prev?.display_color ?? null,
      role_id: u.role_id ?? null,
      role_name: u.role_name ?? null,
      role: null,
    } as AccessRow
  })
  if (groups !== undefined) {
    const knownGroups = [...draftGroups.value, ...accessGroupRows.value]
    draftGroups.value = groups.map(g => {
      const prev: any = knownGroups.find((x: any) => x.group_id === g.id)
      return {
        ...(prev || {}),
        group_id: g.id,
        group_name: g.name || prev?.group_name || 'Team',
        group_color: g.display_color ?? prev?.group_color ?? null,
        member_count: g.member_count ?? prev?.member_count ?? 0,
        role_id: g.role_id,
        role_name: g.role_name,
        role: null,
      }
    })
  }
  accessTouched.value = true
  accessModalOpen.value = false
}

function removeAccess(userId: number) {
  draftAccess.value = draftAccess.value.filter(a => a.user_id !== userId)
  accessTouched.value = true
}

function removeGroupAccess(groupId: number) {
  draftGroups.value = draftGroups.value.filter((g: any) => g.group_id !== groupId)
  accessTouched.value = true
}

function undoRemoveAccess(userId: number) {
  const row = access.value.find(a => a.user_id === userId)
  if (row && !draftAccess.value.some(a => a.user_id === userId)) draftAccess.value = [...draftAccess.value, { ...row }]
}

function undoRemoveGroupAccess(groupId: number) {
  const row = accessGroupRows.value.find((g: any) => g.group_id === groupId)
  if (row && !draftGroups.value.some((g: any) => g.group_id === groupId)) draftGroups.value = [...draftGroups.value, { ...row }]
}

async function saveDraftAccess() {
  if (!props.link) return
  const users = buildUsersPayload(draftAccess.value.map(a => ({
    id: a.user_id > 0 ? a.user_id : undefined,
    username: a.user_name,
    name: a.name,
    user_email: a.user_email,
    role_id: a.role_id ?? a.role?.id ?? null,
    role_name: a.role_name ?? a.role?.name ?? null,
  })))
  const groups = draftGroups.value.map((g: any) => ({
    groupId: g.group_id,
    roleId: g.role_id ?? g.role?.id ?? null,
    roleName: g.role_name ?? g.role?.name ?? null,
  }))
  // The merge endpoint replaces the link's user and team lists with exactly these.
  const resp = await props.apiFetch(`/api/links/${props.link.id}/access/merge`, {
    method: 'POST',
    body: JSON.stringify({ users, groups }),
  })
  accessTouched.value = false
  setAccessFromResponse(resp)
}

function beginEdit(tab: EditTab = 'details') {
  if (!props.link) return
  editMode.value = true
  editTab.value = tab
  void loadUploadSpec()

  // Tour: show edit-mode tour the first time
  if (!_editTourTriggered && !onboarding.value.linkDetailsEditTourDone) {
    _editTourTriggered = true
    setTimeout(() => {
      requestTour('link-details-edit', linkDetailsEditTourSteps.value, () => markDone('linkDetailsEditTourDone'))
    }, 300)
  }

  draftTitle.value = props.link.title || ''
  draftNotes.value = (props.link as any).notes || ''
  draftAccessMode.value = props.link.access_mode || 'open'
  draftAllowComments.value = supportsComments.value
    ? (props.link.allow_comments ?? true)
    : false
  draftUsePassword.value =
    draftAccessMode.value === 'open' &&
    ((props.link.auth_mode || '') === 'password' || !!props.link.passwordRequired)
  draftPassword.value = ''
  draftUploadEnabled.value = !!props.link.upload_enabled
  draftShareEnabled.value = !!props.link.share_enabled
  draftAutoShareUploads.value = !!props.link.auto_share_uploads
  draftAutoWatermarkUploads.value = !!props.link.auto_watermark_uploads
  draftAutoTranscodeUploads.value = !!props.link.auto_transcode_uploads
  draftAutoTranscodeProxyQualities.value = props.link.auto_transcode_proxy_qualities?.length
    ? props.link.auto_transcode_proxy_qualities.slice()
    : ['720p']
  draftProjectId.value = (props.link as any).project_id ?? null
  if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
  seedDraftMediaSettings()
  seedDraftAccess()
  draftApproverId.value = serverApproverId.value

  // Fetch available projects for project selector
  fetchAvailableProjects()

  // Seed upload destination based on upload capability, not link type
  if (props.link.upload_enabled) {
    const cur = currentUploadDir.value || ''
    draftUploadDir.value = cur
    originalUploadDir.value = cur
  } else {
    draftUploadDir.value = ''
    originalUploadDir.value = ''
  }

  // Seed file paths based on share capability, not link type
  if (props.link.share_enabled) {
    const fromDetails = files.value
      .map(f => f?.relPath)
      .filter((p: any) => typeof p === 'string' && p.trim().length > 0) as string[]

    const seeded = fromDetails.length
      ? fromDetails
      : (props.link.target?.files || []).map((f: any) => f?.relPath || f?.path || f?.p).filter(Boolean)

    draftFilePaths.value = Array.isArray(seeded)
      ? seeded.map(normalizeAbs).filter(Boolean)
      : []
    originalFilePaths.value = draftFilePaths.value.slice()
  } else {
    draftFilePaths.value = []
    originalFilePaths.value = []
  }


}

// Review tab: download every decision and comment for this link (C2 export).
const reviewExporting = ref<'csv' | 'json' | null>(null)
async function exportReview(format: 'csv' | 'json') {
  const id = props.link?.id
  if (!id || reviewExporting.value) return
  reviewExporting.value = format
  try {
    const text = await props.apiFetch(`/api/links/${id}/export/review?format=${format}`, { parse: 'text' })
    const slug = String(props.link?.title || `link-${id}`).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || `link-${id}`
    const fileName = `${slug}-review.${format}`
    const blob = new Blob([text], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    pushNotification(new Notification('Review Exported', `Saved ${fileName}.`, 'success', 5000))
  } catch (err: any) {
    pushNotification(new Notification('Export Failed', err?.message || 'Could not export the review history.', 'error', 8000))
  } finally {
    reviewExporting.value = null
  }
}

// Opened from the Review tab's Change/Choose: land on the approver picker instead of the top of the form.
async function editApprover() {
  beginEdit('access')
  await nextTick()
  await new Promise(r => requestAnimationFrame(() => r(null)))
  const row = document.getElementById('ld-edit-approver-row')
  if (!row) return
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  document.getElementById('ld-edit-approver')?.focus({ preventScroll: true })
}

function cancelEdit() {
  editMode.value = false
  mediaWasReprocessed.value = false
  draftUploadSpec.value = savedUploadSpec.value ? JSON.parse(JSON.stringify(savedUploadSpec.value)) : null

  draftTitle.value = props.link?.title || ''
  draftNotes.value = (props.link as any)?.notes || ''
  draftAccessMode.value = props.link?.access_mode || 'open'
  draftAllowComments.value = supportsComments.value
    ? (props.link?.allow_comments ?? true)
    : false
  draftUsePassword.value =
    draftAccessMode.value === 'open' &&
    ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
  draftPassword.value = ''
  draftUploadEnabled.value = !!props.link?.upload_enabled
  draftShareEnabled.value = !!props.link?.share_enabled
  draftAutoShareUploads.value = !!props.link?.auto_share_uploads
  draftAutoWatermarkUploads.value = !!props.link?.auto_watermark_uploads
  draftAutoTranscodeUploads.value = !!props.link?.auto_transcode_uploads
  draftAutoTranscodeProxyQualities.value = props.link?.auto_transcode_proxy_qualities?.length
    ? props.link.auto_transcode_proxy_qualities.slice()
    : ['720p']
  if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
  seedDraftMediaSettings()
  seedDraftAccess()
  draftApproverId.value = serverApproverId.value

  draftFilePaths.value = originalFilePaths.value.slice()
  draftUploadDir.value = originalUploadDir.value || currentUploadDir.value || ''
}

function openFilesEditor() {
  if (!props.link) return
  // Allow opening files editor if share is enabled (or will be enabled in edit mode)
  if (!props.link.share_enabled && !draftShareEnabled.value) return
  filesEditorOpen.value = true
}

function onApplyFilePaths(paths: string[]) {
  draftFilePaths.value = paths.slice()
}

async function saveAll() {
  if (!props.link) return

  // Optional: prevent duplicate clicks
  if (saving.value) return

  saving.value = true

  // Helpers
  const id = props.link.id

  function toRel(p: string) {
    return (p || '').replace(/^\/+/, '')
  }

  function apiErrMsg(e: any) {
    return e?.message || e?.error || String(e || 'Request failed')
  }

  function parseApiConflictPayload(e: any): any | null {
    if (!e) return null
    if (typeof e?.payload === 'object' && e.payload) return e.payload
    if (typeof e?.response === 'object' && e.response) return e.response
    if (typeof e?.data === 'object' && e.data) return e.data
    if (typeof e?.error === 'string' && e.error.trim()) return { error: e.error.trim() }
    if (typeof e?.code === 'string' && e.code.trim()) return { error: e.code.trim() }
    const msg = String(e?.message || '')
    const match = msg.match(/\b(outputs_exist|hls_exists|watermark_exists)\b/i)
    if (match?.[1]) return { error: match[1].toLowerCase() }
    if (typeof e?.message === 'string' && e.message.trim()) {
      try {
        return JSON.parse(e.message)
      } catch {
        return null
      }
    }
    return null
  }

  async function resolveOutputsConflictAction(payload: any): Promise<'overwrite' | 'keep' | 'cancel'> {
    const warnings = Array.isArray(payload?.warnings) ? payload.warnings : []
    const lines: string[] = []
    lines.push('Existing generated outputs were found for one or more selected files.')
    lines.push('')
    if (warnings.length) {
      const preview = warnings
        .slice(0, 3)
        .map((w: any) => `${w?.kind || 'output'}: ${String(w?.filePath || '').trim() || 'unknown file'}`)
      for (const p of preview) lines.push(`- ${p}`)
      if (warnings.length > 3) lines.push(`- ...and ${warnings.length - 3} more`)
      lines.push('')
    }
    lines.push('Press OK to overwrite existing outputs and regenerate.')
    lines.push('Press Cancel for more options.')
    const overwrite = confirm(lines.join('\n'))
    if (overwrite) return 'overwrite'

    const keep = confirm(
      'Keep existing outputs and continue saving without regeneration?\n\n' +
      'Press OK to keep existing outputs.\n' +
      'Press Cancel to abort save.'
    )
    if (keep) return 'keep'
    return 'cancel'
  }

  async function apiFetchWithOutputConflictRetry(
    url: string,
    init: { method: string; body: string },
    label: string
  ) {
    const baseBody = JSON.parse(init.body || '{}')
    const fetchInit = { ...init, timeoutMs: 5 * 60 * 1000 }
    try {
      return await props.apiFetch(url, fetchInit)
    } catch (e: any) {
      const payload = parseApiConflictPayload(e)
      const errCode = String(payload?.error || '')
      if (e?.status !== 409 || !/^(outputs_exist|hls_exists|watermark_exists)$/.test(errCode)) {
        throw e
      }
      // console.log('[link-details:save] conflict 409', { label, payload })
      const action = await resolveOutputsConflictAction(payload)
      if (action === 'cancel') {
        const canceled: any = new Error('save canceled')
        canceled.conflictCanceled = true
        throw canceled
      }

      const retryBody = {
        ...baseBody,
        overwrite: action === 'overwrite',
        keepExistingOutputs: action === 'keep',
        allowExistingOutputs: action === 'keep',
      }
      console.log(`[link-details:save] retry ${label} after conflict`, {
        action,
        retryBody,
      })
      return await props.apiFetch(url, {
        ...fetchInit,
        body: JSON.stringify(retryBody),
      })
    }
  }

  // Track what we actually attempted (for better messaging)
  const did = {
    access: false,
    details: false,
    files: false,
    uploadDest: false,
    uploadSpec: false,
  }

  try {
    // Compute change flags up front
    const titleChanged = (draftTitle.value || '') !== (props.link.title || '')
    const notesChanged = (draftNotes.value || '') !== (((props.link as any).notes) || '')

    const uploadEnabledChanged = !!draftUploadEnabled.value !== !!props.link.upload_enabled
    const shareEnabledChanged = !!draftShareEnabled.value !== !!props.link.share_enabled
    const capabilitiesChanged = uploadEnabledChanged || shareEnabledChanged

    // Validate that at least one capability is enabled
    if (!draftUploadEnabled.value && !draftShareEnabled.value) {
      pushNotification(
        new Notification(
          'Invalid Link Capabilities',
          'At least one capability (Upload or Review/Share) must be enabled.',
          'warning',
          8000
        )
      )
      return
    }

    // Validate share capability has files
    if (draftShareEnabled.value && draftFilePaths.value.length === 0) {
      pushNotification(
        new Notification(
          'Files Required',
          'Select at least one file to share. Click "Manage files…" to select files.',
          'warning',
          8000
        )
      )
      return
    }

    // Validate upload capability has destination directory
    if (uploadDirMissing.value) {
      pushNotification(
        new Notification(
          'Upload Destination Required',
          'Specify an upload destination folder.',
          'warning',
          8000
        )
      )
      return
    }

    const currentAccessModeValue = props.link.access_mode || 'open'
    const nextAccessMode = draftAccessMode.value
    const accessModeChanged = nextAccessMode !== currentAccessModeValue
    const nextAllowComments =
      nextAccessMode === 'open' && supportsComments.value ? !!draftAllowComments.value : false
    const currentAllowComments =
      currentAccessModeValue === 'open' && supportsComments.value ? !!props.link.allow_comments : false
    const allowCommentsChanged =
      supportsComments.value && nextAccessMode === 'open' && nextAllowComments !== currentAllowComments

    const hadPassword = (props.link.auth_mode || '') === 'password' || !!props.link.passwordRequired
    const currentAuthModeValue =
      props.link.auth_mode || (hadPassword ? 'password' : 'none')
    const wantsPassword = nextAccessMode === 'open' && draftUsePassword.value
    const nextAuthMode = nextAccessMode === 'restricted'
      ? 'password'
      : (wantsPassword ? 'password' : 'none')
    const authModeChanged = nextAuthMode !== currentAuthModeValue

    const passwordInput = draftPassword.value.trim()
    const passwordWillSet = nextAccessMode === 'open' && wantsPassword && passwordInput.length > 0
    const passwordWillClear = nextAccessMode === 'open' && !wantsPassword && hadPassword
    const passwordChanged = passwordWillSet || passwordWillClear

    const autoShareChanged = !!draftAutoShareUploads.value !== !!props.link.auto_share_uploads
    const autoWatermarkChanged = !!draftAutoWatermarkUploads.value !== !!props.link.auto_watermark_uploads
    const autoTranscodeChanged =
      !!draftAutoTranscodeUploads.value !== !!props.link.auto_transcode_uploads ||
      (draftAutoTranscodeUploads.value &&
        JSON.stringify([...draftAutoTranscodeProxyQualities.value].sort()) !==
          JSON.stringify([...(props.link.auto_transcode_proxy_qualities || [])].sort()))
    const projectChanged = (draftProjectId.value ?? null) !== ((props.link as any).project_id ?? null)
    const shouldUpdateDetailsCore =
      titleChanged || notesChanged || accessModeChanged || allowCommentsChanged || authModeChanged || passwordChanged || capabilitiesChanged || autoShareChanged || autoWatermarkChanged || autoTranscodeChanged || projectChanged
    const shouldUpdateFiles = draftShareEnabled.value && filesDirty.value
    const shouldPatchMediaSettings = mediaSettingsDirty.value
    const watermarkChanged =
      (!!draftWatermarkEnabled.value !== currentWatermark.value) ||
      ((draftWatermarkFile.value || '').trim() !== (originalWatermarkFile.value || currentWatermarkFile.value)) ||
      !!draftWatermarkLocalFile.value
    const deferMediaPatchUntilAfterFiles = shouldUpdateFiles && shouldPatchMediaSettings
    const shouldUpdateDetails =
      shouldUpdateDetailsCore || (shouldPatchMediaSettings && !deferMediaPatchUntilAfterFiles)
    const shouldUpdateUploadDest = draftUploadEnabled.value && uploadDirDirty.value

    const addedPaths = computeAddedPaths(draftFilePaths.value, originalFilePaths.value)
    const wantsHls = addedPaths.length > 0
    const wantsProxy = wantsHls && draftGenerateReviewProxy.value
    const nextProxyQualities = normalizeQualities(draftProxyQualities.value)

    if (draftWatermarkEnabled.value && draftWatermarkLocalFile.value && watermarkChanged) {
      const up = await uploadDraftLocalWatermark()
      if (!up.ok) {
        pushNotification(
          new Notification(
            'Watermark Upload Failed',
            up.error || 'Unable to upload local watermark file.',
            'error',
            8000
          )
        )
        return
      }
      draftWatermarkFile.value = up.relPath || draftWatermarkFile.value
    }

    if (draftWatermarkEnabled.value && !draftGenerateReviewProxy.value && linkHasVideoFiles.value && watermarkChanged) {
      pushNotification(
        new Notification(
          'Invalid Media Settings',
          'Enable proxy files before enabling watermark.',
          'warning',
          8000
        )
      )
      return
    }
    if (draftGenerateReviewProxy.value && nextProxyQualities.length === 0) {
      pushNotification(
        new Notification(
          'Proxy File Quality Required',
          'Select at least one proxy file quality.',
          'warning',
          8000
        )
      )
      return
    }
    if (draftAutoTranscodeUploads.value && draftAutoTranscodeProxyQualities.value.length === 0) {
      pushNotification(
        new Notification(
          'Proxy Resolution Required',
          'Select at least one proxy resolution for auto-transcode uploads.',
          'warning',
          8000
        )
      )
      return
    }
    if (draftWatermarkEnabled.value && watermarkChanged && !draftWatermarkFile.value.trim()) {
      pushNotification(
        new Notification(
          'Watermark File Required',
          'Enter a watermark file name.',
          'warning',
          8000
        )
      )
      return
    }

    // 0) Invited clients and teams (before the access mode changes, so a failure can't lock anyone out)
    if (accessEditsPending.value) {
      try {
        await saveDraftAccess()
        did.access = true
      } catch (e: any) {
        pushNotification(
          new Notification(
            'Failed to Save Invites',
            apiErrMsg(e) || 'The invited clients and teams could not be updated. Nothing was saved.',
            'error',
            8000
          )
        )
        return
      }
    }

    // Approver after invites, since the server only accepts someone already invited.
    if (approverDirty.value) {
      if (!(await linkReview.setApprover(draftApproverId.value))) {
        pushNotification(
          new Notification(
            'Failed to Save Approver',
            linkReview.error.value || 'The approver could not be changed.',
            'error',
            8000
          )
        )
        return
      }
      did.access = true
    }

    // 1) Title/notes
    let detailsResp: any | null = null
    if (shouldUpdateDetails) {
      const body: any = {
        title: draftTitle.value || null,
        notes: draftNotes.value || null,
      }

      if (projectChanged) {
        body.projectId = draftProjectId.value ?? null
      }

      if (capabilitiesChanged) {
        body.uploadEnabled = !!draftUploadEnabled.value
        body.shareEnabled = !!draftShareEnabled.value
      }

      // Include autoShareUploads if it changed
      if (!!draftAutoShareUploads.value !== !!props.link.auto_share_uploads) {
        body.autoShareUploads = !!draftAutoShareUploads.value
      }

      // Include autoWatermarkUploads if it changed
      if (!!draftAutoWatermarkUploads.value !== !!props.link.auto_watermark_uploads) {
        body.autoWatermarkUploads = !!draftAutoWatermarkUploads.value
      }

      // Include autoTranscodeUploads/proxy qualities if changed
      if (autoTranscodeChanged) {
        body.autoTranscodeUploads = !!draftAutoTranscodeUploads.value
        body.autoTranscodeProxyQualities = draftAutoTranscodeUploads.value ? draftAutoTranscodeProxyQualities.value.slice() : []
      }

      if (accessModeChanged || allowCommentsChanged || authModeChanged) {
        body.access_mode = nextAccessMode
        if (accessModeChanged || authModeChanged) body.auth_mode = nextAuthMode
        body.allow_comments = nextAllowComments
      }
      if (passwordWillSet) {
        body.password = passwordInput
      } else if (passwordWillClear) {
        body.password = ''
      }
      if (shouldPatchMediaSettings && !deferMediaPatchUntilAfterFiles) {
        body.generateReviewProxy = !!draftGenerateReviewProxy.value
        body.adaptiveHls = !!draftGenerateReviewProxy.value || !!draftWatermarkEnabled.value
        body.proxyQualities = draftGenerateReviewProxy.value ? nextProxyQualities : []
        // Only send watermark fields if watermark actually changed
        if (watermarkChanged) {
          body.watermark = !!draftWatermarkEnabled.value
          body.watermarkFile = draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null
          body.watermarkProxyQualities = draftWatermarkEnabled.value ? nextProxyQualities : []
          body.watermarkSettings = draftWatermarkEnabled.value ? JSON.parse(JSON.stringify(draftWatermarkSettings.value)) : null
          if (clientTranscodeEnabled.value) body.clientTranscode = true
        } else {
          body.saveSettingsOnly = true
        }
      }

      try {
        console.log('[link-details:save] PATCH /api/links/:id request', {
          id,
          watermarkSettings: body.watermarkSettings,
          watermarkFile: body.watermarkFile,
          watermark: body.watermark,
          watermarkChanged,
          saveSettingsOnly: body.saveSettingsOnly,
          draftWatermarkSettings: JSON.parse(JSON.stringify(draftWatermarkSettings.value)),
        })
        detailsResp = await apiFetchWithOutputConflictRetry(`/api/links/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }, 'PATCH /api/links/:id')
        // console.log('[link-details:save] PATCH /api/links/:id response', {
        //   id,
        //   hasTranscodes: Array.isArray(detailsResp?.transcodes) || !!detailsResp?.transcodes,
        //   keys: Object.keys(detailsResp || {}),
        //   response: detailsResp,
        // })
        did.details = true
      } catch (e: any) {
        if (e?.conflictCanceled) return
        const msg = apiErrMsg(e)
        console.error('[link-details:save] PATCH failed:', e)
        pushNotification(
          new Notification(
            'Failed to Save Link Details',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // 2) Files (download/collection)
    let filesResp: any | null = null
    if (shouldUpdateFiles) {
      const body: any = { filePaths: draftFilePaths.value.map(toRel) }
      if (wantsHls) {
        body.adaptiveHls = true
        body.generateReviewProxy = wantsProxy
        if (clientTranscodeEnabled.value) body.clientTranscode = true
      }

      try {
        console.log('[link-details:save] PUT /api/links/:id/files request', { id, fileCount: draftFilePaths.value.length })
        filesResp = await apiFetchWithOutputConflictRetry(`/api/links/${id}/files`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }, 'PUT /api/links/:id/files')
        console.log('[link-details:save] PUT /api/links/:id/files success')
        did.files = true
      } catch (e: any) {
        if (e?.conflictCanceled) return
        const msg = apiErrMsg(e)
        console.error('[link-details:save] PUT files failed:', e)
        pushNotification(
          new Notification(
            'Failed to Update Link Files',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // 2.5) Media settings patch AFTER files update when files changed.
    // This avoids overwrite prompts being evaluated against stale (pre-edit) file sets.
    let mediaResp: any | null = null
    if (shouldPatchMediaSettings && deferMediaPatchUntilAfterFiles) {
      const mediaBody: any = {
        generateReviewProxy: !!draftGenerateReviewProxy.value,
        adaptiveHls: !!draftGenerateReviewProxy.value || !!draftWatermarkEnabled.value,
        proxyQualities: draftGenerateReviewProxy.value ? nextProxyQualities : [],
        watermark: !!draftWatermarkEnabled.value,
        watermarkFile: draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null,
        watermarkProxyQualities: draftWatermarkEnabled.value ? nextProxyQualities : [],
        watermarkSettings: draftWatermarkEnabled.value ? JSON.parse(JSON.stringify(draftWatermarkSettings.value)) : null,
        ...(watermarkChanged ? {} : { saveSettingsOnly: true }),
        ...(watermarkChanged && clientTranscodeEnabled.value ? { clientTranscode: true } : {}),
      }

      try {
        mediaResp = await apiFetchWithOutputConflictRetry(`/api/links/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(mediaBody),
        }, 'PATCH /api/links/:id (media)')
        did.details = true
      } catch (e: any) {
        if (e?.conflictCanceled) return
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Save Media Settings',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }
    
    // 3) Upload destination — must succeed BEFORE starting any transcode work.
    // If this fails, we bail early without triggering transcodes (prevents orphan jobs).
    let uploadResp: any | null = null
    if (shouldUpdateUploadDest) {
      try {
        console.log('[link-details:save] PUT /api/links/:id/upload-destination request', { id, path: draftUploadDir.value })
        uploadResp = await props.apiFetch(`/api/links/${id}/upload-destination`, {
          method: 'PUT',
          body: JSON.stringify({ path: draftUploadDir.value }),
        })
        console.log('[link-details:save] PUT /api/links/:id/upload-destination success')
        did.uploadDest = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        console.error('[link-details:save] PUT upload-destination failed:', e)
        pushNotification(
          new Notification(
            'Failed to Update Upload Destination',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // 3b) File requirements (Pro) — only on links that already accept uploads.
    if (uploadSpecDirty.value) {
      try {
        const resp = await props.apiFetch(`/api/links/${id}/upload-spec`, {
          method: 'PUT',
          body: JSON.stringify({ rules: hasAnySpecRule(draftUploadSpec.value) ? draftUploadSpec.value : null }),
          retry: 0,
          exposeServerMessage: true,
        })
        savedUploadSpec.value = withSpecDefaults(resp?.rules)
        did.uploadSpec = true
      } catch (e: any) {
        pushNotification(new Notification('File requirements not saved', apiErrMsg(e), 'error', 8000))
        return
      }
    }

    // Track transcode progress when files were added or watermark changed
    const trackingResp = shouldUpdateFiles ? filesResp : (watermarkChanged ? (mediaResp || detailsResp) : null)
    if (trackingResp && (trackingResp?.hasTranscodes || (shouldUpdateFiles && (wantsHls || wantsProxy)))) {
      if (clientTranscodeEnabled.value && trackingResp?.hasTranscodes) {
        // Client-side transcoding: run remote transcodes for each video file
        const apiBase = connectionMeta?.value?.apiBase || ''
        const apiToken = connectionMeta?.value?.token || ''
        const transcodeEntries: { assetVersionId: number; filename: string }[] = []
        const transcodes = Array.isArray(trackingResp.transcodes) ? trackingResp.transcodes : []
        for (const t of transcodes) {
          const avId = Number(t?.assetVersionId ?? t?.asset_version_id)
          if (!Number.isFinite(avId) || avId <= 0) continue
          const queuedKinds: string[] = t?.jobs?.queuedKinds || []
          if (!queuedKinds.includes('proxy_mp4') && !queuedKinds.includes('hls')) continue
          const fileId = Number(t?.fileId ?? t?.file_id)
          const matchedFile = files.value.find((f: any) => Number(f?.id) === fileId)
          const filename = matchedFile?.name || matchedFile?.relPath || `asset-${avId}`
          transcodeEntries.push({ assetVersionId: avId, filename })
        }

        if (transcodeEntries.length) {
          let localWatermarkPath: string | null = null
          const linkWm = draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null
          if (linkWm) {
            try {
              localWatermarkPath = await window.electron.downloadWatermark({
                apiBase,
                token: apiToken,
                relPath: linkWm,
              })
            } catch {}
          }

          const wmSettings = draftWatermarkEnabled.value
            ? JSON.parse(JSON.stringify(draftWatermarkSettings.value)) : undefined

          const promises = transcodeEntries.map((entry) =>
            runRemoteTranscode({
              assetVersionId: entry.assetVersionId,
              filename: entry.filename,
              proxyQualities: draftGenerateReviewProxy.value ? nextProxyQualities : ['original'],
              generateHls: true,
              watermarkPath: localWatermarkPath,
              watermarkSettings: isPremiumActive.value ? wmSettings : undefined,
              skipWatermarkCleanup: true,
              apiBase,
              apiToken,
              apiFetch: props.apiFetch,
              context: {
                source: 'link' as const,
                file: entry.filename,
              },
            })
          )

          Promise.allSettled(promises).then(() => {
            if (localWatermarkPath) {
              window.electron.cleanupWatermarkTemp(localWatermarkPath).catch(() => {})
            }
          })
        }
      } else {
        startLinkTranscodeTracking({
          resp: trackingResp,
          wantsProxy: shouldUpdateFiles ? !!wantsProxy : !!draftGenerateReviewProxy.value,
          wantsHls: true,
          addedPaths: shouldUpdateFiles ? addedPaths.slice() : draftFilePaths.value.slice(),
          proxyQualities: (shouldUpdateFiles ? wantsProxy : draftGenerateReviewProxy.value) ? nextProxyQualities : [],
        })
      }
    }

    // Refresh visible data (files table + access list)
    try {
      await fetchDetailsFor()
    } catch {
      // Non-fatal: UI can still exit edit mode since saves succeeded
    }

    // Normalize what we store as the "original" clean state
    originalFilePaths.value = draftFilePaths.value.slice()

    // If upload destination was changed, prefer server-returned rel dir
    if (did.uploadDest && uploadResp && typeof uploadResp.dirRel === 'string') {
      originalUploadDir.value = uploadResp.dirRel
      // If your UI expects PathInput to show absolute paths, don't overwrite draftUploadDir here.
      // If PathInput can display rel paths fine, you may set it too:
      // draftUploadDir.value = uploadResp.dirRel
    } else {
      originalUploadDir.value = draftUploadDir.value
    }

    // Emit accurate updated payload
    const updatedPayload: any = {
      id,
      title: draftTitle.value || null,
      notes: draftNotes.value || null,
    }

    if (accessModeChanged || allowCommentsChanged || authModeChanged) {
      updatedPayload.access_mode = nextAccessMode
      updatedPayload.allow_comments = nextAllowComments
      if (accessModeChanged || authModeChanged) updatedPayload.auth_mode = nextAuthMode
    }
    if (passwordWillSet) updatedPayload.passwordRequired = true
    if (passwordWillClear) updatedPayload.passwordRequired = false
    if (mediaSettingsDirty.value) {
      updatedPayload.generateReviewProxy = !!draftGenerateReviewProxy.value
      updatedPayload.proxyQualities = draftGenerateReviewProxy.value ? nextProxyQualities : []
      updatedPayload.watermark = !!draftWatermarkEnabled.value
      updatedPayload.watermarkFile = draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null
      updatedPayload.watermarkProxyQualities = draftWatermarkEnabled.value ? nextProxyQualities : []
    }

    if (did.files && filesResp && typeof filesResp.type === 'string') {
      updatedPayload.type = filesResp.type
      updatedPayload.filesCount = draftFilePaths.value.length
      updatedPayload.target = { ...(props.link.target || {}), files: draftFilePaths.value.map(p => ({ p: toRel(p) })) }
    }

    emit('updated', updatedPayload)

    // Optional success notification (only if something changed)
    if (did.access || did.details || did.files || did.uploadDest || did.uploadSpec) {
      console.log('[link-details:save] Save complete!', { did, capabilitiesChanged, uploadEnabledChanged, shareEnabledChanged })
      pushNotification(
        new Notification(
          'Saved',
          'Link changes were saved successfully.',
          'success',
          6000
        )
      )
    }

    close()
    editMode.value = false
    mediaWasReprocessed.value = false
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      editMode.value = false
      activeTab.value = 'overview'
      draftTitle.value = props.link?.title || ''
      draftNotes.value = (props.link as any)?.notes || ''
      draftAccessMode.value = props.link?.access_mode || 'open'
      draftAllowComments.value = supportsComments.value
        ? (props.link?.allow_comments ?? true)
        : false
      draftUsePassword.value =
        draftAccessMode.value === 'open' &&
        ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
      draftPassword.value = ''
      if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
      seedDraftMediaSettings()
      draftUploadDir.value = currentUploadDir.value || ''
      originalUploadDir.value = draftUploadDir.value
      accessTouched.value = false
      fetchDetailsFor()
      loadAccess()
      loadCategories()
      loadShareRoot()
    }
  },
  { immediate: false }
)

watch(
  () => props.link?.id,
  () => {
    if (props.modelValue) {
      editMode.value = false
      activeTab.value = 'overview'
      draftTitle.value = props.link?.title || ''
      draftNotes.value = (props.link as any)?.notes || ''
      draftAccessMode.value = props.link?.access_mode || 'open'
      draftAllowComments.value = supportsComments.value
        ? (props.link?.allow_comments ?? true)
        : false
      draftUsePassword.value =
        draftAccessMode.value === 'open' &&
        ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
      draftPassword.value = ''
      if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
      seedDraftMediaSettings()
      draftUploadDir.value = currentUploadDir.value || ''
      originalUploadDir.value = draftUploadDir.value
      accessTouched.value = false
      fetchDetailsFor()
      loadAccess()
      loadCategories()
      loadShareRoot()
    }
  }
)

watch(effectiveToken, (tok) => {
  if (tok && props.modelValue) loadCategories()
})

watch(
  () => selectedVersionFileId.value,
  (id) => {
    if (suppressVersionWatch || !id) return
    loadVersions(id)
  }
)

watch(
  () => draftAccessMode.value,
  (mode) => {
    if (mode === 'restricted' || !supportsComments.value) {
      draftAllowComments.value = false
    }
    if (mode === 'restricted') {
      draftUsePassword.value = false
      draftPassword.value = ''
    }
  }
)

watch(
  () => draftUsePassword.value,
  (v) => {
    if (!v) {
      draftPassword.value = ''
    }
  }
)

watch(
  () => draftGenerateReviewProxy.value,
  (v) => {
    if (v && draftProxyQualities.value.length === 0) {
      draftProxyQualities.value = ['720p']
    }
    if (!v) {
      draftProxyQualities.value = []
      draftWatermarkEnabled.value = false
      draftWatermarkFile.value = ''
      draftWatermarkLocalFile.value = null
    }
  }
)

watch(
  () => draftWatermarkEnabled.value,
  (v) => {
    if (v) {
      void loadExistingWatermarkFilesForEdit()
      return
    }
    if (!v) {
      draftWatermarkFile.value = ''
      draftWatermarkLocalFile.value = null
    }
  }
)

watch(
  () => draftWatermarkFile.value,
  (v) => {
    const localName = String(draftWatermarkLocalFile.value?.name || '').trim()
    if (!localName) return
    if (String(v || '').trim() !== localName) {
      draftWatermarkLocalFile.value = null
    }
  }
)
</script>

<style scoped>
/* ── Summary strip ───────────────────────────────────── */
.ld-summary {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex-shrink: 0;
  padding: 1.1rem 1.5rem 1rem;
}
.ld-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 8.5rem;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-md);
  background: var(--flow-surface-sunken);
}
.ld-url {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.65rem;
  font-size: var(--flow-text-sm);
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-md);
  background: var(--flow-surface-sunken);
}
.ld-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem 1.25rem;
}
.ld-facts dt {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-subtle-text);
}
.ld-facts dd {
  margin-top: 0.15rem;
  font-size: var(--flow-text-sm);
  font-weight: 500;
}
.ld-facts__aside {
  display: block;
  font-size: var(--flow-text-xs);
  font-weight: 400;
  color: var(--ui-subtle-text);
}
@media (max-width: 760px) {
  .ld-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ld-thumb { display: none; }
}

/* ── Content ─────────────────────────────────────────── */
.ld-link {
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: var(--flow-accent-line);
  text-underline-offset: 3px;
}
.ld-link:hover {
  text-decoration-thickness: 2px;
}
.ld-link:focus-visible {
  outline: 2px solid var(--ui-ring);
  outline-offset: 2px;
  border-radius: 2px;
}
.ld-path {
  font-size: var(--flow-text-xs);
  word-break: break-all;
}
.ld-notes {
  white-space: pre-wrap;
  padding: 0.75rem 1rem;
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-lg);
  background: var(--flow-surface-sunken);
}
.ld-paths {
  display: grid;
  gap: 0.25rem;
  max-height: 10rem;
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  overflow-y: auto;
  font-size: var(--flow-text-xs);
  border-radius: var(--flow-radius-md);
  background: var(--flow-surface-sunken);
}
.ld-danger {
  border-color: var(--flow-danger-border);
}
.ld-extra-row > td,
.flow-table tbody tr.ld-extra-row:hover > td {
  background: var(--flow-surface-sunken);
}
</style>
