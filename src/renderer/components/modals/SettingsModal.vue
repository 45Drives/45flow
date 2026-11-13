<template>
    <FlowModal :model-value="true" title="Settings" description="Settings for this server and for 45Flow on this computer." size="xl"
        surface="default" class="h-[min(46rem,calc(100vh-2rem))]" :header-attrs="{ 'data-tour': 'settings-modal-header' }"
        flush body-class="flex flex-col !overflow-hidden" footer-class="justify-between" :before-close="confirmDiscard" @close="close">

                <!-- Body: sidebar + content -->
                <div class="flex flex-1 min-h-0">
                    <!-- Sidebar nav -->
                    <nav class="settings-nav" aria-label="Settings sections" data-tour="settings-modal-nav">
                        <div class="relative px-3 pb-2">
                            <MagnifyingGlassIcon class="w-4 h-4 absolute left-5 top-1/2 -translate-y-[calc(50%+0.25rem)] opacity-60" aria-hidden="true" />
                            <input v-model.trim="navQuery" type="search" aria-label="Find a setting"
                                class="input-textlike w-full pl-8 pr-2 py-1.5 text-xs" placeholder="Find a setting" />
                        </div>
                        <template v-for="group in filteredNavGroups" :key="group.label">
                            <p class="settings-nav-group-label">{{ group.label }}</p>
                            <button v-for="item in group.items" :key="item.key" type="button"
                                class="settings-nav-btn" :class="{ 'settings-nav-btn-active': activeSection === item.key }"
                                :aria-current="activeSection === item.key ? 'page' : undefined"
                                @click="activeSection = item.key">
                                <component :is="item.icon" class="settings-nav-icon" aria-hidden="true" />
                                <span class="truncate">{{ item.label }}</span>
                            </button>
                        </template>
                        <p v-if="!filteredNavGroups.length" class="px-4 py-2 text-xs text-muted">No settings match “{{ navQuery }}”.</p>
                    </nav>

                    <!-- Content -->
                    <div ref="contentRef" class="settings-content flex-1 overflow-y-auto px-6 py-5 text-left" data-tour="settings-modal-urls">
                        <header class="settings-page-head">
                            <h3 class="settings-page-title">{{ currentMeta.label }}</h3>
                            <p class="settings-page-desc">{{ currentMeta.description }}</p>
                        </header>
                        <AdminNetworksPanel v-if="activeSection === 'adminNetworks' && adminSession && activeConnection"
                            :key="activeConnection.connectionId" :connection-id="activeConnection.connectionId" />

                        <FlowNotice v-if="activeSection === 'adminMail' && egress.isOff('smtp')" tone="warning" size="sm" class="mb-3"
                            title="Email is off">{{ EGRESS_OFF_TEXT.smtp }}</FlowNotice>
                        <AdminSmtpPanel v-if="activeSection === 'adminMail' && adminSession && activeConnection"
                            :key="activeConnection.connectionId" :connection-id="activeConnection.connectionId" />
                        <AdminStaffAlertsPanel v-if="activeSection === 'adminMail' && adminSession && activeConnection"
                            :key="`staff-${activeConnection.connectionId}`" :connection-id="activeConnection.connectionId" />
                        <EmailProblemsPanel v-if="activeSection === 'adminMail' && adminSession && activeConnection"
                            :key="`problems-${activeConnection.connectionId}`" :connection-id="activeConnection.connectionId" />

                        <AdminScannerPanel v-if="activeSection === 'adminSecurity' && adminSession && activeConnection"
                            :key="`scanner-${activeConnection.connectionId}`" :connection-id="activeConnection.connectionId" />
                        <AdminEgressPanel v-if="activeSection === 'adminSecurity' && adminSession && activeConnection"
                            :key="`egress-${activeConnection.connectionId}`" :connection-id="activeConnection.connectionId" class="mt-6"
                            @changed="egress.load" />

                        <!-- Loading state: shown until settings arrive from the server -->
                        <div v-if="!settingsLoaded && (activeSection === 'sharing' || activeSection === 'linkOptions')" class="flex flex-col items-center justify-center gap-3 py-12">
                            <template v-if="loadError">
                                <FlowNotice tone="danger" title="Couldn't load settings">{{ loadError }}</FlowNotice>
                                <button class="btn btn-secondary" type="button" :disabled="busy" @click="reload">Try again</button>
                            </template>
                            <template v-else>
                                <svg class="animate-spin h-6 w-6 text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                <span class="text-sm text-muted">Loading settings…</span>
                            </template>
                        </div>

                        <!-- ═══ Link Sharing ══════════════════════════════════ -->
                        <template v-if="activeSection === 'sharing' && settingsLoaded">
                            <FlowNotice v-if="externalAuto && egress.isOff('public_ip')" tone="warning" size="sm" class="mb-3"
                                title="Public IP lookup is off">{{ EGRESS_OFF_TEXT.public_ip }}</FlowNotice>
                            <p class="settings-subhead settings-subhead--first">Internet address</p>
                            <div class="settings-group">
                                <SettingRow label="Detect automatically" description="Use this server's public IP address.">
                                    <FlowSwitch v-model="externalAuto" :disabled="busy" label="Toggle external auto-detect" />
                                </SettingRow>
                                <SettingRow v-if="!externalAuto" label="Custom address" description="A domain name or public IP, with no path. A domain needs a trusted certificate (see HTTPS certificate).">
                                    <input v-model="externalBase" type="text" :disabled="busy || externalAuto"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="https://example.ddns.net" />
                                </SettingRow>
                                <SettingRow label="HTTPS port" description="The port clients reach from the internet. Forward it on your router.">
                                    <input v-model.number="externalHttpsPort" type="number" min="1" max="65535" :disabled="busy"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-20 text-right" />
                                </SettingRow>
                            </div>

                            <p class="settings-subhead">Local network address</p>
                            <div class="settings-group">
                                <SettingRow label="Detect automatically" description="Use this server's local IP address.">
                                    <FlowSwitch v-model="internalAuto" :disabled="busy" label="Toggle internal auto-detect" />
                                </SettingRow>
                                <SettingRow v-if="!internalAuto" label="Custom address" description="A private IP or internal hostname.">
                                    <input v-model="internalBase" type="text" :disabled="busy || internalAuto"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="http://192.168.1.123" />
                                </SettingRow>
                            </div>

                            <!-- URL Preview -->
                            <div class="mt-5 rounded-lg border border-default bg-default/40 p-3 space-y-2">
                                <div class="settings-subhead !mt-0">Links will look like</div>
                                <div class="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <div class="text-xs text-accent">Internet</div>
                                        <div class="font-mono text-xs break-all mt-0.5">{{ externalPreview || '—' }}</div>
                                        <div v-if="externalAuto && externalEffectivePreview"
                                            class="mt-1 text-xs opacity-60 break-all">
                                            Detected: <span class="font-mono">{{ externalEffectivePreview }}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-accent">Local network</div>
                                        <div class="font-mono text-xs break-all mt-0.5">{{ internalPreview || '—' }}</div>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Public Sharing ════════════════════════════════ -->
                        <template v-if="activeSection === 'publicSharing'">
                            <FlowNotice v-if="egress.isOff('port_check')" tone="warning" size="sm" class="mb-3"
                                title="Port check is off">{{ EGRESS_OFF_TEXT.port_check }}</FlowNotice>
                            <FlowNotice v-if="egress.isOff('public_ip')" tone="warning" size="sm" class="mb-3"
                                title="Public IP lookup is off">{{ EGRESS_OFF_TEXT.public_ip }}</FlowNotice>
                            <!-- Status Summary Card -->
                            <div class="rounded-lg border p-4 mb-4" :class="{
                                'flow-tone-success': publicSharingStatus?.friendlyStatus === 'ready',
                                'flow-tone-warning': publicSharingStatus?.friendlyStatus === 'needs_trusted_cert' || publicSharingStatus?.friendlyStatus === 'firewall_warning',
                                'flow-tone-danger': publicSharingStatus?.friendlyStatus === 'nginx_warning',
                                'border-default bg-default/40': !publicSharingStatus || publicSharingStatus?.friendlyStatus === 'unknown',
                            }">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center gap-2">
                                        <div class="text-sm font-semibold" :class="{
                                            'text-flow-success': publicSharingStatus?.friendlyStatus === 'ready',
                                            'text-flow-warning': publicSharingStatus?.friendlyStatus === 'needs_trusted_cert' || publicSharingStatus?.friendlyStatus === 'firewall_warning',
                                            'text-flow-danger': publicSharingStatus?.friendlyStatus === 'nginx_warning',
                                            'text-default': !publicSharingStatus || publicSharingStatus?.friendlyStatus === 'unknown',
                                        }">
                                            {{ publicSharingFriendlyLabel }}
                                        </div>
                                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" :class="{
                                            'flow-tone-success': publicSharingStatus?.friendlyStatus === 'ready',
                                            'flow-tone-warning': publicSharingStatus?.friendlyStatus === 'needs_trusted_cert' || publicSharingStatus?.friendlyStatus === 'firewall_warning',
                                            'flow-tone-danger': publicSharingStatus?.friendlyStatus === 'nginx_warning',
                                            'bg-default text-accent': !publicSharingStatus || publicSharingStatus?.friendlyStatus === 'unknown',
                                        }">
                                            {{ publicSharingStatusBadge }}
                                        </span>
                                    </div>
                                    <button class="btn btn-secondary text-xs px-2 py-1" :disabled="publicSharingBusy" @click="checkPublicSharing">
                                        {{ publicSharingBusy ? 'Checking…' : 'Check Now' }}
                                    </button>
                                </div>
                            </div>

                            <!-- Status Rows -->
                            <div class="settings-group">
                                <SettingRow label="Share URL" description="The public URL recipients use to view your shared content.">
                                    <span class="font-mono text-xs">{{ publicSharingStatus?.settings?.externalBaseEffective || '(not configured)' }}</span>
                                </SettingRow>
                                <SettingRow label="Internet links" description="Copied links use a domain name with a trusted certificate, never the server's IP address.">
                                    <FlowChip v-if="recipientReadiness" size="sm" :tone="recipientReadiness.ready ? 'success' : 'warning'" :dot="recipientReadiness.ready">
                                        {{ recipientReadiness.ready ? 'Ready' : 'Not ready' }}
                                    </FlowChip>
                                    <span v-else class="text-xs text-muted">Checking…</span>
                                </SettingRow>
                                <SettingRow label="HTTPS" :description="publicSharingCertDescription">
                                    <span class="text-sm" :class="{
                                        'text-flow-success': publicSharingStatus?.certificate?.mode === 'letsencrypt' && publicSharingStatus?.certificate?.valid,
                                        'text-flow-warning': publicSharingStatus?.certificate?.mode === 'self-signed',
                                        'text-flow-danger': publicSharingStatus?.certificate?.mode === 'letsencrypt' && !publicSharingStatus?.certificate?.valid,
                                    }">{{ publicSharingCertLabel }}</span>
                                </SettingRow>
                                <SettingRow label="Web routing" description="Houston automatically configures web traffic routing.">
                                    <span class="text-sm" :class="{
                                        'text-flow-success': publicSharingStatus?.nginx?.running && publicSharingStatus?.nginx?.configValid,
                                        'text-flow-danger': publicSharingStatus?.nginx && (!publicSharingStatus?.nginx?.running || !publicSharingStatus?.nginx?.configValid),
                                    }">{{ publicSharingNginxLabel }}</span>
                                </SettingRow>
                                <SettingRow label="Firewall" description="HTTP and HTTPS ports must be open for external access.">
                                    <span class="text-sm" :class="{
                                        'text-flow-success': publicSharingStatus?.firewall?.httpOpen && publicSharingStatus?.firewall?.httpsOpen,
                                        'text-flow-warning': publicSharingStatus?.firewall && (!publicSharingStatus?.firewall?.httpOpen || !publicSharingStatus?.firewall?.httpsOpen),
                                    }">{{ publicSharingFirewallLabel }}</span>
                                </SettingRow>
                                <SettingRow v-if="publicSharingStatus?.bootstrap?.timestamp" label="Last setup" description="When Houston last configured public sharing.">
                                    <span class="text-xs text-accent">{{ formatBootstrapTime(publicSharingStatus.bootstrap.timestamp) }}</span>
                                </SettingRow>
                            </div>

                            <FlowNotice v-if="recipientReadiness && !recipientReadiness.ready" tone="warning" size="sm" class="mt-3">
                                {{ describeExternalAddressNotReady(recipientReadiness.reason) }}
                                <template #actions>
                                    <button v-if="recipientReadiness.reason === 'certificate_not_trusted'" type="button" class="btn btn-secondary btn-xs"
                                        @click="activeSection = 'certificate'">Open HTTPS certificate</button>
                                    <button v-else type="button" class="btn btn-secondary btn-xs" @click="activeSection = 'sharing'">Open Share addresses</button>
                                </template>
                            </FlowNotice>

                            <!-- Action Buttons -->
                            <p class="settings-subhead">Fix problems</p>
                            <div class="flex flex-wrap items-center gap-2">
                                <button class="btn btn-secondary text-sm" type="button"
                                    :disabled="publicSharingBusy" @click="repairPublicSharing">
                                    {{ publicSharingRepairBusy ? 'Repairing…' : 'Repair internet sharing' }}
                                </button>
                                <button class="btn btn-secondary text-sm" type="button"
                                    @click="activeSection = 'certificate'">
                                    Install a trusted certificate…
                                </button>
                                <button class="btn btn-secondary text-sm" type="button"
                                    :disabled="publicSharingBusy" @click="regenerateLocalCert">
                                    {{ publicSharingRegenBusy ? 'Regenerating…' : 'Regenerate local certificate' }}
                                </button>
                            </div>

                            <!-- Check Results -->
                            <div v-if="publicSharingCheckResult" class="mt-4 rounded-lg border border-default bg-default/40 p-3">
                                <div class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Check Results</div>
                                <div v-if="publicSharingCheckResult.issues?.length === 0" class="text-sm text-flow-success">
                                    All checks passed. Public sharing is working correctly.
                                </div>
                                <div v-else class="space-y-2">
                                    <div v-for="(issue, idx) in publicSharingCheckResult.issues" :key="idx"
                                        class="flex items-start gap-2 text-sm">
                                        <span class="shrink-0 mt-0.5" :class="{
                                            'text-flow-danger': issue.severity === 'error',
                                            'text-flow-warning': issue.severity === 'warning',
                                        }">{{ issue.severity === 'error' ? '✕' : '⚠' }}</span>
                                        <span>{{ issue.message }}</span>
                                    </div>
                                </div>
                                <div class="text-xs text-accent mt-2">Checked: {{ publicSharingCheckResult.checkedAt ? new Date(publicSharingCheckResult.checkedAt).toLocaleString(undefined, { hour12: hour12 }) : '' }}</div>
                            </div>

                            <!-- Repair Results -->
                            <div v-if="publicSharingRepairResult" class="mt-3 rounded-lg border border-default bg-default/40 p-3">
                                <div class="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Repair Results</div>
                                <div class="space-y-1">
                                    <div v-for="(action, idx) in publicSharingRepairResult.actions" :key="idx"
                                        class="flex items-center gap-2 text-sm">
                                        <span :class="{
                                            'text-flow-success': action.status === 'ok',
                                            'text-flow-danger': action.status === 'error',
                                            'text-flow-warning': action.status === 'warning',
                                        }">{{ action.status === 'ok' ? '✓' : action.status === 'error' ? '✕' : '⚠' }}</span>
                                        <span>{{ action.message }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Advanced Details (collapsed) -->
                            <details class="mt-5 border-t border-default pt-4">
                                <summary class="text-xs font-semibold text-accent uppercase tracking-wide cursor-pointer select-none hover:text-default transition-colors">
                                    Advanced Details
                                </summary>
                                <div class="mt-3 text-xs space-y-2 font-mono bg-well rounded p-3">
                                    <div><span class="text-accent">Proxy:</span> nginx</div>
                                    <div><span class="text-accent">Config path:</span> {{ publicSharingStatus?.nginx?.configPath || '/etc/nginx/conf.d/houston-broadcaster.conf' }}</div>
                                    <div><span class="text-accent">Certificate path:</span> {{ publicSharingStatus?.certificate?.mode === 'letsencrypt' && publicSharingStatus?.certificate?.domain ? `/etc/letsencrypt/live/${publicSharingStatus.certificate.domain}/fullchain.pem` : '/etc/ssl/selfsigned/houston.crt' }}</div>
                                    <div><span class="text-accent">App target:</span> {{ publicSharingStatus?.bootstrap?.app?.target || '127.0.0.1:9095' }}</div>
                                    <div><span class="text-accent">Service:</span> {{ publicSharingStatus?.bootstrap?.app?.service || 'houston-broadcaster.service' }}</div>
                                    <div><span class="text-accent">Firewall tool:</span> {{ publicSharingStatus?.firewall?.tool || 'unknown' }}</div>
                                    <div><span class="text-accent">Firewall ports:</span> {{ publicSharingStatus?.bootstrap?.firewall?.ports || '80/tcp, 443/tcp' }}</div>
                                    <div v-if="publicSharingStatus?.bootstrap?.timestamp"><span class="text-accent">Last bootstrap:</span> {{ publicSharingStatus.bootstrap.timestamp }}</div>
                                    <div v-if="publicSharingStatus?.bootstrap?.status"><span class="text-accent">Bootstrap status:</span> {{ publicSharingStatus.bootstrap.status }}</div>
                                    <div v-if="publicSharingStatus?.bootstrap?.nginx?.warnings?.length">
                                        <span class="text-accent">Warnings:</span>
                                        <ul class="list-disc list-inside ml-2 mt-1">
                                            <li v-for="(w, i) in publicSharingStatus.bootstrap.nginx.warnings" :key="i">{{ w }}</li>
                                        </ul>
                                    </div>
                                </div>
                            </details>
                        </template>

                        <!-- ═══ New link defaults ═════════════════════════════ -->
                        <template v-if="activeSection === 'linkOptions' && settingsLoaded">
                            <p class="settings-subhead">Who can open new links</p>
                            <div class="settings-group">
                                <SettingRow label="Network" description="Internet links work anywhere (needs port forwarding). Local Network links only work on the same network or VPN as this server.">
                                    <div class="settings-segmented" role="radiogroup" aria-label="Default link network">
                                        <button type="button" role="radio" :aria-checked="!defaultAccessIsExternal"
                                            :class="{ 'is-on': !defaultAccessIsExternal }" @click="defaultAccessIsExternal = false">Local Network</button>
                                        <button type="button" role="radio" :aria-checked="defaultAccessIsExternal"
                                            :class="{ 'is-on': defaultAccessIsExternal }" @click="defaultAccessIsExternal = true">Internet</button>
                                    </div>
                                </SettingRow>
                                <SettingRow label="Invite-only links (recommended)"
                                    description="New links start as “Only invited clients &amp; teams”. Turn off to start them as “Anyone with the link”.">
                                    <FlowSwitch v-model="defaultRestrictAccess" :disabled="busy" label="Invite-only links" />
                                </SettingRow>
                                <SettingRow label="Allow comments on open links"
                                    description="Let people comment on links that don't need a sign-in.">
                                    <FlowSwitch v-model="defaultAllowComments" :disabled="busy" label="Allow comments on open links" />
                                </SettingRow>
                            </div>

                            <p class="settings-subhead">Expiry</p>
                            <div class="settings-group">
                                <SettingRow label="Links never expire" description="Turn off to give new links an end date.">
                                    <FlowSwitch v-model="defaultExpiryNever" :disabled="busy" label="Links never expire" />
                                </SettingRow>
                                <SettingRow v-if="!defaultExpiryNever" label="Expire after"
                                    description="After this time the link stops working and clients can no longer open it.">
                                    <div class="flex items-center gap-2">
                                        <input v-model.number="defaultExpiryValue" type="number" min="1" :disabled="busy"
                                            aria-label="Expire after" class="input-textlike px-2 py-1 w-20 text-sm text-center" placeholder="1" />
                                        <select v-model="defaultExpiryUnit" :disabled="busy" aria-label="Unit"
                                            class="input-textlike px-2 py-1 w-28 text-sm">
                                            <option value="hours">Hours</option>
                                            <option value="days">Days</option>
                                            <option value="weeks">Weeks</option>
                                        </select>
                                    </div>
                                </SettingRow>
                            </div>

                            <p class="settings-subhead">Video</p>
                            <div class="settings-group">
                                <SettingRow label="Make proxy files"
                                    description="Create smaller copies of videos that stream smoothly in the browser.">
                                    <FlowSwitch v-model="defaultUseProxyFiles" :disabled="busy" label="Make proxy files" />
                                </SettingRow>
                                <SettingRow v-if="proxyQualitiesSupported" label="Proxy sizes for uploads"
                                    description="The proxy files the server makes for uploaded videos when the upload doesn't choose its own.">
                                    <div class="flex items-center gap-3" role="group" aria-label="Proxy sizes for uploads">
                                        <label v-for="q in PROXY_QUALITY_CHOICES" :key="q" class="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                                            <input type="checkbox" class="proxy-quality-checkbox" :value="q" :checked="effectiveProxyQualities.includes(q)"
                                                :disabled="busy || (effectiveProxyQualities.length === 1 && effectiveProxyQualities.includes(q))"
                                                @change="toggleDefaultProxyQuality(q)" />
                                            <span>{{ q === 'original' ? 'Original' : q }}</span>
                                        </label>
                                    </div>
                                </SettingRow>
                                <SettingRow v-if="speedProfileSupported" label="Server encoding"
                                    description="How the server makes proxy files. Faster finishes sooner with slightly larger, softer files; Higher quality takes longer.">
                                    <div class="settings-segmented" role="radiogroup" aria-label="Server encoding">
                                        <button v-for="p in SPEED_PROFILE_CHOICES" :key="p.id" type="button" role="radio"
                                            :aria-checked="transcodeSpeedProfile === p.id" :class="{ 'is-on': transcodeSpeedProfile === p.id }"
                                            :disabled="busy" @click="transcodeSpeedProfile = p.id">{{ p.label }}</button>
                                    </div>
                                </SettingRow>
                                <SettingRow label="Watermark videos" description="Stamp an image on videos in new links.">
                                    <FlowSwitch v-model="defaultWatermarkEnabled" :disabled="busy" label="Watermark videos" />
                                </SettingRow>
                                <div v-if="defaultWatermarkEnabled" class="py-3 space-y-2">
                                        <div class="flex items-center gap-2 mb-2">
                                            <label class="inline-flex items-center gap-1.5 text-xs">
                                                <input type="checkbox" v-model="showDefaultWatermarksInSettings" class="proxy-quality-checkbox" />
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
                                                <optgroup v-if="showDefaultWatermarksInSettings && defaultWatermarkPresets.length && existingWatermarkFiles.length" label="Client Uploads">
                                                    <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
                                                </optgroup>
                                                <template v-else-if="existingWatermarkFiles.length">
                                                    <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
                                                </template>
                                                <optgroup v-if="showDefaultWatermarksInSettings && defaultWatermarkPresets.length" label="45Flow Defaults">
                                                    <option v-for="preset in defaultWatermarkPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
                                                </optgroup>
                                            </select>
                                            <button class="btn btn-secondary px-2 py-1 text-xs" @click="refreshWatermarks">Refresh</button>
                                        </div>
                                        
                                        <p v-if="!defaultWatermarkFile && !selectedExistingWatermark" class="text-xs text-flow-warning">
                                            Select a watermark image to continue.
                                        </p>
                                        
                                        <!-- Watermark Customizer (premium) or basic preview (free) -->
                                        <div v-if="defaultWatermarkFile || selectedExistingWatermark" class="mt-4 border-t border-default pt-4 min-w-0">
                                            <WatermarkCustomizer v-if="isPremiumActive"
                                                v-model="watermarkSettings"
                                                :watermarkPreviewUrl="effectiveWatermarkPreviewUrl"
                                            />
                                            <WatermarkPreview v-else
                                                :previewUrl="effectiveWatermarkPreviewUrl || ''"
                                                label="Watermark (bottom-right)"
                                            />
                                        </div>
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Application / Preferences ═════════════════════ -->
                        <template v-if="activeSection === 'app'">
                            <p class="settings-subhead">Display</p>
                            <div class="settings-group">
                                <SettingRow label="Time format" description="How timestamps are displayed throughout the app.">
                                    <div class="settings-segmented" role="radiogroup" aria-label="Time format">
                                        <button type="button" role="radio" :aria-checked="!hour12" :class="{ 'is-on': !hour12 }" @click="hour12 = false">24-hour</button>
                                        <button type="button" role="radio" :aria-checked="hour12" :class="{ 'is-on': hour12 }" @click="hour12 = true">12-hour</button>
                                    </div>
                                </SettingRow>
                                <SettingRow label="Default link list view" description="Choose which links are shown by default when viewing the Manage Links list.">
                                    <select v-model="linkListDefault" class="text-sm bg-well border border-default rounded px-2 py-1">
                                        <option value="">All Links</option>
                                        <option value="active">Active Only</option>
                                    </select>
                                </SettingRow>
                                <SettingRow v-if="isWeb" label="Notify when uploads finish" :description="notifyDescription">
                                    <button
                                        class="btn btn-secondary text-sm px-3 py-1"
                                        type="button"
                                        :disabled="notifyPermission === 'unsupported' || notifyPermission === 'denied'"
                                        @click="toggleBrowserNotifications"
                                    >
                                        {{ notifyOn ? 'Turn off' : 'Turn on' }}
                                    </button>
                                </SettingRow>
                            </div>

                            <p class="settings-subhead">Server folders</p>
                            <div class="settings-group">
                                <div class="py-3">
                                    <p class="text-sm font-medium text-default">Default server folder</p>
                                    <p class="text-xs text-accent mt-0.5 mb-2">
                                        Holds the hidden .45flow folder (proxy files and streams) for links that aren't in a project. Each project keeps its own .45flow folder inside its project folder.
                                    </p>
                                    <PathInput
                                        v-model="projectRoot"
                                        :apiFetch="apiFetch"
                                        :dirsOnly="true"
                                    />
                                </div>
                                <SettingRow label="Start folder pickers here" description="Folder pickers open in the default server folder. Projects still use their own folders.">
                                    <FlowSwitch v-model="forceProjectRoot" :disabled="busy" label="Start folder pickers in the default server folder" />
                                </SettingRow>
                            </div>

                        </template>

                        <!-- ═══ Performance ═══════════════════════════════════ -->
                        <template v-if="activeSection === 'performance' && isWeb">
                            <p class="text-sm text-muted">Client-side transcoding and hardware detection require 45Flow Desktop. Browser mode does not access your workstation's filesystem or GPU.</p>
                        </template>
                        <template v-else-if="activeSection === 'performance'">
                            <p class="settings-subhead">Client-Side Transcoding</p>
                            <p class="text-xs text-muted mb-3">When enabled, video processing (proxy files and browser streams) happens on this computer using your CPU or GPU before uploading. When disabled, the server handles all transcoding after files are uploaded.</p>
                            <div class="settings-group">
                                <SettingRow 
                                    label="Enable client-side transcoding" 
                                    description="Process videos locally to create proxy files faster and reduce server load. Requires FFmpeg — works best with a modern GPU."
                                >
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm" :class="!clientTranscodeEnabled ? 'opacity-60' : 'font-semibold'">
                                            {{ clientTranscodeEnabled ? 'Enabled' : 'Disabled' }}
                                        </span>
                                        <FlowSwitch v-model="clientTranscodeEnabled" label="Toggle client-side transcoding" />
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
                                        <FlowSwitch v-model="hwAccelEnabled" :disabled="!hardwareCapabilities?.hasHardwareAccel" label="Use hardware acceleration" />
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
                                            :class="ok ? 'flow-tone-success' : 'bg-default text-muted line-through opacity-50'"
                                        >{{ codec }}</span>
                                    </div>
                                </SettingRow>
                            </div>

                        </template>

                        <!-- ═══ Help ══════════════════════════════════════════ -->
                        <template v-if="activeSection === 'help'">
                            <div class="settings-group">
                                <SettingRow label="User Guide" description="Open the full 45Flow documentation in your browser.">
                                    <button
                                        class="btn btn-secondary text-sm px-3 py-1"
                                        type="button"
                                        @click="openUserGuide"
                                    >
                                        Open User Guide
                                    </button>
                                </SettingRow>
                                <SettingRow label="API Documentation" description="Open the interactive Swagger API docs for your connected server.">
                                    <button
                                        class="btn btn-secondary text-sm px-3 py-1"
                                        type="button"
                                        @click="openApiDocs"
                                    >
                                        Open API Docs
                                    </button>
                                </SettingRow>
                            </div>

                            <p class="settings-subhead">Guided Tours</p>
                            <div class="settings-group">
                                <SettingRow label="Disable guided tours" description="Turn off all onboarding walkthroughs and first-time guides.">
                                    <FlowSwitch v-model="toursDisabled" label="Disable guided tours" />
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

                        <!-- ═══ Go Pro / Upgrade ══════════════════════════════ -->
                        <template v-if="activeSection === 'upgrade'">
                            <!-- Full license active (non-trial) -->
                            <div v-if="isPremiumActive && !isFallback && !isTrial" class="space-y-3">
                                <div class="rounded-lg border flow-tone-success p-4">
                                    <div class="flex items-center gap-2 mb-2">
                                        <div class="text-sm font-semibold text-flow-success">Pro Edition Active</div>
                                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-success">
                                            {{ licenseInfo?.perpetual ? 'Perpetual' : 'Licensed' }}
                                        </span>
                                    </div>
                                    <div class="text-sm text-flow-success space-y-1">
                                        <p>All premium features are enabled on this server.</p>
                                    </div>
                                </div>

                                <!-- License Details Card -->
                                <div class="rounded-lg border border-default bg-default/40 p-4">
                                    <div class="text-xs font-semibold text-accent uppercase tracking-wide mb-3">License Details</div>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div v-if="licenseInfo?.customerEmail" class="col-span-2">
                                            <span class="text-accent">Licensed to:</span>
                                            <span class="font-medium ml-1">{{ licenseInfo.customerEmail }}</span>
                                        </div>
                                        <div v-if="licenseInfo?.licenseId">
                                            <span class="text-accent">License ID:</span>
                                            <span class="font-mono text-xs ml-1">{{ licenseInfo.licenseId.slice(0, 8) }}…</span>
                                        </div>
                                        <div>
                                            <span class="text-accent">Type:</span>
                                            <span class="ml-1">{{ licenseInfo?.perpetual ? 'Perpetual' : 'Subscription' }}</span>
                                        </div>
                                        <div v-if="licenseInfo?.activatedAt">
                                            <span class="text-accent">Activated:</span>
                                            <span class="ml-1">{{ new Date(licenseInfo.activatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }}</span>
                                        </div>
                                        <div v-if="licenseInfo?.expiresAt && !licenseInfo?.perpetual">
                                            <span class="text-accent">Expires:</span>
                                            <span class="ml-1">{{ new Date(licenseInfo.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }}</span>
                                        </div>
                                        <div v-else-if="licenseInfo?.perpetual">
                                            <span class="text-accent">Expires:</span>
                                            <span class="ml-1 text-flow-success">Never</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Renewal: re-activating fetches a certificate with the new expiry -->
                                <div v-if="!licenseInfo?.perpetual" class="rounded-lg border border-default bg-default/40 p-4">
                                    <div class="text-sm font-semibold text-default mb-1">Renewed your license?</div>
                                    <p class="text-sm text-accent leading-relaxed mb-3">
                                        Enter your license key again to update this server with the new expiry date.
                                    </p>
                                    <div class="flex gap-2">
                                        <input
                                            v-model="upgradeKey"
                                            type="text"
                                            class="input-textlike border border-default px-3 py-2 rounded text-sm flex-1"
                                            placeholder="STUDIO-XXXX-XXXX-XXXX-XXXX"
                                            :disabled="upgradeBusy"
                                            @keydown.enter.prevent="handleUpgradeActivate"
                                        />
                                        <button
                                            class="btn btn-secondary text-sm px-4"
                                            type="button"
                                            :disabled="upgradeBusy || !upgradeKey.trim()"
                                            @click="handleUpgradeActivate"
                                        >
                                            {{ upgradeBusy ? 'Updating…' : 'Update License' }}
                                        </button>
                                    </div>
                                    <div v-if="upgradeError" class="text-flow-danger text-sm mt-3">{{ upgradeError }}</div>
                                </div>
                            </div>

                            <!-- Trial active -->
                            <div v-else-if="isPremiumActive && isTrial" class="space-y-3">
                                <div class="rounded-lg border flow-tone-warning p-4">
                                    <div class="flex items-center gap-2 mb-1">
                                        <div class="text-sm font-semibold text-flow-warning">Pro Trial Active</div>
                                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-warning">Trial</span>
                                    </div>
                                    <div class="text-sm text-flow-warning space-y-1">
                                        <p v-if="licenseInfo?.expiresAt">
                                            Trial expires: <span class="font-semibold">{{ new Date(licenseInfo.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}</span>
                                        </p>
                                        <p v-if="trialDaysRemaining != null">
                                            <span class="font-semibold">{{ trialDaysRemaining }}</span> {{ trialDaysRemaining === 1 ? 'day' : 'days' }} remaining
                                        </p>
                                    </div>
                                </div>

                                <div class="rounded-lg border border-default bg-default/40 p-4 mb-4">
                                    <div class="text-sm font-semibold text-default mb-1">Upgrade to Full License</div>
                                    <p class="text-sm text-accent leading-relaxed mb-3">
                                        Keep all Pro features after your trial ends.
                                        <a href="https://45drivesstudio.com/contact" target="_blank" rel="noopener noreferrer" 
                                           class="text-blue-500 hover:text-blue-600 underline">Contact 45Studio</a> to purchase a license.
                                    </p>
                                    <div class="py-3">
                                        <label class="block text-sm font-medium text-default mb-1">License Key</label>
                                        <div class="flex gap-2">
                                            <input
                                                v-model="upgradeKey"
                                                type="text"
                                                class="input-textlike border border-default px-3 py-2 rounded text-sm flex-1"
                                                placeholder="STUDIO-XXXX-XXXX-XXXX-XXXX"
                                                :disabled="upgradeBusy"
                                                @keydown.enter.prevent="handleUpgradeActivate"
                                            />
                                            <button
                                                class="btn btn-primary text-sm px-4"
                                                type="button"
                                                :disabled="upgradeBusy || !upgradeKey.trim()"
                                                @click="handleUpgradeActivate"
                                            >
                                                {{ upgradeBusy ? 'Activating…' : 'Activate' }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="upgradeError" class="text-flow-danger text-sm mt-3">{{ upgradeError }}</div>
                            </div>

                            <!-- Unlicensed — Pro expired (legacy/fallback mode) -->
                            <div v-else-if="isFallback" class="space-y-3">
                                <div class="rounded-lg border flow-tone-warning p-4">
                                    <div class="flex items-center gap-2 mb-2">
                                        <div class="text-sm font-semibold text-flow-warning">License Expired</div>
                                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-warning">Legacy Mode</span>
                                    </div>
                                    <div class="text-sm text-flow-warning space-y-1">
                                        <p>Your Pro license has expired. Premium features remain available at your current version, but app and server updates are paused until you renew.</p>
                                        <p v-if="licenseInfo?.expiresAt" class="text-xs opacity-80">
                                            Expired: {{ new Date(licenseInfo.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}
                                        </p>
                                    </div>
                                </div>

                                <div class="rounded-lg border border-default bg-default/40 p-4">
                                    <div class="text-sm font-semibold text-default mb-1">Renew License</div>
                                    <p class="text-sm text-accent leading-relaxed mb-3">
                                        Renew to restore app updates and continued support.
                                        <a href="https://45drivesstudio.com/contact" target="_blank" rel="noopener noreferrer" 
                                           class="text-blue-500 hover:text-blue-600 underline">Contact 45Studio</a> to renew.
                                    </p>
                                    <div class="py-3">
                                        <label class="block text-sm font-medium text-default mb-1">License Key</label>
                                        <div class="flex gap-2">
                                            <input
                                                v-model="upgradeKey"
                                                type="text"
                                                class="input-textlike border border-default px-3 py-2 rounded text-sm flex-1"
                                                placeholder="STUDIO-XXXX-XXXX-XXXX-XXXX"
                                                :disabled="upgradeBusy"
                                                @keydown.enter.prevent="handleUpgradeActivate"
                                            />
                                            <button
                                                class="btn btn-primary text-sm px-4"
                                                type="button"
                                                :disabled="upgradeBusy || !upgradeKey.trim()"
                                                @click="handleUpgradeActivate"
                                            >
                                                {{ upgradeBusy ? 'Activating…' : 'Activate' }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="upgradeError" class="text-flow-danger text-sm mt-3">{{ upgradeError }}</div>
                            </div>

                            <!-- Unlicensed — Trial expired (community mode) -->
                            <div v-else-if="isTrialExpired" class="space-y-3">
                                <div class="rounded-lg border flow-tone-danger p-4">
                                    <div class="flex items-center gap-2 mb-2">
                                        <div class="text-sm font-semibold text-flow-danger">Trial Expired</div>
                                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-danger">Community Mode</span>
                                    </div>
                                    <div class="text-sm text-flow-danger space-y-1">
                                        <p>Your 30-day Pro trial has expired. The server is now in Community mode — premium features are disabled.</p>
                                        <p v-if="licenseInfo?.expiresAt" class="text-xs opacity-80">
                                            Trial ended: {{ new Date(licenseInfo.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}
                                        </p>
                                    </div>
                                </div>

                                <div class="rounded-lg border border-default bg-default/40 p-4">
                                    <div class="text-sm font-semibold text-default mb-1">Upgrade to Full License</div>
                                    <p class="text-sm text-accent leading-relaxed mb-3">
                                        Purchase a Pro license to restore all premium features.
                                        <a href="https://45drivesstudio.com/contact" target="_blank" rel="noopener noreferrer" 
                                           class="text-blue-500 hover:text-blue-600 underline">Contact 45Studio</a> to purchase.
                                    </p>
                                    <div class="py-3">
                                        <label class="block text-sm font-medium text-default mb-1">License Key</label>
                                        <div class="flex gap-2">
                                            <input
                                                v-model="upgradeKey"
                                                type="text"
                                                class="input-textlike border border-default px-3 py-2 rounded text-sm flex-1"
                                                placeholder="STUDIO-XXXX-XXXX-XXXX-XXXX"
                                                :disabled="upgradeBusy"
                                                @keydown.enter.prevent="handleUpgradeActivate"
                                            />
                                            <button
                                                class="btn btn-primary text-sm px-4"
                                                type="button"
                                                :disabled="upgradeBusy || !upgradeKey.trim()"
                                                @click="handleUpgradeActivate"
                                            >
                                                {{ upgradeBusy ? 'Activating…' : 'Activate' }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="upgradeError" class="text-flow-danger text-sm mt-3">{{ upgradeError }}</div>
                            </div>

                            <!-- Unlicensed (never licensed) -->
                            <div v-else>
                                <div class="rounded-lg border border-default bg-default/40 p-4 mb-4">
                                    <div class="text-sm font-semibold text-default mb-1">45Flow Pro Edition</div>
                                    <p class="text-sm text-accent leading-relaxed">
                                        Upgrade to Pro for multi-server connections, custom watermarks, comment review/export workflows,
                                        white-label branding, and more premium features as well as priority support.
                                        <a href="https://45drivesstudio.com/contact" target="_blank" rel="noopener noreferrer" 
                                           class="text-blue-500 hover:text-blue-600 underline">Contact 45Studio</a> to purchase a license.
                                    </p>
                                </div>

                                <div class="settings-group">
                                    <!-- Trial Request Section -->
                                    <div class="py-3">
                                        <label class="block text-sm font-medium text-default mb-1">Start Free 30-Day Trial</label>
                                        <p class="text-xs text-accent mb-2">
                                            Try all Pro features free for 30 days. Limited to 1 activation per trial.
                                        </p>
                                        <div class="flex gap-2">
                                            <button
                                                class="btn btn-primary text-sm px-4"
                                                type="button"
                                                :disabled="trialBusy"
                                                @click="handleTrialRequest"
                                            >
                                                {{ trialBusy ? 'Requesting…' : 'Start Trial' }}
                                            </button>
                                        </div>
                                        <div v-if="trialError" class="text-flow-danger text-xs mt-2">{{ trialError }}</div>
                                        <div v-if="trialSuccess" class="text-flow-success text-xs mt-2">{{ trialSuccess }}</div>
                                    </div>

                                    <!-- License Key Activation Section -->
                                    <div class="py-3">
                                        <label class="block text-sm font-medium text-default mb-1">License Key</label>
                                        <div class="flex gap-2">
                                            <input
                                                v-model="upgradeKey"
                                                type="text"
                                                class="input-textlike border border-default px-3 py-2 rounded text-sm flex-1"
                                                placeholder="STUDIO-XXXX-XXXX-XXXX-XXXX"
                                                :disabled="upgradeBusy"
                                                @keydown.enter.prevent="handleUpgradeActivate"
                                            />
                                            <button
                                                class="btn btn-primary text-sm px-4"
                                                type="button"
                                                :disabled="upgradeBusy || !upgradeKey.trim()"
                                                @click="handleUpgradeActivate"
                                            >
                                                {{ upgradeBusy ? 'Activating…' : 'Activate' }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="upgradeError" class="text-flow-danger text-sm mt-3">{{ upgradeError }}</div>
                            </div>
                        </template>

                        <!-- ═══ SSL Certificate ═══════════════════════════════ -->
                        <template v-if="activeSection === 'certificate'">
                            <!-- Current status -->
                            <div class="rounded-lg border border-default bg-default/40 p-3 mb-4">
                                <div class="flex items-center gap-2 mb-2">
                                    <div class="text-xs font-semibold text-accent uppercase tracking-wide">Certificate Status</div>
                                    <span v-if="certStatus.certMode === 'letsencrypt' && certStatus.valid"
                                        class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-success">
                                        Trusted
                                    </span>
                                    <span v-else
                                        class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-warning">
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
                                            class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-success">
                                            Active
                                        </span>
                                        <span v-else
                                            class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-danger">
                                            Inactive
                                        </span>
                                    </div>
                                    <div v-if="certStatus.certMode === 'self-signed'" class="text-accent text-xs mt-1">
                                        Browsers will show a security warning when clients open share links. Set up a trusted certificate below to fix this.
                                    </div>
                                </div>
                            </div>

                            <!-- Setup form -->
                            <p class="settings-subhead">Set Up Trusted Certificate</p>

                            <div class="settings-group">
                                <SettingRow label="Domain *" description="Your custom domain name (e.g. studio.yourcompany.com). Auto-synced from External Base if set.">
                                    <input v-model="certDomainInput" type="text" :disabled="certBusy"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        placeholder="studio.yourcompany.com" required />
                                </SettingRow>
                                <SettingRow label="Contact email *" description="Required — Let's Encrypt sends renewal notices here.">
                                    <input v-model="certEmailInput" type="email" :disabled="certBusy"
                                        class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                        :class="{ 'border-flow-danger': certEmailTouched && !certEmailInput.trim() }"
                                        placeholder="admin@yourcompany.com" required
                                        @blur="certEmailTouched = true" />
                                    <p v-if="certEmailTouched && !certEmailInput.trim()" class="text-xs text-flow-danger mt-1">Email is required to install a trusted certificate.</p>
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
                            <p v-if="!certEmailInput.trim() || !certDomainInput.trim() || !certDnsVerified" class="text-xs text-accent mt-2">
                                Requires: <span :class="certDomainInput.trim() ? 'line-through opacity-50' : 'font-semibold'">domain</span>,
                                <span :class="certEmailInput.trim() ? 'line-through opacity-50' : 'font-semibold'">email</span>,
                                <span :class="certDnsVerified ? 'line-through opacity-50' : 'font-semibold'">DNS verified</span>
                            </p>

                            <!-- Status messages -->
                            <div v-if="certDnsResult && !certDnsResult.ok" class="mt-3 rounded-lg border flow-tone-warning p-3 text-sm">
                                <div class="font-semibold text-flow-warning mb-1">DNS Not Ready</div>
                                <div class="text-flow-warning">{{ certDnsResult.message }}</div>
                            </div>
                            <div v-if="certDnsVerified" class="mt-3 rounded-lg border flow-tone-success p-3 text-sm">
                                DNS verified — {{ certDomainInput }} points to {{ certStatus.wanIp }}.
                            </div>
                            <div v-if="certError" class="text-flow-danger text-sm mt-3">{{ certError }}</div>
                            <div v-if="certSuccessMsg" class="text-flow-success text-sm mt-3">{{ certSuccessMsg }}</div>
                        </template>

                        <!-- ═══ Server Health ═════════════════════════════════ -->
                        <template v-if="activeSection === 'health'">
                            <FlowNotice v-if="egress.isOff('update_check')" tone="warning" size="sm" class="mb-3"
                                title="Update checks are off">{{ EGRESS_OFF_TEXT.update_check }}</FlowNotice>
                            <FlowNotice v-if="egress.isOff('registry_heartbeat')" tone="info" size="sm" class="mb-3"
                                title="Registry heartbeat is off">{{ EGRESS_OFF_TEXT.registry_heartbeat }}</FlowNotice>
                            <p class="text-xs text-accent mb-3">
                                Live server resource stats from the connected broadcaster.
                            </p>

                            <div class="flex items-center gap-2 mb-4">
                                <button class="btn btn-secondary text-sm" type="button" @click="fetchHealth" :disabled="healthLoading">
                                    {{ healthLoading ? 'Loading…' : 'Refresh' }}
                                </button>
                            </div>

                            <div v-if="healthError" class="text-flow-danger text-xs mb-3">{{ healthError }}</div>

                            <!-- Multi-server health display -->
                            <div v-if="serverHealthData.length" class="space-y-4">
                                <div v-for="(server, idx) in serverHealthData" :key="server.connection.connectionId" class="space-y-4">
                                    <!-- Server Header -->
                                    <div class="flex items-center gap-2 mb-2">
                                        <div class="text-sm font-semibold text-default">{{ server.connection.name }}</div>
                                        <div class="text-xs text-muted">{{ server.connection.serverIp }}</div>
                                        <div v-if="server.connection.isActive" class="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">Active</div>
                                    </div>
                                    
                                    <div v-if="server.error" class="text-flow-danger text-xs">{{ server.error }}</div>
                                    
                                    <template v-else>
                                        <!-- License Status -->
                                        <div v-if="server.license" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="settings-subhead">License Status</p>
                                            <div class="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span class="text-muted">Status:</span>
                                                    <span class="ml-1 font-mono">
                                                        <span v-if="server.license.licensed" class="text-flow-success">Licensed</span>
                                                        <span v-else-if="server.license.reason === 'trial_expired'" class="text-flow-danger">Trial Expired</span>
                                                        <span v-else-if="server.license.fallback" class="text-flow-warning">Pro Expired (Legacy)</span>
                                                        <span v-else-if="server.license.needsActivation" class="text-flow-danger">Not Activated</span>
                                                        <span v-else class="text-flow-danger">Unlicensed</span>
                                                    </span>
                                                </div>
                                                <div v-if="server.license.license">
                                                    <span class="text-muted">Type:</span>
                                                    <span class="ml-1 font-mono">{{ server.license.license.perpetual ? 'Perpetual' : (server.license.trial ? 'Trial' : 'Subscription') }}</span>
                                                </div>
                                                <div v-if="server.license.licensed && server.license.license && !server.license.license.perpetual && server.license.license.expiresAt" class="col-span-2">
                                                    <span class="text-muted">Expires:</span>
                                                    <span class="ml-1 font-mono">{{ new Date(server.license.license.expiresAt).toLocaleDateString() }}</span>
                                                </div>
                                                <div v-if="!server.license.licensed && server.license.license && server.license.license.expiresAt" class="col-span-2">
                                                    <span class="text-muted">Expired:</span>
                                                    <span class="ml-1 font-mono">{{ new Date(server.license.license.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}</span>
                                                </div>
                                                <div v-if="!server.license.licensed && server.license.revokedAt" class="col-span-2">
                                                    <span class="text-muted">Revoked:</span>
                                                    <span class="ml-1 font-mono">{{ new Date(server.license.revokedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}</span>
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
                                                <p v-if="licenseActivationError[server.connection.connectionId]" class="text-flow-danger text-xs">
                                                    {{ licenseActivationError[server.connection.connectionId] }}
                                                </p>
                                                <p v-if="licenseActivationOk[server.connection.connectionId]" class="text-flow-success text-xs">
                                                    {{ licenseActivationOk[server.connection.connectionId] }}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <!-- Uptime -->
                                        <div v-if="server.health" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="settings-subhead">Uptime</p>
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
                                            <p class="settings-subhead">CPU</p>
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
                                            <p class="settings-subhead">Memory</p>
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

                                        <!-- Transcoding / Hardware Encoder -->
                                        <div v-if="server.health?.hardware" class="rounded-lg border border-default bg-default/40 p-3">
                                            <p class="settings-subhead">Transcoding (Server)</p>
                                            <div class="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span class="text-muted">Encoder:</span>
                                                    <span class="ml-1 font-mono">{{ server.health.hardware.encoder }}</span>
                                                </div>
                                                <div>
                                                    <span class="text-muted">Mode:</span>
                                                    <span class="ml-1 font-mono" :class="server.health.hardware.type === 'hw' ? 'text-flow-success' : 'text-flow-warning'">
                                                        {{ server.health.hardware.type === 'hw' ? 'GPU' : 'CPU' }}
                                                    </span>
                                                </div>
                                            </div>
                                            <p v-if="server.health.hardware.autoDisabled" class="text-xs text-flow-warning mt-2">
                                                GPU encoding was auto-disabled after a runtime failure ({{ server.health.hardware.disabledReason }}). It will retry the GPU again in
                                                {{ Math.ceil((server.health.hardware.cooldownRemainingMs || 0) / 60000) }} min, sooner if the server restarts.
                                            </p>
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
                                    <p class="settings-subhead">No health data</p>
                                    <p class="text-xs text-muted">Click Refresh to load server health information.</p>
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Maintenance ═══════════════════════════════════ -->
                        <template v-if="activeSection === 'maintenance'">
                            <TranscodeBackfillPanel v-if="activeConnection" :key="`backfill-${activeConnection.connectionId}`"
                                :connection-id="activeConnection.connectionId" />
                            <p class="text-xs text-accent mb-3">
                                Scan for orphaned transcode folders and missing-file metadata, then optionally apply cleanup.
                            </p>

                            <div class="settings-group">
                                <SettingRow label="Delete orphan transcode directories" description="Remove transcode output folders no longer linked to any file.">
                                    <FlowSwitch v-model="cleanupDeleteOrphans" :disabled="busy || cleanupBusy" label="Toggle delete orphans" />
                                </SettingRow>
                                <SettingRow label="Prune missing source files" description="Remove database rows referencing files that no longer exist.">
                                    <FlowSwitch v-model="cleanupPruneMissingFiles" :disabled="busy || cleanupBusy" label="Toggle prune missing files" />
                                </SettingRow>
                            </div>

                            <p class="settings-subhead">Parameters</p>
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

                            <div v-if="cleanupError" class="text-flow-danger text-xs mt-2">{{ cleanupError }}</div>

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
                            <FlowNotice v-if="brandingError" tone="danger" size="sm" class="mb-3" live>{{ brandingError }}</FlowNotice>
                            <div class="settings-group">
                                <SettingRow label="Enable custom branding" description="Apply your company name, logo, and brand colors to share and upload pages.">
                                    <FlowSwitch v-model="brandingEnabled" :disabled="brandingBusy" label="Toggle custom branding" />
                                </SettingRow>
                            </div>

                            <template v-if="brandingEnabled">
                                <p class="settings-subhead">Company Identity</p>
                                <div class="settings-group">
                                    <SettingRow label="Company name" description="Used in headers and link previews. Max 200 characters.">
                                        <input v-model="brandingCompanyName" type="text" :disabled="brandingBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56"
                                            placeholder="Your Company" maxlength="200" />
                                    </SettingRow>
                                </div>

                                <p class="settings-subhead">Recipient Experience</p>
                                <p class="text-xs text-accent mb-3">Choose what recipients see on share and upload pages. When set, the theme picker will be hidden from them.</p>
                                <div class="settings-group">
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
                                    <p class="settings-subhead">Brand Colors</p>
                                    <p class="text-xs text-accent mb-3">Define your brand colors. These will be available as a "Custom" theme in your palette and can be shown to recipients.</p>
                                    <div class="settings-group">
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
                                                    <div v-if="brandingPrimaryContrastWarning" class="text-xs text-flow-warning flex items-start gap-1.5">
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
                                                    <div v-if="brandingSecondaryContrastWarning" class="text-xs text-flow-warning flex items-start gap-1.5">
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

                                <p class="settings-subhead">Company Logo</p>
                                <p class="text-xs text-accent mb-3">Replaces the 45Studio logo on link pages. Supports PNG, JPEG, SVG, and WebP. Max 2 MB. <br/><b>Recommended: transparent background, at least 200px tall.</b></p>
                                <div class="settings-group">
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
                                            <div v-if="brandingLogoLightPreview" class="flex items-start gap-3 p-2 border border-default rounded bg-well/30">
                                                <img :src="brandingLogoLightPreview" alt="Logo preview" class="w-16 h-16 object-contain rounded border border-default bg-default" />
                                                <div class="flex-1 min-w-0 text-xs space-y-0.5">
                                                    <div v-if="brandingLogoLightInfo?.name" class="font-medium text-fg truncate">{{ brandingLogoLightInfo.name }}</div>
                                                    <div class="text-accent">
                                                        <span v-if="brandingLogoLightInfo?.width && brandingLogoLightInfo?.height">{{ brandingLogoLightInfo.width }} × {{ brandingLogoLightInfo.height }}px</span>
                                                        <span v-if="brandingLogoLightInfo?.size" class="ml-2">{{ (brandingLogoLightInfo.size / 1024).toFixed(1) }} KB</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else-if="brandingLogoLight" class="text-xs text-accent">Logo saved: {{ brandingLogoLight }}</div>
                                            <div v-else-if="!brandingBusy" class="text-xs text-accent">No logo uploaded</div>
                                        </div>
                                    </SettingRow>
                                    <SettingRow label="Use separate logo for dark backgrounds" description="Recommended if your default logo has poor contrast on dark backgrounds.">
                                        <FlowSwitch v-model="brandingSplitLogos" :disabled="brandingBusy" label="Toggle split logos" />
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
                                            <div v-if="brandingLogoDarkPreview" class="flex items-start gap-3 p-2 border border-default rounded bg-well/30">
                                                <img :src="brandingLogoDarkPreview" alt="Logo preview" class="w-16 h-16 object-contain rounded border border-default bg-default" />
                                                <div class="flex-1 min-w-0 text-xs space-y-0.5">
                                                    <div v-if="brandingLogoDarkInfo?.name" class="font-medium text-fg truncate">{{ brandingLogoDarkInfo.name }}</div>
                                                    <div class="text-accent">
                                                        <span v-if="brandingLogoDarkInfo?.width && brandingLogoDarkInfo?.height">{{ brandingLogoDarkInfo.width }} × {{ brandingLogoDarkInfo.height }}px</span>
                                                        <span v-if="brandingLogoDarkInfo?.size" class="ml-2">{{ (brandingLogoDarkInfo.size / 1024).toFixed(1) }} KB</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else-if="brandingLogoDark" class="text-xs text-accent">Logo saved: {{ brandingLogoDark }}</div>
                                            <div v-else-if="!brandingBusy" class="text-xs text-accent">No dark logo uploaded</div>
                                        </div>
                                    </SettingRow>
                                </div>

                                <p class="settings-subhead">Support & Contact</p>
                                <p class="text-xs text-accent mb-3">Optional. Provide help resources for recipients viewing share and upload pages.</p>
                                <div class="settings-group">
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

                                <p class="settings-subhead">Link Previews</p>
                                <p class="text-xs text-accent mb-3">Customize how share links appear when pasted in Slack, Teams, or social media.</p>
                                <div class="settings-group">
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

                                <p class="settings-subhead">Preview</p>
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

                <!-- Footer: only when there is something to save -->
                <template v-if="showSaveBar" #footer>
                    <div class="min-w-0 text-sm" aria-live="polite">
                        <span v-if="validationError" class="text-flow-danger">{{ validationError }}</span>
                        <span v-else-if="saveError" class="text-flow-danger">{{ saveError }}</span>
                        <span v-else-if="saveOk" class="text-flow-success">Saved.</span>
                        <span v-else-if="isDirty" class="inline-flex items-center gap-2 font-medium">
                            <span class="flow-dot flow-dot--warning" aria-hidden="true" />You have unsaved changes
                        </span>
                        <span v-else class="text-xs text-muted">{{ currentMeta.saveHint || 'Changes are saved for the whole server.' }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button v-if="isDirty" class="btn btn-secondary" type="button" @click="discardChanges" :disabled="busy">Discard changes</button>
                        <button class="btn btn-success" type="button" @click="save" :disabled="busy || !!validationError || !isDirty">
                            <span v-if="savingSettings">Saving…</span>
                            <span v-else>Save changes</span>
                        </button>
                    </div>
                </template>
    </FlowModal>
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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useApi } from "../../composables/useApi";
import AdminNetworksPanel from "../AdminNetworksPanel.vue";
import AdminSmtpPanel from "../AdminSmtpPanel.vue";
import AdminStaffAlertsPanel from "../AdminStaffAlertsPanel.vue";
import EmailProblemsPanel from "../EmailProblemsPanel.vue";
import TranscodeBackfillPanel from "../TranscodeBackfillPanel.vue";
import AdminScannerPanel from "../AdminScannerPanel.vue";
import AdminEgressPanel from "../AdminEgressPanel.vue";
import { EGRESS_OFF_TEXT, useEgressSwitches } from "../../composables/useEgressSwitches";
import { isAdminSession } from "../../composables/adminSession";
import { disableNotifications, enableNotifications, notificationPermission, notificationsEnabled } from "../../web-notify";
import { pushNotification, Notification } from '@45drives/houston-common-ui';
import PathInput from "../PathInput.vue";
import { useOnboarding } from "../../composables/useOnboarding";
import { useTimeFormat } from "../../composables/useTimeFormat";
import { useClientTranscode, type TranscodePreset } from "../../composables/useClientTranscode";
import { useLinkListDefault } from "../../composables/useLinkListDefault";
import { useTourManager, type TourStep } from "../../composables/useTourManager";
import { useTourPreferences } from "../../composables/useTourPreferences";
import { appLog } from "../../composables/useLog";
import { useThemeFromAlias } from "../../composables/useThemeFromAlias";
import { useConnections } from "../../composables/useConnections";
import { useLicenseStatus } from "../../composables/useLicenseStatus";
import WatermarkCustomizer from "../WatermarkCustomizer.vue";
import WatermarkPreview from "../WatermarkPreview.vue";
import type { WatermarkSettings } from "../../types/watermark";
import { createDefaultWatermarkSettings, DEFAULT_45FLOW_WATERMARKS } from "../../types/watermark";
import FlowModal from '../../ui/FlowModal.vue';
import FlowSwitch from '../../ui/FlowSwitch.vue';
import FlowNotice from '../../ui/FlowNotice.vue';
import FlowChip from '../../ui/FlowChip.vue';
import { useExternalAddressReadiness, describeExternalAddressNotReady, type ExternalAddressReadiness } from '../../composables/useExternalAddressReadiness';
import type { Component } from 'vue';
import {
    AdjustmentsHorizontalIcon, BugAntIcon, EnvelopeIcon, FilmIcon, GlobeAltIcon, LinkIcon, LockClosedIcon, MagnifyingGlassIcon,
    QuestionMarkCircleIcon, ServerIcon, ShieldCheckIcon, SignalIcon, SparklesIcon, SwatchIcon, WrenchScrewdriverIcon,
} from '@heroicons/vue/24/outline';

const props = withDefaults(defineProps<{
    initialSection?: string
}>(), {
    initialSection: undefined,
});

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
// Optional outbound calls an admin turned off; sections that rely on one say so.
const egress = useEgressSwitches(apiFetch);
const { onboarding, resetAll: resetOnboarding, markDone } = useOnboarding();
const { hour12 } = useTimeFormat();
const { enabled: _tcEnabled, preset: _tcPreset, hwAccel: _tcHwAccel, setEnabled: commitTranscodeEnabled, setPreset: commitTranscodePreset, setHwAccel: commitHwAccel } = useClientTranscode();
const { linkListDefault } = useLinkListDefault();
const { requestTour } = useTourManager();
const { setCustomThemeColors, setCustomThemeEnabled } = useThemeFromAlias();
const { toursDisabled } = useTourPreferences();
const notifyPermission = ref(notificationPermission());
const notifyOn = ref(notificationsEnabled());
const notifyDescription = computed(() =>
    notifyPermission.value === 'unsupported' ? 'This browser does not support notifications.'
    : notifyPermission.value === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings to turn this on.'
    : 'Show a browser notification when an upload finishes or fails while this tab is in the background.');
async function toggleBrowserNotifications() {
    if (notifyOn.value) {
        disableNotifications();
    } else {
        notifyPermission.value = await enableNotifications();
    }
    notifyOn.value = notificationsEnabled();
}
const { connections, activeConnection, updateConnection } = useConnections();
const adminSession = computed(() => isAdminSession(activeConnection.value?.token));
const isWeb = window.electron?.isWeb === true
const { isPremiumActive, isTrial, isTrialExpired, isFallback, trialDaysRemaining, licenseInfo } = useLicenseStatus();

// Local copies of transcode settings — only committed to the composable on Save
const clientTranscodeEnabled = ref(_tcEnabled.value);
const transcodePreset = ref<TranscodePreset>(_tcPreset.value);
const hwAccelEnabled = ref(_tcHwAccel.value);

const hardwareCapabilities = ref<any>(null);

onMounted(async () => {
    if (isWeb) return
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

const settingsTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="settings-modal-header"]',
		message: 'Welcome to 45Flow Settings.\n\nThis is where you set defaults for new links, your share addresses, and how the app and server behave.',
	},
	{
		target: '[data-tour="settings-modal-nav"]',
        message: 'Use the sidebar to move between pages, or type in "Find a setting".\n\n• Sharing — new link defaults, share addresses, internet sharing, HTTPS certificate' + (isPremiumActive.value ? ', and branding (Pro).' : '.') + '\n• This app — preferences and video processing on this computer.\n• Server — server health, maintenance' + (adminSession.value ? ', and admin networks.' : '.') + '\n• Help — the user guide, API docs, and guided tours.',
	},
	{
		target: '[data-tour="settings-modal-urls"]',
		message: 'Each page shows its settings here.\n\nRight now you\'re on New link defaults — who can open new links, when they expire, and video options.\n\nWhen you change something, a "Save changes" button appears at the bottom.',
		beforeShow: () => { activeSection.value = 'linkOptions' },
	},
])

// ── Section navigation ──────────────────────────────────────────────────
type Section = 'sharing' | 'publicSharing' | 'app' | 'performance' | 'maintenance' | 'help' | 'certificate' | 'linkOptions' | 'branding' | 'health' | 'upgrade' | 'adminNetworks' | 'adminMail' | 'adminSecurity';

type SectionMeta = {
    label: string
    description: string
    icon: Component
    /** Extra words people might search for */
    keywords: string
    /** Section has fields that the footer Save button stores */
    savable?: boolean
    saveHint?: string
}

const SECTION_META: Record<Section, SectionMeta> = {
    linkOptions: {
        label: 'New link defaults', icon: LinkIcon, savable: true,
        description: 'Starting values for every new link. You can still change them on each link.',
        keywords: 'network internet local invite only restrict access comments expiry expire never proxy watermark',
        saveHint: 'Applies to links you create after saving.',
    },
    sharing: {
        label: 'Share addresses', icon: GlobeAltIcon, savable: true,
        description: 'The web addresses your share links use on the internet and on your local network.',
        keywords: 'url urls external internal domain ip port https auto detect lan wan vpn',
        saveHint: 'Applies to links you create after saving.',
    },
    publicSharing: {
        label: 'Internet sharing', icon: SignalIcon,
        description: 'Check that clients outside your network can reach your links, and repair common problems.',
        keywords: 'public firewall nginx routing repair check status',
    },
    certificate: {
        label: 'HTTPS certificate', icon: LockClosedIcon,
        description: 'Install a trusted certificate so browsers don\'t show your clients a security warning.',
        keywords: 'ssl tls letsencrypt let\'s encrypt domain dns self-signed',
    },
    branding: {
        label: 'Branding', icon: SwatchIcon, savable: true,
        description: 'Put your company name, logo and colours on the pages your clients see.',
        keywords: 'white label logo colours colors theme company support email preview',
        saveHint: 'Changes show on client pages after saving.',
    },
    app: {
        label: 'Preferences', icon: AdjustmentsHorizontalIcon, savable: true,
        description: 'How 45Flow looks and behaves, and where folder pickers start.',
        keywords: 'time format 12 24 hour link list view notifications default server folder project root path',
        saveHint: 'Time format and link list view apply right away. The default folder is saved for the server.',
    },
    performance: {
        label: 'Video processing', icon: FilmIcon, savable: true,
        description: 'Choose whether this computer or the server prepares videos for playback.',
        keywords: 'performance transcoding transcode gpu hardware acceleration ffmpeg encode quality',
        saveHint: 'Saved on this computer only.',
    },
    health: {
        label: 'Server health', icon: ServerIcon,
        description: 'Live status of the servers this app is connected to.',
        keywords: 'cpu memory uptime license status transcoding',
    },
    maintenance: {
        label: 'Maintenance', icon: WrenchScrewdriverIcon,
        description: 'Clean up leftover files and records on the server.',
        keywords: 'cleanup orphan prune missing files transcode directories',
    },
    adminNetworks: {
        label: 'Admin networks', icon: ShieldCheckIcon,
        description: 'Which networks may sign in to this server as an admin.',
        keywords: 'admin cidr network security allow list',
    },
    adminMail: {
        label: 'Email (SMTP)', icon: EnvelopeIcon,
        description: 'The mail server 45Flow uses to send share invitations.',
        keywords: 'smtp email mail invitation invite send server relay',
    },
    adminSecurity: {
        label: 'Scanning & privacy', icon: BugAntIcon,
        description: 'What the malware scanner does, and everything this server sends over the internet.',
        keywords: 'clamav malware virus scan freshclam signatures security telemetry egress outbound privacy license heartbeat public ip port check updates',
    },
    upgrade: {
        label: 'Go Pro', icon: SparklesIcon,
        description: 'Unlock branding, watermark controls and more with a 45Flow Pro license.',
        keywords: 'license trial activate upgrade pro',
    },
    help: {
        label: 'Help & tours', icon: QuestionMarkCircleIcon,
        description: 'Documentation, the server API reference, and guided tours.',
        keywords: 'guide user guide api docs swagger tours onboarding',
    },
};

const activeSection = ref<Section>(
    props.initialSection && props.initialSection in SECTION_META ? (props.initialSection as Section) : 'linkOptions'
);
const currentMeta = computed(() => SECTION_META[activeSection.value]);
const contentRef = ref<HTMLElement | null>(null);
watch(activeSection, () => { contentRef.value?.scrollTo?.({ top: 0 }); void egress.load() }, { immediate: true });

const showUpgrade = computed(() => !isPremiumActive.value || isTrial.value);

const navGroups = computed(() => {
    const item = (key: Section) => ({ key, label: SECTION_META[key].label, icon: SECTION_META[key].icon });
    return [
        {
            label: 'Sharing',
            items: [
                item('linkOptions'),
                item('sharing'),
                item('publicSharing'),
                item('certificate'),
                ...(isPremiumActive.value ? [item('branding')] : []),
            ],
        },
        {
            label: 'This app',
            items: [
                item('app'),
                ...(!isWeb ? [item('performance')] : []),
            ],
        },
        {
            label: 'Server',
            items: [
                item('health'),
                item('maintenance'),
                ...(adminSession.value ? [item('adminNetworks'), item('adminMail'), item('adminSecurity')] : []),
            ],
        },
        {
            label: showUpgrade.value ? 'Pro & help' : 'Help',
            items: [
                ...(showUpgrade.value ? [item('upgrade')] : []),
                item('help'),
            ],
        },
    ];
});

const navQuery = ref('');
const filteredNavGroups = computed(() => {
    const q = navQuery.value.toLowerCase();
    if (!q) return navGroups.value;
    return navGroups.value
        .map(g => ({
            ...g,
            items: g.items.filter(i => {
                const m = SECTION_META[i.key];
                return `${m.label} ${m.description} ${m.keywords}`.toLowerCase().includes(q);
            }),
        }))
        .filter(g => g.items.length);
});

onMounted(() => {
	if (!onboarding.value.settingsTourDone) {
		setTimeout(() => {
			requestTour('settings', settingsTourSteps.value, () => markDone('settingsTourDone'))
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
    window.open('https://github.com/45Drives/45flow/blob/main/docs/45Flow_User_Guide.md', '_blank', 'noopener,noreferrer');
}

async function openApiDocs() {
    try {
        await window.electron?.ipcRenderer.invoke('api-docs:open', { baseUrl: baseUrl.value, token: meta.value?.token || '' });
    } catch (e: any) {
        const message = String(e?.message || e || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        pushNotification(new Notification('API Docs', message || 'Could not open the API docs.', 'error', 8000));
    }
}

// ── Go Pro / Upgrade ────────────────────────────────────────────────────
const upgradeKey = ref('')
const upgradeBusy = ref(false)
const upgradeError = ref('')

const trialBusy = ref(false)
const trialError = ref('')
const trialSuccess = ref('')

const TRIAL_SERVER_URL = 'https://studio-license.45d.io'

async function handleTrialRequest() {
    trialBusy.value = true
    trialError.value = ''
    trialSuccess.value = ''

    try {
        // Call the VPS license server trial endpoint (no email needed)
        const response = await fetch(`${TRIAL_SERVER_URL}/api/licenses/trial`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        })

        const result = await response.json()

        if (!response.ok || !result?.ok) {
            if (result?.error === 'rate_limited') {
                trialError.value = 'Too many requests. Please try again later.'
            } else if (result?.error === 'trial_already_active') {
                trialError.value = result?.message || 'This server already has an active trial.'
            } else {
                trialError.value = result?.message || result?.error || 'Trial request failed.'
            }
            return
        }

        // Success - auto-populate the license key field
        if (result?.license?.key) {
            upgradeKey.value = result.license.key
            trialSuccess.value = `Trial key generated! It has been filled in below. Click Activate to enable your 30-day trial.`
        } else {
            trialSuccess.value = 'Trial key generated!'
        }
    } catch (err: any) {
        trialError.value = err?.message || 'Network error. Please check your internet connection.'
    } finally {
        trialBusy.value = false
    }
}

async function handleUpgradeActivate() {
    const key = upgradeKey.value.trim()
    if (!key) return

    upgradeBusy.value = true
    upgradeError.value = ''

    try {
        // Activate key on the connected broadcaster server
        // Server validates with VPS internally, saves cert, returns result
        const result = await apiFetch('/api/license/activate', {
            method: 'POST',
            body: JSON.stringify({ licenseKey: key }),
        })

        if (!result?.ok) {
            upgradeError.value = result?.error || result?.message || 'Activation failed.'
            return
        }

        // Refresh license status so the UI reacts
        const status = await apiFetch('/api/license/status')
        if (status?.ok && status.licensed) {
            const { activeConnection, updateConnection } = useConnections()
            if (activeConnection.value) {
                updateConnection(activeConnection.value.connectionId, {
                    licensed: true,
                    licenseCheckedAt: Date.now(),
                    licenseInfo: {
                        ...(status.license || {}),
                        ...(status.metadata || {}),
                    },
                })
            }
        }

        const licenseInfo = result?.license
        let licenseMsg = result?.reused ? 'License details updated.' : 'Pro Edition activated!'
        if (licenseInfo?.perpetual) {
            licenseMsg = result?.reused
                ? 'License updated — perpetual, never expires.'
                : 'Perpetual Pro license activated — never expires.'
        } else if (licenseInfo?.expiresAt) {
            const expiryDate = new Date(licenseInfo.expiresAt).toLocaleDateString()
            licenseMsg = result?.reused
                ? `License updated — valid until ${expiryDate}.`
                : `Pro license activated — valid until ${expiryDate}.`
        }

        pushNotification(new Notification('Pro Edition', licenseMsg, 'success', 8000))
        upgradeKey.value = ''
    } catch (err: any) {
        // Map known error codes/messages to user-friendly text
        const raw = err?.message || ''
        const code = err?.code || ''
        const friendlyMap: Record<string, string> = {
            admin_required: 'Admin access required. Please log in with server credentials.',
            session_expired: 'Session expired. Please log in again.',
            premium_required: 'This feature requires a Pro license.',
        }
        const friendly = friendlyMap[code] || ''
        if (friendly) {
            upgradeError.value = friendly
        } else if (raw.includes('Admin access required') || raw === 'Forbidden') {
            upgradeError.value = 'Admin access required. Please log in with server credentials.'
        } else if (raw.includes('Session expired') || raw.includes('Invalid token') || raw === 'Unauthorized') {
            upgradeError.value = 'Session expired. Please log in again.'
        } else {
            // Strip request IDs from display
            upgradeError.value = raw.replace(/\s*\(request [0-9a-f-]+\)/gi, '').trim() || 'Activation failed.'
        }
    } finally {
        upgradeBusy.value = false
    }
}

const busy = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saveOk = ref(false);
const savingSettings = ref(false);

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

const defaultRestrictAccess = ref(true);
const defaultAllowComments = ref(true);
const defaultUseProxyFiles = ref(false);
// Server-wide proxy sizes for uploads (null = never set; the server then makes 720p).
const PROXY_QUALITY_CHOICES = ['720p', '1080p', 'original'] as const;
const proxyQualitiesSupported = ref(false);
const defaultProxyQualities = ref<string[] | null>(null);
const effectiveProxyQualities = computed(() => defaultProxyQualities.value?.length ? defaultProxyQualities.value : ['720p']);
function toggleDefaultProxyQuality(q: string) {
    const current = effectiveProxyQualities.value;
    const next = current.includes(q) ? current.filter(x => x !== q) : [...current, q];
    if (!next.length) return;
    defaultProxyQualities.value = PROXY_QUALITY_CHOICES.filter(c => next.includes(c));
}
// Server speed/quality profile for server-side transcodes (C4). Hidden for older servers.
const SPEED_PROFILE_CHOICES = [
    { id: 'fast', label: 'Faster' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'quality', label: 'Higher quality' },
] as const;
type SpeedProfile = typeof SPEED_PROFILE_CHOICES[number]['id'];
const speedProfileSupported = ref(false);
const transcodeSpeedProfile = ref<SpeedProfile>('balanced');
const defaultExpiryValue = ref<number>(1);
const defaultExpiryUnit = ref<'hours' | 'days' | 'weeks'>('days');
const defaultExpiryNever = ref(true);
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

function computeDefaultExpirySec(): number {
    const v = Math.max(0, Number(defaultExpiryValue.value) || 0);
    const multipliers: Record<string, number> = { hours: 3600, days: 86400, weeks: 7 * 86400 };
    return v * (multipliers[defaultExpiryUnit.value] || 86400);
}

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
    // Map known error codes to user-friendly messages
    const friendlyMessages: Record<string, string> = {
        admin_required: 'Admin access required. Please log in with server credentials.',
        session_expired: 'Session expired. Please log in again.',
        invalid_license_key: 'Invalid license key. Please check and try again.',
        missing_license_server_url: 'License server not configured on this server.',
        license_activate_failed: 'Activation failed. Please check your key or try again later.',
        forbidden: 'Access denied. Please log in again with admin credentials.',
    }
    const errorCode = typeof body?.error === 'string' ? body.error : ''
    const friendly = friendlyMessages[errorCode]
    if (friendly) return friendly

    // Prefer message field over raw error code
    const base = body?.message || body?.error || body?.detail?.error || rawText || `HTTP ${resp.status}`
    // Strip request IDs from display — they confuse end users
    const cleaned = String(base).replace(/\s*\(request [0-9a-f-]+\)/gi, '').trim()
    return cleaned || 'License activation failed.'
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
    // Clear trial messages when switching sections
    trialError.value = ''
    trialSuccess.value = ''
    upgradeError.value = ''
    
    if (section === 'health' && serverHealthData.value.length === 0 && !healthLoading.value) {
        fetchHealth();
    }
    
    // Load available watermarks when navigating to Link Options
    if (section === 'linkOptions' && existingWatermarkFiles.value.length === 0) {
        loadExistingWatermarkFiles();
        loadDefaultWatermarkPresets();
    }

    // Refresh public sharing status when navigating to that section
    if (section === 'publicSharing') {
        loadPublicSharingStatus();
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
        // Load server watermarks from both local dir and global search
        const dirRel = '.45flow/watermarks';
        const [dirData, globalData] = await Promise.all([
            apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`).catch(() => null),
            apiFetch('/api/files/watermarks', { method: 'GET' }).catch(() => null),
        ]);
        const dirEntries = Array.isArray(dirData?.entries) ? dirData.entries : [];
        const dirWatermarks = dirEntries
            .filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
            .map((e: any) => `${dirRel}/${String(e.name).trim()}`);
        const globalWatermarks = Array.isArray(globalData?.watermarks) ? globalData.watermarks : [];
        const serverWatermarks = [...new Set([...dirWatermarks, ...globalWatermarks])].sort();
        
        existingWatermarkFiles.value = serverWatermarks;
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
    cleanupLastRunAt.value ? new Date(cleanupLastRunAt.value).toLocaleString(undefined, { hour12: hour12.value }) : "—"
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
        savedBranding.value = brandingSnapshot();
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
        savedBranding.value = brandingSnapshot();
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

        // Set preview and ref optimistically so UI updates immediately
        setBrandingLogoPreview(slot, previewUrl, info);
        setBrandingLogoRef(slot, '__uploading__');

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
        // Reset ref on failure (preview stays for visual feedback)
        setBrandingLogoRef(slot, null);
        setBrandingLogoPreview(slot, null, null);
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
// ── Public Sharing ────────────────────────────────────────────────────────────────────
const publicSharingStatus = ref<any>(null);
const publicSharingBusy = ref(false);
const publicSharingRepairBusy = ref(false);
const publicSharingRegenBusy = ref(false);
const publicSharingCheckResult = ref<any>(null);
const publicSharingRepairResult = ref<any>(null);

const publicSharingFriendlyLabel = computed(() => {
    const s = publicSharingStatus.value?.friendlyStatus;
    if (s === 'ready') return 'Public Sharing Ready';
    if (s === 'needs_trusted_cert') return 'Needs Trusted Certificate';
    if (s === 'nginx_warning') return 'Web Routing Needs Attention';
    if (s === 'firewall_warning') return 'Firewall Needs Attention';
    if (s === 'dns_not_verified') return 'DNS Not Verified';
    return 'Status Unknown';
});

const publicSharingStatusBadge = computed(() => {
    const s = publicSharingStatus.value?.friendlyStatus;
    if (s === 'ready') return 'Ready';
    if (s === 'needs_trusted_cert' || s === 'firewall_warning' || s === 'dns_not_verified') return 'Needs Attention';
    if (s === 'nginx_warning') return 'Error';
    return 'Not Checked';
});

const publicSharingCertLabel = computed(() => {
    const cert = publicSharingStatus.value?.certificate;
    if (!cert) return 'Unknown';
    if (cert.mode === 'letsencrypt' && cert.valid) return 'Trusted certificate active';
    if (cert.mode === 'letsencrypt' && !cert.valid) return 'Trusted certificate invalid';
    return 'Local certificate (self-signed)';
});

const publicSharingCertDescription = computed(() => {
    const cert = publicSharingStatus.value?.certificate;
    if (!cert) return 'Certificate status could not be determined.';
    if (cert.mode === 'letsencrypt' && cert.valid && cert.domain) return `Trusted certificate for ${cert.domain}. Recipients will not see browser warnings.`;
    if (cert.mode === 'self-signed') return 'Recipients will see a browser security warning when opening share links.';
    return 'Certificate status unclear.';
});

const publicSharingNginxLabel = computed(() => {
    const nginx = publicSharingStatus.value?.nginx;
    if (!nginx) return 'Unknown';
    if (nginx.running && nginx.configValid) return 'Configured by Houston';
    if (!nginx.installed) return 'Not installed';
    if (!nginx.running) return 'Not running';
    return 'Needs repair';
});

const publicSharingFirewallLabel = computed(() => {
    const fw = publicSharingStatus.value?.firewall;
    if (!fw) return 'Unknown';
    if (!fw.managed) return 'No firewall detected';
    if (fw.httpOpen && fw.httpsOpen) return 'Web sharing allowed';
    if (!fw.httpsOpen) return 'HTTPS port blocked';
    return 'Needs attention';
});

function formatBootstrapTime(iso: string) {
    try { return new Date(iso).toLocaleString(undefined, { hour12: hour12.value }); }
    catch { return iso; }
}

// C1: same check the app runs before copying an internet link.
const { checkExternalAddressReady } = useExternalAddressReadiness();
const recipientReadiness = ref<ExternalAddressReadiness | null>(null);

async function loadPublicSharingStatus() {
    checkExternalAddressReady().then((r) => { recipientReadiness.value = r; });
    try {
        const data = await apiFetch('/api/settings/public-sharing/status', { timeoutMs: 15000 });
        publicSharingStatus.value = data;
    } catch (e: any) {
        appLog('Failed to load public sharing status', e);
    }
}

async function checkPublicSharing() {
    publicSharingBusy.value = true;
    publicSharingCheckResult.value = null;
    try {
        const data = await apiFetch('/api/settings/public-sharing/check', { method: 'POST', timeoutMs: 30000 });
        publicSharingCheckResult.value = data;
        await loadPublicSharingStatus();
    } catch (e: any) {
        pushNotification(new Notification('Check failed', e?.message || 'Could not check public sharing.', 'error'));
    } finally {
        publicSharingBusy.value = false;
    }
}

async function repairPublicSharing() {
    publicSharingRepairBusy.value = true;
    publicSharingBusy.value = true;
    publicSharingRepairResult.value = null;
    try {
        const data = await apiFetch('/api/settings/public-sharing/repair', { method: 'POST', timeoutMs: 60000 });
        publicSharingRepairResult.value = data;
        pushNotification(new Notification('Repair complete', data.ok ? 'Public sharing has been repaired.' : 'Repair completed with issues.', data.ok ? 'info' : 'warning'));
        await loadPublicSharingStatus();
    } catch (e: any) {
        pushNotification(new Notification('Repair failed', e?.message || 'Could not repair public sharing.', 'error'));
    } finally {
        publicSharingRepairBusy.value = false;
        publicSharingBusy.value = false;
    }
}

async function regenerateLocalCert() {
    publicSharingRegenBusy.value = true;
    publicSharingBusy.value = true;
    try {
        const data = await apiFetch('/api/settings/public-sharing/regenerate-self-signed', { method: 'POST', timeoutMs: 30000 });
        pushNotification(new Notification('Certificate regenerated', data.message || 'Local certificate has been regenerated.', 'info'));
        await loadPublicSharingStatus();
        await loadCertStatus();
    } catch (e: any) {
        pushNotification(new Notification('Regeneration failed', e?.message || 'Could not regenerate certificate.', 'error'));
    } finally {
        publicSharingRegenBusy.value = false;
        publicSharingBusy.value = false;
    }
}

// ── Certificate / Let’s Encrypt ───────────────────────────────────────────────────────
const certBusy = ref(false);
const certStep = ref<'verify' | 'setup' | 'revert' | null>(null);
const certError = ref<string | null>(null);
const certSuccessMsg = ref<string | null>(null);
const certDomainInput = ref('');
const certEmailInput = ref('');
const certEmailTouched = ref(false);
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

// ── Unsaved changes ────────────────────────────────────────────────────
// Snapshots of what the server last returned; the Save bar compares against them.
function coreSnapshot() {
    return JSON.stringify([
        defaultLinkAccess.value, externalHttpsPort.value, externalAuto.value, externalBase.value.trim(),
        internalAuto.value, internalBase.value.trim(), defaultRestrictAccess.value, defaultAllowComments.value,
        defaultUseProxyFiles.value, defaultProxyQualities.value, transcodeSpeedProfile.value, defaultExpiryNever.value,
        defaultExpiryNever.value ? null : [defaultExpiryValue.value, defaultExpiryUnit.value],
        defaultWatermarkEnabled.value,
        defaultWatermarkEnabled.value ? (selectedExistingWatermark.value || defaultWatermarkId.value) : null,
        isPremiumActive.value && defaultWatermarkEnabled.value ? watermarkSettings.value : null,
        projectRoot.value.trim(), forceProjectRoot.value,
    ]);
}

function brandingSnapshot() {
    return JSON.stringify([
        brandingEnabled.value, brandingCompanyName.value, brandingEnforcedTheme.value, brandingSplitLogos.value,
        brandingCustomPrimary.value, brandingCustomSecondary.value, brandingSupportEmail.value, brandingSupportUrl.value,
        brandingLinkPreviewTitle.value, brandingLinkPreviewDescription.value,
    ]);
}

const savedCore = ref<string | null>(null);
const savedBranding = ref<string | null>(null);

const coreDirty = computed(() => settingsLoaded.value && savedCore.value !== null && coreSnapshot() !== savedCore.value);
const brandingDirty = computed(() => isPremiumActive.value && savedBranding.value !== null && brandingSnapshot() !== savedBranding.value);
const transcodeDirty = computed(() => {
    // Hardware acceleration is forced off when none is detected; that alone isn't a change.
    const hwExpected = hardwareCapabilities.value && !hardwareCapabilities.value.hasHardwareAccel ? false : _tcHwAccel.value;
    return clientTranscodeEnabled.value !== _tcEnabled.value
        || transcodePreset.value !== _tcPreset.value
        || hwAccelEnabled.value !== hwExpected;
});
const isDirty = computed(() => coreDirty.value || brandingDirty.value || transcodeDirty.value);
const showSaveBar = computed(() => isDirty.value || !!saveError.value || saveOk.value
    || (!!currentMeta.value.savable && !(activeSection.value === 'performance' && isWeb)));

function confirmDiscard() {
    if (!isDirty.value || busy.value) return true;
    return window.confirm('You have unsaved changes. Close Settings and lose them?');
}

async function discardChanges() {
    clientTranscodeEnabled.value = _tcEnabled.value;
    transcodePreset.value = _tcPreset.value;
    hwAccelEnabled.value = hardwareCapabilities.value && !hardwareCapabilities.value.hasHardwareAccel ? false : _tcHwAccel.value;
    await reload();
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
        return "The HTTPS port must be between 1 and 65535 (Share addresses).";
    }

    // External
    if (!externalAuto.value) {
        if (!externalBase.value.trim()) return "Enter a custom internet address, or turn on Detect automatically (Share addresses).";
        if (!normalizeUrlInput(externalBase.value, "https")) {
            return "The custom internet address isn't valid. Use a domain or IP, like studio.example.com.";
        }
    }

    // Internal
    if (!internalAuto.value) {
        if (!internalBase.value.trim()) return "Enter a custom local address, or turn on Detect automatically (Share addresses).";
        if (!normalizeUrlInput(internalBase.value, "http")) {
            return "The custom local address isn't valid. Use an IP or hostname, like 192.168.1.20.";
        }
    }

    if (forceProjectRoot.value && !projectRoot.value.trim()) {
        return "Choose a default server folder to turn this on (Preferences).";
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
            typeof data.defaultRestrictAccess === "boolean" ? data.defaultRestrictAccess : true;
        defaultAllowComments.value =
            typeof data.defaultAllowComments === "boolean" ? data.defaultAllowComments : true;

        // Default expiry
        const expSec = Number(data.defaultExpirySeconds || 0);
        if (expSec > 0) {
            defaultExpiryNever.value = false;
            if (expSec % (7 * 86400) === 0) {
                defaultExpiryValue.value = expSec / (7 * 86400);
                defaultExpiryUnit.value = 'weeks';
            } else if (expSec % 86400 === 0) {
                defaultExpiryValue.value = expSec / 86400;
                defaultExpiryUnit.value = 'days';
            } else {
                defaultExpiryValue.value = Math.round(expSec / 3600);
                defaultExpiryUnit.value = 'hours';
            }
        } else {
            defaultExpiryNever.value = true;
            defaultExpiryValue.value = 1;
            defaultExpiryUnit.value = 'days';
        }

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
        // Older servers don't send this field; keep the row hidden for them.
        proxyQualitiesSupported.value = "defaultProxyQualities" in data;
        defaultProxyQualities.value = Array.isArray(data.defaultProxyQualities) ? data.defaultProxyQualities : null;
        speedProfileSupported.value = "transcodeSpeedProfile" in data;
        transcodeSpeedProfile.value = SPEED_PROFILE_CHOICES.some(c => c.id === data.transcodeSpeedProfile)
            ? data.transcodeSpeedProfile : 'balanced';
        projectRoot.value = typeof data.projectRoot === "string" ? data.projectRoot : "";
        forceProjectRoot.value = typeof data.forceProjectRoot === "boolean" ? data.forceProjectRoot : false;
        
        settingsLoaded.value = true;
        await nextTick();
        savedCore.value = coreSnapshot();
    } catch (e: any) {
        loadError.value = e?.message ? `Failed to load settings: ${e.message}` : "Failed to load settings.";
    } finally {
        busy.value = false;
    }

    // Load cert status in parallel (non-blocking)
    loadCertStatus();
    loadPublicSharingStatus();
    if (isPremiumActive.value) loadBranding();
}

async function save() {
    saveOk.value = false;
    saveError.value = null;

    if (validationError.value) {
        saveError.value = validationError.value;
        return;
    }

    busy.value = true;
    savingSettings.value = true;
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
            ...(proxyQualitiesSupported.value && defaultProxyQualities.value ? { defaultProxyQualities: defaultProxyQualities.value } : {}),
            ...(speedProfileSupported.value ? { transcodeSpeedProfile: transcodeSpeedProfile.value } : {}),
            defaultExpirySeconds: defaultExpiryNever.value ? 0 : computeDefaultExpirySec(),
            defaultWatermarkId: defaultWatermarkEnabled.value ? (selectedExistingWatermark.value || defaultWatermarkId.value) : null,
            projectRoot: (projectRoot.value || "").trim() || null,
            forceProjectRoot: !!forceProjectRoot.value,
        };

        // Only send watermark settings if premium (server enforces license check)
        if (isPremiumActive.value) {
            payload.defaultWatermarkSettings = defaultWatermarkEnabled.value ? watermarkSettings.value : null;
        }

        await apiFetch("/api/settings", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        appLog.info('settings.saved', { changed: Object.keys(payload) });

        // If the HTTPS port changed, apply to nginx + firewall on the server
        const portChanged = externalHttpsPort.value !== savedHttpsPort.value;
        if (portChanged) {
            try {
                const portConnection = activeConnection.value;
                const applyResult = await apiFetch("/api/settings/apply-port", { method: "POST" });
                const appliedPort = applyResult?.newPort ?? applyResult?.port;
                if (!applyResult?.ok || typeof appliedPort !== "number"
                    || !Number.isInteger(appliedPort) || appliedPort < 1 || appliedPort > 65535) {
                    throw new Error("Server did not confirm the applied HTTPS port.");
                }
                if (portConnection) {
                    const url = new URL(portConnection.baseUrl);
                    if (url.protocol === "https:") url.port = String(appliedPort);
                    updateConnection(portConnection.connectionId, {
                        httpsPort: appliedPort,
                        baseUrl: url.protocol === "https:" ? url.href.replace(/\/$/, "") : portConnection.baseUrl,
                    });
                }
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

        // Save branding before reload() overwrites its refs
        if (brandingDirty.value) {
            await saveBranding();
            if (brandingError.value) throw new Error(`Branding wasn't saved: ${brandingError.value}`);
        }

        await reload();

        // Commit transcode settings to persistent storage only on save
        commitTranscodeEnabled(clientTranscodeEnabled.value);
        commitTranscodePreset(transcodePreset.value);
        commitHwAccel(hwAccelEnabled.value);

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
            defaultExpirySeconds: defaultExpiryNever.value ? 0 : computeDefaultExpirySec(),
            projectRoot: (projectRoot.value || "").trim() || null,
            forceProjectRoot: !!forceProjectRoot.value,
        });
        emit("close")
    } catch (e: any) {
        appLog.error('settings.save_failed', { error: e?.message });
        saveError.value = e?.message || "Failed to save settings.";
    } finally {
        busy.value = false;
        savingSettings.value = false;
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
/* ── Sidebar ─────────────────────────────────────────── */
.settings-nav {
    width: 13.5rem;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 0.9rem 0 1rem;
    border-right: 1px solid var(--flow-line);
    background: var(--flow-surface-sunken);
}
.settings-nav-group-label {
    padding: 0.85rem 1rem 0.3rem;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ui-subtle-text);
}
.settings-nav-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: calc(100% - 1rem);
    margin: 0 0.5rem;
    padding: 0.45rem 0.6rem;
    font-size: 0.8125rem;
    font-weight: 500;
    text-align: left;
    color: var(--ui-subtle-text);
    border-radius: var(--flow-radius-md);
    transition: background 0.12s ease, color 0.12s ease;
}
.settings-nav-btn:hover {
    color: inherit;
    background: var(--flow-surface-hover);
}
.settings-nav-btn:focus-visible {
    outline: 2px solid var(--ui-ring);
    outline-offset: -2px;
}
.settings-nav-btn-active,
.settings-nav-btn-active:hover {
    color: inherit;
    font-weight: 600;
    background: var(--flow-accent-soft);
    box-shadow: inset 3px 0 0 var(--flow-accent-line);
}
.settings-nav-icon {
    width: 1.05rem;
    height: 1.05rem;
    flex-shrink: 0;
    opacity: 0.8;
}

/* ── Page ────────────────────────────────────────────── */
.settings-content {
    max-width: 100%;
}
.settings-page-head {
    margin-bottom: 1.1rem;
}
.settings-page-title {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
}
.settings-page-desc {
    margin-top: 0.2rem;
    font-size: 0.8125rem;
    color: var(--ui-subtle-text);
    max-width: 40rem;
}
.settings-subhead {
    margin: 1.4rem 0 0.45rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ui-subtle-text);
}
.settings-page-head + .settings-subhead,
.settings-page-head + * .settings-subhead:first-child,
.settings-subhead--first {
    margin-top: 0;
}

/* A titled block of setting rows: one border, lines between rows */
.settings-group {
    border: 1px solid var(--flow-line);
    border-radius: var(--flow-radius-lg);
    padding: 0 1rem;
}
.settings-group > * + * {
    border-top: 1px solid var(--flow-line);
}

/* Two-option picker (e.g. Local Network / Internet) */
.settings-segmented {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--flow-line);
    border-radius: var(--flow-radius-md);
    background: var(--flow-surface-sunken);
}
.settings-segmented > button {
    padding: 0.3rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--ui-subtle-text);
    border-radius: calc(var(--flow-radius-md) - 2px);
    white-space: nowrap;
}
.settings-segmented > button:hover {
    color: inherit;
}
.settings-segmented > button.is-on {
    color: white;
    font-weight: 600;
    background: var(--btn-primary-fill);
}
.settings-segmented > button:focus-visible {
    outline: 2px solid var(--ui-ring);
    outline-offset: 1px;
}
</style>
