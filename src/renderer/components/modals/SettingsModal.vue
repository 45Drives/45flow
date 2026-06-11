<template>
    <div class="fixed inset-0 z-50">
        <div class="absolute inset-0 bg-black/60" @click="close" />

        <div class="absolute inset-0 flex items-center justify-center p-4">
            <div
                class="w-full max-w-5xl h-[min(36rem,calc(100vh-2rem))] rounded-lg border border-default bg-default shadow-2xl flex flex-col"
                @click.stop>

                <!-- Header -->
                <div class="flex items-center justify-between px-5 py-3 border-b border-default shrink-0" data-tour="settings-modal-header">
                    <div>
                        <h2 class="text-lg font-semibold text-default">45Flow Settings</h2>
                        <div class="text-xs text-accent mt-0.5">Adjust global settings for share links.</div>
                    </div>
                    <button class="btn btn-secondary" type="button" @click="close" :disabled="busy">Close</button>
                </div>

                <!-- Body: sidebar + content -->
                <div class="flex flex-1 min-h-0">
                    <!-- Sidebar nav -->
                    <nav class="w-44 shrink-0 border-r border-default py-3 overflow-y-auto" data-tour="settings-modal-nav">
                        <template v-for="group in navGroups" :key="group.label">
                            <p class="settings-nav-group-label">{{ group.label }}</p>
                            <button v-for="item in group.items" :key="item.key"
                                class="settings-nav-btn" :class="{ 'settings-nav-btn-active': activeSection === item.key }"
                                @click="activeSection = item.key">
                                {{ item.label }}
                            </button>
                        </template>
                    </nav>

                    <!-- Content -->
                    <div class="flex-1 overflow-y-auto px-5 py-4 text-left" data-tour="settings-modal-urls">

                        <!-- ═══ Link Sharing ══════════════════════════════════ -->
                        <template v-if="activeSection === 'sharing'">
                            <div class="divide-y divide-default">
                                <SettingRow label="Default Link Access" description="External uses your public domain or IP. Internal uses LAN or VPN routing.">
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm" :class="!defaultAccessIsExternal ? 'font-semibold' : 'opacity-60'">Internal</span>
                                        <Switch v-model="defaultAccessIsExternal" :class="[
                                            defaultAccessIsExternal ? 'bg-primary' : 'bg-well',
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                        ]">
                                            <span class="sr-only">Toggle link access</span>
                                            <span :class="[
                                                defaultAccessIsExternal ? 'translate-x-4' : 'translate-x-0',
                                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                            ]" />
                                        </Switch>
                                        <span class="text-sm" :class="defaultAccessIsExternal ? 'font-semibold' : 'opacity-60'">External</span>
                                    </div>
                                </SettingRow>
                            </div>

                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">External Share URL (Public)</p>
                            <div class="divide-y divide-default">
                                <SettingRow label="Auto-detect" description="Use the detected public WAN IP.">
                                    <Switch v-model="externalAuto" :disabled="busy" :class="[
                                        externalAuto ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle external auto-detect</span>
                                        <span :class="[
                                            externalAuto ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                                <SettingRow label="External base" description="Hostname or public IP only. No path. A domain requires a valid certificate.">
                                    <input v-model="externalBase" type="text" :disabled="busy || externalAuto"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="https://example.ddns.net" />
                                </SettingRow>
                                <SettingRow label="HTTPS port" description="Port users enter in their browser.">
                                    <input v-model.number="externalHttpsPort" type="number" min="1" max="65535" :disabled="busy"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-20 text-right" />
                                </SettingRow>
                            </div>

                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Internal Share URL (LAN / VPN)</p>
                            <div class="divide-y divide-default">
                                <SettingRow label="Auto-detect" description="Use the detected LAN IP.">
                                    <Switch v-model="internalAuto" :disabled="busy" :class="[
                                        internalAuto ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle internal auto-detect</span>
                                        <span :class="[
                                            internalAuto ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                                <SettingRow label="Internal base" description="Private IP or internal hostname.">
                                    <input v-model="internalBase" type="text" :disabled="busy || internalAuto"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="http://192.168.1.123" />
                                </SettingRow>
                            </div>

                            <!-- URL Preview -->
                            <div class="mt-5 rounded-lg border border-default bg-default/40 p-3 space-y-2">
                                <div class="text-xs font-semibold text-accent uppercase tracking-wide">URL Preview</div>
                                <div class="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <div class="text-xs text-accent">External</div>
                                        <div class="font-mono text-xs break-all mt-0.5">{{ externalPreview || '—' }}</div>
                                        <div v-if="externalAuto && externalEffectivePreview"
                                            class="mt-1 text-xs opacity-60 break-all">
                                            Detected: <span class="font-mono">{{ externalEffectivePreview }}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-accent">Internal</div>
                                        <div class="font-mono text-xs break-all mt-0.5">{{ internalPreview || '—' }}</div>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Default Link Options ══════════════════════════ -->
                        <template v-if="activeSection === 'linkOptions'">
                            <div class="divide-y divide-default">
                                <SettingRow label="Restrict access to users"
                                    description="New links will require user accounts by default.">
                                    <Switch v-model="defaultRestrictAccess" :disabled="busy" :class="[
                                        defaultRestrictAccess ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle restrict access</span>
                                        <span :class="[
                                            defaultRestrictAccess ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                                <SettingRow label="Allow comments on open links"
                                    description="Enable commenting for links accessible without sign-in.">
                                    <Switch v-model="defaultAllowComments" :disabled="busy" :class="[
                                        defaultAllowComments ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle allow comments</span>
                                        <span :class="[
                                            defaultAllowComments ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                                <SettingRow label="Generate review copies by default"
                                    description="Create streamable review copies of video files when sharing.">
                                    <Switch v-model="defaultUseProxyFiles" :disabled="busy" :class="[
                                        defaultUseProxyFiles ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle review copies</span>
                                        <span :class="[
                                            defaultUseProxyFiles ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                            </div>
                            
                            <!-- Default Watermark -->
                            <div class="mt-4 pt-4 border-t border-default">
                                <div class="px-1 py-2">
                                    <p class="font-semibold text-sm mb-3">Default Watermark</p>
                                    
                                    <div class="flex items-center gap-3 mb-3">
                                        <Switch v-model="defaultWatermarkEnabled" :disabled="busy" :class="[
                                            defaultWatermarkEnabled ? 'bg-primary' : 'bg-well',
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                        ]">
                                            <span class="sr-only">Toggle default watermark</span>
                                            <span :class="[
                                                defaultWatermarkEnabled ? 'translate-x-4' : 'translate-x-0',
                                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                            ]" />
                                        </Switch>
                                        <span class="text-sm text-default">Apply watermark to new video links</span>
                                    </div>
                                    
                                    <div v-if="defaultWatermarkEnabled" class="space-y-2">
                                        <div class="flex items-center gap-2 mb-2">
                                            <label class="inline-flex items-center gap-1.5 text-xs">
                                                <input type="checkbox" v-model="showDefaultWatermarksInSettings" class="rounded" />
                                                <span>Include 45Flow defaults</span>
                                            </label>
                                        </div>
                                        
                                        <div class="flex flex-row items-center gap-2 mb-2">
                                            <button class="btn btn-secondary text-xs" @click="pickDefaultWatermark">Browse…</button>
                                            <!-- <span class="text-sm truncate min-w-0" :title="defaultWatermarkName || 'No image selected'">
                                                {{ defaultWatermarkName || 'No image selected' }}
                                            </span> -->
                                            <select v-model="selectedExistingWatermark" @change="onSelectExistingWatermark"
                                                class="input-textlike border rounded px-2 py-1 text-xs min-w-[14rem]">
                                                <option value="">Select existing watermark…</option>
                                                <optgroup v-if="showDefaultWatermarksInSettings && defaultWatermarkPresets.length" label="45Flow Defaults">
                                                    <option v-for="preset in defaultWatermarkPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
                                                </optgroup>
                                                <optgroup v-if="existingWatermarkFiles.length" label="Server Watermarks">
                                                    <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
                                                </optgroup>
                                            </select>
                                            <button class="btn btn-secondary px-2 py-1 text-xs" @click="refreshWatermarks">Refresh</button>
                                        </div>
                                        
                                        <p v-if="!defaultWatermarkFile && !selectedExistingWatermark" class="text-xs text-amber-700 dark:text-amber-300">
                                            Select a watermark image to continue.
                                        </p>
                                        
                                        <!-- Watermark Customizer (premium feature) -->
                                        <div v-if="defaultWatermarkFile || selectedExistingWatermark" class="mt-4 border-t border-default pt-4 min-w-0">
                                            <WatermarkCustomizer 
                                                v-model="watermarkSettings"
                                                :watermarkPreviewUrl="effectiveWatermarkPreviewUrl"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <p class="text-xs text-accent mt-3">
                                These defaults apply when creating new links and can be changed per link.
                            </p>
                        </template>

                        <!-- ═══ Project Root ══════════════════════════════════ -->
                        <template v-if="activeSection === 'project'">
                            <div class="divide-y divide-default">
                                <SettingRow label="Force project root" description="Ignore ZFS pools and use project root by default.">
                                    <Switch v-model="forceProjectRoot" :disabled="busy" :class="[
                                        forceProjectRoot ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle force project root</span>
                                        <span :class="[
                                            forceProjectRoot ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                            </div>

                            <div class="mt-4">
                                <label class="block text-sm font-medium text-default mb-1">Project root path</label>
                                <PathInput
                                    v-model="projectRoot"
                                    :apiFetch="apiFetch"
                                    :dirsOnly="true"
                                />
                                <div class="text-xs text-accent mt-1">
                                    Absolute path used as the default root when creating share/upload destinations.
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Application / Preferences ═════════════════════ -->
                        <template v-if="activeSection === 'app'">
                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Display</p>
                            <div class="divide-y divide-default">
                                <SettingRow label="Time format" description="How timestamps are displayed throughout the app.">
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm" :class="!hour12 ? 'font-semibold' : 'opacity-60'">24-hour</span>
                                        <Switch v-model="hour12" :class="[
                                            hour12 ? 'bg-primary' : 'bg-well',
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                        ]">
                                            <span class="sr-only">Toggle time format</span>
                                            <span :class="[
                                                hour12 ? 'translate-x-4' : 'translate-x-0',
                                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                            ]" />
                                        </Switch>
                                        <span class="text-sm" :class="hour12 ? 'font-semibold' : 'opacity-60'">12-hour</span>
                                    </div>
                                </SettingRow>
                            </div>

                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Performance</p>
                            <div class="divide-y divide-default">
                                <SettingRow 
                                    label="Client-side transcoding" 
                                    description="Process videos on this computer before uploading (uses your local CPU or GPU). This creates review copies faster and reduces load on the server. When disabled, the server handles all video processing after files are uploaded. Requires FFmpeg — works best with a modern GPU."
                                >
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm" :class="!clientTranscodeEnabled ? 'opacity-60' : 'font-semibold'">
                                            {{ clientTranscodeEnabled ? 'Enabled' : 'Disabled' }}
                                        </span>
                                        <Switch v-model="clientTranscodeEnabled" :class="[
                                            clientTranscodeEnabled ? 'bg-primary' : 'bg-well',
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                        ]">
                                            <span class="sr-only">Toggle client-side transcoding</span>
                                            <span :class="[
                                                clientTranscodeEnabled ? 'translate-x-4' : 'translate-x-0',
                                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                            ]" />
                                        </Switch>
                                    </div>
                                </SettingRow>
                                <SettingRow 
                                    label="Hardware Acceleration" 
                                    :description="`${hardwareCapabilities?.hardwareDescription || 'Detecting...'}`"
                                >
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm" :class="!hwAccelEnabled || !hardwareCapabilities?.hasHardwareAccel ? 'opacity-60' : 'font-semibold'">
                                            {{ hardwareCapabilities?.hasHardwareAccel 
                                                ? (hwAccelEnabled ? '✓ GPU' : '⚠ CPU only') 
                                                : '⚠ No GPU detected' }}
                                        </span>
                                        <Switch v-model="hwAccelEnabled" :class="[
                                            hwAccelEnabled ? 'bg-primary' : 'bg-well',
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                        ]" :disabled="!hardwareCapabilities?.hasHardwareAccel">
                                            <span class="sr-only">Toggle hardware acceleration</span>
                                            <span :class="[
                                                hwAccelEnabled ? 'translate-x-4' : 'translate-x-0',
                                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                            ]" />
                                        </Switch>
                                    </div>
                                </SettingRow>
                                <SettingRow 
                                    label="Encode Quality" 
                                    description="Fast: quicker encode, larger file. Balanced: good tradeoff. Quality: slower encode, best visual fidelity."
                                >
                                    <select v-model="transcodePreset" class="text-sm bg-well border border-default rounded px-2 py-1">
                                        <option value="fast">Fast</option>
                                        <option value="balanced">Balanced</option>
                                        <option value="quality">Quality</option>
                                    </select>
                                </SettingRow>
                                <SettingRow v-if="hardwareCapabilities?.probeResults"
                                    label="Detected Encoders"
                                    description="Encoders verified by test-encoding one frame on your hardware."
                                >
                                    <div class="flex flex-wrap gap-1.5">
                                        <span v-for="(ok, codec) in hardwareCapabilities.probeResults" :key="codec"
                                            class="text-xs px-1.5 py-0.5 rounded"
                                            :class="ok ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-default text-muted line-through opacity-50'"
                                        >{{ codec }}</span>
                                    </div>
                                </SettingRow>
                            </div>

                        </template>

                        <!-- ═══ Help ══════════════════════════════════════════ -->
                        <template v-if="activeSection === 'help'">
                            <div class="divide-y divide-default">
                                <SettingRow label="User Guide" description="Open the full 45Flow documentation in your browser.">
                                    <button
                                        class="btn btn-secondary text-sm px-3 py-1"
                                        type="button"
                                        @click="openUserGuide"
                                    >
                                        Open User Guide
                                    </button>
                                </SettingRow>
                            </div>

                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Guided Tours</p>
                            <div class="divide-y divide-default">
                                <SettingRow label="Disable guided tours" description="Turn off all onboarding walkthroughs and first-time guides.">
                                    <Switch v-model="toursDisabled" :class="[
                                        toursDisabled ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle guided tours</span>
                                        <span :class="[
                                            toursDisabled ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                                <SettingRow label="Re-enable guided tours" description="Reset onboarding walkthroughs so they show again on each page.">
                                    <button
                                        class="btn btn-secondary text-sm px-3 py-1"
                                        type="button"
                                        :disabled="busy || !anyOnboardingDone"
                                        @click="handleResetOnboarding"
                                    >
                                        Reset Tours
                                    </button>
                                </SettingRow>
                            </div>
                        </template>

                        <!-- ═══ SSL Certificate ═══════════════════════════════ -->
                        <template v-if="activeSection === 'certificate'">
                            <!-- Current status -->
                            <div class="rounded-lg border border-default bg-default/40 p-3 mb-4">
                                <div class="flex items-center gap-2 mb-2">
                                    <div class="text-xs font-semibold text-accent uppercase tracking-wide">Certificate Status</div>
                                    <span v-if="certStatus.certMode === 'letsencrypt' && certStatus.valid"
                                        class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                        Trusted
                                    </span>
                                    <span v-else
                                        class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                        Self-Signed
                                    </span>
                                </div>
                                <div class="text-sm space-y-1">
                                    <div v-if="certStatus.certMode === 'letsencrypt'">
                                        <span class="text-accent">Domain:</span>
                                        <span class="font-mono ml-1">{{ certStatus.certDomain }}</span>
                                    </div>
                                    <div v-if="certStatus.certMode === 'letsencrypt' && certStatus.certExpiry">
                                        <span class="text-accent">Expires:</span>
                                        <span class="ml-1">{{ formatCertExpiry(certStatus.certExpiry) }}</span>
                                        <span v-if="certStatus.daysRemaining != null" class="text-accent ml-1">({{ certStatus.daysRemaining }} days)</span>
                                    </div>
                                    <div v-if="certStatus.certMode === 'letsencrypt'">
                                        <span class="text-accent">Auto-renewal:</span>
                                        <span v-if="certStatus.renewalTimerActive"
                                            class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                            Active
                                        </span>
                                        <span v-else
                                            class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                            Inactive
                                        </span>
                                    </div>
                                    <div v-if="certStatus.certMode === 'self-signed'" class="text-accent text-xs mt-1">
                                        Browsers will show a security warning when clients open share links. Set up a trusted certificate below to fix this.
                                    </div>
                                </div>
                            </div>

                            <!-- Setup form -->
                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Set Up Trusted Certificate</p>

                            <div class="divide-y divide-default">
                                <SettingRow label="Domain" description="Your custom domain name (e.g. studio.yourcompany.com). Auto-synced from External Base if set.">
                                    <input v-model="certDomainInput" type="text" :disabled="certBusy"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="studio.yourcompany.com" />
                                </SettingRow>
                                <SettingRow label="Contact email" description="Let's Encrypt sends renewal notices here.">
                                    <input v-model="certEmailInput" type="text" :disabled="certBusy"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="admin@yourcompany.com" />
                                </SettingRow>
                            </div>

                            <!-- DNS Instructions -->
                            <div class="mt-4 rounded-lg border border-default bg-default/40 p-3">
                                <div class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">DNS Setup Instructions</div>
                                <div class="text-sm space-y-2">
                                    <p>Before obtaining a trusted certificate, you need a DNS A record pointing your domain to this server's public IP.</p>
                                    <div class="rounded border border-default overflow-hidden">
                                        <table class="w-full text-xs">
                                            <thead>
                                                <tr class="border-b border-default bg-well">
                                                    <th class="px-3 py-1.5 text-left font-semibold text-accent">Type</th>
                                                    <th class="px-3 py-1.5 text-left font-semibold text-accent">Name / Host</th>
                                                    <th class="px-3 py-1.5 text-left font-semibold text-accent">Value / Points To</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td class="px-3 py-1.5 font-mono">A</td>
                                                    <td class="px-3 py-1.5 font-mono">{{ dnsHostPart }}</td>
                                                    <td class="px-3 py-1.5 font-mono">{{ certStatus.wanIp || '(detecting...)' }}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <p class="text-xs text-accent">
                                        Create this record at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) under DNS settings.
                                        Propagation is usually instant but can take a few minutes.
                                    </p>
                                </div>
                            </div>

                            <!-- Action buttons -->
                            <div class="flex flex-wrap items-center gap-2 mt-4">
                                <button class="btn btn-secondary text-sm" type="button"
                                    @click="verifyDNS" :disabled="certBusy || !certDomainInput.trim()">
                                    <span v-if="certBusy && certStep === 'verify'">Verifying…</span>
                                    <span v-else>Verify DNS</span>
                                </button>
                                <button class="btn btn-success text-sm" type="button"
                                    @click="setupLetsEncrypt"
                                    :disabled="certBusy || !certDomainInput.trim() || !certEmailInput.trim() || !certDnsVerified">
                                    <span v-if="certBusy && certStep === 'setup'">Obtaining Certificate…</span>
                                    <span v-else>Install Trusted Certificate</span>
                                </button>
                                <button v-if="certStatus.certMode === 'letsencrypt'"
                                    class="btn btn-danger text-sm" type="button"
                                    @click="revertToSelfSigned" :disabled="certBusy">
                                    <span v-if="certBusy && certStep === 'revert'">Reverting…</span>
                                    <span v-else>Revert to Self-Signed</span>
                                </button>
                            </div>

                            <!-- Status messages -->
                            <div v-if="certDnsResult && !certDnsResult.ok" class="mt-3 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm">
                                <div class="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">DNS Not Ready</div>
                                <div class="text-yellow-700 dark:text-yellow-400">{{ certDnsResult.message }}</div>
                            </div>
                            <div v-if="certDnsVerified" class="mt-3 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-400">
                                DNS verified — {{ certDomainInput }} points to {{ certStatus.wanIp }}.
                            </div>
                            <div v-if="certError" class="text-danger text-sm mt-3">{{ certError }}</div>
                            <div v-if="certSuccessMsg" class="text-success text-sm mt-3">{{ certSuccessMsg }}</div>
                        </template>

                        <!-- ═══ Server Health ═════════════════════════════════ -->
                        <template v-if="activeSection === 'health'">
                            <p class="text-xs text-accent mb-3">
                                Live server resource stats from the connected broadcaster.
                            </p>

                            <div class="flex items-center gap-2 mb-4">
                                <button class="btn btn-secondary text-sm" type="button" @click="fetchHealth" :disabled="healthLoading">
                                    {{ healthLoading ? 'Loading…' : 'Refresh' }}
                                </button>
                            </div>

                            <div v-if="healthError" class="text-danger text-xs mb-3">{{ healthError }}</div>

                            <!-- Multi-server health display -->
                            <div v-if="serverHealthData.length" class="space-y-4">
                                <div v-for="(server, idx) in serverHealthData" :key="server.connection.connectionId" class="space-y-4">
                                    <!-- Server Header -->
                                    <div class="flex items-center gap-2 mb-2">
                                        <div class="text-sm font-semibold text-default">{{ server.connection.name }}</div>
                                        <div class="text-xs text-muted">{{ server.connection.serverIp }}</div>
                                        <div v-if="server.connection.isActive" class="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">Active</div>
                                    </div>
                                    
                                    <div v-if="server.error" class="text-danger text-xs">{{ server.error }}</div>
                                    
                                    <template v-else>
                                        <!-- License Status -->
                                        <div v-if="server.license" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">License Status</p>
                                            <div class="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span class="text-muted">Status:</span>
                                                    <span class="ml-1 font-mono">
                                                        <span v-if="server.license.licensed" class="text-green-500">Licensed</span>
                                                        <span v-else class="text-red-500">{{ server.license.needsActivation ? 'Not Activated' : 'Unlicensed' }}</span>
                                                    </span>
                                                </div>
                                                <div v-if="server.license.licensed && server.license.license">
                                                    <span class="text-muted">Type:</span>
                                                    <span class="ml-1 font-mono">{{ server.license.license.perpetual ? 'Perpetual' : 'Subscription' }}</span>
                                                </div>
                                                <div v-if="server.license.licensed && server.license.license && !server.license.license.perpetual && server.license.license.expiresAt" class="col-span-2">
                                                    <span class="text-muted">Expires:</span>
                                                    <span class="ml-1 font-mono">{{ new Date(server.license.license.expiresAt).toLocaleDateString() }}</span>
                                                </div>
                                            </div>

                                            <div v-if="!server.license.licensed && server.license.enforcement" class="mt-3 border-t border-default pt-3 space-y-2">
                                                <p class="text-xs text-accent">Enter a 45Flow license key to activate this server.</p>
                                                <div class="flex flex-wrap items-center gap-2">
                                                    <input
                                                        v-model="licenseKeyInputs[server.connection.connectionId]"
                                                        type="text"
                                                        class="input-textlike border border-default px-2 py-1 rounded text-sm min-w-[18rem]"
                                                        placeholder="Paste license key"
                                                        :disabled="!!licenseActivationBusy[server.connection.connectionId]"
                                                    />
                                                    <button
                                                        type="button"
                                                        class="btn btn-primary h-fit"
                                                        :disabled="!!licenseActivationBusy[server.connection.connectionId] || !String(licenseKeyInputs[server.connection.connectionId] || '').trim()"
                                                        @click="activateLicenseForServer(server)"
                                                    >
                                                        <span v-if="licenseActivationBusy[server.connection.connectionId]">Activating…</span>
                                                        <span v-else>Activate License</span>
                                                    </button>
                                                </div>
                                                <p v-if="licenseActivationError[server.connection.connectionId]" class="text-danger text-xs">
                                                    {{ licenseActivationError[server.connection.connectionId] }}
                                                </p>
                                                <p v-if="licenseActivationOk[server.connection.connectionId]" class="text-success text-xs">
                                                    {{ licenseActivationOk[server.connection.connectionId] }}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <!-- Uptime -->
                                        <div v-if="server.health" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Uptime</p>
                                            <div class="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span class="text-muted">Process:</span>
                                                    <span class="ml-1 font-mono">{{ formatUptime(server.health.uptime?.process) }}</span>
                                                </div>
                                                <div>
                                                    <span class="text-muted">System:</span>
                                                    <span class="ml-1 font-mono">{{ formatUptime(server.health.uptime?.system) }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- CPU -->
                                        <div v-if="server.health" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">CPU</p>
                                            <div class="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span class="text-muted">Cores:</span>
                                                    <span class="ml-1 font-mono">{{ server.health.cpu?.cores }}</span>
                                                </div>
                                                <div>
                                                    <span class="text-muted">Load (1/5/15m):</span>
                                                    <span class="ml-1 font-mono">{{ server.health.cpu?.loadAvg1?.toFixed(2) }} / {{ server.health.cpu?.loadAvg5?.toFixed(2) }} / {{ server.health.cpu?.loadAvg15?.toFixed(2) }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Memory -->
                                        <div v-if="server.health" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Memory</p>
                                            <div class="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span class="text-muted">System:</span>
                                                    <span class="ml-1 font-mono">{{ formatBytes(server.health.memory?.systemFree) }} free / {{ formatBytes(server.health.memory?.systemTotal) }}</span>
                                                </div>
                                                <div>
                                                    <span class="text-muted">Process RSS:</span>
                                                    <span class="ml-1 font-mono">{{ formatBytes(server.health.memory?.rss) }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </template>
                                    
                                    <!-- Separator between servers -->
                                    <div v-if="idx < serverHealthData.length - 1" class="border-t border-default mt-4 pt-4"></div>
                                </div>
                            </div>
                            
                            <!-- Legacy single-server display (fallback, hidden when multi-server data available) -->
                            <div v-if="!serverHealthData.length" class="space-y-4">
                                <!-- Uptime -->
                                <div class="rounded-lg border border-default bg-default/40 p-3">
                                    <p class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">No health data</p>
                                    <p class="text-xs text-muted">Click Refresh to load server health information.</p>
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Maintenance ═══════════════════════════════════ -->
                        <template v-if="activeSection === 'maintenance'">
                            <p class="text-xs text-accent mb-3">
                                Scan for orphaned transcode folders and missing-file metadata, then optionally apply cleanup.
                            </p>

                            <div class="divide-y divide-default">
                                <SettingRow label="Delete orphan transcode directories" description="Remove transcode output folders no longer linked to any file.">
                                    <Switch v-model="cleanupDeleteOrphans" :disabled="busy || cleanupBusy" :class="[
                                        cleanupDeleteOrphans ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle delete orphans</span>
                                        <span :class="[
                                            cleanupDeleteOrphans ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                                <SettingRow label="Prune missing source files" description="Remove database rows referencing files that no longer exist.">
                                    <Switch v-model="cleanupPruneMissingFiles" :disabled="busy || cleanupBusy" :class="[
                                        cleanupPruneMissingFiles ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle prune missing files</span>
                                        <span :class="[
                                            cleanupPruneMissingFiles ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                            </div>

                            <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Parameters</p>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="flex items-center justify-between gap-2 rounded-lg border border-default bg-default/40 px-3 py-2">
                                    <div class="text-sm text-default">Orphan min age</div>
                                    <div class="flex items-center gap-1">
                                        <input v-model.number="cleanupOrphanMinAgeHours" type="number" min="0" max="8760"
                                            :disabled="busy || cleanupBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-16 text-right" />
                                        <span class="text-xs text-accent">hrs</span>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between gap-2 rounded-lg border border-default bg-default/40 px-3 py-2">
                                    <div class="text-sm text-default">Max missing checks</div>
                                    <div class="flex items-center gap-1">
                                        <input v-model.number="cleanupMaxMissingFiles" type="number" min="1" max="5000"
                                            :disabled="busy || cleanupBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-16 text-right" />
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-wrap items-center gap-2 mt-4">
                                <button class="btn btn-secondary text-sm" type="button" @click="runCleanup(false)" :disabled="busy || cleanupBusy">
                                    <span v-if="cleanupBusy && cleanupMode === 'scan'">Scanning…</span>
                                    <span v-else>Run Scan</span>
                                </button>
                                <button class="btn btn-danger text-sm" type="button" @click="runCleanup(true)" :disabled="busy || cleanupBusy">
                                    <span v-if="cleanupBusy && cleanupMode === 'apply'">Applying…</span>
                                    <span v-else>Apply Cleanup</span>
                                </button>
                                <button class="btn btn-secondary text-sm" type="button" @click="exportCleanupReport" :disabled="!cleanupResult || cleanupBusy">
                                    Export JSON
                                </button>
                            </div>

                            <div v-if="cleanupError" class="text-danger text-xs mt-2">{{ cleanupError }}</div>

                            <div v-if="cleanupResult" class="mt-4 rounded-lg border border-default bg-default/40 p-3 text-xs space-y-2">
                                <div class="font-semibold">
                                    Last run: {{ cleanupResult.apply ? 'Applied changes' : 'Dry run' }}
                                </div>
                                <div v-if="cleanupLastRunAt" class="opacity-75">
                                    Ran at: {{ cleanupLastRunAtLabel }}
                                </div>
                                <div class="grid grid-cols-3 gap-2">
                                    <div>Transcode fixes: <span class="font-semibold">{{ cleanupTranscodeFixes.length }}</span></div>
                                    <div>Orphan dirs: <span class="font-semibold">{{ cleanupOrphanDirs.length }}</span></div>
                                    <div>Missing files: <span class="font-semibold">{{ cleanupMissingFiles.length }}</span></div>
                                </div>

                                <div v-if="cleanupOrphanDirs.length">
                                    <div class="font-semibold mb-1">Sample orphan dirs</div>
                                    <ul class="space-y-1">
                                        <li v-for="(d, i) in cleanupOrphanDirs.slice(0, 5)" :key="`orphan-${i}`" class="font-mono break-all">
                                            {{ d.dir || d.path || d }}
                                        </li>
                                    </ul>
                                </div>

                                <div v-if="cleanupMissingFiles.length">
                                    <div class="font-semibold mb-1">Sample missing files</div>
                                    <ul class="space-y-1">
                                        <li v-for="(m, i) in cleanupMissingFiles.slice(0, 5)" :key="`missing-${i}`" class="font-mono break-all">
                                            {{ m.abs || [m.rel_dir, m.filename].filter(Boolean).join('/') || m }}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </template>

                        <!-- ═══ White Label / Branding ═══════════════════════ -->
                        <template v-if="activeSection === 'branding'">
                            <div class="divide-y divide-default">
                                <SettingRow label="Enable custom branding" description="Apply your company name, logo, and brand colors to share and upload pages.">
                                    <Switch v-model="brandingEnabled" :disabled="brandingBusy" :class="[
                                        brandingEnabled ? 'bg-primary' : 'bg-well',
                                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                    ]">
                                        <span class="sr-only">Toggle custom branding</span>
                                        <span :class="[
                                            brandingEnabled ? 'translate-x-4' : 'translate-x-0',
                                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                        ]" />
                                    </Switch>
                                </SettingRow>
                            </div>

                            <template v-if="brandingEnabled">
                                <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Company Identity</p>
                                <div class="divide-y divide-default">
                                    <SettingRow label="Company name" description="Used in headers and link previews. Max 200 characters.">
                                        <input v-model="brandingCompanyName" type="text" :disabled="brandingBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                            placeholder="Your Company" maxlength="200" />
                                    </SettingRow>
                                </div>

                                <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Recipient Experience</p>
                                <p class="text-xs text-accent mb-3">Choose what recipients see on share and upload pages. When set, the theme picker will be hidden from them.</p>
                                <div class="divide-y divide-default">
                                    <SettingRow label="Recipient theme" description="Theme shown to recipients on link pages.">
                                        <div class="flex flex-col gap-2">
                                            <select v-model="brandingEnforcedTheme" :disabled="brandingBusy"
                                                class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                                                <option v-for="opt in brandingThemeOptions" :key="opt.id" :value="opt.id">
                                                    {{ opt.label }}
                                                </option>
                                            </select>
                                            <div v-if="brandingEnforcedTheme && brandingEnforcedTheme !== 'custom'" class="flex items-center gap-2">
                                                <span class="inline-block w-32 h-5 rounded-md border border-default"
                                                    :style="{ background: brandingThemeOptions.find(t => t.id === brandingEnforcedTheme)?.preview || '#888' }" />
                                                <span class="text-xs text-accent">{{ brandingSelectedThemeLabel }}</span>
                                            </div>
                                        </div>
                                    </SettingRow>
                                </div>
                                <p class="text-xs text-accent mt-2">When custom branding is enabled, recipients see your company branding with a small "Powered by 45Flow" attribution.</p>

                                <template v-if="brandingEnforcedTheme === 'custom'">
                                    <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Brand Colors</p>
                                    <p class="text-xs text-accent mb-3">Define your brand colors. These will be available as a "Custom" theme in your palette and can be shown to recipients.</p>
                                    <div class="divide-y divide-default">
                                        <SettingRow label="Primary brand color" description="Used for primary branded actions, highlights, and gradient start.">
                                            <div class="flex flex-col items-end">
                                                <div class="flex items-center gap-2">
                                                    <input :value="sanitizeHex(brandingCustomPrimary)" type="color" :disabled="brandingBusy"
                                                        class="w-8 h-8 rounded cursor-pointer border border-default"
                                                        @input="brandingCustomPrimary = ($event.target as HTMLInputElement).value" />
                                                    <input v-model="brandingCustomPrimary" type="text" :disabled="brandingBusy"
                                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-24 font-mono"
                                                        placeholder="#D92B2F" maxlength="7" />
                                                </div>
                                                <div class="mt-1.5">
                                                    <div v-if="brandingPrimaryContrastWarning" class="text-xs text-warning flex items-start gap-1.5">
                                                        <svg class="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                                        </svg>
                                                        <span>{{ brandingPrimaryContrastWarning }}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </SettingRow>
                                        <SettingRow label="Secondary brand color" description="Used for gradient end, borders, and supporting accents.">
                                            <div class="flex flex-col items-end">
                                                <div class="flex items-center gap-2">
                                                    <input :value="sanitizeHex(brandingCustomSecondary)" type="color" :disabled="brandingBusy"
                                                        class="w-8 h-8 rounded cursor-pointer border border-default"
                                                        @input="brandingCustomSecondary = ($event.target as HTMLInputElement).value" />
                                                    <input v-model="brandingCustomSecondary" type="text" :disabled="brandingBusy"
                                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-24 font-mono"
                                                        placeholder="#b02428" maxlength="7" />
                                                </div>
                                                <div class="mt-1.5">
                                                    <div v-if="brandingSecondaryContrastWarning" class="text-xs text-warning flex items-start gap-1.5">
                                                        <svg class="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                                        </svg>
                                                        <span>{{ brandingSecondaryContrastWarning }}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </SettingRow>
                                        <SettingRow label="Preview" description="Gradient from your two colors.">
                                            <span class="inline-block w-48 h-6 rounded-md border border-default"
                                                :style="{ background: brandingCustomPreview }" />
                                        </SettingRow>
                                    </div>
                                </template>

                                <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Company Logo</p>
                                <p class="text-xs text-accent mb-3">Replaces the 45Studio logo on link pages. Supports PNG, JPEG, SVG, and WebP. Max 2 MB. <br/><b>Recommended: transparent background, at least 200px tall.</b></p>
                                <div class="divide-y divide-default">
                                    <SettingRow label="Default logo" description="Shown on share and upload pages.">
                                        <div class="flex flex-col gap-2">
                                            <div class="flex items-center gap-2">
                                                <input ref="brandingLogoLightInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden"
                                                    @change="(e: Event) => onBrandingFileSelected('logo_light', e)" />
                                                <button class="btn btn-secondary text-xs px-2 py-1" type="button" :disabled="brandingBusy"
                                                    @click="brandingLogoLightInput?.click()">
                                                    {{ brandingLogoLight ? 'Replace' : 'Upload' }}
                                                </button>
                                                <button v-if="brandingLogoLight" class="btn btn-danger text-xs px-2 py-1" type="button" :disabled="brandingBusy"
                                                    @click="deleteBrandingLogo('logo_light')">
                                                    Remove
                                                </button>
                                            </div>
                                            <div v-if="brandingLogoLight && brandingLogoLightPreview" class="flex items-start gap-3 p-2 border border-default rounded bg-well/30">
                                                <img :src="brandingLogoLightPreview" alt="Logo preview" class="w-16 h-16 object-contain rounded border border-default bg-default" />
                                                <div class="flex-1 min-w-0 text-xs space-y-0.5">
                                                    <div v-if="brandingLogoLightInfo?.name" class="font-medium text-fg truncate">{{ brandingLogoLightInfo.name }}</div>
                                                    <div class="text-accent">
                                                        <span v-if="brandingLogoLightInfo?.width && brandingLogoLightInfo?.height">{{ brandingLogoLightInfo.width }} × {{ brandingLogoLightInfo.height }}px</span>
                                                        <span v-if="brandingLogoLightInfo?.size" class="ml-2">{{ (brandingLogoLightInfo.size / 1024).toFixed(1) }} KB</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else-if="!brandingLogoLight" class="text-xs text-accent">No logo uploaded</div>
                                        </div>
                                    </SettingRow>
                                    <SettingRow label="Use separate logo for dark backgrounds" description="Recommended if your default logo has poor contrast on dark backgrounds.">
                                        <Switch v-model="brandingSplitLogos" :disabled="brandingBusy" :class="[
                                            brandingSplitLogos ? 'bg-primary' : 'bg-well',
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors'
                                        ]">
                                            <span class="sr-only">Toggle split logos</span>
                                            <span :class="[
                                                brandingSplitLogos ? 'translate-x-4' : 'translate-x-0',
                                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-default shadow ring-0 transition-transform'
                                            ]" />
                                        </Switch>
                                    </SettingRow>
                                    <SettingRow v-if="brandingSplitLogos" label="Dark background logo" description="Shown when recipients use dark mode or dark themes.">
                                        <div class="flex flex-col gap-2">
                                            <div class="flex items-center gap-2">
                                                <input ref="brandingLogoDarkInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden"
                                                    @change="(e: Event) => onBrandingFileSelected('logo_dark', e)" />
                                                <button class="btn btn-secondary text-xs px-2 py-1" type="button" :disabled="brandingBusy"
                                                    @click="brandingLogoDarkInput?.click()">
                                                    {{ brandingLogoDark ? 'Replace' : 'Upload' }}
                                                </button>
                                                <button v-if="brandingLogoDark" class="btn btn-danger text-xs px-2 py-1" type="button" :disabled="brandingBusy"
                                                    @click="deleteBrandingLogo('logo_dark')">
                                                    Remove
                                                </button>
                                            </div>
                                            <div v-if="brandingLogoDark && brandingLogoDarkPreview" class="flex items-start gap-3 p-2 border border-default rounded bg-well/30">
                                                <img :src="brandingLogoDarkPreview" alt="Logo preview" class="w-16 h-16 object-contain rounded border border-default bg-default" />
                                                <div class="flex-1 min-w-0 text-xs space-y-0.5">
                                                    <div v-if="brandingLogoDarkInfo?.name" class="font-medium text-fg truncate">{{ brandingLogoDarkInfo.name }}</div>
                                                    <div class="text-accent">
                                                        <span v-if="brandingLogoDarkInfo?.width && brandingLogoDarkInfo?.height">{{ brandingLogoDarkInfo.width }} × {{ brandingLogoDarkInfo.height }}px</span>
                                                        <span v-if="brandingLogoDarkInfo?.size" class="ml-2">{{ (brandingLogoDarkInfo.size / 1024).toFixed(1) }} KB</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else-if="!brandingLogoDark" class="text-xs text-accent">No dark logo uploaded</div>
                                        </div>
                                    </SettingRow>
                                </div>

                                <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Support & Contact</p>
                                <p class="text-xs text-accent mb-3">Optional. Provide help resources for recipients viewing share and upload pages.</p>
                                <div class="divide-y divide-default">
                                    <SettingRow label="Support email" description="Shown on link pages and error states for recipient assistance.">
                                        <input v-model="brandingSupportEmail" type="email" :disabled="brandingBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                            placeholder="support@example.com" maxlength="200" />
                                    </SettingRow>
                                    <SettingRow label="Support URL" description="Link to help documentation or support portal.">
                                        <input v-model="brandingSupportUrl" type="url" :disabled="brandingBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                            placeholder="https://support.example.com" maxlength="500" />
                                    </SettingRow>
                                </div>

                                <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Link Previews</p>
                                <p class="text-xs text-accent mb-3">Customize how share links appear when pasted in Slack, Teams, or social media.</p>
                                <div class="divide-y divide-default">
                                    <SettingRow label="Link preview title" description="Defaults to company name if not set.">
                                        <input v-model="brandingLinkPreviewTitle" type="text" :disabled="brandingBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                            placeholder="Your Company - Secure File Sharing" maxlength="200" />
                                    </SettingRow>
                                    <SettingRow label="Link preview description" description="Short text shown in previews.">
                                        <input v-model="brandingLinkPreviewDescription" type="text" :disabled="brandingBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                            placeholder="Secure file review and collaboration" maxlength="500" />
                                    </SettingRow>
                                </div>

                                <p class="text-xs font-semibold text-accent uppercase tracking-wide mt-5 mb-2">Preview</p>
                                <p class="text-xs text-accent mb-3">How your branding will appear on recipient pages.</p>
                                <div class="flex gap-3 p-3 border border-default rounded bg-well/30">
                                    <!-- Protected Page Preview -->
                                    <div class="flex-1 min-w-0">
                                        <div class="text-xs font-medium text-accent mb-2">Protected Link</div>
                                        <div class="border border-default rounded bg-default p-2 text-xs space-y-1.5">
                                            <div class="flex items-center gap-1.5">
                                                <div v-if="brandingLogoLight && brandingLogoLightPreview" class="w-6 h-6 shrink-0">
                                                    <img :src="brandingLogoLightPreview" class="w-full h-full object-contain" alt="Logo" />
                                                </div>
                                                <div v-else class="w-6 h-6 shrink-0 bg-accent/20 rounded" />
                                                <div v-if="brandingCompanyName" class="font-medium truncate">{{ brandingCompanyName }}</div>
                                            </div>
                                            <div class="h-px bg-default" />
                                            <div class="text-[0.65rem] text-accent">This link is protected</div>
                                            <div class="h-4 bg-well rounded" />
                                            <div class="h-6 rounded" :style="{ background: brandingCustomPreview }">
                                                <div class="text-[0.65rem] text-white/90 text-center leading-6">Unlock</div>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Review Page Preview -->
                                    <div class="flex-1 min-w-0">
                                        <div class="text-xs font-medium text-accent mb-2">Review Page</div>
                                        <div class="border border-default rounded bg-default p-2 text-xs space-y-1.5">
                                            <div class="flex items-center justify-between gap-1.5">
                                                <div class="flex items-center gap-1.5 min-w-0">
                                                    <div v-if="brandingLogoLight && brandingLogoLightPreview" class="w-5 h-5 shrink-0">
                                                        <img :src="brandingLogoLightPreview" class="w-full h-full object-contain" alt="Logo" />
                                                    </div>
                                                    <div v-else class="w-5 h-5 shrink-0 bg-accent/20 rounded" />
                                                    <div v-if="brandingCompanyName" class="text-[0.65rem] truncate">{{ brandingCompanyName }}</div>
                                                </div>
                                                <div class="w-3 h-3 bg-accent/20 rounded-full shrink-0" />
                                            </div>
                                            <div class="aspect-video bg-well/50 rounded flex items-center justify-center">
                                                <div class="w-6 h-6 border-2 border-accent/30 rounded-full" />
                                            </div>
                                            <div class="h-5 rounded" :style="{ background: brandingCustomPreview }">
                                                <div class="text-[0.65rem] text-white/90 text-center leading-5">Download</div>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Upload Page Preview -->
                                    <div class="flex-1 min-w-0">
                                        <div class="text-xs font-medium text-accent mb-2">Upload Page</div>
                                        <div class="border border-default rounded bg-default p-2 text-xs space-y-1.5">
                                            <div class="flex items-center gap-1.5">
                                                <div v-if="brandingLogoLight && brandingLogoLightPreview" class="w-6 h-6 shrink-0">
                                                    <img :src="brandingLogoLightPreview" class="w-full h-full object-contain" alt="Logo" />
                                                </div>
                                                <div v-else class="w-6 h-6 shrink-0 bg-accent/20 rounded" />
                                                <div v-if="brandingCompanyName" class="font-medium truncate">{{ brandingCompanyName }}</div>
                                            </div>
                                            <div class="h-px bg-default" />
                                            <div class="border-2 border-dashed border-accent/30 rounded p-2 bg-well/30">
                                                <div class="text-[0.65rem] text-accent text-center">Drop files here</div>
                                            </div>
                                            <div class="h-5 rounded" :style="{ background: brandingCustomPreview }">
                                                <div class="text-[0.65rem] text-white/90 text-center leading-5">Browse</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2 mt-4">
                                    <button class="btn btn-danger text-sm" type="button" :disabled="brandingBusy" @click="clearBranding">
                                        <span v-if="brandingBusy">Clearing…</span>
                                        <span v-else>Clear Custom Branding</span>
                                    </button>
                                    <div class="text-xs text-accent">
                                        Reset all branding settings to 45Flow defaults and remove uploaded logos.
                                    </div>
                                </div>

                                <p class="text-xs text-accent mt-3">
                                    Changes apply immediately to all share and upload link pages. 45Flow attribution remains visible on link pages.
                                </p>
                            </template>
                        </template>

                    </div>
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between px-5 py-3 border-t border-default shrink-0">
                    <div class="min-w-0">
                        <div v-if="validationError" class="text-danger text-sm">{{ validationError }}</div>
                        <div v-else-if="saveError" class="text-danger text-sm">{{ saveError }}</div>
                        <div v-else-if="saveOk" class="text-success text-sm">Saved.</div>
                        <div v-else class="text-xs text-accent">New shares will use these settings automatically.</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-secondary" type="button" @click="reload" :disabled="busy">Reload</button>
                        <button class="btn btn-success" type="button" @click="save" :disabled="busy || !!validationError">
                            <span v-if="busy">Saving…</span>
                            <span v-else>Save Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<!-- Inline sub-components -->
