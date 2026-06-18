<template>
    <form @submit.prevent="connectToServer" class="connect-page" :class="{ 'is-dark': darkMode }" :aria-busy="anyBusy">
        <div class="connect-shell ss-page-frame">
            <section data-tour="connect-hero" class="connect-hero ss-surface">
                <h1>Share files through secure review links</h1>
                <p>Connect this client to your server, then create and manage links from the dashboard.</p>
                <p class="connect-note">
                    Servers appear automatically when <b class="text-primary">houston-broadcaster</b> is running. If not, use manual IP connection.
                </p>
            </section>

            <CardContainer class="connect-main-card rounded-md shadow-xl text-black" :style="{ background: connectMainCardBackground }">
                <div class="connect-main-grid">
                    <section data-tour="connect-server-selection" class="connect-panel">
                        <div class="connect-section-title">Server Selection</div>

                        <div class="flex flex-col text-left">
                            <span class="connect-label">Select a server</span>
                            <select v-model="selectedServerIp" :disabled="anyBusy || manualIp !== ''"
                                class="connect-control h-[2.9rem] text-default rounded-lg px-4 flex-1 border border-default w-full">
                                <option v-for="server in discoveryState.servers" :key="server.ip" :value="server.ip">
                                    {{ server.name }} ({{ server.ip }})
                                </option>
                            </select>
                        </div>

                        <div class="connect-or mt-2">OR</div>

                        <div class="flex flex-col text-left">
                            <span class="connect-label">Connect manually via IP</span>
                            <input v-model="manualIp" type="text" placeholder="192.168.1.123" :disabled="anyBusy"
                                class="connect-control h-[2.9rem] text-default input-textlike border px-4 rounded-lg text-lg w-full" />
                        </div>

                        <details ref="portsDetailsRef" data-tour="connect-ports" class="py-2 gap-3 my-2 text-left group" :open="Boolean(portError || portWarning) || tourPortsOpen">
                            <summary
                                class="list-none flex w-full items-center justify-between text-left cursor-pointer select-none">
                                <div class="min-w-0">
                                    <p class="text-sm font-semibold">Configure Ports</p>
                                    <p class="text-xs opacity-75">Optional. Leave collapsed unless you need custom ports.</p>
                                </div>
                                <svg
                                    class="h-5 w-5 opacity-70 transition-transform duration-200 group-open:rotate-180"
                                    viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fill-rule="evenodd"
                                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                                        clip-rule="evenodd" />
                                </svg>
                            </summary>

                            <div class="connect-port-grid text-sm mt-2">
                                <label class="flex flex-col">
                                    <span class="mb-1 opacity-80">SSH</span>
                                    <input v-model.number="sshPort" type="number" min="1" max="65535" :disabled="anyBusy"
                                        class="connect-control text-default input-textlike border px-3 py-1.5 rounded text-base w-full"
                                        placeholder="22" />
                                </label>

                                <label class="flex flex-col">
                                    <span class="mb-1 opacity-80">
                                        API <span class="text-xs">(houston-broadcaster)</span>
                                    </span>
                                    <input v-model.number="broadcasterPort" type="number" min="1" max="65535"
                                        :disabled="anyBusy"
                                        class="connect-control text-default input-textlike border px-3 py-1.5 rounded text-base w-full"
                                        placeholder="9095" />
                                </label>

                                <label class="flex flex-col">
                                    <span class="mb-1 opacity-80">HTTPS</span>
                                    <input v-model.number="httpsPort" type="number" min="1" max="65535" :disabled="anyBusy"
                                        class="connect-control text-default input-textlike border px-3 py-1.5 rounded text-base w-full"
                                        placeholder="443" />
                                </label>
                            </div>

                            <p class="mt-2 text-xs opacity-75">
                                Leave blank to use defaults: SSH 22, API 9095, HTTPS 443. Ports must be different.
                            </p>

                            <p v-if="portError" class="mt-1 text-xs text-danger">
                                {{ portError }}
                            </p>
                            <p v-else-if="portWarning" class="mt-1 text-xs text-warning">
                                {{ portWarning }}
                            </p>
                        </details>
                    </section>

                    <section data-tour="connect-auth" class="connect-panel connect-panel-auth">
                        <div class="connect-section-title">Authentication</div>
                        <label class="connect-auth-row flex flex-col">
                            <span class="connect-label">Username</span>
                            <input v-model="username" type="text" placeholder="root" :disabled="anyBusy"
                                class="connect-control h-[2.9rem] text-default input-textlike px-4 py-2 rounded-lg text-lg w-full border" />
                        </label>

                        <div class="connect-or connect-or--ghost" aria-hidden="true"></div>

                        <label class="connect-auth-row flex flex-col">
                            <span class="connect-label">Password</span>
                            <div class="w-full relative">
                                <input v-model="password" v-enter-next :type="showPassword ? 'text' : 'password'" id="password"
                                    :disabled="anyBusy"
                                    class="connect-control h-[2.9rem] text-default input-textlike px-4 py-2 rounded-lg text-lg w-full border"
                                    placeholder="••••••••" />
                                <button type="button" @click="togglePassword" :disabled="anyBusy"
                                    class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                                    <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                    <EyeSlashIcon v-else class="w-5 h-5" />
                                </button>
                            </div>
                        </label>
                    </section>
                </div>
            </CardContainer>

            <section data-tour="connect-port-forwarding" class="connect-warning ss-surface">
                <p class="text-danger text-sm text-left">
                    <b>External sharing requires port forwarding:</b> HTTPS port 443 (or your custom HTTPS port) must be open/forwarded on your router.
                </p>
                <button type="button" @click.prevent="togglePortFwdModal" :disabled="anyBusy"
                    class="btn btn-secondary w-fit text-sm">
                    How to set this up
                </button>
            </section>

            <div data-tour="connect-submit" class="connect-submit">
                <button type="submit"
                    class="btn btn-success connect-submit-btn flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    :disabled="anyBusy">
                    <svg v-if="isBusy" class="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity=".25" />
                        <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="4" fill="none" />
                    </svg>
                    <span>{{ isBusy ? 'Connecting…' : 'Connect to Server' }}</span>
                </button>
                <div v-if="statusLine" class="mt-2 text-sm opacity-85 flex items-center gap-2 justify-center text-center">
                    <svg v-if="isBootstrapping" class="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity=".25" />
                        <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" stroke-width="4" fill="none" />
                    </svg>
                    <span>{{ statusLine }}</span>
                </div>
            </div>
        </div>
    </form>
    <PortForwardingModal v-if="showPortFwdModal" @close="togglePortFwdModal" />
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useHeader } from '../composables/useHeader'
import { currentServerInjectionKey, discoveryStateInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import type { DiscoveryState, Server } from '../types'
import { pushNotification, Notification, CardContainer, useDarkModeState } from '@45drives/houston-common-ui'
import PortForwardingModal from '../components/modals/PortForwardingModal.vue' 
import { useResilientNav } from '../composables/useResilientNav';
import { loadLastSession, saveLastSession, clearLastSession, saveManualServer, saveRegistryLicenseId } from '../composables/useSessionPersistence';
import { useConnections } from '../composables/useConnections'
import type { Connection } from '../composables/useConnections'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
useHeader('Welcome to 45Flow!');

const route = useRoute()
const { to } = useResilientNav()
const { addConnection, setActive, removeConnection, connections } = useConnections()
const discoveryState = inject<DiscoveryState>(discoveryStateInjectionKey)!;
const manualIp = ref('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const togglePassword = () => { showPassword.value = !showPassword.value; };
const darkMode = useDarkModeState()
const connectMainCardBackground = 'var(--btn-primary-fill)'

const selectedServerIp = ref<string>('')
const providedCurrentServer = inject(currentServerInjectionKey)!;
const connectionMeta = inject(connectionMetaInjectionKey)!;

const selectedServer = computed<Server | undefined>(() =>
    discoveryState.servers.find(s => s.ip === selectedServerIp.value)
);

const sshPort = ref<number | null>(null);          // SSH port (null means “unspecified → default/detect”)
const broadcasterPort = ref<number | null>(null);  // internal API, default 9095
const httpsPort = ref<number | null>(null);        // external HTTPS, default 443

// ================== Guided tour ==================
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()
const tourPortsOpen = ref(false)
const portsDetailsRef = ref<HTMLDetailsElement | null>(null)

const connectTourSteps: TourStep[] = [
	{
		target: '[data-tour="connect-hero"]',
		message: 'Welcome to 45Flow!\n\nThis is your starting point. From here you\'ll connect this client application to your media server — then you can create share links, upload files, and manage access from the dashboard.',
	},
	{
		target: '[data-tour="connect-server-selection"]',
		message: 'Pick a server to connect to.\n\nServers running houston-broadcaster appear automatically in the dropdown. If your server doesn\'t show up, type its IP address in the manual field below instead.',
	},
	{
		target: '[data-tour="connect-ports"]',
		message: 'You can customise the connection ports here.\n\n• SSH (default 22) — used for secure file operations and server setup.\n• API / houston-broadcaster (default 9095) — the backend service that powers 45Flow.\n• HTTPS (default 443) — used for external link access.\n\nLeave these blank to use the defaults. Only change them if your server uses non-standard ports.',
		beforeShow: () => {
			tourPortsOpen.value = true
			if (portsDetailsRef.value) portsDetailsRef.value.open = true
		},
		cleanup: () => {
			tourPortsOpen.value = false
			if (portsDetailsRef.value) portsDetailsRef.value.open = false
		},
	},
	{
		target: '[data-tour="connect-auth"]',
		message: 'Enter your server credentials.\n\nUse the same username and password you\'d use to login into the machine. These are used to authenticate the connection and log in to the 45Flow API.',
	},
	{
		target: '[data-tour="connect-port-forwarding"]',
		message: 'If you plan to share links externally (over the internet), your router must forward HTTPS traffic (port 443 by default) to the server.\n\nClick "How to set this up" for step-by-step instructions. This isn\'t needed for local/LAN sharing.',
	},
	{
		target: '[data-tour="connect-submit"]',
		message: 'Once you\'ve selected a server and entered credentials, click here to connect.\n\n45Flow will verify the SSH connection, check that houston-broadcaster is installed (and set it up if needed), validate your license, and log you in. You\'ll be taken to the dashboard when everything\'s ready.',
	},
]

const DEFAULT_SSH_PORT = 22;
const DEFAULT_API_PORT = Number((import.meta as any).env?.VITE_API_PORT || 9095);
const DEFAULT_HTTPS_PORT = 443;

// Map for nicer names in the message
const PORT_LABELS: Record<'ssh' | 'api' | 'https', string> = {
    ssh: 'SSH',
    api: 'API',
    https: 'HTTPS',
};

const PORT_PREF_KEY = 'hb_port_prefs_v1';

type PortPrefs = Record<string, {
    sshPort?: number;
    apiPort?: number;
    httpsPort?: number;
}>;

function formatPortNames(keys: PortKey[]): string {
    const labels = keys.map(k => PORT_LABELS[k]);
    const last = labels.pop()!;
    if (labels.length === 0) return last;
    if (labels.length === 1) return `${labels[0]} and ${last}`;
    return `${labels.join(', ')} and ${last}`;
}

function normalizePort(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;

    const n = typeof val === 'string' ? Number(val) : (val as number);

    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 65535) return null;

    return n;
}

function loadPortPrefs(): PortPrefs {
    try {
        const raw = window.localStorage.getItem(PORT_PREF_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed as PortPrefs : {};
    } catch {
        return {};
    }
}

function savePortPrefs(prefs: PortPrefs) {
    try {
        window.localStorage.setItem(PORT_PREF_KEY, JSON.stringify(prefs));
    } catch {
        // ignore storage errors (private mode, etc.)
    }
}

function getPrefsForHost(host: string) {
    const prefs = loadPortPrefs();
    return prefs[host] || null;
}

function rememberPortsForHost(host: string, ports: {
    sshPort?: number;
    apiPort?: number;
    httpsPort?: number;
}) {
    const prefs = loadPortPrefs();
    prefs[host] = {
        ...prefs[host],
        ...ports,
    };
    savePortPrefs(prefs);
}

watch(selectedServerIp, (ip) => {
    if (!ip) return;

    // clear manual IP when selecting from dropdown (you already do similar)
    manualIp.value = '';

    const prefs = getPrefsForHost(ip.trim());
    if (prefs) {
        sshPort.value = prefs.sshPort ?? null;
        broadcasterPort.value = prefs.apiPort ?? null;
        httpsPort.value = prefs.httpsPort ?? null;
    }
}, { immediate: false });

type NormalizedHost = {
    host: string;
    sshPort?: number;
};

function normalizeHost(raw: string): NormalizedHost {
    const s = raw.trim();
    if (!s) return { host: '' };

    // Pattern: "10.0.0.10:2222"
    const colonIdx = s.lastIndexOf(':');
    if (colonIdx > -1) {
        const hostPart = s.slice(0, colonIdx).trim();
        const portPart = s.slice(colonIdx + 1).trim();
        if (/^\d+$/.test(portPart) && hostPart) {
            return { host: hostPart, sshPort: Number(portPart) };
        }
    }

    // Pattern: "10.0.0.10 -p 2222" or "10.0.0.10 -P 2222"
    const m = s.match(/^(.*)\s+-p\s+(\d+)$/i);
    if (m) {
        const hostPart = m[1].trim();
        const portPart = Number(m[2]);
        if (hostPart) {
            return { host: hostPart, sshPort: portPart };
        }
    }

    // Fallback: just a host/IP
    return { host: s };
}

/** Simple IPv4-ish validation for UI */
function looksLikeIpv4(host: string): boolean {
    const parts = host.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
        if (!/^\d+$/.test(p)) return false;
        const n = Number(p);
        return n >= 0 && n <= 255;
    });
}

