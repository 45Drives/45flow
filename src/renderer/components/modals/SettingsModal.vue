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
                        <div class="text-xs text-muted mt-0.5">Adjust global settings for share links.</div>
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

                            <p class="text-xs font-semibold text-muted uppercase tracking-wide mt-5 mb-2">External Share URL (Public)</p>
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

                            <p class="text-xs font-semibold text-muted uppercase tracking-wide mt-5 mb-2">Internal Share URL (LAN / VPN)</p>
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
                                <div class="text-xs font-semibold text-muted uppercase tracking-wide">URL Preview</div>
                                <div class="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <div class="text-xs text-muted">External</div>
                                        <div class="font-mono text-xs break-all mt-0.5">{{ externalPreview || '—' }}</div>
                                        <div v-if="externalAuto && externalEffectivePreview"
                                            class="mt-1 text-xs opacity-60 break-all">
                                            Detected: <span class="font-mono">{{ externalEffectivePreview }}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-muted">Internal</div>
                                        <div class="font-mono text-xs break-all mt-0.5">{{ internalPreview || '—' }}</div>
                                    </div>
                                </div>
                            </div>
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
                                <div class="text-xs text-muted mt-1">
                                    Absolute path used as the default root when creating share/upload destinations.
                                </div>
                            </div>
                        </template>

                        <!-- ═══ Default Link Options ══════════════════════════ -->
                        <template v-if="activeSection === 'defaults'">
                            <div class="divide-y divide-default">
                                <SettingRow label="Restrict access to users" description="New links will require user accounts by default.">
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
                                <SettingRow label="Allow comments on open links" description="Enable commenting for links accessible without sign-in.">
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
                                <SettingRow label="Generate review copies by default" description="Create streamable review copies of video files when sharing.">
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
                            <p class="text-xs text-muted mt-3">
                                These defaults apply when creating new links and can be changed per link.
                            </p>
                        </template>

                        <!-- ═══ Application / Preferences ═════════════════════ -->
                        <template v-if="activeSection === 'app'">
                            <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Display</p>
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

                            <p class="text-xs font-semibold text-muted uppercase tracking-wide mt-5 mb-2">Guided Tours</p>
                            <div class="divide-y divide-default">
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
                        </template>

                        <!-- ═══ Maintenance ═══════════════════════════════════ -->
                        <template v-if="activeSection === 'maintenance'">
                            <p class="text-xs text-muted mb-3">
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

                            <p class="text-xs font-semibold text-muted uppercase tracking-wide mt-5 mb-2">Parameters</p>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="flex items-center justify-between gap-2 rounded-lg border border-default bg-default/40 px-3 py-2">
                                    <div class="text-sm text-default">Orphan min age</div>
                                    <div class="flex items-center gap-1">
                                        <input v-model.number="cleanupOrphanMinAgeHours" type="number" min="0" max="8760"
                                            :disabled="busy || cleanupBusy"
                                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-16 text-right" />
                                        <span class="text-xs text-muted">hrs</span>
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

                    </div>
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between px-5 py-3 border-t border-default shrink-0">
                    <div class="min-w-0">
                        <div v-if="validationError" class="text-danger text-sm">{{ validationError }}</div>
                        <div v-else-if="saveError" class="text-danger text-sm">{{ saveError }}</div>
                        <div v-else-if="saveOk" class="text-success text-sm">Saved.</div>
                        <div v-else class="text-xs text-muted">New shares will use these settings automatically.</div>
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
                    ? h('div', { class: 'text-xs text-muted mt-0.5' }, props.description)
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
import { useTourManager, type TourStep } from "../../composables/useTourManager";
import { appLog } from "../../composables/useLog";

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

const { apiFetch } = useApi();
const { onboarding, resetAll: resetOnboarding, markDone } = useOnboarding();
const { hour12 } = useTimeFormat();
const { requestTour } = useTourManager();

const settingsTourSteps: TourStep[] = [
	{
		target: '[data-tour="settings-modal-header"]',
		message: 'Welcome to 45Flow Settings.\n\nThis is where you configure global options that affect all new links and server behavior.',
	},
	{
		target: '[data-tour="settings-modal-nav"]',
		message: 'Use the sidebar to navigate between sections.\n\n• URLs & Access — configure external/internal share URLs.\n• Project Root — set the default directory root.\n• Link Options — default access, comments, and review copy settings.\n• Preferences — time format and guided tour settings.\n• Maintenance — clean up orphaned files and metadata.',
	},
	{
		target: '[data-tour="settings-modal-urls"]',
		message: 'Each section shows its settings here.\n\nRight now you\'re viewing URLs & Access — toggle between Internal and External link access, configure your public domain or auto-detect, and set the HTTPS port.\n\nClick "Save Settings" at the bottom when you\'re done.',
		beforeShow: () => { activeSection.value = 'sharing' },
	},
]

// ── Section navigation ──────────────────────────────────────────────────
type Section = 'sharing' | 'project' | 'defaults' | 'app' | 'maintenance' | 'help';
const activeSection = ref<Section>('sharing');

const navGroups = [
    {
        label: 'Link Sharing',
        items: [
            { key: 'sharing' as Section, label: 'URLs & Access' },
            { key: 'project' as Section, label: 'Project Root' },
        ],
    },
    {
        label: 'Defaults',
        items: [
            { key: 'defaults' as Section, label: 'Link Options' },
        ],
    },
    {
        label: 'Application',
        items: [
            { key: 'app' as Section, label: 'Preferences' },
            { key: 'maintenance' as Section, label: 'Maintenance' },
        ],
    },
    {
        label: 'Help',
        items: [
            { key: 'help' as Section, label: 'User Guide' },
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
const projectRoot = ref<string>("");
const forceProjectRoot = ref(false);

const cleanupBusy = ref(false);
const cleanupMode = ref<"scan" | "apply" | null>(null);
const cleanupError = ref<string | null>(null);
const cleanupResult = ref<any | null>(null);
const cleanupLastRunAt = ref<number | null>(null);
const cleanupDeleteOrphans = ref(true);
const cleanupPruneMissingFiles = ref(false);
const cleanupMaxMissingFiles = ref(200);
const cleanupOrphanMinAgeHours = ref(24);

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
        defaultUseProxyFiles.value =
            typeof data.defaultUseProxyFiles === "boolean" ? data.defaultUseProxyFiles : false;
        projectRoot.value = typeof data.projectRoot === "string" ? data.projectRoot : "";
        forceProjectRoot.value = typeof data.forceProjectRoot === "boolean" ? data.forceProjectRoot : false;
    } catch (e: any) {
        loadError.value = e?.message ? `Failed to load settings: ${e.message}` : "Failed to load settings.";
    } finally {
        busy.value = false;
    }
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