<script lang="ts">
import { defineComponent, h } from 'vue';

const SettingRow = defineComponent({
    props: {
        label: { type: String, required: true },
        description: { type: String, default: '' },
    },
    setup(props, { slots }) {
        return () => h('div', { class: 'grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 items-start py-3' }, [
            h('div', { class: 'min-w-0' }, [
                h('div', { class: 'text-sm font-medium text-default' }, props.label),
                props.description
                    ? h('div', { class: 'text-xs text-accent mt-0.5' }, props.description)
                    : null,
            ]),
            h('div', { class: 'flex items-center gap-1 justify-end min-w-[160px]' }, slots.default?.()),
        ]);
    },
});
</script>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Switch } from "@headlessui/vue";
import { useApi } from "../../composables/useApi";
import { pushNotification, Notification } from '@45drives/houston-common-ui';
import PathInput from "../PathInput.vue";
import { useOnboarding } from "../../composables/useOnboarding";
import { useTimeFormat } from "../../composables/useTimeFormat";
import { useClientTranscode } from "../../composables/useClientTranscode";
import { useTourManager, type TourStep } from "../../composables/useTourManager";
import { useTourPreferences } from "../../composables/useTourPreferences";
import { appLog } from "../../composables/useLog";
import { useThemeFromAlias } from "../../composables/useThemeFromAlias";
import { useConnections } from "../../composables/useConnections";
import WatermarkCustomizer from "../WatermarkCustomizer.vue";
import type { WatermarkSettings } from "../../types/watermark";
import { createDefaultWatermarkSettings, DEFAULT_45FLOW_WATERMARKS } from "../../types/watermark";