const findServerByIp = (ip: string) =>
    discoveryState.servers.find(s => s.ip === ip.trim());

watch(() => discoveryState.servers.length, (len) => {
    if (len > 0 && !selectedServerIp.value && !manualIp.value) {
        selectedServerIp.value = discoveryState.servers[0].ip
    }
}, { immediate: true })

watch(manualIp, (val) => {
    const ip = val.trim();
    const hit = ip ? findServerByIp(ip) : undefined;
    if (hit) {
        selectedServerIp.value = hit.ip;
        manualIp.value = '';
        return;
    } else if (val !== '') {
        selectedServerIp.value = '';
    }

    if (ip) {
        const prefs = getPrefsForHost(ip);
        if (prefs) {
            sshPort.value = prefs.sshPort ?? null;
            broadcasterPort.value = prefs.apiPort ?? null;
            httpsPort.value = prefs.httpsPort ?? null;
        }
    }
});

watch(selectedServerIp, () => { if (selectedServerIp.value !== '') manualIp.value = '' })

const isDev = import.meta.env.DEV === true;

const portError = ref<string>('');    // hard error: block Connect
const portWarning = ref<string>('');  // soft warning: explain auto-fallback

type PortKey = 'ssh' | 'api' | 'https';

function ensurePortConstraints(changed: PortKey) {
    portError.value = '';
    portWarning.value = '';

    const values: Record<PortKey, number | null> = {
        ssh: normalizePort(sshPort.value),
        api: normalizePort(broadcasterPort.value),
        https: normalizePort(httpsPort.value),
    };

    const defaults: Record<PortKey, number> = {
        ssh: DEFAULT_SSH_PORT,
        api: DEFAULT_API_PORT,
        https: DEFAULT_HTTPS_PORT,
    };

    const allKeys: PortKey[] = ['ssh', 'api', 'https'];

    //
    // 1) Explicit conflicts only (user-entered values, ignoring defaults)
    //
    const explicitMap = new Map<number, PortKey[]>();
    for (const k of allKeys) {
        const v = values[k];
        if (v == null) continue; // blank → ignore here
        const arr = explicitMap.get(v) ?? [];
        arr.push(k);
        explicitMap.set(v, arr);
    }

    for (const [port, keys] of explicitMap.entries()) {
        if (keys.length > 1) {
            const names = formatPortNames(keys);
            portError.value =
                `Ports must be unique: ${names} are all set to ${port}. ` +
                `Please choose a different port for one of them.`;
            return; // do not auto-fix explicit conflicts
        }
    }

    // 2) auto-bump block
    const changedVal = values[changed];

    if (changedVal != null && changedVal !== defaults[changed]) {
        const warnParts: string[] = [];
        let didAdjust = false;

        const used = new Set<number>();
        for (const k of allKeys) {
            const v = values[k];
            if (v != null) used.add(v);
        }
        used.add(changedVal);

        for (const k of allKeys) {
            if (k === changed) continue;

            if (values[k] == null && defaults[k] === changedVal) {
                let candidate = defaults[k] + 1;
                while (candidate <= 65535 && used.has(candidate)) {
                    candidate++;
                }

                if (candidate > 65535) {
                    portError.value = `No free port found for ${PORT_LABELS[k]}. Please pick a value manually.`;
                    return;
                }

                values[k] = candidate;
                used.add(candidate);
                didAdjust = true;

                warnParts.push(
                    `${PORT_LABELS[k]} default port ${defaults[k]} is already used by ${PORT_LABELS[changed]} (${changedVal}).\n` +
                    `${PORT_LABELS[k]} was set to ${candidate}. Please review and adjust if needed.\n`
                );
            }
        }

        if (didAdjust) {
            isProgrammaticPortUpdate = true;
            try {
                sshPort.value = values.ssh;
                broadcasterPort.value = values.api;
                httpsPort.value = values.https;
            } finally {
                isProgrammaticPortUpdate = false;
            }
        }

        if (warnParts.length > 0) {
            const msg = warnParts.join(' ');
            portWarning.value = msg;
            pushNotification(new Notification('Port Changed', msg, 'warning', 8000));
        }
    }


    //
    // 3) Final safety: check conflicts on *effective* ports (value or default if blank)
    //
    const effective: Record<PortKey, number> = {
        ssh: values.ssh ?? DEFAULT_SSH_PORT,
        api: values.api ?? DEFAULT_API_PORT,
        https: values.https ?? DEFAULT_HTTPS_PORT,
    };

    const effectiveMap = new Map<number, PortKey[]>();
    for (const k of allKeys) {
        const p = effective[k];
        const arr = effectiveMap.get(p) ?? [];
        arr.push(k);
        effectiveMap.set(p, arr);
    }

    for (const [port, keys] of effectiveMap.entries()) {
        if (keys.length > 1) {
            const names = formatPortNames(keys);
            portError.value =
                `Ports must be unique: ${names} are all set to ${port} (including defaults). ` +
                `Please choose distinct ports.`;
            return;
        }
    }

    // If we get here, no conflicts remain and warnings (if any) were already set.
}

