<template>
    <div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
        <div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div class="grid w-full grid-cols-1 gap-4 text-2xl min-w-0">
                <CardContainer class="w-full bg-well rounded-md shadow-xl min-w-0">
                    <template #header>
                        <!-- ===== Step 1: Project selection ===== -->
                        <div v-if="!projectSelected" data-tour="share-project-selection" class="ss-toned-panel flex w-full flex-col gap-3 text-left min-w-0 p-4">
                            <h2 class="text-xl font-semibold">Select a project</h2>

                            <label class="flex items-center gap-2 text-sm cursor-pointer select-none min-w-0">
                                <input type="checkbox" v-model="showEntireTree" @change="loadProjectChoices" />
                                <span class="min-w-0">Show entire directory tree from root</span>
                            </label>

                            <label
                                v-if="hasConfiguredProjectRoot && !showEntireTree"
                                class="flex items-center gap-2 text-xs opacity-80 cursor-pointer select-none min-w-0"
                            >
                                <input type="checkbox" v-model="useConfiguredProjectRoot" @change="loadProjectChoices" />
                                <span class="min-w-0">Use configured project root by default</span>
                            </label>

                            <label
                                v-if="showDefaultRootOption"
                                class="flex items-center gap-2 text-xs opacity-80 cursor-pointer select-none min-w-0"
                            >
                                <input type="checkbox" v-model="rememberProjectAsDefault" />
                                <span class="min-w-0">
                                    Use selected project as default share root (change later in Settings -> Project Root (Share / Upload)).
                                </span>
                            </label>

                            <!-- Mode: ROOTS -->
                            <template v-if="browseMode === 'roots'">
                                <div class="text-sm opacity-80 min-w-0">
                                    <span class="font-semibold">ZFS Pools:</span>
                                    <span v-if="detecting" class="ml-1">Detecting…</span>
                                    <span v-else-if="!projectRoots.length" class="ml-1">None detected</span>
                                </div>

                                <div class="max-h-64 overflow-auto border-default bg-default rounded-md min-w-0">
                                    <div v-for="r in projectRoots" :key="r.mountpoint"
                                        class="flex items-center justify-between gap-2 border-b border-default px-3 py-2 text-base min-w-0">
                                        <div class="min-w-0 flex-1">
                                            <code class="block truncate" :title="`${r.name} → ${r.mountpoint}`">{{
                                                r.mountpoint }}</code>
                                        </div>
                                        <div class="flex gap-2 flex-shrink-0">
                                            <button class="btn btn-primary" @click="chooseProject(r.mountpoint)">Select</button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            <template v-else-if="useConfiguredProjectRoot && currentRoot">
                                <div class="text-sm opacity-80 min-w-0">
                                    <span class="font-semibold">Configured project root:</span>
                                    <code class="ml-2">{{ currentRoot }}</code>
                                </div>
                                <div class="max-h-64 overflow-auto border-default bg-default rounded-md min-w-0">
                                    <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2 text-base min-w-0">
                                        <div class="min-w-0 flex-1">
                                            <code class="block truncate" :title="currentRoot">{{ currentRoot }}</code>
                                        </div>
                                        <div class="flex gap-2 flex-shrink-0">
                                            <button class="btn btn-primary" @click="chooseProject(currentRoot)">Select</button>
                                        </div>
                                    </div>
                                </div>
                            </template>

                            <div class="text-sm text-red-400" v-if="detectError">
                                {{ detectError }}
                            </div>
                        </div>

                        <!-- ===== Step 2: select file content (only after project chosen) ===== -->
                        <div v-else data-tour="share-file-selection" class="ss-toned-panel flex flex-col gap-2 text-left min-w-0 p-3">
                            <div class="flex flex-col gap-2 text-left min-w-0">
                                <h2 class="text-xl font-semibold">Share Files</h2>
                                <div class="text-sm opacity-80 -mt-1">
                                    Pick files to share and generate a shareable link.
                                </div>
                            </div>
                            <div class="text-sm text-muted -mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                                <span class="font-semibold">Project:</span>
                                <code class="min-w-0 truncate">{{ projectBase }}</code>
                                <button class="btn btn-secondary sm:ml-3" @click="resetProject">
                                    Change Project Directory
                                </button>
                            </div>

                            <div data-tour="share-file-browser">
                                <FileExplorer :apiFetch="apiFetch" :modelValue="files" @add="onExplorerAdd" @remove="onExplorerRemove"
                                    :base="!showEntireTree ? projectBase : ''" :startDir="!showEntireTree ? projectBase : ''" />
                            </div>

                            <!-- Selected files panel -->
                            <div v-if="files.length" class="border border-default p-0.5 rounded bg-accent min-w-0">
                                <div class="flex flex-wrap items-center justify-between gap-2 px-2 py-1 min-w-0">
                                    <div class="text-sm font-semibold">
                                        Selected files <span class="text-muted">({{ files.length }})</span>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-2">
                                        <button class="btn btn-secondary" @click="showSelected = !showSelected">
                                            {{ showSelected ? 'Hide' : 'Show' }} list
                                        </button>
                                        <button class="btn btn-danger" @click="clearAll">Clear all</button>
                                    </div>
                                </div>

                                <div v-show="showSelected" class="max-h-40 overflow-auto min-w-0">
                                    <div v-for="(f, i) in files" :key="f"
                                        class="grid items-center [grid-template-columns:minmax(0,1fr)_auto] border-t border-default text-sm min-w-0">
                                        <div class="relative px-3 py-2 rounded-md bg-default min-w-0">
                                            <span aria-hidden="true"
                                                class="pointer-events-none absolute inset-0 rounded-md bg-green-500/50 animate-pulse z-0"></span>
                                            <span class="truncate block text-default relative z-10 min-w-0">{{ f }}</span>
                                        </div>

                                        <button class="btn btn-danger m-2 px-2 py-1" @click="removeFile(i)"
                                            title="Remove">✕</button>
                                    </div>
                                </div>
                            </div>

                            <div data-tour="share-link-options" class="border-t border-default mt-4 pt-4 min-w-0">
                                <!-- ===== Common link options ===== -->
                                <CommonLinkControls class="">
                                    <template #expiry>
                                        <div data-tour="share-expiry" class="flex flex-col gap-3 min-w-0">
                                            <!-- Row 1: label + input + select (always one row; inputs stay together) -->
                                            <div class="flex items-center gap-3 min-w-0">
                                                <label class="font-semibold whitespace-nowrap flex-shrink-0">Expires
                                                    in:</label>

                                                <div class="flex items-center gap-2 min-w-0 flex-1">
                                                    <input type="number" min="1" step="1" v-model.number="expiresValue"
                                                        class="input-textlike border rounded px-3 py-2 w-24" />

                                                    <select v-model="expiresUnit"
                                                        class="input-textlike border rounded px-3 py-2 w-32">
                                                        <option value="hours">hours</option>
                                                        <option value="days">days</option>
                                                        <option value="weeks">weeks</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <!-- Row 2: preset buttons -->
                                            <div class="flex flex-nowrap gap-1 text-xs min-w-0">
                                                <button type="button" class="btn btn-secondary w-20"
                                                    @click="setPreset(1, 'hours')">1 hour</button>
                                                <button type="button" class="btn btn-secondary w-20"
                                                    @click="setPreset(1, 'days')">1 day</button>
                                                <button type="button" class="btn btn-secondary w-20"
                                                    @click="setPreset(1, 'weeks')">1 week</button>
                                                <button type="button" class="btn btn-secondary w-20"
                                                    @click="setNever()">Never</button>
                                            </div>
                                        </div>
                                    </template>

                                    <template #title>
                                        <div data-tour="share-link-title" class="flex flex-wrap items-center gap-3 min-w-0">
                                            <label class="font-semibold sm:whitespace-nowrap">Link Title:</label>
                                            <input type="text" v-model.trim="linkTitle"
                                                class="input-textlike border rounded px-3 py-2 w-full min-w-[12rem]"
                                                placeholder="Optional title for the shared link" />
                                        </div>
                                    </template>
                                    <template #access>
                                        <div data-tour="share-network-access" class="flex flex-col gap-1 min-w-0">
                                            <div class="flex flex-wrap items-center gap-3 min-w-0">
                                                <span class="font-semibold sm:whitespace-nowrap">
                                                    Network Access:
                                                </span>

                                                <div class="flex flex-wrap gap-2 min-w-0" role="radiogroup"
                                                    aria-label="Network Access">
                                                    <!-- Local (false) -->
                                                    <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition
                border border-default bg-default hover:bg-well/40">
                                                        <input type="radio" name="link-access" :value="false"
                                                            :checked="usePublicBase === false"
                                                            @change="usePublicBase = false" class="h-4 w-4" />
                                                        <span class="text-sm truncate">
                                                            Share Locally (Over LAN)
                                                        </span>
                                                    </label>

                                                    <!-- External (true) -->
                                                    <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition
                 border border-default bg-default hover:bg-well/40">
                                                        <input type="radio" name="link-access" :value="true"
                                                            :checked="usePublicBase === true"
                                                            @change="usePublicBase = true" class="h-4 w-4" />
                                                        <span class="text-sm truncate">
                                                            Share Externally (Over Internet)
                                                        </span>
                                                    </label>
                                                </div>
                                            </div>

                                            <p class="text-xs text-muted">
                                                External sharing needs working port forwarding.
                                            </p>
                                        </div>
                                    </template>

                                    <template #accessExtra>
                                        <div v-if="usePublicBase" class="flex flex-col gap-3 min-w-0">
                                            <CheckPortForwarding :apiFetch="apiFetch"
                                                endpoint="/api/forwarding/check" :autoCheckOnMount="false"
                                                :showDetails="true" />
                                        </div>
                                    </template>

                                    <!-- Link Access row -->
                                    <template #after class="">
                                        <div class="border-t border-default mt-2 pt-2 min-w-0">
                                            <div data-tour="share-access-mode" class="ss-toned-panel min-w-0 p-3">
                                                <div class="font-semibold mb-2">Link Access Mode</div>
                                                <div class="grid grid-cols-3 gap-2 min-w-0">
                                                    <div>
                                                        <label
                                                            class="flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer">
                                                            <input type="radio" name="access-mode" value="open"
                                                                v-model="accessMode" class="mt-1" />
                                                            <span class="min-w-0">
                                                                <span class="font-semibold block">Anyone with the
                                                                    link</span>
                                                                <span class="text-xs text-muted block">No sign-in
                                                                    required.</span>
                                                            </span>
                                                        </label>

                                                        <label
                                                            class="flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer">
                                                            <input type="radio" name="access-mode" value="open_password"
                                                                v-model="accessMode" class="mt-1" />
                                                            <span class="min-w-0">
                                                                <span class="font-semibold block">Anyone with the link +
                                                                    password</span>
                                                                <span class="text-xs text-muted block">One shared
                                                                    password for everyone.</span>
                                                            </span>
                                                        </label>

                                                        <label
                                                            class="flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer">
                                                            <input type="radio" name="access-mode" value="restricted"
                                                                v-model="accessMode" class="mt-1" />
                                                            <span class="min-w-0">
                                                                <span class="font-semibold block">Only invited
                                                                    users</span>
                                                                <span class="text-xs text-muted block">Sign in with a
                                                                    user account. Permissions come from roles.</span>
                                                            </span>
                                                        </label>
                                                    </div>
                                                    <div
                                                        class="col-span-2 border-default min-w-0 p-3 border border-default rounded-md gap-2">
                                                        <div v-if="accessMode !== 'restricted'"
                                                            class="flex flex-wrap items-center gap-3 min-w-0">
                                                            <label class="font-semibold sm:whitespace-nowrap">Allow
                                                                comments</label>
                                                            <Switch id="allow-comments-switch"
                                                                v-model="allowOpenComments" :class="[
                                                                    allowOpenComments ? 'bg-secondary' : 'bg-well',
                                                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                                ]">
                                                                <span class="sr-only">Toggle comments</span>
                                                                <span aria-hidden="true" :class="[
                                                                    allowOpenComments ? 'translate-x-5' : 'translate-x-0',
                                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                                ]" />
                                                            </Switch>
                                                            <span class="text-xs text-muted">{{ allowOpenComments ?
                                                                'Visitors can leave a name and a comment.' : 'Comments are disabled.'}}</span>
                                                        </div>
                                                        <div v-if="accessMode === 'open_password'"
                                                            class="flex flex-col gap-2 min-w-0 mt-1">
                                                            <div class="flex flex-row gap-6 items-center text-center">
                                                                <label
                                                                    class="text-default font-semibold sm:whitespace-nowrap">Link
                                                                    password</label>
                                                                <p class="text-xs text-muted">Share this password with
                                                                    anyone
                                                                    you want to access the link.</p>
                                                            </div>

                                                            <div class="relative flex items-center min-w-0 w-full">
                                                                <input :type="showPassword ? 'text' : 'password'"
                                                                    v-model.trim="password"
                                                                    placeholder="Enter a password"
                                                                    class="input-textlike border rounded px-3 py-2 w-full pr-10 min-w-0" />
                                                                <button type="button"
                                                                    @click="showPassword = !showPassword"
                                                                    class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                                                                    <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                                                    <EyeSlashIcon v-else class="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                          
                                                            <p v-if="!password" class="text-sm text-red-500">
                                                                Password is required when protection is enabled.
                                                            </p>
                                                        </div>

                                                        <div v-if="accessMode === 'restricted'"
                                                            class="flex flex-col gap-2 min-w-0">
                                                            <p class="text-xs text-muted">
                                                                Invited users sign in with their own username and
                                                                password.
                                                                Roles control download and comment permissions.
                                                            </p>
                                                            <button type="button" class="btn btn-primary"
                                                                @click="openUserModal()">
                                                                {{ accessCount ? 'Manage invited users' : 'Invite users…' }}
                                                                <span v-if="accessCount"
                                                                    class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default text-default">
                                                                    {{ accessCount }}
                                                                </span>
                                                            </button>
                                                            <p class="text-xs opacity-70">Roles control permissions.</p>
                                                            <p v-if="!accessSatisfied" class="text-sm text-red-500">
                                                                Add at least one user to continue.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div class="col-span-3 grid grid-cols-3">
                                                        <p class="mx-auto text-xs text-success">
                                                            Access:
                                                            {{
                                                                accessMode === 'open'
                                                                    ? 'Anyone with the link'
                                                                    : accessMode === 'open_password'
                                                                        ? 'Anyone with the link + password'
                                                                        : 'Invited users only'
                                                            }}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                 
                                        <!-- Advanced Video Options -->
                                        <div v-if="hasVideoSelected || tourSpoofing" data-tour="share-advanced-video" class="border-t border-default mt-2 pt-2 min-w-0">
                                            <Disclosure v-slot="{ open }" as="div" :defaultOpen="true"
                                                class="ss-toned-panel min-w-0">
                                                <DisclosureButton
                                                    class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left min-w-0 rounded-md">
                                                    <div class="min-w-0">
                                                        <p class="font-semibold">Video options</p>
                                                        <p class="text-xs text-muted truncate">
                                                            <span v-if="usingExistingProxy">Existing review copies found.</span>
                                                            <span v-else>Review copies will be generated after upload.</span>
                                                            <span v-if="watermarkEnabled"> · Watermark enabled.</span>
                                                        </p>
                                                    </div>
                                                    <ChevronDownIcon class="h-5 w-5 text-muted transition-transform duration-200"
                                                        :class="open ? 'rotate-180' : ''" />
                                                </DisclosureButton>
                                                <DisclosurePanel class="border-t border-default px-3 py-2.5 min-w-0 rounded-b-md">
                                                    <div class="grid grid-cols-3 gap-4 items-start">
                                                        <!-- Review Copies -->
                                                        <div class="rounded-md p-2.5 min-w-0">
                                                            <label class="font-semibold block mb-2">Review Copies</label>

                                                            <div v-if="canTranscodeSelected && preflightProxyBlocked"
                                                                class="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                                                {{ proxyBlockReason }}
                                                            </div>

                                                            <div class="flex flex-wrap gap-x-3 gap-y-2">
                                                                <label class="inline-flex items-center gap-2 text-sm">
                                                                    <input type="checkbox" class="proxy-quality-checkbox" value="720p"
                                                                        v-model="proxyQualities" />
                                                                    <span>720p</span>
                                                                </label>
                                                                <label class="inline-flex items-center gap-2 text-sm">
                                                                    <input type="checkbox" class="proxy-quality-checkbox" value="1080p"
                                                                        v-model="proxyQualities" />
                                                                    <span>1080p</span>
                                                                </label>
                                                                <label class="inline-flex items-center gap-2 text-sm">
                                                                    <input type="checkbox" class="proxy-quality-checkbox" value="original"
                                                                        v-model="proxyQualities" />
                                                                    <span>Full Res</span>
                                                                </label>
                                                            </div>
                                                            <div class="text-xs text-slate-400 mt-2">
                                                                Lightweight MP4s for downloading &amp; offline review. A browser stream is always generated separately. The original file is always preserved.
                                                            </div>
                                                        </div>

                                                        <!-- Watermark Videos -->
                                                        <div class="col-span-2 rounded-md p-2.5 min-w-0">
                                                            <div v-if="hasVideoSelected"
                                                                class="flex flex-wrap items-center gap-2 mb-2">
                                                                <label class="font-semibold whitespace-nowrap">Watermark Videos:</label>
                                                                <Switch v-model="watermarkEnabled"
                                                                    :disabled="watermarkSwitchDisabled"
                                                                    :title="watermarkSwitchTitle" :class="[
                                                                        watermarkEnabled ? 'bg-secondary' : 'bg-well',
                                                                        watermarkSwitchDisabled ? 'opacity-50 cursor-not-allowed' : '',
                                                                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                                    ]">
                                                                    <span class="sr-only">Toggle video watermarking</span>
                                                                    <span aria-hidden="true" :class="[
                                                                        watermarkEnabled ? 'translate-x-5' : 'translate-x-0',
                                                                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                                    ]" />
                                                                </Switch>
                                                                <span class="text-sm truncate min-w-0 flex-1" :title="watermarkSwitchTitle">
                                                                    {{ watermarkEnabled ? (usingExistingWatermark ? 'Use existing watermark' : 'Apply watermark') : 'No watermark' }}
                                                                </span>
                                                            </div>
                                                            <div v-else class="text-sm text-muted">
                                                                Select a video to use watermark options.
                                                            </div>

                                                            <div v-if="hasVideoSelected && preflightWatermarkBlocked"
                                                                class="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                                                {{ watermarkBlockReason }}
                                                            </div>
                                                            <div v-if="hasVideoSelected && watermarkEnabled"
                                                                class="flex flex-wrap items-center gap-2 mb-2">
                                                                <button class="btn btn-secondary" @click="pickWatermark">
                                                                    {{ usingExistingWatermark ? 'Choose New Image' : 'Choose Image' }}
                                                                </button>
                                                                <span class="text-sm truncate min-w-0"
                                                                    :title="effectiveWatermarkName || (usingExistingWatermark ? 'Using existing watermark' : 'No image selected')">
                                                                    {{ effectiveWatermarkName || (usingExistingWatermark ? 'Using existing watermark' : 'No image selected') }}
                                                                </span>
                                                                <select
                                                                    v-model="selectedExistingWatermark"
                                                                    class="input-textlike border rounded px-2 py-1 text-sm min-w-[16rem]"
                                                                >
                                                                    <option value="">Select existing watermark file…</option>
                                                                    <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">
                                                                        {{ wm }}
                                                                    </option>
                                                                </select>
                                                                <button class="btn btn-secondary px-2 py-1 text-xs" @click="loadExistingWatermarkFiles">
                                                                    Refresh
                                                                </button>
                                                            </div>
                                                            <div v-if="hasVideoSelected && watermarkEnabled && !watermarkFile && !selectedExistingWatermark && !usingExistingWatermark"
                                                                class="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                                                Select a watermark image to continue.
                                                            </div>

                                                            <!-- Watermark preview -->
                                                            <div v-if="hasVideoSelected && watermarkEnabled && effectiveWatermarkPreviewUrl"
                                                                class="mt-2">
                                                                <div class="flex items-center justify-between gap-2 mb-1">
                                                                    <div class="text-xs text-slate-400">Preview (approximate)</div>
                                                                    <button v-if="watermarkFile"
                                                                        class="btn btn-danger"
                                                                        @click="clearWatermark">
                                                                        Clear Image
                                                                    </button>
                                                                </div>
                                                                <div
                                                                    class="relative aspect-video w-full max-w-[18rem] rounded-md border border-default bg-default/60 overflow-hidden">
                                                                    <div
                                                                        class="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60">
                                                                    </div>
                                                                    <img :src="effectiveWatermarkPreviewUrl"
                                                                        alt="Watermark preview"
                                                                        class="absolute bottom-3 right-3 max-h-[35%] max-w-[35%] opacity-70 drop-shadow-md" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </DisclosurePanel>
                                            </Disclosure>
                                        </div>
                                    </template>
                                </CommonLinkControls>
                            </div>

                            <AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :link="linkContext"
                                roleHint="view" :preselected="accessUsers.map(c => ({
                                    id: c.id,
                                    username: c.username || '',
                                    name: c.name,
                                    user_email: c.user_email,
                                    display_color: c.display_color,
                                    role_id: c.role_id ?? undefined,
                                    role_name: c.role_name ?? undefined,
                                }))" @apply="onApplyUsers" />
                            <ConfirmDeleteModal
                                v-model="outputsExistModalOpen"
                                :title="outputsConflictTitle"
                                :message="outputsConflictMessage"
                                confirmText="Overwrite"
                                cancelText="Generate Link"
                                :danger="false"
                                :closeIsCancel="false"
                                @confirm="onOutputsExistConfirm"
                                @cancel="onOutputsExistCancel"
                                @close="onOutputsExistClose"
                            />
                        </div>
                    </template>

                    <div v-if="projectSelected" class="flex flex-col min-w-0">
                        <div class="flex flex-wrap gap-2 w-full min-w-0">
                            <button class="btn btn-secondary" :disabled="loading" @click="resetAll">
                                Reset
                            </button>
                            <button data-tour="share-generate-btn" class="btn btn-primary flex-1 min-w-[14rem]" :disabled="!canGenerate || loading"
                                @click="generateLink" title="Create a Flow link with the selected options">
                                <span v-if="loading" class="inline-flex items-center gap-2">
                                    <span
                                        class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
                                    Generating…
                                </span>
                                <span v-else>Generate Flow link</span>
                            </button>
                        </div>
                        <div v-if="hasActiveTranscodeForSelection" class="text-xs text-amber-700 dark:text-amber-300 mt-2">
                            A transcode is already running for this selection. You can still generate a link and choose whether to overwrite or keep existing/in-progress outputs.
                        </div>
                        <div v-if="hasActiveUploadForSelection" class="text-xs text-amber-700 dark:text-amber-300 mt-2">
                            One or more selected files are still uploading. Wait for upload completion before creating a link (transcodes run after upload completes).
                        </div>

                        <div v-if="viewUrl" class="p-3 border rounded flex flex-col items-center mt-1 min-w-0">
                            <code class="max-w-full break-all">{{ viewUrl }}</code>
                            <div class="flex flex-wrap gap-2 mt-2">
                                <button class="btn btn-secondary" @click="copyLink">Copy</button>
                                <button class="btn btn-primary" @click="openInBrowser">Open</button>
                            </div>
                        </div>
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
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, inject } from 'vue'
import { useApi } from '../composables/useApi'
import FileExplorer from '../components/FileExplorer.vue'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { useProjectChoices } from '../composables/useProjectChoices'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import type { Commenter } from '../typings/electron'
import { useHeader } from '../composables/useHeader'
import { Disclosure, DisclosureButton, DisclosurePanel, Switch } from '@headlessui/vue'
import { ChevronDownIcon, EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { useResilientNav } from '../composables/useResilientNav';
import { useTransferProgress } from '../composables/useTransferProgress'
import { connectionMetaInjectionKey } from '../keys/injection-keys';
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'

const { to } = useResilientNav()
useHeader('Select Files to Share');
const transfer = useTransferProgress()
const connectionMeta = inject(connectionMetaInjectionKey)!
const ssh = connectionMeta.value.ssh
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

/** When true, conditionally-hidden tour targets (original quality, advanced video) are forced visible */
const tourSpoofing = ref(false)

const shareFilesTourSteps: TourStep[] = [
	{
		target: '[data-tour="share-project-selection"]',
		message: 'Welcome to File Sharing!\n\nFirst, select a project — this is a ZFS pool or a configured root directory on your server. It sets the base folder where you\'ll browse for files to share.',
	},
	{
		target: '[data-tour="share-file-browser"]',
		message: 'After selecting a project, the file browser opens here.\n\nBrowse folders and check the files you want to include in your share link. Selected files appear in a list below.',
	},
	{
		target: '[data-tour="file-browser-view-toggle"]',
		message: 'Toggle between List and Grid view.\n\nList view shows files in a compact tree layout. Grid view displays larger thumbnails with file type icons — great for browsing media folders.',
	},
	{
		target: '[data-tour="share-expiry"]',
		message: 'Set how long the link stays active.\n\nChoose a duration with the input fields or use the preset buttons (1 hour, 1 day, 1 week, or Never). After the link expires, it can no longer be accessed.',
	},
	{
		target: '[data-tour="share-link-title"]',
		message: 'Give your link an optional title.\n\nThis makes it easier to identify in the link management table on the dashboard. If left empty, a title is generated from the file names.',
	},
	{
		target: '[data-tour="share-network-access"]',
		message: 'Choose how the link is accessed on the network.\n\n"Share Locally" creates a link accessible over your LAN. "Share Externally" creates a public link, but requires port forwarding to be configured on your network.',
	},
	{
		target: '[data-tour="share-access-mode"]',
		message: 'Control who can access the link.\n\n• "Anyone with the link" — no sign-in needed.\n• "Anyone + password" — one shared password for all visitors.\n• "Only invited users" — each user signs in with their own account. Roles control download and comment permissions.',
	},
	{
		target: '[data-tour="share-advanced-video"]',
		message: 'When video files are selected, these advanced options appear.\n\n• Review Copies — generate 720p, 1080p, or full-res MP4s that recipients can download for offline review.\n• Watermark — overlay a logo or image on review copies to brand or protect your content.\n\nA browser-playable stream is always created automatically so recipients can watch immediately.',
		beforeShow: () => { tourSpoofing.value = true },
		cleanup: () => { tourSpoofing.value = false },
	},
	{
		target: '[data-tour="share-generate-btn"]',
		message: 'Once you\'ve selected files and configured options, click here to generate your secure Flow link.\n\nThe link will appear below — you can copy it to your clipboard or open it directly in your browser.',
	},
]

const { apiFetch } = useApi()
const linkContext = { type: 'download' as const }
// ================== Project selection state ==================
const projectSelected = ref(false)
const showEntireTree = ref(false)
const projectBase = ref<string>('')
const {
    detecting,
    detectError,
    projectRoots,
    browseMode,
    loadProjectChoices,
    currentRoot,
    forceProjectRoot,
    configuredProjectRoot,
    useConfiguredProjectRoot,
    hasConfiguredProjectRoot,
} = useProjectChoices(showEntireTree)
const rememberProjectAsDefault = ref(true)
const savingDefaultRoot = ref(false)
const showDefaultRootOption = computed(
    () =>
        !showEntireTree.value &&
        browseMode.value === 'roots' &&
        !forceProjectRoot.value &&
        !configuredProjectRoot.value,
)
const accessUsers = ref<Commenter[]>([])
type AccessMode = 'open' | 'open_password' | 'restricted'
const accessMode = ref<AccessMode>('open')
const allowOpenComments = ref(true)
const defaultAccessMode = ref<AccessMode>('open')
const defaultAllowOpenComments = ref(true)
const defaultUseProxyFiles = ref(false)
const accessCount = computed(() => accessUsers.value.length)
const protectWithPassword = computed({
    get: () => accessMode.value === 'open_password',
    set: (v: boolean) => {
        if (v) accessMode.value = 'open_password'
        else if (accessMode.value === 'open_password') accessMode.value = 'open'
    }
})
const accessSatisfied = computed(() => accessMode.value !== 'restricted' || accessCount.value > 0)
const linkTitle = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

function resetAll() {
    files.value = []
    showSelected.value = false
    expiresValue.value = 7
    expiresUnit.value = 'days'
    usePublicBase.value = defaultUsePublicBase.value
    linkTitle.value = ''
    accessUsers.value = []
    accessMode.value = defaultAccessMode.value
    allowOpenComments.value = defaultAllowOpenComments.value
    password.value = ''
    showPassword.value = false
    viewUrl.value = ''
    downloadUrl.value = ''
    error.value = null
    autoRegenerate.value = false
    transcodeProxy.value = false
    proxyQualities.value = ['original']
    watermarkEnabled.value = false
    watermarkFile.value = null
    overwriteExisting.value = false
    resetPreflightState()
    if (regenTimer) {
        clearTimeout(regenTimer)
        regenTimer = null
    }
}

async function chooseProject(dirPath: string) {
    void maybePersistDefaultProjectRoot(dirPath)
    projectBase.value = dirPath
    projectSelected.value = true
    // Optional: clear previously selected files when switching projects
    files.value = []
    invalidateLink()
}

async function maybePersistDefaultProjectRoot(dirPath: string) {
    if (!showDefaultRootOption.value) return
    if (!rememberProjectAsDefault.value) return
    if (savingDefaultRoot.value) return
    const normalized = ensureAbsDir(dirPath)
    if (!normalized) return
    savingDefaultRoot.value = true
    try {
        await apiFetch('/api/settings', {
            method: 'POST',
            body: JSON.stringify({
                projectRoot: normalized,
                forceProjectRoot: true,
            }),
        })
        configuredProjectRoot.value = normalized
        forceProjectRoot.value = true
        pushNotification(
            new Notification(
                'Default Share Root Saved',
                `Using ${normalized} as the default share root. Update this in Settings -> Project Root (Share / Upload).`,
                'success',
                8000
            )
        )
    } catch (e: any) {
        pushNotification(
            new Notification(
                'Could Not Save Default Share Root',
                e?.message || 'Project was selected, but the default share root could not be saved.',
                'warning',
                8000
            )
        )
    } finally {
        savingDefaultRoot.value = false
    }
}

// Allow going back to re-pick a project
function resetProject() {
    projectSelected.value = false
    projectBase.value = ''
    invalidateLink()
    files.value = []
    resetPreflightState()
    // Refresh choice list (honors current checkbox)
    loadProjectChoices()
}

const autoRegenerate = ref(false)
let regenTimer: ReturnType<typeof setTimeout> | null = null

const files = ref<string[]>([])
const showSelected = ref(false)
function clearAll() {
    files.value = []
    resetPreflightState()
    invalidateLink()
}

const usePublicBase = ref(false);
const defaultUsePublicBase = ref(false);
const externalHttpsPort = ref(443);

async function loadLinkDefaults() {
    try {
        const s = await apiFetch("/api/settings", { method: "GET" });
        const isInternal = (s?.defaultLinkAccess === "internal");
        defaultUsePublicBase.value = !isInternal;
        usePublicBase.value = defaultUsePublicBase.value;
        externalHttpsPort.value = Number(s?.externalHttpsPort ?? 443);
        const defaultRestrict = typeof s?.defaultRestrictAccess === 'boolean' ? s.defaultRestrictAccess : false;
        defaultAccessMode.value = defaultRestrict ? 'restricted' : 'open';
        defaultAllowOpenComments.value =
            typeof s?.defaultAllowComments === 'boolean' ? s.defaultAllowComments : true;
        defaultUseProxyFiles.value =
            typeof s?.defaultUseProxyFiles === 'boolean' ? s.defaultUseProxyFiles : true;

        accessMode.value = defaultAccessMode.value;
        allowOpenComments.value = defaultAllowOpenComments.value;
        transcodeProxy.value = true;
    } catch {
        // Keep current default if settings can't be loaded
        defaultUsePublicBase.value = false;
        usePublicBase.value = false;
        defaultAccessMode.value = 'open';
        defaultAllowOpenComments.value = true;
        defaultUseProxyFiles.value = false;
        accessMode.value = defaultAccessMode.value;
        allowOpenComments.value = defaultAllowOpenComments.value;
        transcodeProxy.value = true;
    }
}

let linkDefaultsLoaded = false;
watch(usePublicBase, (isExternal) => {
    if (isExternal && linkDefaultsLoaded) {
        const port = externalHttpsPort.value || 443;
        pushNotification(
            new Notification(
                'Port Forwarding Required',
                `External sharing requires port forwarding to your configured HTTPS port (${port}). You can change this port in Settings → URLs & Access.`,
                'info',
                8000
            )
        );
    }
});

function toAbsUnder(base: string, p: string) {
    // base: e.g. "/tank"
    const bName = (base || '').replace(/\/+$/, '').replace(/^\/+/, ''); // "tank"
    const clean = (p || '').replace(/^\/+/, '');                         // "tank/foo" or "foo"
    if (!bName) return '/' + clean;                                      // no project root picked

    // If the path already starts with the base name, don't duplicate it.
    if (clean === bName || clean.startsWith(bName + '/')) {
        return '/' + clean;                                                // "/tank/..."
    }
    return '/' + bName + '/' + clean;                                    // "/tank/foo"
}

function ensureAbsDir(raw: string) {
    let p = String(raw || '').trim().replace(/\\/g, '/')
    if (!p) return ''
    if (!p.startsWith('/')) p = `/${p}`
    return p.replace(/\/+$/, '') || '/'
}

// When FileExplorer emits @add, normalize relative paths to live under the chosen project (if restricted)
function onExplorerAdd(paths: string[]) {
    paths.forEach(p => {
        let full = p;
        if (!showEntireTree.value && projectBase.value) {
            // Always normalize to an absolute path under the chosen project root.
            full = toAbsUnder(projectBase.value, p);
        } else {
            // Ensure absolute (avoid accidental relative paths)
            full = p.startsWith('/') ? p : '/' + p.replace(/^\/+/, '');
        }
        if (!files.value.includes(full)) files.value.push(full);
    });
    invalidateLink();
    scheduleAutoRegen();
}

function onExplorerRemove(paths: string[]) {
    const removeSet = new Set(
        paths.map((p) => {
            if (!showEntireTree.value && projectBase.value) return toAbsUnder(projectBase.value, p);
            return p.startsWith('/') ? p : '/' + p.replace(/^\/+/, '');
        })
    );
    files.value = files.value.filter((f) => !removeSet.has(f));
    invalidateLink();
    scheduleAutoRegen();
}

function removeFile(i: number) {
    files.value.splice(i, 1)
    invalidateLink()
    scheduleAutoRegen()
}

watch(files, () => {
    // This catches adds/removes done outside the helpers (e.g., FileExplorer @add)
    invalidateLink()
    scheduleAutoRegen()
    schedulePreflight()
}, { deep: true })

function isVideoPath(path: string) {
    const ext = String(path || '').toLowerCase().split('.').pop() || ''
    return videoExts.has(ext)
}

function normServerPath(p: string) {
    return String(p || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/')
}

const canTranscodeSelected = computed(() =>
    files.value.length > 0 &&
    files.value.some(isVideoPath)
)

// const canTranscodeSelected = true;
watch(canTranscodeSelected, (ok) => {
    if (!ok) {
        transcodeProxy.value = false
    } else {
        transcodeProxy.value = true
        if (!proxyQualities.value.includes('original')) {
            proxyQualities.value = ['original']
        }
    }
})

watch(showEntireTree, (v) => {
    if (v) {
        // Bypass the project picker and jump straight to the normal file selector
        projectBase.value = '';          // no restriction
        projectSelected.value = true;    // show step 2
        resetPreflightState()
        invalidateLink();
    } else {
        // Return to ZFS pool selection
        projectSelected.value = false;
        projectBase.value = '';
        resetPreflightState()
        invalidateLink();
        loadProjectChoices().then(() => {
            if (useConfiguredProjectRoot.value && currentRoot.value) {
                chooseProject(currentRoot.value)
            }
        });
    }
});

watch(accessMode, (mode) => {
    if (mode !== 'open_password') {
        password.value = ''
        showPassword.value = false
    }
})

function extractJobInfoByVersion(
    data: any
): Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> {
    const map: Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> = {};
    const t = data?.transcodes;

    if (!Array.isArray(t)) return map;

    for (const rec of t as any[]) {
        const vId = Number(rec?.assetVersionId);
        if (!Number.isFinite(vId) || vId <= 0) continue;

        map[vId] = {
            queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
            activeKinds: Array.isArray(rec?.jobs?.activeKinds) ? rec.jobs.activeKinds : [],
            skippedKinds: Array.isArray(rec?.jobs?.skippedKinds) ? rec.jobs.skippedKinds : [],
        };
    }
    return map;
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


const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
// const maxDownloads = ref(5)

// password state
const password = ref('')
const showPassword = ref(false)

const viewUrl = ref('')
const downloadUrl = ref('')

const transcodeProxy = ref(false)

const proxyQualities = ref<string[]>(['original'])
const watermarkEnabled = ref(false)
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }
const watermarkFile = ref<LocalFile | null>(null)
const existingWatermarkFiles = ref<string[]>([])
const selectedExistingWatermark = ref('')
const existingWatermarkPreviewUrl = ref<string | null>(null)
const overwriteExisting = ref(false)
const preflightLoading = ref(false)
const preflightProxyBlocked = ref(false)
const preflightWatermarkBlocked = ref(false)
const preflightProxyExistingCount = ref(0)
const preflightWatermarkExistingCount = ref(0)
const preflightTranscodeInProgressCount = ref(0)
const preflightVideoCount = ref(0)
const lastPreflightNoticeKey = ref('')
let preflightTimer: ReturnType<typeof setTimeout> | null = null
let preflightReqSeq = 0

// HLS is generated server-side; no client flag needed

const videoExts = new Set([
    'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
    'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
    'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
    'r3d', 'braw', 'ari', 'cine', 'dav',
])
const hasVideoSelected = computed(() =>
    files.value.some(f => {
        const ext = String(f || '').toLowerCase().split('.').pop() || ''
        return videoExts.has(ext)
    })
)

const proxyBlockReason = computed(() => {
    if (!preflightProxyBlocked.value) return ''
    if (preflightTranscodeInProgressCount.value > 0) {
        return `A transcode is already in progress for ${preflightTranscodeInProgressCount.value} selected video(s). You can decide to overwrite or keep existing outputs when generating the link.`
    }
    return 'Review copy generation needs attention for this selection.'
})

const watermarkBlockReason = computed(() => {
    if (!preflightWatermarkBlocked.value) return ''
    if (preflightTranscodeInProgressCount.value > 0) {
        return `A transcode is already in progress for ${preflightTranscodeInProgressCount.value} selected video(s). You can decide to overwrite or keep existing outputs when generating the link.`
    }
    return 'Watermark generation needs attention for this selection.'
})

const allSelectedVideosHaveProxy = computed(() =>
    preflightVideoCount.value > 0 && preflightProxyExistingCount.value >= preflightVideoCount.value
)

const allSelectedVideosHaveWatermark = computed(() =>
    preflightVideoCount.value > 0 && preflightWatermarkExistingCount.value >= preflightVideoCount.value
)

const usingExistingProxy = computed(() =>
    !!transcodeProxy.value && allSelectedVideosHaveProxy.value
)

const usingExistingWatermark = computed(() =>
    !!watermarkEnabled.value && allSelectedVideosHaveWatermark.value && !watermarkFile.value
)

const effectiveWatermarkPreviewUrl = computed(() =>
    watermarkFile.value?.dataUrl || existingWatermarkPreviewUrl.value || null
)

const effectiveWatermarkName = computed(() => {
    if (watermarkFile.value) return watermarkFile.value.name
    if (selectedExistingWatermark.value) return selectedExistingWatermark.value.split('/').pop() || ''
    if (allSelectedVideosHaveWatermark.value && existingWatermarkFiles.value.length) {
        return existingWatermarkFiles.value[0].split('/').pop() || ''
    }
    return ''
})

const transcodeSwitchDisabled = computed(() =>
    !canTranscodeSelected.value || preflightLoading.value
)

const transcodeSwitchTitle = computed(() => {
    if (!canTranscodeSelected.value) return 'Only for Videos'
    if (preflightLoading.value) return 'Checking transcode status...'
    if (preflightProxyBlocked.value) return proxyBlockReason.value
    return ''
})

const watermarkSwitchDisabled = computed(() =>
    preflightLoading.value
)

const watermarkSwitchTitle = computed(() => {
    if (preflightLoading.value) return 'Checking transcode status...'
    if (preflightWatermarkBlocked.value) return watermarkBlockReason.value
    return watermarkEnabled.value ? 'Watermark is enabled' : 'Watermark is disabled'
})

function resetPreflightState() {
    preflightLoading.value = false
    preflightProxyBlocked.value = false
    preflightWatermarkBlocked.value = false
    preflightVideoCount.value = 0
    preflightProxyExistingCount.value = 0
    preflightWatermarkExistingCount.value = 0
    preflightTranscodeInProgressCount.value = 0
}

function schedulePreflight() {
    if (preflightTimer) clearTimeout(preflightTimer)
    preflightTimer = setTimeout(() => {
        void runPreflight()
    }, 250)
}

async function runPreflight() {
    const selected = files.value.slice()
    const videoSelected = selected.filter(isVideoPath)
    if (!videoSelected.length) {
        resetPreflightState()
        return
    }

    const seq = ++preflightReqSeq
    preflightLoading.value = true
    try {
        const body: any = videoSelected.length === 1
            ? { filePath: videoSelected[0] }
            : { filePaths: videoSelected }

        const data = await apiFetch('/api/magic-link/preflight', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 5 * 60 * 1000,
        })

        if (seq !== preflightReqSeq) return

        const summary = data?.summary || {}
        preflightVideoCount.value = Number(summary.videoCount || 0)
        preflightProxyBlocked.value = Number(summary.transcodeInProgressCount || 0) > 0
        preflightWatermarkBlocked.value = Number(summary.transcodeInProgressCount || 0) > 0
        preflightProxyExistingCount.value = Number(summary.proxyExistingCount || 0)
        preflightWatermarkExistingCount.value = Number(summary.watermarkExistingCount || 0)
        preflightTranscodeInProgressCount.value = Number(summary.transcodeInProgressCount || 0)

        const noticeKey = [
            videoSelected.slice().sort().join('|'),
            preflightProxyBlocked.value ? '1' : '0',
            preflightWatermarkBlocked.value ? '1' : '0',
            preflightProxyExistingCount.value,
            preflightWatermarkExistingCount.value,
            preflightTranscodeInProgressCount.value,
        ].join('::')

        if ((preflightProxyBlocked.value || preflightWatermarkBlocked.value) && noticeKey !== lastPreflightNoticeKey.value) {
            const msgParts: string[] = []
            if (preflightTranscodeInProgressCount.value > 0) {
                msgParts.push(`Transcode already in progress for ${preflightTranscodeInProgressCount.value} selected video(s).`)
                msgParts.push('You can keep configuring review copy/watermark options and choose overwrite vs keep existing when generating the link.')
            }
            const message = msgParts.length
                ? msgParts.join(' ')
                : 'Transcode status changed for the selected files.'
            if (!transfer.state.open) pushNotification(new Notification('Transcode In Progress', message, 'info', 7000, 'transcode-preflight'))
            lastPreflightNoticeKey.value = noticeKey
        } else if (!preflightProxyBlocked.value && !preflightWatermarkBlocked.value) {
            lastPreflightNoticeKey.value = ''
        }
    } catch {
        if (seq !== preflightReqSeq) return
        resetPreflightState()
    } finally {
        if (seq === preflightReqSeq) preflightLoading.value = false
    }
}

watch(transcodeProxy, (v) => {
    if (v && proxyQualities.value.length === 0) {
        proxyQualities.value = ['original']
    }
    if (!v) {
        proxyQualities.value = []
        watermarkEnabled.value = false
        watermarkFile.value = null
        overwriteExisting.value = false
    }
})



watch(files, () => {
    if (!hasVideoSelected.value) {
        transcodeProxy.value = false
        watermarkEnabled.value = false
        watermarkFile.value = null
    } else {
        transcodeProxy.value = true
        if (!proxyQualities.value.includes('original')) {
            proxyQualities.value = ['original']
        }
    }
}, { deep: true })

watch(selectedExistingWatermark, (v) => {
    if (String(v || '').trim()) {
        watermarkFile.value = null
        void fetchExistingWatermarkPreview(v)
    }
})

watch(watermarkEnabled, (enabled) => {
    if (enabled) void loadExistingWatermarkFiles()
    if (!enabled) {
        selectedExistingWatermark.value = ''
        existingWatermarkPreviewUrl.value = null
    }
})

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
    existingWatermarkPreviewUrl.value = null
    selectedExistingWatermark.value = ''
}