const emit = defineEmits<{
    (e: "close"): void;
    (e: "saved", payload: {
        externalBaseCustom: string | null;
        externalBaseEffective: string | null;
        internalBase: string | null;
        externalHttpsPort: number;
        defaultLinkAccess: "external" | "internal";
        externalMode: "auto" | "custom";
        defaultRestrictAccess: boolean;
        defaultAllowComments: boolean;
        defaultUseProxyFiles: boolean;
        projectRoot: string | null;
        forceProjectRoot: boolean;
    }): void;
}>();

const { apiFetch, baseUrl, meta } = useApi();
const { onboarding, resetAll: resetOnboarding, markDone } = useOnboarding();
const { hour12 } = useTimeFormat();
const { enabled: clientTranscodeEnabled, preset: transcodePreset, hwAccel: hwAccelEnabled } = useClientTranscode();
const { requestTour } = useTourManager();
const { setCustomThemeColors, setCustomThemeEnabled } = useThemeFromAlias();
const { toursDisabled } = useTourPreferences();
const { connections } = useConnections();

const hardwareCapabilities = ref<any>(null);

onMounted(async () => {
	try {
		hardwareCapabilities.value = await window.electron.getTranscodeCapabilities();
		// If no hardware acceleration available, force the toggle off
		if (!hardwareCapabilities.value?.hasHardwareAccel && hwAccelEnabled.value) {
			hwAccelEnabled.value = false;
		}
	} catch (e) {
		console.warn('Failed to detect hardware capabilities:', e);
		hardwareCapabilities.value = {
			hasHardwareAccel: false,
			hardwareDescription: 'Detection failed',
		};
		// Force toggle off if detection failed
		if (hwAccelEnabled.value) {
			hwAccelEnabled.value = false;
		}
	}
});