let isProgrammaticPortUpdate = false;

watch(sshPort, () => {
    if (isProgrammaticPortUpdate) return;
    ensurePortConstraints('ssh');
});

watch(broadcasterPort, () => {
    if (isProgrammaticPortUpdate) return;
    ensurePortConstraints('api');
});

watch(httpsPort, () => {
    if (isProgrammaticPortUpdate) return;
    ensurePortConstraints('https');
});

const statusLine = ref<string>('');  // one line only
const isBusy = ref(false);           // disables UI + button during whole flow
const isBootstrapping = ref(false);  // shows spinner while remote deps/bootstrap running
let unlistenProgress: (() => void) | null = null;
const anyBusy = computed(() => isBusy.value);

const showPortFwdModal = ref(false);
function togglePortFwdModal() {
    showPortFwdModal.value = !showPortFwdModal.value;
}


function listenBootstrap(id: string) {
    const handler = (_: any, msg: any) => {
        if (msg.id !== id) return;
        if (msg.label) statusLine.value = msg.label;
    };
    window.electron?.ipcRenderer.on('bootstrap-progress', handler);
    return () => window.electron?.ipcRenderer.removeListener('bootstrap-progress', handler);
}

async function readHttpError(res: Response): Promise<string> {
    const requestId = String(res.headers.get('x-request-id') || '').trim();
    const raw = await res.text().catch(() => '');
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

    const base =
        (parsed && typeof parsed.error === 'string' && parsed.error) ||
        (parsed && typeof parsed.message === 'string' && parsed.message) ||
        raw ||
        `HTTP ${res.status}`;
    const bodyReqId = parsed && typeof parsed.requestId === 'string' ? parsed.requestId : '';
    const rid = bodyReqId || requestId;
    return rid && !String(base).includes(rid) ? `${base} (request ${rid})` : String(base);
}