async function loadExistingWatermarkFiles() {
    try {
        const dirRel = resolveWatermarkDirRel()
        const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`, { method: 'GET' })
        const entries = Array.isArray(data?.entries) ? data.entries : []
        existingWatermarkFiles.value = entries
            .filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
            .map((e: any) => `${dirRel}/${String(e.name).trim()}`)
            .sort((a: string, b: string) => a.localeCompare(b))

        // Auto-load preview for first existing watermark when detected
        if (allSelectedVideosHaveWatermark.value && existingWatermarkFiles.value.length && !watermarkFile.value && !selectedExistingWatermark.value) {
            selectedExistingWatermark.value = existingWatermarkFiles.value[0]
            void fetchExistingWatermarkPreview(existingWatermarkFiles.value[0])
        }
    } catch {
        existingWatermarkFiles.value = []
    }
}

async function fetchExistingWatermarkPreview(relPath: string) {
    try {
        const base = connectionMeta.value.apiBase ?? ''
        const token = connectionMeta.value.token ?? ''
        const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(relPath)}`
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
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

function dirOfServerPath(p: string) {
    const clean = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '')
    if (!clean) return '/'
    const idx = clean.lastIndexOf('/')
    if (idx <= 0) return '/'
    return clean.slice(0, idx)
}

function rootOfServerPath(p: string) {
    const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (!clean) return '/'
    const first = clean.split('/').filter(Boolean)[0] || ''
    return first ? `/${first}` : '/'
}

function resolveWatermarkStorageRoot() {
    const base = String(projectBase.value || '').trim()
    const root = base || rootOfServerPath(files.value[0] || '')
    let abs = String(root || '/').replace(/\\/g, '/').trim()
    if (!abs) abs = '/'
    if (!abs.startsWith('/')) abs = '/' + abs
    abs = abs.replace(/\/+$/, '') || '/'
    const rel = abs === '/' ? '' : abs.replace(/^\/+/, '')
    return { abs, rel }
}

function resolveWatermarkDirRel() {
    const { rel } = resolveWatermarkStorageRoot()
    return rel ? `${rel}/.45flow/watermarks` : '.45flow/watermarks'
}

function resolveWatermarkUploadDir() {
    return `/${resolveWatermarkDirRel()}`
}

function resolveWatermarkRelPath() {
    const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (!name) return ''
    return `${resolveWatermarkDirRel()}/${name}`
}

function resolveWatermarkProjectRelPath() {
    const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (!name) return ''
    return `.45flow/watermarks/${name}`
}

function splitRelPath(relPath: string) {
    const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (!clean) return { dir: '', name: '' }
    const idx = clean.lastIndexOf('/')
    if (idx < 0) return { dir: '', name: clean }
    return {
        dir: clean.slice(0, idx),
        name: clean.slice(idx + 1),
    }
}

async function serverFileExists(relPath: string) {
    const { dir, name } = splitRelPath(relPath)
    if (!name) return false
    try {
        const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dir)}`, { method: 'GET' })
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

async function resolveExistingServerWatermarkRelPath() {
    const rooted = resolveWatermarkRelPath()
    const projectRel = resolveWatermarkProjectRelPath()
    const candidates = Array.from(new Set([rooted, projectRel].filter(Boolean)))
    for (const relPath of candidates) {
        if (await serverFileExists(relPath)) return relPath
    }
    return ''
}

function buildWatermarkFileCandidates() {
    const rooted = resolveWatermarkRelPath()
    const projectRel = resolveWatermarkProjectRelPath()
    const baseName = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    return Array.from(new Set([
        rooted,
        projectRel,
        baseName ? `.45flow/watermarks/${baseName}` : '',
        baseName,
    ].filter(Boolean)))
}

function parseApiErrorPayload(e: any) {
    if (typeof e?.payload === 'object' && e.payload) return e.payload
    if (typeof e?.response === 'object' && e.response) return e.response
    if (typeof e?.data === 'object' && e.data) return e.data
    if (typeof e?.message === 'string' && e.message.trim()) {
        try {
            return JSON.parse(e.message)
        } catch {
            return null
        }
    }
    return null
}

function isWatermarkMissingError(e: any) {
    const payload = parseApiErrorPayload(e)
    const code = String(payload?.error || '')
    if (/watermark.*not[_\s-]*found/i.test(code)) return true
    const msg = String(e?.message || e?.error || '')
    return /watermark.*not[_\s-]*found/i.test(msg)
}

async function uploadWatermarkToProject() {
    if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }
    const host = ssh?.server
    const user = ssh?.username
    if (!host || !user) return { ok: false, error: 'missing ssh connection info' }

    const existingRelPath = await resolveExistingServerWatermarkRelPath()
    if (existingRelPath) {
        return { ok: true, relPath: existingRelPath, reused: true }
    }

    const destDir = resolveWatermarkUploadDir()
    const ensured = await ensureServerDirExists(destDir)
    if (!ensured) return { ok: false, error: 'failed to prepare remote watermark directory' }
    const { done } = await window.electron.rsyncStart({
        host,
        user,
        src: watermarkFile.value.path,
        destDir,
        port: 22,
        keyPath: undefined,
        noIngest: true,
    })
    const res = await done
    if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' }
    return { ok: true, relPath: resolveWatermarkRelPath(), reused: false }
}

// Map units → seconds
const UNIT_TO_SECONDS = {
    hours: 60 * 60,
    days: 24 * 60 * 60,
    weeks: 7 * 24 * 60 * 60,
} as const


// Compute the seconds value we send to the server
const expiresSec = computed(() => {
    const raw = Math.floor(expiresValue.value || 0);

    // 0 → Never
    if (raw <= 0) return 0;

    return raw * UNIT_TO_SECONDS[expiresUnit.value];
});


// Pretty text like "3 days" / "2 weeks"
const prettyExpiry = computed(() => {
    if (expiresSec.value === 0) return 'Never';

    const v = Math.max(1, Math.floor(expiresValue.value || 0));
    const u = expiresUnit.value;
    const label = v === 1 ? u.slice(0, -1) : u;
    return `${v} ${label}`;
});

const canGenerate = computed(() =>
    files.value.length > 0 &&
    Number.isFinite(expiresValue.value) &&
    expiresValue.value >= 0 && // 0 = never, >=1 = normal
    (!protectWithPassword.value || !!password.value) &&
    accessSatisfied.value &&
    (!hasVideoSelected.value || proxyQualities.value.length > 0) &&
    (!watermarkEnabled.value || !!watermarkFile.value || !!selectedExistingWatermark.value || usingExistingWatermark.value) &&
    !hasActiveUploadForSelection.value
);

function hasRequestedExistingOutputs() {
    if (!hasVideoSelected.value) return false
    if (watermarkEnabled.value && preflightTranscodeInProgressCount.value > 0) return true
    if (preflightProxyExistingCount.value > 0) return true
    if (watermarkEnabled.value && preflightWatermarkExistingCount.value > 0) return true
    return false
}

const outputsConflictTitle = computed(() =>
    preflightTranscodeInProgressCount.value > 0 ? 'Transcode In Progress' : 'Outputs Already Exist'
)

const outputsConflictMessage = computed(() => {
    if (preflightTranscodeInProgressCount.value > 0) {
        return `A transcode is already in progress for ${preflightTranscodeInProgressCount.value} selected video(s). Overwrite to restart output generation, or Generate Link to keep existing/in-progress outputs.`
    }
    return 'Outputs already exist for one or more files. Overwrite them?'
})

function sameSelection(a: string[], b: string[]) {
    if (a.length !== b.length) return false
    const aset = new Set(a)
    for (const v of b) if (!aset.has(v)) return false
    return true
}

const hasActiveTranscodeForSelection = computed(() => {
    const selected = files.value.slice()
    if (!selected.length) return false

    return transfer.state.tasks.some(t => {
        if (t.kind !== 'transcode') return false
        if (!['queued', 'running', 'unknown'].includes(t.status)) return false
        if (t.context?.source !== 'link') return false

        if (t.context?.file && selected.length === 1) {
            return t.context.file === selected[0]
        }
        if (Array.isArray(t.context?.files)) {
            return sameSelection(t.context.files, selected)
        }
        return false
    })
})

const hasActiveUploadForSelection = computed(() => {
    const selected = new Set(files.value.map(normServerPath))
    if (!selected.size) return false

    return transfer.state.tasks.some(t => {
        if (t.kind !== 'upload') return false
        if (!['queued', 'uploading'].includes(t.status)) return false
        if (t.context?.source !== 'upload') return false
        const uploadFile = normServerPath(String(t.context?.file || ''))
        if (!uploadFile) return false
        return selected.has(uploadFile)
    })
})

watch(hasActiveUploadForSelection, (active, wasActive) => {
    if (active && !wasActive && !transfer.state.open) {
        pushNotification(
            new Notification(
                'Upload In Progress',
                'Selected file is still uploading. Wait for upload and transcode completion before sharing.',
                'info',
                6000
            )
        )
    }
})

function invalidateLink() {
    viewUrl.value = ''
    downloadUrl.value = ''
}

function scheduleAutoRegen() {
    // avoid spamming the server if multiple mutations happen quickly
    if (regenTimer) clearTimeout(regenTimer)
    regenTimer = setTimeout(async () => {
        if (autoRegenerate.value && canGenerate.value) {
            await generateLink()
        }
    }, 350)
}


// Set preset helper
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
    expiresValue.value = v
    expiresUnit.value = u
}

function setNever() {
    expiresValue.value = 0;
    expiresUnit.value = 'hours';
}

type MagicLinkTranscode = {
    fileId?: string | number;
    assetVersionId?: string | number;
    jobs?: any;
};

function extractAssetVersionIdsFromMagicLinkResponse(data: any): number[] {
    const ids: number[] = [];
    const push = (v: any) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) ids.push(n);
    };

    const t = data?.transcodes;

    if (Array.isArray(t)) {
        for (const rec of t as MagicLinkTranscode[]) push(rec?.assetVersionId);
    } else if (t && typeof t === "object") {
        for (const k of Object.keys(t)) push((t as any)[k]?.assetVersionId);
    }

    return Array.from(new Set(ids));
}

function extractDbFileIdsFromMagicLinkResponse(data: any): number[] {
    const ids: number[] = [];
    const push = (v: any) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) ids.push(n);
    };

    const t = data?.transcodes;
    if (Array.isArray(t)) {
        for (const rec of t as MagicLinkTranscode[]) push(rec?.fileId);
    } else if (t && typeof t === "object") {
        for (const k of Object.keys(t)) push((t as any)[k]?.fileId);
    }

    // single-file response shape
    push(data?.file?.id);

    // collection response shape
    if (Array.isArray(data?.files)) {
        for (const f of data.files) push(f?.id);
    }

    return Array.from(new Set(ids));
}

function extractLinkTokenFromResponse(data: any): string {
    const direct = String(data?.token || data?.link?.token || '').trim()
    if (direct) return direct
    const u = String(data?.viewUrl || '').trim()
    if (!u) return ''
    try {
        const parsed = new URL(u)
        const parts = parsed.pathname.split('/').filter(Boolean)
        const idx = parts.findIndex(p => p.toLowerCase() === 'token')
        if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]).trim()
        return String(parts[parts.length - 1] || '').trim()
    } catch {
        return ''
    }
}

async function generateLink() {
    if (!canGenerate.value) {
        // Safety guard – normally prevented by disabled button
        pushNotification(
            new Notification(
                'Cannot Generate Link',
                'Please select at least one file and fix any validation errors before creating a link.',
                'denied',
                8000,
            )
        )
        return
    }

    if (watermarkEnabled.value) {
        if (!watermarkFile.value && !selectedExistingWatermark.value && !usingExistingWatermark.value) {
            pushNotification(
                new Notification(
                    'Watermark Image Required',
                    'Please choose a watermark image before creating a link (or use files that already have watermark outputs).',
                    'warning',
                    8000
                )
            )
            return
        }
    }

    if (protectWithPassword.value && !password.value) {
        pushNotification(
            new Notification(
                'Password Required',
                'Enter a password or turn off link password protection.',
                'warning',
                8000,
            )
        )
        return
    }

    loading.value = true
    error.value = null
    viewUrl.value = ''
    downloadUrl.value = ''

    let keepExistingOutputs = false
    let forceOverwrite = false

    if (hasRequestedExistingOutputs()) {
        const action = await confirmOutputsExistOverwrite()
        if (action === 'close') {
            loading.value = false
            return
        }
        if (action === 'overwrite') {
            if (watermarkEnabled.value && preflightWatermarkExistingCount.value > 0 && !watermarkFile.value?.name && !selectedExistingWatermark.value) {
                pushNotification(
                    new Notification(
                        'Watermark Image Required',
                        'Choose a new watermark image to overwrite existing watermark outputs.',
                        'warning',
                        8000
                    )
                )
                loading.value = false
                return
            }
            forceOverwrite = true
            overwriteExisting.value = true
        } else {
            keepExistingOutputs = true
            overwriteExisting.value = false
        }
    }

    const body: any = {
        expiresInSeconds: expiresSec.value,
        projectBase: projectBase.value || undefined,
        baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
        title: linkTitle.value || undefined,
    }

    if (files.value.length === 1) body.filePath = files.value[0]
    else body.filePaths = files.value.slice()

    if (accessMode.value === 'open_password' && password.value) {
        body.password = password.value
    }

    body.access_mode = accessMode.value === 'restricted' ? 'restricted' : 'open'
    body.auth_mode = accessMode.value === 'open_password' ? 'password' : 'none'
    if (accessMode.value !== 'restricted') {
        body.allow_comments = !!allowOpenComments.value
    }

    if (accessMode.value === 'restricted' && accessUsers.value.length) {
        (body as any).users = accessUsers.value.map(c => {
            const out: any = {}
            if (c.id != null) out.userId = c.id
            if (c.username) out.username = c.username
            if (c.user_email) out.user_email = c.user_email
            if (c.name) out.name = c.name
            if (c.role_id != null) out.roleId = c.role_id
            if (c.role_name) out.roleName = c.role_name
            return out
        })
    }

    body.generateReviewProxy = hasVideoSelected.value
    body.hls = hasVideoSelected.value
    if (hasVideoSelected.value) {
        body.proxyQualities = proxyQualities.value.length > 0 ? proxyQualities.value.slice() : ['original']
    }
    if (forceOverwrite || overwriteExisting.value) {
        body.overwrite = true
    }
    if (keepExistingOutputs) {
        body.keepExistingOutputs = true
    }
    const selectedServerWatermark = String(selectedExistingWatermark.value || '').trim()
    const useExistingWatermarkOnly =
        watermarkEnabled.value && !watermarkFile.value?.name && !selectedServerWatermark && usingExistingWatermark.value

    const keepExistingWatermark = keepExistingOutputs && watermarkEnabled.value && preflightWatermarkExistingCount.value > 0

    if (watermarkEnabled.value && (watermarkFile.value?.name || selectedServerWatermark) && !keepExistingWatermark) {
        body.watermark = true
        body.watermarkFile = selectedServerWatermark || resolveWatermarkRelPath() || watermarkFile.value!.name
        body.watermarkProxyQualities = proxyQualities.value.slice()
    } else if (useExistingWatermarkOnly || keepExistingWatermark) {
        body.watermark = true
        body.keepExistingOutputs = true
        body.allowExistingOutputs = true
        body.watermarkProxyQualities = proxyQualities.value.slice()
    }

    try {
        window.appLog?.info?.('share.create.request', {
            files: files.value.length,
            access_mode: body.access_mode,
            auth_mode: body.auth_mode,
            hasPassword: !!body.password,
            generateReviewProxy: !!body.generateReviewProxy,
            watermark: !!body.watermark,
            overwrite: !!body.overwrite,
            keepExistingOutputs: !!body.keepExistingOutputs,
        })
        if (watermarkEnabled.value && watermarkFile.value && !keepExistingWatermark && !selectedServerWatermark) {
            const up = await uploadWatermarkToProject()
            if (!up.ok) {
                pushNotification(
                    new Notification(
                        'Watermark Upload Failed',
                        up.error || 'Unable to upload the watermark image.',
                        'error',
                        8000
                    )
                )
                return
            }
            if ((up as any).relPath) body.watermarkFile = (up as any).relPath
        }

        // console.log('[magic-link] request body', JSON.stringify(body))
        let data: any
        const watermarkFileCandidates = buildWatermarkFileCandidates()
        const tryRequest = async () => {
            return apiFetch('/api/magic-link', {
                method: 'POST',
                body: JSON.stringify(body),
                timeoutMs: 5 * 60 * 1000,
            })
        }
        try {
            data = await tryRequest()
        } catch (e: any) {
            if (e?.status === 409) {
                let payload: any = null
                try { payload = JSON.parse(e?.message) } catch { }

                if (payload?.error === 'outputs_exist' || payload?.error === 'hls_exists') {
                    const action = await confirmOutputsExistOverwrite()
                    if (action === 'overwrite') {
                        overwriteExisting.value = true
                        body.overwrite = true
                        // console.log('[magic-link] retry with overwrite', JSON.stringify(body))
                        data = await tryRequest()
                    } else if (action === 'generate') {
                        body.keepExistingOutputs = true
                        body.overwrite = false
                        // console.log('[magic-link] retry keeping existing outputs', JSON.stringify(body))
                        data = await tryRequest()
                        pushNotification(
                            new Notification(
                                'Overwrite Canceled',
                                'Existing outputs were kept and the link was created.',
                                'info',
                                6000
                            )
                        )
                    } else {
                        // Closed the dialog; cancel flow.
                        return
                    }
                } else {
                    throw e
                }
            } else if (body.watermark && isWatermarkMissingError(e)) {
                const current = String(body.watermarkFile || '').trim()
                const fallback = watermarkFileCandidates.find((c) => c && c !== current) || ''
                if (!fallback) throw e
                body.watermarkFile = fallback
                data = await tryRequest()
            } else {
                throw e
            }
        }

        viewUrl.value = data.viewUrl
        downloadUrl.value = data.downloadUrl

        // Only apply overwrite for the retry; reset for subsequent requests
        overwriteExisting.value = false

        const wantsHls = hasVideoSelected.value
        if (transcodeProxy.value || wantsHls) {
            const versionIds = extractAssetVersionIdsFromMagicLinkResponse(data);
            const jobInfo = extractJobInfoByVersion(data)
            const unknownPolicy = body.keepExistingOutputs ? 'skipped' : 'queued'
            const hlsSplit = wantsHls
                ? filterVersionIdsByJobKind(versionIds, jobInfo, 'hls', unknownPolicy)
                : { queued: [] as number[], active: [] as number[], skipped: [] as number[] }
            const proxySplit = transcodeProxy.value
                ? filterVersionIdsByJobKind(versionIds, jobInfo, 'proxy_mp4', unknownPolicy)
                : { queued: [] as number[], active: [] as number[], skipped: [] as number[] }
            const hlsTrackSet = new Set<number>([...hlsSplit.queued, ...hlsSplit.active])
            const proxyTrackSet = new Set<number>([...proxySplit.queued, ...proxySplit.active])
            const hlsQueuedSet = new Set<number>(hlsSplit.queued)
            const hlsActiveSet = new Set<number>(hlsSplit.active)
            const proxyQueuedSet = new Set<number>(proxySplit.queued)
            const proxyActiveSet = new Set<number>(proxySplit.active)

            const transcodeDetail = (kind: 'hls' | 'proxy_mp4', assetVersionId: number) => {
                const queuedSet = kind === 'hls' ? hlsQueuedSet : proxyQueuedSet
                const activeSet = kind === 'hls' ? hlsActiveSet : proxyActiveSet
                const kindLabel = kind === 'hls' ? 'HLS' : 'review copy'
                if (activeSet.has(assetVersionId)) return `Tracking ${kindLabel} (already running)`
                if (queuedSet.has(assetVersionId)) return `Tracking ${kindLabel} (queued now)`
                return `Tracking ${kindLabel}`
            }

            if (versionIds.length) {
                const groupId = `link:${data.viewUrl}`;
                const fileRecords = Array.isArray(data?.files) ? data.files : [];
                const started = new Set<number>();
                const token = extractLinkTokenFromResponse(data)

                const getFileLabel = (rec: any) =>
                    rec?.name || rec?.relPath || rec?.path || rec?.p || 'File';

                if (fileRecords.length) {
                    for (const rec of fileRecords) {
                        const recPath = String(rec?.path || rec?.relPath || rec?.p || rec?.name || '')
                        if (!isVideoPath(recPath)) continue
                        const assetVersionId = Number(
                            rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id
                        );
                        if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) continue;
                        if (!versionIds.includes(assetVersionId)) continue;
                        const shouldTrackHls = wantsHls && hlsTrackSet.has(assetVersionId)
                        const shouldTrackProxy = transcodeProxy.value && proxyTrackSet.has(assetVersionId)
                        if (!shouldTrackHls && !shouldTrackProxy) continue

                        started.add(assetVersionId);
                        const context = {
                            source: 'link' as const,
                            groupId,
                            linkUrl: data.viewUrl,
                            linkTitle: linkTitle.value || undefined,
                            file: rec?.path || rec?.relPath || rec?.p || rec?.name,
                            files: files.value.slice(),
                            proxyQualities: transcodeProxy.value ? proxyQualities.value.slice() : [],
                        }
                        const fileId = Number(rec?.id ?? rec?.fileId ?? rec?.file_id ?? rec?.file?.id)
                        const canUsePlayback = !!token && Number.isFinite(fileId) && fileId > 0 && accessMode.value === 'open'
                        const playbackPath = canUsePlayback
                            ? `/api/token/${encodeURIComponent(token)}/files/${encodeURIComponent(String(fileId))}/playback/${encodeURIComponent(String(assetVersionId))}?prefer=auto&audit=0`
                            : ''

                        if (shouldTrackHls && canUsePlayback) {
                            transfer.startPlaybackTranscodeTask({
                                title: `Transcoding: ${getFileLabel(rec)}`,
                                detail: transcodeDetail('hls', assetVersionId),
                                intervalMs: 1500,
                                jobKind: 'hls',
                                context,
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
                        } else if (shouldTrackHls) {
                            transfer.startAssetVersionTranscodeTask({
                                apiFetch,
                                assetVersionIds: [assetVersionId],
                                title: `Transcoding: ${getFileLabel(rec)}`,
                                detail: transcodeDetail('hls', assetVersionId),
                                intervalMs: 1500,
                                jobKind: 'hls',
                                context,
                            });
                        }

                        if (shouldTrackProxy) {
                            if (canUsePlayback) {
                                transfer.startPlaybackTranscodeTask({
                                    title: `Transcoding: ${getFileLabel(rec)}`,
                                    detail: transcodeDetail('proxy_mp4', assetVersionId),
                                    intervalMs: 1500,
                                    jobKind: 'proxy_mp4',
                                    context,
                                    fetchSnapshot: async () => {
                                        const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
                                        const j = payload?.transcodes?.proxy_mp4 || payload?.transcodes?.proxy || null
                                        return {
                                            status: j?.status ?? payload?.proxyStatus ?? payload?.status,
                                            progress: j?.progress ?? payload?.proxyProgress ?? 0,
                                            etaSeconds: j?.eta_seconds ?? null,
                                            speedX: j?.speed_x ?? null,
                                            qualityOrder: j?.quality_order ?? j?.qualityOrder ?? payload?.quality_order ?? payload?.qualityOrder,
                                            activeQuality: j?.active_quality ?? j?.activeQuality ?? payload?.active_quality ?? payload?.activeQuality,
                                            perQualityProgress: j?.per_quality_progress ?? j?.perQualityProgress ?? payload?.per_quality_progress ?? payload?.perQualityProgress,
                                        }
                                    }
                                })
                            } else {
                                transfer.startAssetVersionTranscodeTask({
                                    apiFetch,
                                    assetVersionIds: [assetVersionId],
                                    title: `Transcoding: ${getFileLabel(rec)}`,
                                    detail: transcodeDetail('proxy_mp4', assetVersionId),
                                    intervalMs: 1500,
                                    jobKind: 'proxy_mp4',
                                    context,
                                });
                            }
                        }
                    }
                }

                // Fallback: if version IDs exist but no per-file task could be started,
                // create an aggregate tracker so the Transfers panel still reflects server work.
                if (!started.size && (hlsTrackSet.size || proxyTrackSet.size)) {
                    const trackableVersionIds = Array.from(new Set([
                        ...hlsTrackSet,
                        ...proxyTrackSet,
                    ]))
                    for (const assetVersionId of trackableVersionIds) {
                        transfer.startAssetVersionTranscodeTask({
                            apiFetch,
                            assetVersionIds: [assetVersionId],
                            title: "Generating transcodes",
                            detail: `Tracking asset version ${assetVersionId}`,
                            intervalMs: 1500,
                            jobKind: 'any',
                            context: {
                                source: 'link',
                                groupId: `link:${data.viewUrl}`,
                                linkUrl: data.viewUrl,
                                linkTitle: linkTitle.value || undefined,
                                files: files.value.slice(),
                                proxyQualities: transcodeProxy.value ? proxyQualities.value.slice() : [],
                            },
                        });
                    }
                }
            } else {
                // fallback (only if server didn't return transcodes for some reason)
                const fileIds = extractDbFileIdsFromMagicLinkResponse(data);

                if (fileIds.length && hasVideoSelected.value && !body.keepExistingOutputs) {
                    // NOTE: fileId polling can't separate proxy vs hls unless you also add jobKind support to summarize()
                    // If you want two rows even in fallback mode, you need the deterministic taskId approach or extend startTranscodeTask similarly.
                    for (const fileId of fileIds) {
                        transfer.startTranscodeTask({
                            apiFetch,
                            fileIds: [fileId],
                            title: "Generating transcodes",
                            detail: `Tracking file ${fileId}`,
                            intervalMs: 1500,
                        });
                    }

                    pushNotification(
                        new Notification(
                            "Transcode Tracking Limited",
                            "The server did not return asset version IDs, so progress tracking may be less detailed.",
                            "warning",
                            8000
                        )
                    );
                } else {
                    pushNotification(
                        new Notification(
                            "Transcode Generation Requested",
                            "Transcode generation was requested, but the server did not return tracking IDs.",
                            "warning",
                            8000
                        )
                    );
                }
            }
        }

        const label = usePublicBase.value ? 'external (Internet)' : 'local (LAN)'
        const titlePart = linkTitle.value ? ` for “${linkTitle.value}”` : ''

        pushNotification(
            new Notification(
                'Flow link Created',
                `A ${label} Flow link was created${titlePart}.`,
                'success',
                8000,
            )
        )
    } catch (e: any) {
        const msg = e?.message || e?.error || String(e)
        const level: 'error' | 'denied' =
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'
        window.appLog?.error('share.create.failed', {
            files: files.value.length,
            error: msg,
            status: e?.status,
            code: e?.code,
            requestId: e?.requestId,
        })
        error.value = msg

        pushNotification(
            new Notification(
                'Failed to Create Flow link',
                msg,
                level,
                8000,
            )
        )
    } finally {
        // Keep overwrite as a one-shot retry flag only.
        overwriteExisting.value = false
        loading.value = false
    }
}

onMounted(async () => {
    // Start tour early — don't wait for network fetches
    if (!onboarding.value.shareFilesTourDone) {
        setTimeout(() => {
            requestTour('share-files', shareFilesTourSteps, () => markDone('shareFilesTourDone'))
        }, 300)
    }

    await loadLinkDefaults();
    linkDefaultsLoaded = true;
    await loadProjectChoices();
    await loadExistingWatermarkFiles();
    if (useConfiguredProjectRoot.value && currentRoot.value) {
        chooseProject(currentRoot.value)
    }
})

async function copyLink() {
    if (!viewUrl.value) return
    await navigator.clipboard.writeText(viewUrl.value)
    window.appLog?.info('share.link.copied')
    pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000, 'clipboard-copy'))
}

function openInBrowser() {
    if (!viewUrl.value) return
    window.open(viewUrl.value, '_blank')

    pushNotification(
        new Notification(
            'Opening Link',
            'Flow link opened in your default browser.',
            'info',
            4000,
        )
    )
}


async function goBack() {
    to('dashboard');
}

const userModalOpen = ref(false)

function openUserModal() {
    userModalOpen.value = true
}

const outputsExistModalOpen = ref(false)
let outputsExistResolver: ((v: 'overwrite' | 'generate' | 'close') => void) | null = null

function confirmOutputsExistOverwrite(): Promise<'overwrite' | 'generate' | 'close'> {
    outputsExistModalOpen.value = true
    return new Promise(resolve => {
        outputsExistResolver = resolve
    })
}

function resolveOutputsExist(next: 'overwrite' | 'generate' | 'close') {
    if (outputsExistResolver) {
        outputsExistResolver(next)
        outputsExistResolver = null
    }
    outputsExistModalOpen.value = false
}

function onOutputsExistConfirm() {
    resolveOutputsExist('overwrite')
}

function onOutputsExistCancel() {
    resolveOutputsExist('generate')
}

function onOutputsExistClose() {
    resolveOutputsExist('close')
}

function makeKey(name?: string, user_email?: string, username?: string) {
    const u = (username ?? '').trim().toLowerCase()
    const e = (user_email ?? '').trim().toLowerCase()
    const n = (name ?? '').trim().toLowerCase()
    return (u || n) + '|' + e
}

function onApplyUsers(
    users: any[]
) {
    // Normalize the selection coming back from the modal
    const next = users.map(u => {
        const username = (u.username || '').trim()
        const name = (u.name || username).trim()
        const user_email = u.user_email?.trim() || undefined
        const display_color = u.display_color
        const key = makeKey(name, user_email, username)
        return {
            key,
            id: u.id,
            username,
            name,
            user_email,
            display_color,
            role_id: u.role_id ?? null,
            role_name: u.role_name ?? null,
        }
    })

    // Dedupe by key just in case
    const seen = new Set<string>()
    const dedup: typeof next = []
    for (const c of next) {
        if (seen.has(c.key)) continue
        seen.add(c.key)
        dedup.push(c)
    }

    // REPLACE (not merge): reflect exactly what's selected in the modal
    accessUsers.value = dedup

    invalidateLink()
    scheduleAutoRegen()
}

</script>