const settingsTourSteps: TourStep[] = [
	{
		target: '[data-tour="settings-modal-header"]',
		message: 'Welcome to 45Flow Settings.\n\nThis is where you configure global options that affect all new links and server behavior.',
	},
	{
		target: '[data-tour="settings-modal-nav"]',
		message: 'Use the sidebar to navigate between sections.\n\n• URLs & Access — configure external/internal share URLs.\n• Project Root — set the default directory root.\n• Link Options — default access, comments, and review copy settings.\n• Preferences — time format settings.\n• Guides — user guide and guided tour settings.\n• Maintenance — clean up orphaned files and metadata.',
	},
	{
		target: '[data-tour="settings-modal-urls"]',
		message: 'Each section shows its settings here.\n\nRight now you\'re viewing URLs & Access — toggle between Internal and External link access, configure your public domain or auto-detect, and set the HTTPS port.\n\nClick "Save Settings" at the bottom when you\'re done.',
		beforeShow: () => { activeSection.value = 'sharing' },
	},
]

// ── Section navigation ──────────────────────────────────────────────────
type Section = 'sharing' | 'project' | 'app' | 'maintenance' | 'help' | 'certificate' | 'linkOptions' | 'branding' | 'health';
const activeSection = ref<Section>('sharing');

const navGroups = [
    {
        label: 'Link Sharing',
        items: [
            { key: 'sharing' as Section, label: 'URLs & Access' },
            { key: 'certificate' as Section, label: 'Certificate' },
            { key: 'linkOptions' as Section, label: 'Link Options' },
            { key: 'project' as Section, label: 'Project Root' },
        ],
    },
    {
        label: 'Branding',
        items: [
            { key: 'branding' as Section, label: 'White Label' },
        ],
    },
    {
        label: 'Application',
        items: [
            { key: 'app' as Section, label: 'Preferences' },
            { key: 'health' as Section, label: 'Server Health' },
            { key: 'maintenance' as Section, label: 'Maintenance' },
        ],
    },
    {
        label: 'Help',
        items: [
            { key: 'help' as Section, label: 'Guides' },
        ],
    },
];