async function checkLicenseStatus(apiBase: string, token: string): Promise<{ licensed: boolean; licenseInfo?: any }> {
    let statusResp: Response
    try {
        statusResp = await fetch(`${apiBase}/api/license/status`)
    } catch {
        // License endpoint unavailable (older broadcaster) -> assume unlicensed.
        return { licensed: false }
    }
    if (!statusResp.ok) return { licensed: false }

    let statusBody: any = null
    try { statusBody = await statusResp.json() } catch { return { licensed: false } }

    const licensed = !!statusBody?.licensed
    const licenseInfo = statusBody?.license ?? undefined

    if (!licensed) {
        pushNotification(new Notification(
            'Basic Mode',
            'Connected to server (unlicensed). Premium features are disabled. Go to Settings → Go Pro to activate.',
            'info',
            8000
        ))
    }

    return { licensed, licenseInfo }
}

function translateSshError(errorMsg: string): string {
    const msg = String(errorMsg || '').toLowerCase();
    
    // SSH authentication failures
    if (msg.includes('all configured authentication methods failed')) {
        return 'Authentication failed. Please check your username and password.';
    }
    if (msg.includes('permission denied')) {
        return 'Permission denied. Please check your username and password.';
    }
    if (msg.includes('password authentication failed')) {
        return 'Incorrect password. Please try again.';
    }
    
    // SSH connection failures
    if (msg.includes('connect etimedout') || msg.includes('connect timeout')) {
        return 'Connection timed out. Please check the server IP address and ensure SSH is enabled.';
    }
    if (msg.includes('connect econnrefused') || msg.includes('connection refused')) {
        return 'Connection refused. Please check the SSH port (default 22) and ensure SSH is enabled.';
    }
    if (msg.includes('network unreachable') || msg.includes('host unreachable')) {
        return 'Network unreachable. Please check your network connection and the server IP address.';
    }
    
    // Return original message if no translation found
    return errorMsg;
}