onMounted(() => {
	if (!onboarding.value.settingsTourDone) {
		setTimeout(() => {
			requestTour('settings', settingsTourSteps, () => markDone('settingsTourDone'))
		}, 400)
	}
})

const anyOnboardingDone = computed(() =>
    Object.values(onboarding.value).some(v => v === true)
);

function handleResetOnboarding() {
    resetOnboarding();
    pushNotification(
        new Notification('Tours Reset', 'First-time guided tours have been re-enabled.', 'success', 5000)
    );
}

function openUserGuide() {
    window.open('https://github.com/45Drives/45flow-premium-dev/blob/main/docs/45Flow_User_Guide.md', '_blank', 'noopener,noreferrer');
}

const busy = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saveOk = ref(false);

const defaultLinkAccess = ref<"external" | "internal">("internal");

const defaultAccessIsExternal = computed({
    get: () => defaultLinkAccess.value === "external",
    set: (v: boolean) => {
        defaultLinkAccess.value = v ? "external" : "internal";
    },
});

const externalAuto = ref(false);
const internalAuto = ref(false);

// In the new API, this field represents the CUSTOM external base (when not auto)
const externalBase = ref<string>("");
const internalBase = ref<string>("");

const externalHttpsPort = ref<number>(443);
const savedHttpsPort = ref<number>(443);
const savedExternalAuto = ref(false);
const savedExternalBase = ref("");

const defaultRestrictAccess = ref(false);
const defaultAllowComments = ref(true);
const defaultUseProxyFiles = ref(false);
const defaultWatermarkEnabled = ref(false);
const defaultWatermarkId = ref('');
const availableWatermarks = ref<string[]>([]);
const defaultWatermarkPreview = ref<string | null>(null);
const showDefaultWatermarksInSettings = ref(true);
const defaultWatermarkPresets = ref<Array<{ id: string; name: string; path?: string }>>([]);
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null };
const defaultWatermarkFile = ref<LocalFile | null>(null);
const existingWatermarkFiles = ref<string[]>([]);
const selectedExistingWatermark = ref('');
const watermarkSettings = ref<WatermarkSettings>(createDefaultWatermarkSettings());
const projectRoot = ref<string>("");
const forceProjectRoot = ref(false);
const settingsLoaded = ref(false);

const cleanupBusy = ref(false);
const cleanupMode = ref<"scan" | "apply" | null>(null);
const cleanupError = ref<string | null>(null);
const cleanupResult = ref<any | null>(null);
const cleanupLastRunAt = ref<number | null>(null);
const cleanupDeleteOrphans = ref(true);
const cleanupPruneMissingFiles = ref(false);
const cleanupMaxMissingFiles = ref(200);
const cleanupOrphanMinAgeHours = ref(24);

const licenseKeyInputs = ref<Record<string, string>>({});
const licenseActivationBusy = ref<Record<string, boolean>>({});
const licenseActivationError = ref<Record<string, string | null>>({});
const licenseActivationOk = ref<Record<string, string | null>>({});

function setLicenseActivationState(connectionId: string, patch: {
    busy?: boolean;
    error?: string | null;
    ok?: string | null;
}) {
    if (patch.busy !== undefined) {
        licenseActivationBusy.value[connectionId] = patch.busy;
    }
    if (patch.error !== undefined) {
        licenseActivationError.value[connectionId] = patch.error;
    }
    if (patch.ok !== undefined) {
        licenseActivationOk.value[connectionId] = patch.ok;
    }
}

function buildActivateErrorMessage(resp: Response, body: any, rawText: string) {
    const requestId = String(
        resp.headers.get('x-request-id') ||
        (typeof body?.requestId === 'string' ? body.requestId : '')
    ).trim();
    const base = body?.error || body?.detail?.error || body?.message || rawText || `HTTP ${resp.status}`;
    return requestId && !String(base).includes(requestId)
        ? `${base} (request ${requestId})`
        : String(base);
}

async function activateLicenseForServer(server: {
    connection: any;
    license: any;
}) {
    const connectionId = String(server?.connection?.connectionId || '');
    if (!connectionId) return;

    const key = String(licenseKeyInputs.value[connectionId] || '').trim();
    if (!key) {
        setLicenseActivationState(connectionId, { error: 'Please enter a license key.', ok: null });
        return;
    }

    const conn = server.connection;
    const connBaseUrl = conn.baseUrl || `http://${conn.serverIp}:${conn.apiPort || 9095}`;

    setLicenseActivationState(connectionId, { busy: true, error: null, ok: null });
    try {
        const activateResp = await fetch(`${connBaseUrl}/api/license/activate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${conn.token}`,
            },
            body: JSON.stringify({ licenseKey: key }),
        });

        const rawText = await activateResp.text().catch(() => '');
        let body: any = null;
        try { body = rawText ? JSON.parse(rawText) : null; } catch { body = null; }

        if (!activateResp.ok || !body?.ok) {
            throw new Error(buildActivateErrorMessage(activateResp, body, rawText));
        }

        licenseKeyInputs.value[connectionId] = '';
        const licenseInfo = body?.license;
        let okMsg = 'License activated.';
        if (licenseInfo?.perpetual) {
            okMsg = 'Perpetual license activated.';
        } else if (licenseInfo?.expiresAt) {
            okMsg = `License valid until ${new Date(licenseInfo.expiresAt).toLocaleDateString()}.`;
        }
        setLicenseActivationState(connectionId, { ok: okMsg, error: null });

        pushNotification(new Notification('License Activated', `${conn.name || conn.serverIp}: ${okMsg}`, 'success', 6000));

        const statusResp = await fetch(`${connBaseUrl}/api/license/status`, {
            headers: { 'Authorization': `Bearer ${conn.token}` }
        });
        if (statusResp.ok) {
            const statusBody = await statusResp.json().catch(() => null);
            if (statusBody?.ok) {
                server.license = statusBody;
            }
        }
    } catch (err: any) {
        const msg = err?.message || 'License activation failed.';
        setLicenseActivationState(connectionId, { error: msg, ok: null });
        pushNotification(new Notification('License Activation Failed', msg, 'error', 7000));
    } finally {
        setLicenseActivationState(connectionId, { busy: false });
    }
}

// ── Server Health ──
const healthLoading = ref(false);
const healthError = ref<string | null>(null);
const serverHealthData = ref<Array<{
    connection: any;
    health: any | null;
    license: any | null;
    error: string | null;
}>>([])

async function fetchHealth() {
    healthLoading.value = true;
    healthError.value = null;
    serverHealthData.value = [];
    
    try {
        // Fetch health for all connected servers
        if (!connections || !Array.isArray(connections)) {
            healthError.value = 'Connections not initialized';
            healthLoading.value = false;
            return;
        }
        
        const connectedServers = connections.filter((c: any) => c.status === 'connected');
        
        if (!connectedServers.length) {
            healthError.value = 'No connected servers';
            healthLoading.value = false;
            return;
        }
        
        const results = await Promise.all(
            connectedServers.map(async (conn: any) => {
                try {
                    // Build API base for this connection
                    const connBaseUrl = conn.baseUrl || `http://${conn.serverIp}:${conn.apiPort || 9095}`;
                    
                    // Fetch health
                    const healthRes = await fetch(`${connBaseUrl}/api/admin/health`, {
                        headers: { 'Authorization': `Bearer ${conn.token}` }
                    });
                    const health = healthRes.ok ? await healthRes.json() : null;
                    
                    // Fetch license status
                    const licenseRes = await fetch(`${connBaseUrl}/api/license/status`, {
                        headers: { 'Authorization': `Bearer ${conn.token}` }
                    });
                    const license = licenseRes.ok ? await licenseRes.json() : null;
                    
                    return {
                        connection: conn,
                        health: health?.ok ? health : null,
                        license: license?.ok ? license : null,
                        error: null
                    };
                } catch (err: any) {
                    return {
                        connection: conn,
                        health: null,
                        license: null,
                        error: err?.message || 'Failed to fetch'
                    };
                }
            })
        );
        
        serverHealthData.value = results;
    } catch (e: any) {
        healthError.value = e?.message || String(e);
    } finally {
        healthLoading.value = false;
    }
}

function formatUptime(seconds: number | undefined) {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatBytes(bytes: number | undefined) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

watch(activeSection, (section) => {
    if (section === 'health' && serverHealthData.value.length === 0 && !healthLoading.value) {
        fetchHealth();
    }
    
    // Load available watermarks when navigating to Link Options
    if (section === 'linkOptions' && existingWatermarkFiles.value.length === 0) {
        loadExistingWatermarkFiles();
        loadDefaultWatermarkPresets();
    }
});

watch(defaultWatermarkId, async (newId) => {
    if (!newId) {
        defaultWatermarkPreview.value = null;
        return;
    }
    try {
        const base = baseUrl.value;
        const token = meta.value?.token || '';
        // Check if it's a default preset (by ID or from static list)
        const isPreset = defaultWatermarkPresets.value.some(p => p.id === newId) ||
            DEFAULT_45FLOW_WATERMARKS.some(wm => wm.id === newId);
        let url: string;
        if (isPreset) {
            url = `${base}/api/watermarks/defaults/${newId}/stream`;
        } else {
            url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(newId)}`;
        }
        
        // Fetch and convert to data URL (raw URLs fail without auth headers)
        const res = await fetch(url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) {
            defaultWatermarkPreview.value = null;
            return;
        }
        const blob = await res.blob();
        defaultWatermarkPreview.value = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('[settings] Failed to load watermark preview:', err);
        defaultWatermarkPreview.value = null;
    }
});

async function loadAvailableWatermarks() {
    try {
        const res = await apiFetch('/api/files/watermarks');
        if (res?.ok && Array.isArray(res.watermarks)) {
            availableWatermarks.value = res.watermarks;
        }
    } catch (err) {
        console.warn('[settings] Failed to load watermarks:', err);
    }
}

async function loadDefaultWatermarkPresets() {
    try {
        // console.log('[settings] Loading default watermark presets...');
        const res = await apiFetch('/api/watermarks/defaults');
        // console.log('[settings] Presets API response:', res);
        if (res?.ok && Array.isArray(res.defaults)) {
            defaultWatermarkPresets.value = res.defaults;
            // console.log('[settings] Loaded presets:', res.defaults);
        } else {
            console.warn('[settings] Invalid presets response:', res);
        }
    } catch (err) {
        console.warn('[settings] Failed to load default watermark presets:', err);
    }
}

const defaultWatermarkName = computed(() => {
    if (defaultWatermarkFile.value) return defaultWatermarkFile.value.name;
    if (selectedExistingWatermark.value) {
        // Check if it's a preset
        const preset = defaultWatermarkPresets.value.find(p => p.id === selectedExistingWatermark.value);
        if (preset) return preset.name;
        return selectedExistingWatermark.value.split('/').pop() || '';
    }
    return '';
});

const effectiveWatermarkPreviewUrl = computed(() =>
    defaultWatermarkFile.value?.dataUrl || defaultWatermarkPreview.value || null
);

function pickDefaultWatermark() {
    (window.electron as any)?.pickWatermark().then((f: any) => {
        if (f) {
            defaultWatermarkFile.value = f;
            selectedExistingWatermark.value = '';
            if (f.dataUrl) {
                defaultWatermarkPreview.value = f.dataUrl;
            }
        }
    }).catch((err: any) => {
        console.warn('[settings] Failed to pick watermark:', err);
    });
}

function clearDefaultWatermark() {
    defaultWatermarkFile.value = null;
    defaultWatermarkPreview.value = null;
    selectedExistingWatermark.value = '';
    defaultWatermarkId.value = '';
}

async function onSelectExistingWatermark() {
    const selected = selectedExistingWatermark.value;
    if (!selected) {
        defaultWatermarkPreview.value = null;
        defaultWatermarkFile.value = null;
        return;
    }
    
    defaultWatermarkFile.value = null;
    
    try {
        const base = baseUrl.value;
        const token = meta.value?.token || '';
        
        // Check if it's a default preset
        const isPreset = defaultWatermarkPresets.value.some(p => p.id === selected);
        let url: string;
        if (isPreset) {
            url = `${base}/api/watermarks/defaults/${selected}/stream`;
        } else {
            url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(selected)}`;
        }
        
        // console.log('[settings] Fetching watermark preview from:', url);
        
        const res = await fetch(url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        
        if (!res.ok) {
            console.warn('[settings] Failed to fetch watermark preview:', res.status);
            defaultWatermarkPreview.value = null;
            return;
        }
        
        const blob = await res.blob();
        // console.log('[settings] Loaded blob:', blob.size, 'bytes');
        
        // Convert blob to data URL
        defaultWatermarkPreview.value = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        
        // console.log('[settings] Preview URL created');
    } catch (err) {
        console.warn('[settings] Failed to load watermark preview:', err);
        defaultWatermarkPreview.value = null;
    }
}

async function loadExistingWatermarkFiles() {
    try {
        // console.log('[settings] Loading existing watermark files...');
        // Load server watermarks
        const dirRel = '.45flow/watermarks';
        const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`);
        // console.log('[settings] API response:', data);
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        const serverWatermarks = entries
            .filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
            .map((e: any) => `${dirRel}/${String(e.name).trim()}`)
            .sort((a: string, b: string) => a.localeCompare(b));
        
        existingWatermarkFiles.value = serverWatermarks;
        // console.log('[settings] Loaded watermark files:', serverWatermarks);
    } catch (err) {
        console.warn('[settings] Failed to load watermarks:', err);
        existingWatermarkFiles.value = [];
    }
}

async function refreshWatermarks() {
    // console.log('[settings] Refreshing all watermarks...');
    await Promise.all([
        loadExistingWatermarkFiles(),
        loadDefaultWatermarkPresets()
    ]);
    // console.log('[settings] Refresh complete. Presets:', defaultWatermarkPresets.value.length, 'Files:', existingWatermarkFiles.value.length);
}

const cleanupTranscodeFixes = computed(() =>
    Array.isArray(cleanupResult.value?.transcodeFixes) ? cleanupResult.value.transcodeFixes : []
);
const cleanupOrphanDirs = computed(() =>
    Array.isArray(cleanupResult.value?.orphanDirs) ? cleanupResult.value.orphanDirs : []
);
const cleanupMissingFiles = computed(() =>
    Array.isArray(cleanupResult.value?.missingFiles) ? cleanupResult.value.missingFiles : []
);
const cleanupLastRunAtLabel = computed(() =>
    cleanupLastRunAt.value ? new Date(cleanupLastRunAt.value).toLocaleString() : "—"
);

// Read-only server-reported effective base (when auto)
const externalBaseEffective = ref<string | null>(null);
// Read-only server-reported custom base (what’s stored)
const externalBaseCustom = ref<string | null>(null);

// ── White Label / Branding ────────────────────────────────────────────────────
const brandingEnabled = ref(false);
const brandingCompanyName = ref('');
const brandingEnforcedTheme = ref('');
const brandingSplitLogos = ref(false);
const brandingLogoLight = ref<string | null>(null);
const brandingLogoDark = ref<string | null>(null);
const brandingCustomPrimary = ref('#D92B2F');
const brandingCustomSecondary = ref('#b02428');
const brandingBusy = ref(false);
const brandingError = ref<string | null>(null);
const brandingOk = ref(false);

// Logo preview URLs and metadata
const brandingLogoLightPreview = ref<string | null>(null);
const brandingLogoDarkPreview = ref<string | null>(null);
const brandingLogoLightInfo = ref<{ name?: string; size?: number; width?: number; height?: number } | null>(null);
const brandingLogoDarkInfo = ref<{ name?: string; size?: number; width?: number; height?: number } | null>(null);

// Support contact and link preview fields
const brandingSupportEmail = ref('');
const brandingSupportUrl = ref('');
const brandingLinkPreviewTitle = ref('');
const brandingLinkPreviewDescription = ref('');

const brandingLogoLightInput = ref<HTMLInputElement | null>(null);
const brandingLogoDarkInput = ref<HTMLInputElement | null>(null);

const brandingThemeOptions = [
    { id: '', label: 'User\'s choice (no override)' },
    { id: 'custom', label: 'Custom', preview: '' },
    { id: 'theme-studio-grad-logo-flow', label: 'Flow', preview: 'linear-gradient(135deg, #2EA8FF 0%, #7A4DFF 30%, #D02BD6 56%, #F1578A 76%, #FF9A2A 100%)' },
    { id: 'theme-studio-grad-purple-pink-orange', label: 'Party', preview: 'linear-gradient(135deg, #9A24E4 0%, #CF20AE 32%, #F6336E 64%, #FE774F 100%)' },
    { id: 'theme-studio-grad-red-purple-blue', label: 'Prism', preview: 'linear-gradient(135deg, #F43F5E 0%, #8B5CF6 52%, #3B82F6 100%)' },
    { id: 'theme-studio-grad-sunset-laser', label: 'Synthwave', preview: 'linear-gradient(135deg, #FF6A00 0%, #FF2D95 48%, #2CF3E9 100%)' },
    { id: 'theme-studio-grad-neon-studio', label: 'Cyber Pulse', preview: 'linear-gradient(135deg, #14B8A6 0%, #6D28D9 45%, #F43F5E 100%)' },
    { id: 'theme-studio-grad-moon-mist', label: 'Moon Mist', preview: 'linear-gradient(135deg, #7A2CFF 0%, #2EA8FF 52%, #FFE44D 100%)' },
    { id: 'theme-studio-grad-pink-orange', label: 'Flamingo', preview: 'linear-gradient(135deg, #E84393 0%, #F39C12 100%)' },
    { id: 'theme-studio-grad-red-blue-green', label: 'Spectrum', preview: 'linear-gradient(135deg, #EF4444 0%, #3B82F6 50%, #22C55E 100%)' },
    { id: 'theme-studio-grad-red-orange-yellow', label: 'Fire', preview: 'linear-gradient(135deg, #EF4444 0%, #F97316 50%, #EAB308 100%)' },
    { id: 'theme-studio-grad-orange-pink', label: 'Sunset', preview: 'linear-gradient(135deg, #F97316 0%, #EC4899 100%)' },
    { id: 'theme-studio-grad-aurora', label: 'Borealis', preview: 'linear-gradient(135deg, #10B981 0%, #0891B2 50%, #7C3AED 100%)' },
    { id: 'theme-studio-grad-yellow-orange-red', label: 'Solstice', preview: 'linear-gradient(135deg, #EAB308 0%, #F97316 50%, #EF4444 100%)' },
    { id: 'theme-studio-grad-electric-violet', label: 'Ultraviolet', preview: 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)' },
    { id: 'theme-studio-grad-infrared', label: 'Infrared', preview: 'linear-gradient(135deg, #F43F7F 0%, #E11D48 50%, #9F1239 100%)' },
    { id: 'theme-studio-blue-steel', label: 'Blue Steel', preview: 'linear-gradient(135deg, #2C3E5A 0%, #4E6B93 50%, #7A9BC0 100%)' },
    { id: 'theme-studio-slate', label: 'Graphite', preview: 'linear-gradient(135deg, #374151 0%, #5F6E82 50%, #8B9DB3 100%)' },
    { id: 'theme-studio-ocean', label: 'Deep Sea', preview: 'linear-gradient(135deg, #1B3D4F 0%, #3E6D84 50%, #6BA4BE 100%)' },
    { id: 'theme-studio-grad-chrome', label: 'Titanium', preview: 'linear-gradient(135deg, #64748B 0%, #94A3B8 50%, #475569 100%)' },
    { id: 'theme-studio-grad-enterprise', label: 'Enterprise', preview: 'linear-gradient(135deg, #8B1A1E 0%, #D92B2F 50%, #FF6B6B 100%)' },
    { id: 'theme-studio-grad-homelab', label: 'Homelab', preview: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #60A5FA 100%)' },
    { id: 'theme-studio-grad-professional', label: 'Professional', preview: 'linear-gradient(135deg, #2D6A1E 0%, #65A443 50%, #A8E063 100%)' },
    { id: 'theme-studio', label: 'Studio', preview: 'linear-gradient(135deg, #3D2D78 0%, #6557A5 50%, #9B8ADB 100%)' },
];

const brandingSelectedThemeLabel = computed(() =>
    brandingThemeOptions.find(t => t.id === brandingEnforcedTheme.value)?.label || 'User\'s choice'
);

const brandingCustomPreview = computed(() =>
    `linear-gradient(135deg, ${brandingCustomPrimary.value} 0%, ${brandingCustomSecondary.value} 100%)`
);

// Color contrast validation helpers
function sanitizeHex(val: string): string {
    // type="color" inputs require a valid 7-char hex (#rrggbb).
    // If the text input has a partial value, fall back to black.
    return /^#[0-9a-fA-F]{6}$/.test(val) ? val : '#000000';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null;
}

function getLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    if (!rgb1 || !rgb2) return 1;
    
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    
    return (lighter + 0.05) / (darker + 0.05);
}

const brandingPrimaryContrastWarning = computed(() => {
    const onWhite = getContrastRatio(brandingCustomPrimary.value, '#ffffff');
    const onDark = getContrastRatio(brandingCustomPrimary.value, '#1a1a1a');
    
    if (onWhite < 3 && onDark < 3) {
        return 'This color may be hard to read on both light and dark backgrounds.';
    }
    if (onWhite < 3) {
        return 'This color may be hard to read on light backgrounds.';
    }
    if (onDark < 3) {
        return 'This color may be hard to read on dark backgrounds.';
    }
    return null;
});

const brandingSecondaryContrastWarning = computed(() => {
    const onWhite = getContrastRatio(brandingCustomSecondary.value, '#ffffff');
    const onDark = getContrastRatio(brandingCustomSecondary.value, '#1a1a1a');
    
    if (onWhite < 3 && onDark < 3) {
        return 'This color may be hard to read on both light and dark backgrounds.';
    }
    if (onWhite < 3) {
        return 'This color may be hard to read on light backgrounds.';
    }
    if (onDark < 3) {
        return 'This color may be hard to read on dark backgrounds.';
    }
    return null;
});

async function loadBranding() {
    try {
        const data = await apiFetch('/api/branding');
        brandingEnabled.value = !!data.enabled;
        brandingCompanyName.value = data.companyName || '';
        brandingEnforcedTheme.value = data.enforcedTheme || '';
        brandingSplitLogos.value = !!data.splitLogos;
        brandingLogoLight.value = data.logoLight || null;
        brandingLogoDark.value = data.logoDark || null;
        // Build preview URLs from server-stored filenames
        if (data.logoLight && baseUrl.value) {
            brandingLogoLightPreview.value = `${baseUrl.value}/branding/logos/${encodeURIComponent(data.logoLight)}`;
        }
        if (data.logoDark && baseUrl.value) {
            brandingLogoDarkPreview.value = `${baseUrl.value}/branding/logos/${encodeURIComponent(data.logoDark)}`;
        }
        if (data.customPrimary) brandingCustomPrimary.value = data.customPrimary;
        if (data.customSecondary) brandingCustomSecondary.value = data.customSecondary;
        brandingSupportEmail.value = data.supportEmail || '';
        brandingSupportUrl.value = data.supportUrl || '';
        brandingLinkPreviewTitle.value = data.linkPreviewTitle || '';
        brandingLinkPreviewDescription.value = data.linkPreviewDescription || '';
        // Sync custom theme to palette
        setCustomThemeEnabled(!!data.enabled);
        if (data.customPrimary || data.customSecondary) {
            setCustomThemeColors({
                primary: data.customPrimary || brandingCustomPrimary.value,
                secondary: data.customSecondary || brandingCustomSecondary.value,
            });
        }
    } catch {
        // Non-critical
    }
}

async function saveBranding() {
    brandingError.value = null;
    brandingOk.value = false;
    brandingBusy.value = true;

    try {
        await apiFetch('/api/branding', {
            method: 'POST',
            body: JSON.stringify({
                enabled: brandingEnabled.value,
                companyName: brandingCompanyName.value,
                enforcedTheme: brandingEnforcedTheme.value,
                splitLogos: brandingSplitLogos.value,
                customPrimary: brandingCustomPrimary.value,
                customSecondary: brandingCustomSecondary.value,
                supportEmail: brandingSupportEmail.value,
                supportUrl: brandingSupportUrl.value,
                linkPreviewTitle: brandingLinkPreviewTitle.value,
                linkPreviewDescription: brandingLinkPreviewDescription.value,
            }),
        });
        brandingOk.value = true;
        // Sync custom theme to palette
        setCustomThemeEnabled(brandingEnabled.value);
        setCustomThemeColors({
            primary: brandingCustomPrimary.value,
            secondary: brandingCustomSecondary.value,
        });
        pushNotification(
            new Notification('Branding Saved', 'White-label branding settings updated.', 'success', 5000)
        );
    } catch (e: any) {
        brandingError.value = e?.message || 'Failed to save branding settings.';
    } finally {
        brandingBusy.value = false;
        setTimeout(() => { brandingOk.value = false; }, 2000);
    }
}

function setBrandingLogoRef(slot: 'logo_light' | 'logo_dark', filename: string | null) {
    if (slot === 'logo_light') brandingLogoLight.value = filename;
    else if (slot === 'logo_dark') brandingLogoDark.value = filename;
}

function setBrandingLogoPreview(slot: 'logo_light' | 'logo_dark', url: string | null, info: any = null) {
    if (slot === 'logo_light') {
        if (brandingLogoLightPreview.value) URL.revokeObjectURL(brandingLogoLightPreview.value);
        brandingLogoLightPreview.value = url;
        brandingLogoLightInfo.value = info;
    } else {
        if (brandingLogoDarkPreview.value) URL.revokeObjectURL(brandingLogoDarkPreview.value);
        brandingLogoDarkPreview.value = url;
        brandingLogoDarkInfo.value = info;
    }
}

async function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

async function uploadBrandingLogo(slot: 'logo_light' | 'logo_dark', file: File) {
    brandingError.value = null;
    brandingBusy.value = true;

    try {
        // Capture file metadata and generate preview
        const previewUrl = URL.createObjectURL(file);
        let dimensions = { width: 0, height: 0 };
        try {
            dimensions = await loadImageDimensions(file);
        } catch {}

        const info = {
            name: file.name,
            size: file.size,
            width: dimensions.width,
            height: dimensions.height,
        };

        setBrandingLogoPreview(slot, previewUrl, info);

        const formData = new FormData();
        formData.append('logo', file);

        const result = await apiFetch(`/api/branding/logo/${slot}`, {
            method: 'POST',
            body: formData,
        });

        setBrandingLogoRef(slot, result?.filename || slot);
        pushNotification(
            new Notification('Logo Uploaded', `${slot.replace(/_/g, ' ')} logo has been updated.`, 'success', 4000)
        );
    } catch (e: any) {
        brandingError.value = e?.message || 'Logo upload failed.';
    } finally {
        brandingBusy.value = false;
    }
}

async function deleteBrandingLogo(slot: 'logo_light' | 'logo_dark') {
    brandingBusy.value = true;
    try {
        await apiFetch(`/api/branding/logo/${slot}`, { method: 'DELETE' });
        setBrandingLogoRef(slot, null);
        setBrandingLogoPreview(slot, null, null);
    } catch (e: any) {
        brandingError.value = e?.message || 'Failed to remove logo.';
    } finally {
        brandingBusy.value = false;
    }
}

function onBrandingFileSelected(slot: 'logo_light' | 'logo_dark', event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) uploadBrandingLogo(slot, file);
    input.value = '';
}


async function clearBranding() {
    if (!confirm('Clear all custom branding? This will reset everything to 45Flow defaults and remove uploaded logos.')) {
        return;
    }
    
    brandingError.value = null;
    brandingBusy.value = true;
    
    try {
        // Delete logos if they exist
        if (brandingLogoLight.value) {
            await deleteBrandingLogo('logo_light');
        }
        if (brandingLogoDark.value) {
            await deleteBrandingLogo('logo_dark');
        }
        
        // Reset all local state to defaults
        brandingEnabled.value = false;
        brandingCompanyName.value = '';
        brandingEnforcedTheme.value = '';
        brandingSplitLogos.value = false;
        brandingLogoLight.value = null;
        brandingLogoDark.value = null;
        brandingCustomPrimary.value = '#D92B2F';
        brandingCustomSecondary.value = '#b02428';
        brandingSupportEmail.value = '';
        brandingSupportUrl.value = '';
        brandingLinkPreviewTitle.value = '';
        brandingLinkPreviewDescription.value = '';
        
        // Clear previews
        setBrandingLogoPreview('logo_light', null, null);
        setBrandingLogoPreview('logo_dark', null, null);
        
        // Save cleared state to server
        await saveBranding();
        
        pushNotification(
            new Notification('Branding Cleared', 'All custom branding has been reset to defaults.', 'success', 5000)
        );
    } catch (e: any) {
        brandingError.value = e?.message || 'Failed to clear branding.';
    } finally {
        brandingBusy.value = false;
    }
}
// ── Certificate / Let’s Encrypt ───────────────────────────────────────────────────────
const certBusy = ref(false);
const certStep = ref<'verify' | 'setup' | 'revert' | null>(null);
const certError = ref<string | null>(null);
const certSuccessMsg = ref<string | null>(null);
const certDomainInput = ref('');
const certEmailInput = ref('');
const certDnsVerified = ref(false);
const certDnsResult = ref<{ ok: boolean; wanIp?: string; resolvedIps?: string[]; message?: string } | null>(null);
const certStatus = ref<{
    certMode: 'self-signed' | 'letsencrypt';
    certDomain: string | null;
    certEmail: string | null;
    certExpiry: string | null;
    daysRemaining: number | null;
    valid: boolean;
    wanIp: string | null;
    renewalTimerActive: boolean;
    renewalTimerMethod: string | null;
}>({
    certMode: 'self-signed',
    certDomain: null,
    certEmail: null,
    certExpiry: null,
    daysRemaining: null,
    valid: false,
    wanIp: null,
    renewalTimerActive: false,
    renewalTimerMethod: null,
});

const dnsHostPart = computed(() => {
    const d = certDomainInput.value.trim();
    if (!d) return '(enter domain above)';
    const parts = d.split('.');
    if (parts.length > 2) return parts[0];
    return '@';
});

function formatCertExpiry(iso: string | null) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return iso; }
}

async function loadCertStatus() {
    try {
        const data = await apiFetch('/api/settings/letsencrypt/status', { timeoutMs: 15000 });
        certStatus.value = {
            certMode: data.certMode || 'self-signed',
            certDomain: data.certDomain || null,
            certEmail: data.certEmail || null,
            certExpiry: data.certExpiry || null,
            daysRemaining: data.daysRemaining ?? null,
            valid: data.valid,
            wanIp: data.wanIp || null,
            renewalTimerActive: data.renewalTimerActive ?? false,
            renewalTimerMethod: data.renewalTimerMethod || null,
        };
        // Pre-fill form from existing values
        if (!certDomainInput.value && data.certDomain) {
            certDomainInput.value = data.certDomain;
        }
        if (!certEmailInput.value && data.certEmail) {
            certEmailInput.value = data.certEmail;
        }
    } catch {
        // Silent — cert status is non-critical
    }
}

/**
 * Extract the hostname from a URL string. Returns null if it's an IP address.
 * Used to sync external base domain → certificate domain.
 */
function extractDomainFromUrl(urlStr: string): string | null {
    if (!urlStr) return null;
    try {
        // Normalize the input
        const normalized = normalizeUrlInput(urlStr, 'https');
        if (!normalized) return null;

        const url = new URL(normalized);
        const host = url.hostname;

        // Skip IP addresses — cert domain should be a real domain
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null;

        return host;
    } catch {
        return null;
    }
}

// Sync external base → cert domain when external base changes to a domain
watch(externalBase, (newVal) => {
    if (externalAuto.value) return; // Only sync when in custom mode

    const domain = extractDomainFromUrl(newVal);
    if (domain) {
        certDomainInput.value = domain;
    }
});

// Sync cert domain → external base when cert domain is entered and external base is empty/auto
watch(certDomainInput, (newVal) => {
    const trimmed = newVal.trim();
    if (!trimmed) return;

    // Only sync if external base is empty or in auto mode
    if (!externalBase.value.trim() || externalAuto.value) {
        // Build the URL from the domain
        const url = `https://${trimmed}`;
        externalBase.value = url;
        externalAuto.value = false; // Disable auto-detect
    }
});

async function verifyDNS() {
    certError.value = null;
    certSuccessMsg.value = null;
    certDnsVerified.value = false;
    certDnsResult.value = null;
    certBusy.value = true;
    certStep.value = 'verify';

    try {
        const result = await apiFetch('/api/settings/letsencrypt/verify-dns', {
            method: 'POST',
            body: JSON.stringify({ domain: certDomainInput.value.trim() }),
            timeoutMs: 20000,
        });
        certDnsResult.value = result;
        certDnsVerified.value = result.ok;
        if (result.wanIp) certStatus.value.wanIp = result.wanIp;
    } catch (e: any) {
        certError.value = e?.message || 'DNS verification failed.';
    } finally {
        certBusy.value = false;
        certStep.value = null;
    }
}

async function setupLetsEncrypt() {
    certError.value = null;
    certSuccessMsg.value = null;
    certBusy.value = true;
    certStep.value = 'setup';

    try {
        const result = await apiFetch('/api/settings/letsencrypt/setup', {
            method: 'POST',
            body: JSON.stringify({
                domain: certDomainInput.value.trim(),
                email: certEmailInput.value.trim(),
            }),
            timeoutMs: 120000, // certbot can take a while
        });

        certSuccessMsg.value = result.message || 'Certificate installed successfully!';
        pushNotification(
            new Notification('Certificate Installed', certSuccessMsg.value || 'Certificate installed successfully!', 'success', 10000)
        );
        await loadCertStatus();
    } catch (e: any) {
        certError.value = e?.message || 'Failed to obtain certificate.';
        pushNotification(
            new Notification('Certificate Error', certError.value || 'Failed to obtain certificate.', 'error', 8000)
        );
    } finally {
        certBusy.value = false;
        certStep.value = null;
    }
}

async function revertToSelfSigned() {
    certError.value = null;
    certSuccessMsg.value = null;
    certBusy.value = true;
    certStep.value = 'revert';

    try {
        const result = await apiFetch('/api/settings/letsencrypt/revert', {
            method: 'POST',
            timeoutMs: 15000,
        });

        certSuccessMsg.value = result.message || 'Reverted to self-signed certificate.';
        certDnsVerified.value = false;
        certDnsResult.value = null;
        pushNotification(
            new Notification('Certificate Reverted', certSuccessMsg.value || 'Reverted to self-signed certificate.', 'success', 8000)
        );
        await loadCertStatus();
    } catch (e: any) {
        certError.value = e?.message || 'Failed to revert certificate.';
    } finally {
        certBusy.value = false;
        certStep.value = null;
    }
}

function close() {
    if (!busy.value) emit("close");
}

function normalizeUrlInput(raw: string, scheme: "http" | "https"): string | null {
    const s = (raw || "").trim();
    if (!s) return null;

    const withScheme = /^https?:\/\//i.test(s) ? s : `${scheme}://${s}`;
    try {
        const u = new URL(withScheme);

        // Enforce "origin only" (no path/query/hash/creds)
        if (u.username || u.password) return null;
        if (u.pathname && u.pathname !== "/") return null;
        if (u.search) return null;
        if (u.hash) return null;

        return u.origin;
    } catch {
        return null;
    }
}

function isValidPort(p: number): boolean {
    return Number.isFinite(p) && p >= 1 && p <= 65535;
}

function withPortIfNeeded(base: string | null, port: number): string | null {
    if (!base) return null;

    const p = Number(port);
    if (!Number.isFinite(p) || p < 1 || p > 65535) return base;

    try {
        const u = new URL(base);

        // Keep an explicitly provided port
        if (u.port) return u.origin;

        const isHttps = u.protocol === "https:";
        const isHttp = u.protocol === "http:";

        // Only append when non-default
        if ((isHttps && p === 443) || (isHttp && p === 80)) return u.origin;

        u.port = String(p);
        return u.origin;
    } catch {
        return base;
    }
}

const externalEffectivePreview = computed(() => {
    if (!externalAuto.value) return null;
    if (!externalBaseEffective.value) return null;
    return withPortIfNeeded(externalBaseEffective.value, externalHttpsPort.value);
});

const externalPreview = computed(() => {
    // What the modal is currently configured to use
    if (externalAuto.value) {
        // Show effective if we have it, otherwise "auto"
        return externalEffectivePreview.value || "auto";
    }

    const b = normalizeUrlInput(externalBase.value, "https");
    if (!b) return null;
    if (!isValidPort(externalHttpsPort.value)) return null;
    return withPortIfNeeded(b, externalHttpsPort.value);
});

const internalPreview = computed(() => {
    if (internalAuto.value) return "auto";
    return normalizeUrlInput(internalBase.value, "http");
});

const validationError = computed(() => {
    // Don't show validation errors until settings are loaded from server
    if (!settingsLoaded.value) return null;
    
    if (!isValidPort(externalHttpsPort.value)) {
        return "External HTTPS port must be between 1 and 65535.";
    }

    // External
    if (!externalAuto.value) {
        if (!externalBase.value.trim()) return "External base is required unless Auto-detect is enabled.";
        if (!normalizeUrlInput(externalBase.value, "https")) {
            return "External base must be a valid origin (scheme + host + optional port).";
        }
    }

    // Internal
    if (!internalAuto.value) {
        if (!internalBase.value.trim()) return "Internal base is required unless Auto-detect is enabled.";
        if (!normalizeUrlInput(internalBase.value, "http")) {
            return "Internal base must be a valid origin (scheme + host + optional port).";
        }
    }

    if (forceProjectRoot.value && !projectRoot.value.trim()) {
        return "Project root is required when forcing project root mode.";
    }

    return null;
});

async function reload() {
    busy.value = true;
    loadError.value = null;
    saveError.value = null;
    saveOk.value = false;

    try {
        const data = await apiFetch("/api/settings");

        externalHttpsPort.value = Number(data.externalHttpsPort ?? 443);
        savedHttpsPort.value = externalHttpsPort.value;

        defaultLinkAccess.value = (data.defaultLinkAccess === "internal" ? "internal" : "external");

        const mode: "auto" | "custom" = (data.externalMode === "custom" ? "custom" : "auto");
        externalAuto.value = (mode === "auto");
        savedExternalAuto.value = externalAuto.value;

        // internalBase: null means "auto" on server side; keep the existing UI switch behavior
        internalAuto.value = !data.internalBase;
        internalBase.value = data.internalBase ?? "";

        externalBaseCustom.value = data.externalBaseCustom ?? null;
        externalBaseEffective.value = data.externalBaseEffective ?? null;

        // For UI editing, externalBase is the CUSTOM base (only meaningful when mode=custom)
        externalBase.value = data.externalBaseCustom ?? "";
        savedExternalBase.value = externalBase.value;

        defaultRestrictAccess.value =
            typeof data.defaultRestrictAccess === "boolean" ? data.defaultRestrictAccess : false;
        defaultAllowComments.value =
            typeof data.defaultAllowComments === "boolean" ? data.defaultAllowComments : true;
        defaultWatermarkId.value = data.defaultWatermarkId || '';
        defaultWatermarkEnabled.value = !!defaultWatermarkId.value;
        
        // Load watermark settings or use defaults
        if (data.defaultWatermarkSettings && typeof data.defaultWatermarkSettings === 'object') {
            watermarkSettings.value = { ...createDefaultWatermarkSettings(), ...data.defaultWatermarkSettings };
        } else {
            watermarkSettings.value = createDefaultWatermarkSettings();
        }
        
        // Load existing watermark files and sync the selection
        await loadExistingWatermarkFiles();
        await loadDefaultWatermarkPresets();
        if (defaultWatermarkId.value) {
            selectedExistingWatermark.value = defaultWatermarkId.value;
            // Ensure preview is loaded (watcher may have fired before baseUrl/token were ready)
            if (!defaultWatermarkPreview.value) {
                const base = baseUrl.value;
                const token = meta.value?.token || '';
                const isPreset = defaultWatermarkPresets.value.some(p => p.id === defaultWatermarkId.value) ||
                    DEFAULT_45FLOW_WATERMARKS.some(wm => wm.id === defaultWatermarkId.value);
                const url = isPreset
                    ? `${base}/api/watermarks/defaults/${defaultWatermarkId.value}/stream`
                    : `${base}/api/files/watermark-preview?path=${encodeURIComponent(defaultWatermarkId.value)}`;
                try {
                    const res = await fetch(url, {
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    });
                    if (res.ok) {
                        const blob = await res.blob();
                        defaultWatermarkPreview.value = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }
                } catch { /* watcher will retry if needed */ }
            }
        }
        
        defaultUseProxyFiles.value =
            typeof data.defaultUseProxyFiles === "boolean" ? data.defaultUseProxyFiles : false;
        projectRoot.value = typeof data.projectRoot === "string" ? data.projectRoot : "";
        forceProjectRoot.value = typeof data.forceProjectRoot === "boolean" ? data.forceProjectRoot : false;
        
        settingsLoaded.value = true;
    } catch (e: any) {
        loadError.value = e?.message ? `Failed to load settings: ${e.message}` : "Failed to load settings.";
    } finally {
        busy.value = false;
    }

    // Load cert status in parallel (non-blocking)
    loadCertStatus();
    loadBranding();
}

async function save() {
    saveOk.value = false;
    saveError.value = null;

    if (validationError.value) {
        saveError.value = validationError.value;
        return;
    }

    busy.value = true;
    try {
        const payload: any = {
            defaultLinkAccess: defaultLinkAccess.value,
            externalHttpsPort: externalHttpsPort.value,

            // New fields
            externalMode: externalAuto.value ? "auto" : "custom",
            externalBaseCustom: externalAuto.value ? null : (externalBase.value || "").trim(),

            internalBase: internalAuto.value ? "auto" : (internalBase.value || "").trim(),
            defaultRestrictAccess: !!defaultRestrictAccess.value,
            defaultAllowComments: !!defaultAllowComments.value,
            defaultUseProxyFiles: !!defaultUseProxyFiles.value,
            defaultWatermarkId: defaultWatermarkEnabled.value ? (selectedExistingWatermark.value || defaultWatermarkId.value) : null,
            defaultWatermarkSettings: defaultWatermarkEnabled.value ? watermarkSettings.value : null,
            projectRoot: (projectRoot.value || "").trim() || null,
            forceProjectRoot: !!forceProjectRoot.value,
        };

        await apiFetch("/api/settings", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        appLog.info('settings.saved', { changed: Object.keys(payload) });

        // If the HTTPS port changed, apply to nginx + firewall on the server
        const portChanged = externalHttpsPort.value !== savedHttpsPort.value;
        if (portChanged) {
            try {
                const applyResult = await apiFetch("/api/settings/apply-port", { method: "POST" });
                if (applyResult?.changed) {
                    appLog.info('settings.port_applied', { port: externalHttpsPort.value });
                    pushNotification(
                        new Notification(
                            'Port Reconfigured',
                            `HTTPS port changed to ${externalHttpsPort.value}. Nginx and firewall updated.`,
                            'success',
                            8000
                        )
                    );
                }
            } catch (applyErr: any) {
                appLog.error('settings.port_apply_failed', { error: applyErr?.message });
                pushNotification(
                    new Notification(
                        'Port Apply Failed',
                        `Port saved to settings but failed to reconfigure server: ${applyErr?.message || 'unknown error'}. You may need to re-run bootstrap.`,
                        'warning',
                        12000
                    )
                );
            }
        }

        // If external base URL changed (mode or custom domain), regenerate SSL cert
        const externalBaseChanged =
            externalAuto.value !== savedExternalAuto.value ||
            (!externalAuto.value && (externalBase.value || "").trim() !== savedExternalBase.value);
        if (externalBaseChanged) {
            try {
                const certResult = await apiFetch("/api/settings/apply-cert", { method: "POST" });
                if (certResult?.ok) {
                    appLog.info('settings.cert_applied', { changed: certResult.changed, cn: certResult.cn });
                    pushNotification(
                        new Notification(
                            'SSL Certificate Updated',
                            certResult.message || 'Certificate regenerated with updated SANs.',
                            'success',
                            8000
                        )
                    );
                }
            } catch (certErr: any) {
                appLog.error('settings.cert_apply_failed', { error: certErr?.message });
                pushNotification(
                    new Notification(
                        'SSL Certificate Update Failed',
                        `Settings saved but certificate regeneration failed: ${certErr?.message || 'unknown error'}. You may need to re-run bootstrap.`,
                        'warning',
                        12000
                    )
                );
            }
        }

        // Save branding first if we're on that section (before reload overwrites refs)
        if (activeSection.value === 'branding') {
            await saveBranding();
        }

        await reload();

        saveOk.value = true;
        pushNotification(
            new Notification(
                'Saved',
                'Settings were saved successfully.',
                'success',
                6000
            )
        )
        emit("saved", {
            externalBaseCustom: externalBaseCustom.value,
            externalBaseEffective: externalBaseEffective.value,
            internalBase: internalAuto.value ? null : (normalizeUrlInput(internalBase.value, "http") || null),
            externalHttpsPort: externalHttpsPort.value,
            defaultLinkAccess: defaultLinkAccess.value,
            externalMode: externalAuto.value ? "auto" : "custom",
            defaultRestrictAccess: !!defaultRestrictAccess.value,
            defaultAllowComments: !!defaultAllowComments.value,
            defaultUseProxyFiles: !!defaultUseProxyFiles.value,
            projectRoot: (projectRoot.value || "").trim() || null,
            forceProjectRoot: !!forceProjectRoot.value,
        });
        emit("close")
    } catch (e: any) {
        appLog.error('settings.save_failed', { error: e?.message });
        saveError.value = e?.message || "Failed to save settings.";
    } finally {
        busy.value = false;
        setTimeout(() => { saveOk.value = false; }, 2000);
    }
}

async function runCleanup(apply: boolean) {
    cleanupError.value = null;
    cleanupBusy.value = true;
    cleanupMode.value = apply ? "apply" : "scan";

    try {
        const orphanMinAgeMs = Math.max(0, Number(cleanupOrphanMinAgeHours.value || 0)) * 60 * 60 * 1000;
        const maxMissingFiles = Math.max(1, Number(cleanupMaxMissingFiles.value || 200));
        const payload = {
            apply: !!apply,
            deleteOrphans: !!cleanupDeleteOrphans.value,
            pruneMissingFiles: !!cleanupPruneMissingFiles.value,
            maxMissingFiles,
            orphanMinAgeMs,
        };

        const resp = await apiFetch("/api/admin/cleanup", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        cleanupResult.value = resp;
        cleanupLastRunAt.value = Date.now();

        pushNotification(
            new Notification(
                apply ? "Cleanup Applied" : "Cleanup Scan Complete",
                `Transcode fixes: ${cleanupTranscodeFixes.value.length}, orphan dirs: ${cleanupOrphanDirs.value.length}, missing files: ${cleanupMissingFiles.value.length}`,
                "success",
                7000
            )
        );
    } catch (e: any) {
        cleanupError.value = e?.message || "Cleanup request failed.";
    } finally {
        cleanupBusy.value = false;
        cleanupMode.value = null;
    }
}

function exportCleanupReport() {
    if (!cleanupResult.value) return;
    try {
        const payload = {
            generatedAt: cleanupLastRunAt.value ? new Date(cleanupLastRunAt.value).toISOString() : new Date().toISOString(),
            result: cleanupResult.value,
        };
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const a = document.createElement("a");
        a.href = url;
        a.download = `studio-cleanup-report-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        pushNotification(new Notification("Exported", "Cleanup report JSON downloaded.", "success", 4000));
    } catch (e: any) {
        pushNotification(new Notification("Export Failed", e?.message || "Unable to export cleanup report.", "error", 6000));
    }
}

watch(externalAuto, () => { saveOk.value = false; saveError.value = null; });
watch(internalAuto, () => { saveOk.value = false; saveError.value = null; });

onMounted(() => {
    reload();
});
</script>

<style scoped>
.settings-nav-group-label {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgb(156 163 175);
    padding: 0.5rem 0.75rem 0.25rem;
}
:root.dark .settings-nav-group-label {
    color: rgb(107 114 128);
}
.settings-nav-group-label:not(:first-child) {
    margin-top: 0.5rem;
}
.settings-nav-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgb(107 114 128);
    transition: all 0.15s ease;
    border-left: 2px solid transparent;
}
:root.dark .settings-nav-btn {
    color: rgb(156 163 175);
}
.settings-nav-btn:hover {
    color: rgb(55 65 81);
    background-color: rgb(249 250 251);
}
:root.dark .settings-nav-btn:hover {
    color: rgb(209 213 219);
    background-color: rgba(255,255,255,0.05);
}
.settings-nav-btn-active {
    color: rgb(71 85 105);
    background-color: rgba(71, 85, 105, 0.08);
    font-weight: 600;
    border-left-color: rgb(71 85 105);
}
:root.dark .settings-nav-btn-active {
    color: rgb(148 163 184);
    background-color: rgba(148, 163, 184, 0.1);
    border-left-color: rgb(148 163 184);
}
</style>