async function connectToServer() {
    if (!selectedServer.value && !manualIp.value) {
        pushNotification(new Notification('Error', `Please select or enter a server before connecting.`, 'error', 8000));
        return;
    }
    if (!username.value.trim()) {
        pushNotification(new Notification('Error', `Please enter a username.`, 'error', 8000));
        return;
    }
    if (!password.value.trim()) {
        pushNotification(new Notification('Error', `Please enter a password.`, 'error', 8000));
        return;
    }

    // Re-run port constraints on submit to be extra safe
    ensurePortConstraints('ssh');

    if (portError.value) {
        pushNotification(new Notification('Error', portError.value, 'error', 8000));
        return;
    }

    // Normalize manual IP (strip any :port / -p flags the user typed)
    if (!selectedServer.value && manualIp.value.trim()) {
        const norm = normalizeHost(manualIp.value);
        if (!looksLikeIpv4(norm.host)) {
            pushNotification(new Notification('Error', `Please enter a valid IPv4 address (e.g. 192.168.1.10).`, 'error', 8000));
            return;
        }
        // If they typed a port inline and no explicit sshPort yet, adopt it.
        if (norm.sshPort && sshPort.value == null) {
            sshPort.value = norm.sshPort;
        }
        manualIp.value = norm.host;
    }

    isBusy.value = true;
    statusLine.value = '';

    try {
        const rawIpInput = (selectedServer.value?.ip || manualIp.value).trim();
        const normalized = normalizeHost(rawIpInput);
        const rawIp = normalized.host;

        // If the manual IP is already discovered, prefer that discovered record.
        const discovered = findServerByIp(rawIp);
        const effectiveServer = discovered ?? selectedServer.value;
        const ip = effectiveServer?.ip || rawIp;
        
        const apiPortToUse =
            broadcasterPort.value && broadcasterPort.value > 0 && broadcasterPort.value < 65536
                ? broadcasterPort.value
                : DEFAULT_API_PORT;

        const apiBase = `http://${ip}:${apiPortToUse}`;

        // Decide which SSH port to use for this session
        const sshPortToUse = (sshPort.value && sshPort.value > 0 && sshPort.value < 65536)
            ? sshPort.value
            : undefined; // undefined → “let main detect / default 22”

        // Ensure SSH is ready early so any later SSH operations can use keys reliably
        statusLine.value = 'Preparing SSH…';
        let verifiedKeyPath: string | undefined;
        try {
            const r = await window.electron?.ipcRenderer.invoke('ensure-ssh-ready', {
                host: ip,
                username: username.value,
                password: password.value || undefined,
                sshPort: sshPortToUse,
            });

            if (!r?.ok) {
                // If this fails, SSH preflight/bootstrap will probably fail too, so treat as fatal.
                window.appLog?.error('ensure-ssh-ready.failed', { error: r?.error });
                statusLine.value = '';
                const userMsg = translateSshError(r?.error || 'SSH setup failed');
                pushNotification(new Notification('Error', userMsg, 'error', 12000));
                return;
            }
            // Store the verified key path for later use in uploads
            verifiedKeyPath = r?.keyPath;
        } catch (e: any) {
            statusLine.value = '';
            window.appLog?.error('ensure-ssh-ready.failed', { error: e?.message });
            const userMsg = translateSshError(e?.message || 'SSH setup failed');
            pushNotification(new Notification('Error', userMsg, 'error', 12000));
            return;
        }

        // Set current server (avoid creating a "manual" entry if we already discovered it)
        providedCurrentServer.value = effectiveServer ?? {
            ip, name: ip, lastSeen: Date.now(), status: 'unknown', manuallyAdded: true
        };

        connectionMeta.value = {
            ...connectionMeta.value,
            port: apiPortToUse,
            apiBase,
            httpsHost: undefined,
            ssh: {
                server: ip,
                username: username.value,
                port: sshPortToUse,
                keyPath: verifiedKeyPath,
            },
        };

        window.appLog?.info('login.resolveApiBase', { isDev, ip, port: apiPortToUse, apiBase, href: location.href });
        window.appLog?.info('login.request', { url: `${apiBase}/api/login`, ip });

        const probe = async () => {
            const r = await window.electron?.ipcRenderer.invoke('probe-health', { ip, port: apiPortToUse });
            return !!r?.ok;
        };

        // Be patient briefly to avoid transient false negatives
        let healthy = await probe();
        if (!healthy) {
            for (let i = 0; i < 2 && !healthy; i++) {
                await new Promise(r => setTimeout(r, 750));
                healthy = await probe();
            }
        }

        /**
         * Check whether the modern "houston-broadcaster" package is installed
         * (vs. just the legacy service). If not installed → force bootstrap.
         * Run this for ALL connections (discovered or manually-typed) so that
         * manually-typed IPs also get the package check and bootstrap if needed.
         */
        let mustBootstrap = false;
        try {
            const preflight = await window.electron?.ipcRenderer.invoke(
                'remote-check-broadcaster',
                {
                    host: ip,
                    username: username.value,
                    password: password.value,
                    sshPort: sshPortToUse,
                }
            );

            // If package not installed (likely legacy present), we must bootstrap.
            if (preflight && preflight.hasPackage === false) {
                mustBootstrap = true;
                window.appLog?.info('preflight', { ip, reason: 'no-package-installed', preflight });
            } else {
                window.appLog?.info('preflight', { ip, reason: 'package-present', preflight });
            }
        } catch (err: any) {
            // If SSH preflight fails, fall back to the old rule (health decides).
            window.appLog?.warn('preflight.error', { ip, error: err?.message });
        }

        // Decide whether to bootstrap:
        // - If preflight forced it (legacy/no pkg) → bootstrap
        // - Else only bootstrap when API isn’t healthy
        if (mustBootstrap || !healthy) {
            const id = crypto.randomUUID();
            unlistenProgress?.();
            unlistenProgress = listenBootstrap(id);
            statusLine.value = 'Bootstrapping…';
            isBootstrapping.value = true;

            const result = await window.electron?.ipcRenderer.invoke(
                "run-remote-bootstrap",
                {
                    id,
                    host: ip,
                    username: username.value,
                    password: password.value,
                    sshPort: sshPortToUse,
                    bcastPort: apiPortToUse,
                    httpsPort: httpsPort.value ?? 443,
                }
            );

            if (!result?.success) {
                statusLine.value = '';
                isBootstrapping.value = false;
                unlistenProgress?.(); unlistenProgress = null;
                const userMsg = translateSshError(result?.error || 'Bootstrap failed');
                pushNotification(new Notification('Error', userMsg, 'error', 12000));
                return;
            }

            // Mark bootstrap finished before doing extra health probes
            isBootstrapping.value = false;
            statusLine.value = 'Checking server health…';

            // Post-bootstrap health wait (no longer counted as "bootstrapping")
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (await probe()) break;
            }

            statusLine.value = '';
            unlistenProgress?.();
            unlistenProgress = null;
        }

        const res = await fetch(`${apiBase}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username.value,
                password: password.value,
                clientBuildDate: typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : undefined,
            }),
        });

        // Handle entitlement expiry specifically
        if (!res.ok) {
            let errorData: any = null;
            const raw = await res.text().catch(() => '');
            try { errorData = raw ? JSON.parse(raw) : null; } catch {}

            if (res.status === 403 && errorData?.error === 'entitlement_expired') {
                throw new Error(
                    errorData?.message ||
                    'This version of 45Flow was released after your update entitlement expired. Please renew your license or use an earlier version.'
                );
            }
            const errMsg = errorData?.error || errorData?.message || raw || `HTTP ${res.status}`;
            throw new Error(errMsg);
        }

        const loginData = await res.json();
        const token = loginData.token;

        connectionMeta.value = {
            ...connectionMeta.value,
            token,
            ssh: {
                server: ip,
                username: username.value,
                port: sshPortToUse,
                keyPath: verifiedKeyPath,  // Preserve the key path from ensure-ssh-ready
            },
        };

        statusLine.value = '';
        
        try { sessionStorage.setItem('hb_token', token); } catch { /* ignore */ }

        // Check license status (non-blocking — sets licensed flag, doesn't prevent login)
        const licenseResult = await checkLicenseStatus(apiBase, token)

        // Seed initial settings only if not already configured
        try {
            const hdrs = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            };

            // Check if settings already exist
            const existingSettings = await fetch(`${apiBase}/api/settings`, {
                method: 'GET',
                headers: hdrs,
            });
            const settings = await existingSettings.json();

            // Only seed defaults if external mode is not configured yet (first-time setup)
            // Don't overwrite if user has set custom mode or if auto mode has a detected effective base
            const needsInitialSetup = !settings.externalMode || 
                                    (settings.externalMode === 'auto' && !settings.externalBaseEffective);
            
            if (needsInitialSetup) {
                await fetch(`${apiBase}/api/settings`, {
                    method: 'POST',
                    headers: hdrs,
                    body: JSON.stringify({
                        internalBase: 'auto',
                        externalBase: 'auto',
                        externalHttpsPort: httpsPort.value ?? 443
                    }),
                });
            }
        } catch (e: any) {
            window.appLog?.warn('settings.seed.failed', { message: e?.message });
        }

        rememberPortsForHost(ip, {
            sshPort: sshPortToUse,
            apiPort: apiPortToUse,
            httpsPort: httpsPort.value ?? 443,
        });

        // Persist manual server so it appears in the dropdown on next launch
        if (!discovered) {
            saveManualServer({ ip, name: effectiveServer?.name || ip });
        }

        // Create new connection in multi-server store
        const newConnection: Connection = {
            connectionId: crypto.randomUUID(),
            name: effectiveServer?.name || ip,
            serverIp: ip.trim(),
            serverName: effectiveServer?.name,
            baseUrl: apiBase,
            username: username.value.trim(),
            token,
            tokenIssuedAt: Date.now(),
            apiPort: apiPortToUse,
            sshPort: sshPortToUse,
            httpsPort: httpsPort.value ?? 443,
            ssh: {
                server: ip,
                username: username.value.trim(),
                port: sshPortToUse
            },
            serverInfo: effectiveServer?.serverInfo,
            setupComplete: effectiveServer?.setupComplete,
            licensed: licenseResult.licensed,
            licenseCheckedAt: Date.now(),
            licenseInfo: licenseResult.licenseInfo,
            status: 'connected',
            lastConnectedAt: Date.now(),
            isActive: true
        }
        
        const actualConnectionId = addConnection(newConnection)
        setActive(actualConnectionId)

        // Legacy persistence for backwards compatibility (will be removed in Phase 3)
        saveLastSession({
            serverIp: ip,
            serverName: effectiveServer?.name || ip,
            username: username.value,
            token,
            apiPort: apiPortToUse,
            sshPort: sshPortToUse,
            httpsPort: httpsPort.value ?? 443,
            apiBase,
            savedAt: Date.now(),
        });

        window.appLog?.info('login.success', { ip, connectionId: newConnection.connectionId });

        // Fire-and-forget: cache licenseId for VPS registry discovery
        fetch(`${apiBase}/api/license/status`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.license?.licenseId) saveRegistryLicenseId(d.license.licenseId) })
            .catch(() => { /* best-effort */ })

        // Fire-and-forget: check for broadcaster package updates via API (runs in background)
        checkBroadcasterUpdateInBackground(apiBase, token, effectiveServer?.name || ip);

        to('dashboard');
    } catch (e: any) {
        window.appLog?.error('login.error', { error: e?.message });
        pushNotification(new Notification('Error', e?.message || 'Login failed', 'error', 8000));
    } finally {
        isBootstrapping.value = false;
        isBusy.value = false;
    }
}

// ─── Auto-login from saved session on mount ─────────────────────
onMounted(async () => {
    // Start guided tour for first-time users
    if (!onboarding.value.connectTourDone) {
        setTimeout(() => {
            requestTour('connect', connectTourSteps, () => markDone('connectTourDone'))
        }, 500)
    }

    // Skip auto-login if user explicitly clicked "Add Connection"
    if (route.query.skipAutoLogin === 'true') {
        window.appLog?.info('auto-login.skipped', { reason: 'user adding new connection' })
        return
    }

    // Handle reconnect from connection manager
    if (route.query.reconnect && route.query.serverIp && route.query.username) {
        window.appLog?.info('reconnect.initiated', { 
            connectionId: route.query.reconnect,
            serverIp: route.query.serverIp 
        })
        
        // Pre-fill the form with reconnect details
        const serverIp = String(route.query.serverIp)
        const existingServer = discoveryState.servers.find(s => s.ip === serverIp)
        if (existingServer) {
            selectedServerIp.value = existingServer.ip
        } else {
            manualIp.value = serverIp
        }
        username.value = String(route.query.username)
        
        // Find the connection to get port details
        const conn = connections.find(c => c.connectionId === route.query.reconnect)
        if (conn) {
            if (conn.sshPort) sshPort.value = conn.sshPort
            if (conn.apiPort && conn.apiPort !== DEFAULT_API_PORT) broadcasterPort.value = conn.apiPort
            if (conn.httpsPort && conn.httpsPort !== DEFAULT_HTTPS_PORT) httpsPort.value = conn.httpsPort
        }
        
        return
    }

    const saved = loadLastSession()
    if (!saved) return

    // Pre-fill form fields from the saved session (so user sees what's being used)
    const existingServer = discoveryState.servers.find(s => s.ip === saved.serverIp)
    if (existingServer) {
        selectedServerIp.value = existingServer.ip
    } else {
        manualIp.value = saved.serverIp
    }
    username.value = saved.username
    if (saved.sshPort) sshPort.value = saved.sshPort
    if (saved.apiPort && saved.apiPort !== DEFAULT_API_PORT) broadcasterPort.value = saved.apiPort
    if (saved.httpsPort && saved.httpsPort !== DEFAULT_HTTPS_PORT) httpsPort.value = saved.httpsPort

    // Validate the saved token with a quick API call
    isBusy.value = true
    statusLine.value = 'Resuming previous session…'
    try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(`${saved.apiBase}/api/links`, {
            headers: { 'Authorization': `Bearer ${saved.token}` },
            signal: ctrl.signal,
        })
        clearTimeout(timer)

        if (res.status === 401) {
            // Token expired — clear legacy session and remove any migrated connection
            clearLastSession()
            
            // Find and remove connection with this token (likely from migration)
            const expiredConn = connections.find(c => 
                c.serverIp === saved.serverIp && c.token === saved.token
            )
            if (expiredConn) {
                window.appLog?.info('auto-login.removing-expired-connection', { 
                    connectionId: expiredConn.connectionId,
                    ip: saved.serverIp
                })
                removeConnection(expiredConn.connectionId)
            }
            
            statusLine.value = ''
            isBusy.value = false
            return
        }

        if (!res.ok) {
            // Server error but not auth — clear and proceed to manual login
            clearLastSession()
            statusLine.value = ''
            isBusy.value = false
            return
        }

        // Token is valid — restore the full session and navigate
        const restoredLicense = await checkLicenseStatus(saved.apiBase, saved.token)

        const serverObj: Server = existingServer ?? {
            ip: saved.serverIp,
            name: saved.serverName,
            lastSeen: Date.now(),
            status: 'unknown',
            manuallyAdded: true,
        }

        // NOTE: Migration should have already converted saved session to connection
        // This path should rarely execute, but we handle it for safety
        const restoredConnection: Connection = {
            connectionId: crypto.randomUUID(),
            name: saved.serverName || saved.serverIp,
            serverIp: saved.serverIp.trim(),
            serverName: saved.serverName,
            baseUrl: saved.apiBase,
            username: saved.username.trim(),
            token: saved.token,
            tokenIssuedAt: saved.savedAt || Date.now(),
            apiPort: saved.apiPort,
            sshPort: saved.sshPort,
            httpsPort: saved.httpsPort,
            ssh: {
                server: saved.serverIp,
                username: saved.username.trim(),
                port: saved.sshPort || 22
            },
            licensed: restoredLicense.licensed,
            licenseCheckedAt: Date.now(),
            licenseInfo: restoredLicense.licenseInfo,
            status: 'connected',
            lastConnectedAt: Date.now(),
            isActive: true
        }
        
        const actualConnectionId = addConnection(restoredConnection)
        setActive(actualConnectionId)

        // Legacy compatibility - AppShell will update connectionMeta from activeConnection
        try { sessionStorage.setItem('hb_token', saved.token) } catch { /* ignore */ }

        window.appLog?.info('auto-login.restored', { ip: saved.serverIp, connectionId: actualConnectionId })

        if (restoredLicenseStatus?.enforcement && !restoredLicenseStatus?.licensed) {
            pushNotification(new Notification(
                'Server Unlicensed',
                'Connected successfully, but this server is not currently licensed. Premium features are disabled until re-activated.',
                'warning',
                9000,
            ))
        }

        statusLine.value = ''
        isBusy.value = false

        checkBroadcasterUpdateInBackground(saved.apiBase, saved.token, saved.serverName || saved.serverIp)
        to('dashboard')
    } catch (err: any) {
        // Network error (server unreachable) — keep saved credentials so user
        // doesn't have to re-enter them; just stop the auto-login attempt.
        window.appLog?.warn('auto-login.network-error', { ip: saved.serverIp, error: err?.message })
        statusLine.value = ''
        isBusy.value = false
        // Don't clearLastSession() here — the server may just be slow to boot.
        // Credentials stay pre-filled so user can retry with one click.
    }
})

onUnmounted(() => {
    unlistenProgress?.()
    unlistenProgress = null
})

/**
 * Background check for houston-broadcaster package updates via the server API.
 * Fires after login — never blocks the user. Shows a persistent notification
 * with an "Install Update" action if a newer version is available.
 */
async function checkBroadcasterUpdateInBackground(apiBase: string, token: string, serverName: string) {
    try {
        const hdrs = { 'Authorization': `Bearer ${token}` };

        const res = await fetch(`${apiBase}/api/admin/broadcaster-update-check`, { headers: hdrs });
        if (!res.ok) {
            window.appLog?.warn('broadcaster-update-check.http-error', { status: res.status });
            return;
        }

        const data = await res.json();
        window.appLog?.info('broadcaster-update-check.result', data);

        // Entitlement expired — server won't offer updates
        if (data.entitlementExpired) {
            window.appLog?.info('broadcaster-update-check.entitlement-expired', { expiresAt: data.expiresAt });
            pushNotification(new Notification(
                'Update Entitlement Expired',
                `Your update entitlement expired on ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'N/A'}. Renew your license to receive server updates.`,
                'warning',
                15000,
            ));
            return;
        }

        if (!data.updateAvailable) return;

        // Show a persistent notification with an install button
        const msg = `Broadcaster update available: ${data.installedVersion ?? '?'} → ${data.candidateVersion ?? '?'}.\n Clicking Update will log you out while the server updates.`;
        const notif = new Notification(`Server Update Available - ${serverName}`, msg, 'warning', 15000);

        notif.addAction('Update', async () => {
            // Dismiss the "update available" notification immediately
            notif.remove();

            // 1. Fire the install request (server responds then starts upgrade in background)
            let oldVersion: string | undefined;
            try {
                const installRes = await fetch(`${apiBase}/api/admin/broadcaster-update-install`, {
                    method: 'POST',
                    headers: hdrs,
                });
                if (installRes.ok) {
                    const installData = await installRes.json();
                    oldVersion = installData.oldVersion;
                }
            } catch {
                window.appLog?.info('broadcaster-update-install.connection-dropped', { msg: 'expected during upgrade' });
            }

            // 2. Clear auth and navigate back to the connection screen
            clearLastSession()
            to('server-selection');

            // 3. Show a persistent "updating" notification on the connection screen
            const updatingNotif = new Notification(
                'Server Updating…',
                'The broadcaster is installing an update and will restart. Please wait…',
                'info',
                'never',
            );
            pushNotification(updatingNotif);

            // 4a. Wait for the server to go DOWN first (up to 90s).
            //     systemd-run --no-block returns instantly, so the old server
            //     may still be alive for a bit until dnf/apt's %preun stops it.
            const downDeadline = Date.now() + 90_000;
            let serverWentDown = false;
            while (Date.now() < downDeadline) {
                await new Promise(r => setTimeout(r, 2_000));
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 5_000);
                    await fetch(`${apiBase}/api/admin/broadcaster-update-check`, {
                        headers: hdrs,
                        signal: ctrl.signal,
                    });
                    clearTimeout(timer);
                    // Still responding — not down yet
                } catch {
                    // Connection refused / timeout → server is down
                    serverWentDown = true;
                    break;
                }
            }

            // 4b. Now wait for the server to come BACK UP (up to ~4 minutes)
            let newVersion: string | undefined;
            if (serverWentDown) {
                const maxWaitMs = 240_000;
                const pollIntervalMs = 4_000;
                const startedAt = Date.now();

                while (Date.now() - startedAt < maxWaitMs) {
                    await new Promise(r => setTimeout(r, pollIntervalMs));
                    try {
                        const ctrl = new AbortController();
                        const timer = setTimeout(() => ctrl.abort(), 5_000);
                        const pingRes = await fetch(`${apiBase}/api/admin/broadcaster-update-check`, {
                            headers: hdrs,
                            signal: ctrl.signal,
                        });
                        clearTimeout(timer);
                        if (pingRes.ok) {
                            const checkData = await pingRes.json();
                            newVersion = checkData.installedVersion;
                            break;
                        }
                    } catch {
                        // Server still down — keep polling
                    }
                }
            }

            // 5. Remove the "updating" notification and show result
            updatingNotif.remove();

            if (newVersion) {
                const didUpdate = oldVersion && newVersion !== oldVersion;
                pushNotification(new Notification(
                    didUpdate ? 'Server Updated' : 'Server Restarted',
                    didUpdate
                        ? `Updated from ${oldVersion} to ${newVersion}. You can now log in.`
                        : `Server is back (v${newVersion}). You can now log in.`,
                    didUpdate ? 'success' : 'info',
                    12000,
                ));
            } else {
                pushNotification(new Notification(
                    'Update Status Unknown',
                    'The server has not come back yet. It may still be installing — try logging in shortly.',
                    'warning',
                    15000,
                ));
            }
        }, false);

        pushNotification(notif);
    } catch (err: any) {
        // Completely non-blocking — just log and move on
        window.appLog?.warn('broadcaster-update-check.error', { error: err?.message });
    }
}
</script>

<style scoped>
.connect-page {
    --connect-control-bg: rgba(255, 255, 255, 0.68);
    --connect-control-border: color-mix(in srgb, #ffffff 30%, #9da6b5);
    --connect-control-disabled-bg: rgba(244, 246, 250, 0.58);
    --connect-control-disabled-text: #768195;
    --connect-control-placeholder: #8a93a3;
    height: 100%;
    overflow-y: auto;
    padding-top: 1.2rem;
    padding-bottom: 1rem;
}

.connect-shell {
    display: grid;
    gap: 0.95rem;
}

.connect-hero {
    padding: 1rem 1.1rem;
}

.connect-hero h1 {
    font-size: 1.36rem;
    line-height: 1.2;
    font-weight: 700;
}

.connect-hero p {
    margin-top: 0.35rem;
    font-size: 0.95rem;
    opacity: 0.9;
}

.connect-note {
    margin-top: 0.65rem;
    font-size: 0.8rem !important;
    opacity: 0.82 !important;
}

.connect-main-card {
    min-width: 0;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 42%, #7f86b6);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, white 12%, transparent);
}

.connect-main-grid {
    display: grid;
    /* grid-template-columns: minmax(0, 1fr) minmax(0, 0.85fr); */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
}

.connect-panel {
    min-width: 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 22%, #8f98a5);
    border-radius: 0.7rem;
    background: color-mix(in srgb, #ffffff 50%, transparent);
    backdrop-filter: blur(1.5px);
}

.connect-page.is-dark .connect-panel {
    background: rgba(248, 238, 251, 0.50);
    border-color: color-mix(in srgb, #ffffff 22%, #c389c7);
}

.connect-page.is-dark {
    --connect-control-bg: rgba(255, 255, 255, 0.75);
    --connect-control-border: color-mix(in srgb, #ffffff 24%, #93a0b4);
    --connect-control-disabled-bg: rgba(238, 242, 247, 0.42);
    --connect-control-disabled-text: #7a8596;
    --connect-control-placeholder: #737c8d;
}

.connect-page .connect-control {
    background: var(--connect-control-bg) !important;
    border-color: var(--connect-control-border) !important;
    backdrop-filter: blur(1px);
}

.connect-page .connect-control::placeholder {
    color: var(--connect-control-placeholder) !important;
    opacity: 0.9;
}

.connect-page .connect-control:disabled {
    background: var(--connect-control-disabled-bg) !important;
    color: var(--connect-control-disabled-text) !important;
    border-color: color-mix(in srgb, var(--connect-control-border) 78%, #a5afbd) !important;
}

.connect-page.is-dark .connect-panel .connect-section-title,
.connect-page.is-dark .connect-panel .connect-label,
.connect-page.is-dark .connect-panel .connect-or,
.connect-page.is-dark .connect-panel p,
.connect-page.is-dark .connect-panel span {
    color: #2f3340;
    text-shadow: none;
}

.connect-page.is-dark .connect-panel .input-textlike,
.connect-page.is-dark .connect-panel select {
    color: #1f2937 !important;
}

.connect-page.is-dark .connect-panel ::placeholder {
    color: var(--connect-control-placeholder);
    opacity: 1;
}

.connect-page.is-dark .connect-panel .text-muted {
    color: #5f6878 !important;
}

.connect-section-title {
    font-size: 0.93rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.85;
    font-weight: 700;
}

.connect-label {
    margin-bottom: 0.26rem;
    font-size: 0.86rem;
    font-weight: 600;
    opacity: 0.9;
}

.connect-panel-auth .connect-section-title {
    margin-bottom: 0.2rem;
}

.connect-or {
    text-align: center;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.7;
    min-height: 1rem;
    line-height: 1;
}

.connect-or--ghost {
    visibility: hidden;
}

.connect-port-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
}

.connect-warning {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.75rem 1rem;
}

.connect-submit {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 0.2rem;
}

.connect-submit-btn {
    width: min(26rem, 100%);
    min-height: 3rem;
}

@media (max-width: 980px) {
    .connect-main-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 720px) {
    .connect-port-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
