<template>
  <FlowModal :model-value="true" title="Log Viewer" size="2xl"
    :description="source === 'client' ? (isWeb ? 'Showing events and errors recorded by this browser tab.' : 'Showing parsed entries from the local app log file.') : 'Showing audit log entries from the connected server.'"
    :header-attrs="{ 'data-tour': 'logs-modal-header' }" @close="close">
          <template #header-actions>
                <button v-if="isWeb && source === 'client'" class="btn btn-secondary" type="button" @click="downloadBrowserLog">
                  Download
                </button>
                <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading">
                  {{ loading ? 'Refreshing…' : 'Refresh' }}
                </button>
          </template>

          <div class="text-left min-h-0" data-tour="logs-modal-body">
            <!-- Source selector tabs -->
            <div class="flex items-center gap-1 mb-4 border-b border-default">
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                :class="source === 'client' ? 'border-flow-info text-blue-400' : 'border-transparent text-muted hover:text-default'"
                @click="switchSource('client')"
              >
                {{ isWeb ? 'Browser Logs' : 'Client Logs' }}
              </button>
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                :class="source === 'server' ? 'border-flow-info text-blue-400' : 'border-transparent text-muted hover:text-default'"
                @click="switchSource('server')"
              >
                Server Logs
              </button>
              <!-- Server selector (when multiple servers exist) -->
              <div v-if="source === 'server' && allServers.length > 1" class="ml-auto flex items-center gap-2">
                <label class="text-xs text-muted">Server:</label>
                <select
                  v-model="selectedServerConnectionId"
                  class="px-2 py-1 text-sm border border-default rounded bg-default"
                  @change="onServerSelect()"
                >
                  <option v-for="conn in allServers" :key="conn.connectionId" :value="conn.connectionId">
                    {{ conn.name || conn.serverIp }}{{ conn.status !== 'connected' ? ' (disconnected)' : '' }}
                  </option>
                </select>
                <span v-if="selectedServerDisconnected" class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flow-tone-warning">
                  Not connected
                </span>
              </div>
            </div>

            <!-- Client log metadata -->
            <div v-if="source === 'client'" class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">{{ isWeb ? 'Source' : 'Log file' }}</div>
                <div class="text-sm font-mono break-all">{{ meta.file || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">{{ isWeb ? 'Retention' : 'Directory' }}</div>
                <div class="text-sm font-mono break-all">{{ meta.logDir || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Entries loaded</div>
                <div class="text-sm font-semibold">{{ entries.length }}</div>
              </div>
            </div>

            <!-- Server log metadata -->
            <div v-if="source === 'server'" class="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Log file</div>
                <div class="text-sm font-mono break-all">{{ serverMeta.file || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Directory</div>
                <div class="text-sm font-mono break-all">{{ serverMeta.logDir || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Database</div>
                <div class="text-sm font-mono break-all">{{ serverMeta.dbPath || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Entries loaded</div>
                <div class="text-sm font-semibold">{{ serverPagination.total }}</div>
              </div>
            </div>

            <!-- Audit integrity & review (admin only) -->
            <div
              v-if="source === 'server' && serverCanView"
              class="rounded-md border p-3 mb-4 bg-default"
              :class="auditHealthy ? 'border-default' : 'border-red-700'"
              data-testid="audit-status-panel"
            >
              <div class="flex flex-wrap items-start gap-x-6 gap-y-2">
                <div>
                  <div class="text-xs text-muted">Audit writes</div>
                  <div v-if="!auditStatus" class="text-sm text-muted">—</div>
                  <div v-else-if="auditStatus.writes?.ok" class="text-sm font-semibold text-green-500">OK</div>
                  <div v-else class="text-sm font-semibold text-red-400">
                    Failing since {{ formatTs(auditStatus.writes?.since) }} · {{ auditStatus.writes?.dropped }} lost
                  </div>
                </div>
                <div>
                  <div class="text-xs text-muted">Hash chain</div>
                  <div v-if="!auditStatus?.lastVerification" class="text-sm text-muted">Not checked yet</div>
                  <div v-else-if="auditStatus.lastVerification.ok" class="text-sm font-semibold text-green-500">
                    Intact <span class="font-normal text-muted">({{ auditStatus.lastVerification.checked }} rows, {{ formatTs(auditStatus.lastVerification.at) }})</span>
                  </div>
                  <div v-else class="text-sm font-semibold text-red-400">
                    BROKEN at row {{ auditStatus.lastVerification.brokenAtId }} ({{ auditStatus.lastVerification.reason }})
                  </div>
                </div>
                <div>
                  <div class="text-xs text-muted">Last review</div>
                  <div v-if="auditStatus?.lastReview" class="text-sm">
                    {{ formatTs(auditStatus.lastReview.ts) }} by <span class="font-semibold">{{ auditStatus.lastReview.actor || 'unknown' }}</span>
                  </div>
                  <div v-else class="text-sm text-amber-400">Never reviewed</div>
                </div>
                <div v-if="auditStatus">
                  <div class="text-xs text-muted">{{ auditStatus.lastReview ? 'Since last review' : 'All time' }}</div>
                  <div class="text-sm">
                    <span class="text-red-400 font-semibold">{{ auditStatus.lastReview ? auditStatus.sinceLastReview?.errors : auditStatus.errors }}</span> errors ·
                    <span class="text-amber-400 font-semibold">{{ auditStatus.lastReview ? auditStatus.sinceLastReview?.warnings : auditStatus.warnings }}</span> warnings
                  </div>
                </div>
                <div v-if="auditStatus">
                  <div class="text-xs text-muted">Retention</div>
                  <div class="text-sm">{{ auditStatus.retentionDays }} days</div>
                </div>
                <div class="ml-auto flex flex-wrap items-center gap-2">
                  <button class="btn btn-secondary text-xs" type="button" :disabled="verifying" @click="verifyChain">
                    {{ verifying ? 'Verifying…' : 'Verify chain' }}
                  </button>
                  <button class="btn btn-secondary text-xs" type="button" :disabled="exporting" @click="exportAudit('csv')">Export CSV</button>
                  <button class="btn btn-secondary text-xs" type="button" :disabled="exporting" @click="exportAudit('jsonl')">Export JSONL</button>
                  <button class="btn btn-primary text-xs" type="button" @click="reviewOpen = !reviewOpen">Mark reviewed…</button>
                </div>
              </div>
              <div v-if="reviewOpen" class="mt-3 flex flex-wrap items-start gap-2">
                <textarea
                  v-model="reviewNote"
                  maxlength="1000"
                  rows="2"
                  placeholder="Review note (optional): what you checked, follow-ups…"
                  class="input-textlike flex-1 min-w-[280px] px-3 py-2 border border-default rounded-lg bg-default text-default text-sm"
                />
                <button class="btn btn-primary text-xs" type="button" :disabled="reviewing" @click="markReviewed">
                  {{ reviewing ? 'Saving…' : 'Record review' }}
                </button>
                <button class="btn btn-secondary text-xs" type="button" @click="reviewOpen = false">Cancel</button>
              </div>
              <div v-if="auditMessage" class="mt-2 text-xs" :class="auditMessageError ? 'text-red-400' : 'text-green-500'">{{ auditMessage }}</div>
            </div>

            <!-- Quick views & server-side filters -->
            <div v-if="source === 'server' && serverCanView" class="mb-3">
              <div class="flex flex-wrap gap-2 mb-2">
                <button
                  v-for="view in quickViews"
                  :key="view.key"
                  type="button"
                  class="px-3 py-1 rounded-full text-xs border"
                  :class="quickView === view.key ? 'border-blue-500 text-blue-400 bg-blue-900/20' : 'border-default text-muted hover:text-default'"
                  :title="view.hint"
                  @click="selectQuickView(view.key)"
                >
                  {{ view.label }}
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <input v-model.trim="serverFilters.actor" type="text" placeholder="Actor (exact)" class="input-textlike px-3 py-1.5 border border-default rounded-lg bg-default text-default text-sm w-40" @keyup.enter="applyServerFilters" />
                <input v-model.trim="serverFilters.resourceId" type="text" placeholder="Resource ID" class="input-textlike px-3 py-1.5 border border-default rounded-lg bg-default text-default text-sm w-32" @keyup.enter="applyServerFilters" />
                <label class="text-xs text-muted">From</label>
                <input v-model="serverFilters.since" type="date" class="px-2 py-1.5 border border-default rounded-lg bg-default text-sm" />
                <label class="text-xs text-muted">To</label>
                <input v-model="serverFilters.until" type="date" class="px-2 py-1.5 border border-default rounded-lg bg-default text-sm" />
                <button class="btn btn-secondary text-xs" type="button" @click="applyServerFilters">Apply</button>
                <button class="btn btn-secondary text-xs" type="button" @click="clearServerFilters">Clear</button>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Errors</div>
                <div class="text-lg font-semibold text-flow-danger">{{ counts.error }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Warnings</div>
                <div class="text-lg font-semibold text-flow-warning">{{ counts.warn }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Info</div>
                <div class="text-lg font-semibold">{{ counts.info }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Debug</div>
                <div class="text-lg font-semibold">{{ counts.debug }}</div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 mb-4">
              <input
                v-model.trim="search"
                type="search"
                :placeholder="source === 'client' ? 'Search event, summary, details...' : 'Search action, actor, details...'"
                class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-default min-w-[280px]"
              />
              <select v-model="levelFilter" class="px-3 py-2 border border-default rounded-lg bg-default">
                <option value="">All levels</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option v-if="source === 'client'" value="debug">Debug</option>
              </select>
              <label v-if="source === 'client'" class="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="errorsOnly" />
                <span>Errors/warnings only</span>
              </label>
              <label v-if="source === 'client'" class="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="groupRelated" />
                <span>Group related events</span>
              </label>
            </div>

            <div v-if="error" class="p-3 rounded flow-tone-danger border text-sm mb-3">
              {{ error }}
            </div>

            <!-- Client logs table -->
            <div v-if="source === 'client'" class="overflow-x-auto border border-default rounded-md">
              <table class="min-w-full text-sm border-collapse">
                <thead class="bg-default border-b border-default">
                  <tr>
                    <th class="p-2 text-left border-r border-default">Time</th>
                    <th class="p-2 text-left border-r border-default">Level</th>
                    <th class="p-2 text-left border-r border-default">Event</th>
                    <th class="p-2 text-left">Summary</th>
                  </tr>
                </thead>
                <tbody class="bg-accent">
                  <tr v-if="loading">
                    <td colspan="4" class="p-4 text-center">Loading logs…</td>
                  </tr>
                  <tr v-else-if="displayRows.length === 0">
                    <td colspan="4" class="p-4 text-center">No matching log entries.</td>
                  </tr>
                  <tr
                    v-else
                    v-for="row in displayRows"
                    :key="row.id"
                    class="border-b border-default align-top"
                    :class="{
                      'flow-tone-danger': row.level === 'error',
                      'flow-tone-warning': row.level === 'warn',
                    }"
                  >
                    <td class="p-2 border-r border-default whitespace-nowrap">{{ formatTs(row.timestamp) }}</td>
                    <td class="p-2 border-r border-default whitespace-nowrap uppercase">{{ row.level }}</td>
                    <td class="p-2 border-r border-default font-mono">{{ row.event }}</td>
                    <td class="p-2">
                      <div>{{ row.summary }}</div>
                      <details v-if="row.details || (row.children && row.children.length)" class="mt-1">
                        <summary class="cursor-pointer text-xs text-muted">Details</summary>
                        <div v-if="row.children && row.children.length" class="mt-1 space-y-1">
                          <div v-for="child in row.children" :key="child.id" class="text-xs">
                            <span class="text-muted">{{ formatTs(child.timestamp) }}</span>
                            <span class="font-mono ml-2">{{ child.event }}</span>
                            <span class="ml-2">{{ child.summary }}</span>
                          </div>
                        </div>
                        <pre v-if="row.details" class="mt-1 text-xs whitespace-pre-wrap break-words">{{ row.details }}</pre>
                      </details>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Server logs table -->
            <div v-if="source === 'server'" class="overflow-x-auto border border-default rounded-md">
              <table class="min-w-full text-sm border-collapse">
                <thead class="bg-default border-b border-default">
                  <tr>
                    <th class="p-2 text-left border-r border-default">Time</th>
                    <th class="p-2 text-left border-r border-default">Level</th>
                    <th class="p-2 text-left border-r border-default">Action</th>
                    <th class="p-2 text-left border-r border-default">Actor</th>
                    <th class="p-2 text-left border-r border-default">Resource</th>
                    <th class="p-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody class="bg-accent">
                  <tr v-if="loading">
                    <td colspan="6" class="p-4 text-center">Loading logs…</td>
                  </tr>
                  <tr v-else-if="selectedServerDisconnected">
                    <td colspan="6" class="p-4 text-center text-flow-warning">
                      This server is not connected. Log in to this server to view its logs.
                    </td>
                  </tr>
                  <tr v-else-if="serverAccessDenied || !serverCanView">
                    <td colspan="6" class="p-4 text-center text-flow-warning">
                      Admin access required to view server logs. Log in with a system (PAM) account.
                    </td>
                  </tr>
                  <tr v-else-if="serverEntries.length === 0">
                    <td colspan="6" class="p-4 text-center">No matching server log entries.</td>
                  </tr>
                  <tr
                    v-else
                    v-for="row in filteredServerEntries"
                    :key="row.id"
                    class="border-b border-default align-top"
                    :class="{
                      'flow-tone-danger': row.level === 'error',
                      'flow-tone-warning': row.level === 'warn',
                    }"
                  >
                    <td class="p-2 border-r border-default whitespace-nowrap">{{ formatTs(row.ts) }}</td>
                    <td class="p-2 border-r border-default whitespace-nowrap uppercase">{{ row.level }}</td>
                    <td class="p-2 border-r border-default font-mono">{{ row.action }}</td>
                    <td class="p-2 border-r border-default">{{ row.actor || '—' }}</td>
                    <td class="p-2 border-r border-default font-mono text-xs">
                      <span v-if="row.resource_type">{{ row.resource_type }}<span v-if="row.resource_id">/{{ row.resource_id }}</span></span>
                      <span v-else class="text-muted">—</span>
                    </td>
                    <td class="p-2">
                      <details v-if="row.detail" class="cursor-pointer">
                        <summary class="text-xs text-muted">Show detail</summary>
                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words">{{ JSON.stringify(row.detail, null, 2) }}</pre>
                      </details>
                      <span v-else class="text-muted">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Pagination for server logs -->
              <div v-if="serverPagination.pages > 1" class="flex items-center justify-between px-3 py-2 border-t border-default bg-default">
                <button
                  type="button"
                  class="btn btn-secondary text-xs"
                  :disabled="serverPagination.page <= 1 || loading"
                  @click="loadServerPage(serverPagination.page - 1)"
                >
                  ← Previous
                </button>
                <span class="text-xs text-muted">Page {{ serverPagination.page }} of {{ serverPagination.pages }}</span>
                <button
                  type="button"
                  class="btn btn-secondary text-xs"
                  :disabled="serverPagination.page >= serverPagination.pages || loading"
                  @click="loadServerPage(serverPagination.page + 1)"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
  </FlowModal>
</template>

<script setup lang="ts">
import FlowModal from "../../ui/FlowModal.vue";
import { computed, onMounted, ref, watch } from "vue";
import { useTimeFormat } from "../../composables/useTimeFormat";
import { useTourManager, type TourStep } from "../../composables/useTourManager";
import { useOnboarding } from "../../composables/useOnboarding";
import { useApi } from "../../composables/useApi";
import { useConnections } from "../../composables/useConnections";
import { isAdminSession } from "../../composables/adminSession";

const { requestTour } = useTourManager();
const { onboarding, markDone } = useOnboarding();
const { connections, activeConnection } = useConnections();

const connectedServers = computed(() => connections.filter(c => c.status === 'connected'));
const allServers = computed(() => connections.filter(c => c.connectionId));

// Track which server to pull logs from (defaults to active connection)
const selectedServerConnectionId = ref<string>(activeConnection.value?.connectionId ?? '');

const selectedServerDisconnected = computed(() => {
  const conn = connections.find(c => c.connectionId === selectedServerConnectionId.value);
  return conn ? conn.status !== 'connected' : false;
});

// Initialize default if not set
watch(connectedServers, (servers) => {
  if (!selectedServerConnectionId.value && servers.length) {
    selectedServerConnectionId.value = servers[0].connectionId;
  }
}, { immediate: true });

function onServerSelect() {
  if (selectedServerDisconnected.value) {
    // Don't try to fetch logs from a disconnected server
    serverEntries.value = [];
    serverAccessDenied.value = false;
    error.value = null;
    return;
  }
  refresh();
}

// Create a reactive apiFetch bound to the selected server
function getServerApiFetch() {
  const connId = selectedServerConnectionId.value;
  const { apiFetch } = useApi(connId || undefined);
  return apiFetch;
}

const logsTourSteps: TourStep[] = [
	{
		target: '[data-tour="logs-modal-header"]',
		message: 'The Log Viewer shows parsed entries from the local app log file or the connected server audit log.\n\nUse the tabs to switch between Client and Server logs.',
	},
	{
		target: '[data-tour="logs-modal-body"]',
		message: 'The log body shows stats (error/warning/info/debug counts), a search bar, and level filters.\n\nThe table below lists each log entry with timestamp, level, event, and summary. Click any row to expand details.',
	},
]

type LogSource = 'client' | 'server';

type ParsedLogEntry = {
  id: string;
  timestamp: string;
  level: string;
  event: string;
  summary: string;
  details?: string;
  data?: Record<string, any>;
};

type ServerLogEntry = {
  id: number;
  ts: string;
  actor: string | null;
  ip: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, any> | null;
  level: string;
};

type DisplayRow = {
  id: string;
  timestamp: string;
  level: string;
  event: string;
  summary: string;
  details?: string;
  children?: ParsedLogEntry[];
};

const emit = defineEmits<{
  (e: "close"): void;
}>();

const source = ref<LogSource>('client');
const loading = ref(false);
const error = ref<string | null>(null);
const entries = ref<ParsedLogEntry[]>([]);
const meta = ref<{ file: string; logDir: string }>({ file: "", logDir: "" });

// Server log state
const serverEntries = ref<ServerLogEntry[]>([]);
const serverAccessDenied = ref(false);
const serverMeta = ref<{ file: string; logDir: string; dbPath: string }>({ file: "", logDir: "", dbPath: "" });
const serverPagination = ref<{ total: number; page: number; pages: number; limit: number }>({
  total: 0, page: 1, pages: 1, limit: 100,
});

const search = ref("");
const levelFilter = ref("");
const errorsOnly = ref(true);
const groupRelated = ref(true);

// ---- Audit screen (server tab, admins only) --------------------------------
const selectedConnection = computed(() =>
  connections.find(c => c.connectionId === selectedServerConnectionId.value) || activeConnection.value || null
);
// UX gate only; the server enforces requireAdmin on every audit route.
const serverCanView = computed(() => isAdminSession(selectedConnection.value?.token));

type AuditStatus = {
  writes?: { ok: boolean; since?: string | null; dropped?: number; lastError?: string | null };
  lastVerification?: { ok: boolean; at: string; checked?: number; brokenAtId?: number; reason?: string } | null;
  lastReview?: { id: number; ts: string; actor: string | null; detail?: any } | null;
  sinceLastReview?: { errors: number; warnings: number } | null;
  retentionDays?: number;
  total?: number;
  errors?: number;
  warnings?: number;
};
const auditStatus = ref<AuditStatus | null>(null);
const auditHealthy = computed(() =>
  !auditStatus.value || (auditStatus.value.writes?.ok !== false && auditStatus.value.lastVerification?.ok !== false)
);
const verifying = ref(false);
const exporting = ref(false);
const reviewing = ref(false);
const reviewOpen = ref(false);
const reviewNote = ref("");
const auditMessage = ref("");
const auditMessageError = ref(false);

function setAuditMessage(msg: string, isError = false) {
  auditMessage.value = msg;
  auditMessageError.value = isError;
}

const quickViews = [
  { key: 'all', label: 'All events', hint: 'Everything', params: {} },
  { key: 'alerts', label: 'Alerts & warnings', hint: 'Warning and error level events', params: { levels: 'warn,error' } },
  { key: 'security', label: 'Security changes', hint: 'Weakened links, access/role/group changes, scanning disabled', params: { actions: 'link.security.,access.changed,settings.malware_scan.,user.,role.,group.' } },
  { key: 'denied', label: 'Denied & failed logins', hint: 'Rejected requests (401/403) and failed logins', params: { actions: 'http.denied,http.denied.suppressed,auth.login.failed,auth.login.noshell,security.alert' } },
  { key: 'files', label: 'Downloads & streams', hint: 'Link downloads/views and direct desktop streams', params: { actions: 'file.desktop.stream,link.activity.' } },
  { key: 'integrity', label: 'Audit integrity', hint: 'Exports, reviews, verification and write failures', params: { actions: 'audit.' } },
] as const;
type QuickViewKey = typeof quickViews[number]['key'];
const quickView = ref<QuickViewKey>('all');
const serverFilters = ref({ actor: '', resourceId: '', since: '', until: '' });

function serverQueryParams(): URLSearchParams {
  const params = new URLSearchParams();
  const view = quickViews.find(v => v.key === quickView.value);
  for (const [k, v] of Object.entries(view?.params || {})) params.set(k, String(v));
  if (levelFilter.value) params.set('level', levelFilter.value);
  const f = serverFilters.value;
  if (f.actor) params.set('actor', f.actor);
  if (f.resourceId) params.set('resource_id', f.resourceId);
  // Date inputs are local days; send the local-day bounds as UTC ISO strings.
  if (f.since) params.set('since', new Date(`${f.since}T00:00:00`).toISOString());
  if (f.until) params.set('until', new Date(`${f.until}T23:59:59.999`).toISOString());
  return params;
}

function selectQuickView(key: QuickViewKey) {
  quickView.value = key;
  loadServerPage(1);
}

// Server tab: the level filter is applied by the server, across all pages.
watch(levelFilter, () => {
  if (source.value === 'server') loadServerPage(1);
});

function applyServerFilters() {
  loadServerPage(1);
}

function clearServerFilters() {
  serverFilters.value = { actor: '', resourceId: '', since: '', until: '' };
  quickView.value = 'all';
  levelFilter.value = '';
  loadServerPage(1);
}

async function loadAuditStatus() {
  if (!serverCanView.value || selectedServerDisconnected.value) { auditStatus.value = null; return; }
  try {
    const res = await getServerApiFetch()('/api/admin/audit-log/status', { suppressAuthRedirect: true });
    auditStatus.value = res?.ok ? res : null;
  } catch {
    // Older servers do not have /status; the panel just shows dashes.
    auditStatus.value = null;
  }
}

async function verifyChain() {
  verifying.value = true;
  setAuditMessage('');
  try {
    const res = await getServerApiFetch()('/api/admin/audit-log/verify', { suppressAuthRedirect: true, timeoutMs: 120_000, retry: 0 });
    const chain = res?.chain;
    if (chain?.ok) setAuditMessage(`Hash chain intact (${chain.checked} rows checked).`);
    else setAuditMessage(`Hash chain BROKEN at row ${chain?.brokenAtId} (${chain?.reason}). This has been recorded.`, true);
    await loadAuditStatus();
  } catch (e: any) {
    setAuditMessage(e?.message || 'Verification failed', true);
  } finally {
    verifying.value = false;
  }
}

async function exportAudit(format: 'csv' | 'jsonl') {
  exporting.value = true;
  setAuditMessage('');
  try {
    const params = serverQueryParams();
    params.set('format', format);
    const text = await getServerApiFetch()(`/api/admin/audit-log/export?${params.toString()}`, {
      suppressAuthRedirect: true,
      parse: 'text',
      timeoutMs: 300_000,
      retry: 0,
    });
    const type = format === 'csv' ? 'text/csv' : 'application/x-ndjson';
    const blob = new Blob([String(text ?? '')], { type });
    const url = URL.createObjectURL(blob);
    const server = String(selectedConnection.value?.name || selectedConnection.value?.serverIp || 'server').replace(/[^a-z0-9_.-]/gi, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${server}-${stamp}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setAuditMessage(`Exported ${format.toUpperCase()} (the export itself is recorded in the audit log).`);
  } catch (e: any) {
    setAuditMessage(e?.message || 'Export failed', true);
  } finally {
    exporting.value = false;
  }
}

async function markReviewed() {
  reviewing.value = true;
  setAuditMessage('');
  try {
    const throughId = serverEntries.value.length ? Math.max(...serverEntries.value.map(e => e.id)) : undefined;
    const res = await getServerApiFetch()('/api/admin/audit-log/reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: reviewNote.value.trim() || undefined, throughId }),
      suppressAuthRedirect: true,
    });
    if (!res?.ok) throw new Error(res?.error || 'Could not record review');
    reviewOpen.value = false;
    reviewNote.value = '';
    setAuditMessage('Review recorded in the audit log.');
    await Promise.all([loadAuditStatus(), loadServerPage(1)]);
  } catch (e: any) {
    setAuditMessage(e?.status === 404 ? 'This server does not support review records yet; update the server.' : (e?.message || 'Could not record review'), true);
  } finally {
    reviewing.value = false;
  }
}

const counts = computed(() => {
  const out = { error: 0, warn: 0, info: 0, debug: 0 };
  if (source.value === 'client') {
    for (const e of entries.value) {
      const lvl = String(e.level || "").toLowerCase();
      if (lvl === "error") out.error += 1;
      else if (lvl === "warn") out.warn += 1;
      else if (lvl === "debug") out.debug += 1;
      else out.info += 1;
    }
  } else {
    for (const e of serverEntries.value) {
      const lvl = String(e.level || "").toLowerCase();
      if (lvl === "error") out.error += 1;
      else if (lvl === "warn") out.warn += 1;
      else out.info += 1;
    }
  }
  return out;
});

const filteredEntries = computed(() => {
  const q = search.value.toLowerCase();
  return entries.value.filter((entry) => {
    if (levelFilter.value && entry.level !== levelFilter.value) return false;
    if (errorsOnly.value && !["error", "warn"].includes(entry.level)) return false;
    if (!q) return true;
    return (
      entry.event.toLowerCase().includes(q) ||
      entry.summary.toLowerCase().includes(q) ||
      String(entry.details || "").toLowerCase().includes(q)
    );
  });
});

const filteredServerEntries = computed(() => {
  const q = search.value.toLowerCase();
  return serverEntries.value.filter((entry) => {
    if (levelFilter.value && entry.level !== levelFilter.value) return false;
    if (!q) return true;
    return (
      entry.action.toLowerCase().includes(q) ||
      (entry.actor || "").toLowerCase().includes(q) ||
      (entry.resource_type || "").toLowerCase().includes(q) ||
      (entry.resource_id || "").toLowerCase().includes(q) ||
      JSON.stringify(entry.detail || "").toLowerCase().includes(q)
    );
  });
});

function eventRoot(event: string) {
  const suffixes = ["requested", "succeeded", "failed", "start", "done", "completed"];
  for (const s of suffixes) {
    const tail = `.${s}`;
    if (event.endsWith(tail)) return event.slice(0, -tail.length);
  }
  return event;
}

function severityRank(level: string) {
  if (level === "error") return 3;
  if (level === "warn") return 2;
  if (level === "info") return 1;
  return 0;
}

function groupedRows(items: ParsedLogEntry[]): DisplayRow[] {
  const out: DisplayRow[] = [];
  const maxGapMs = 30_000;

  for (const entry of items) {
    const root = eventRoot(entry.event);
    const entity =
      entry.data?.id ??
      entry.data?.jobId ??
      entry.data?.linkId ??
      entry.data?.assetVersionId ??
      entry.data?.fileId ??
      entry.data?.name ??
      entry.data?.dest ??
      "na";
    const key = `${root}::${entity}`;

    const prev = out[out.length - 1];
    const prevTs = prev ? new Date(prev.timestamp).getTime() : 0;
    const curTs = new Date(entry.timestamp).getTime();
    const near = Number.isFinite(prevTs) && Number.isFinite(curTs) ? Math.abs(curTs - prevTs) <= maxGapMs : false;

    if (prev && prev.id.startsWith(`group:${key}:`) && near) {
      const child = entry;
      const currentChildren = prev.children || [];
      const allChildren = [...currentChildren, child];
      const best = allChildren.reduce((acc, c) => (severityRank(c.level) > severityRank(acc) ? c.level : acc), prev.level);
      prev.children = allChildren;
      prev.level = best;
      prev.timestamp = allChildren[0].timestamp;
      prev.summary = `${root} (${allChildren.length} events)`;
      continue;
    }

    out.push({
      id: `group:${key}:${entry.id}`,
      timestamp: entry.timestamp,
      level: entry.level,
      event: root,
      summary: entry.summary,
      details: entry.details,
      children: [entry],
    });
  }

  return out.map((r) => {
    if (!r.children || r.children.length <= 1) {
      const single = r.children?.[0];
      return {
        id: single?.id || r.id,
        timestamp: single?.timestamp || r.timestamp,
        level: single?.level || r.level,
        event: single?.event || r.event,
        summary: single?.summary || r.summary,
        details: single?.details || r.details,
      };
    }
    return r;
  });
}

const displayRows = computed<DisplayRow[]>(() => {
  const rows = filteredEntries.value;
  if (!groupRelated.value) return rows.map((r) => ({ ...r }));
  return groupedRows(rows);
});

const { hour12 } = useTimeFormat()

function formatTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, { hour12: hour12.value });
}

const isWeb = window.electron?.isWeb === true;

// The browser has no log file, so hand the tab's log to the user as a download.
function downloadBrowserLog() {
  const text = window.electron?.exportClientLogs?.() ?? "";
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `45flow-browser-log-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function switchSource(newSource: LogSource) {
  if (source.value === newSource) return;
  source.value = newSource;
  error.value = null;
  refresh();
}

async function loadServerPage(page: number) {
  loading.value = true;
  error.value = null;
  serverAccessDenied.value = false;
  try {
    if (!serverCanView.value) {
      serverEntries.value = [];
      return;
    }
    const params = serverQueryParams();
    params.set('page', String(page));
    params.set('limit', String(serverPagination.value.limit));

    if (selectedServerDisconnected.value) {
      serverEntries.value = [];
      return;
    }
    const apiFetch = getServerApiFetch();
    const res = await apiFetch(`/api/admin/audit-log?${params.toString()}`, { suppressAuthRedirect: true });
    if (!res?.ok) throw new Error(res?.error || 'Failed to fetch server logs');

    serverEntries.value = Array.isArray(res.entries) ? res.entries : [];
    serverMeta.value = {
      file: String(res.file || ""),
      logDir: String(res.logDir || ""),
      dbPath: String(res.dbPath || ""),
    };
    serverPagination.value = {
      total: res.total ?? 0,
      page: res.page ?? page,
      pages: res.pages ?? 1,
      limit: res.limit ?? 100,
    };
  } catch (e: any) {
    if (e?.status === 401 || e?.status === 403) {
      serverAccessDenied.value = true;
      serverEntries.value = [];
    } else {
      error.value = e?.message || String(e);
      serverEntries.value = [];
    }
  } finally {
    loading.value = false;
  }
}

async function refreshClient() {
  loading.value = true;
  error.value = null;
  try {
    const res = await window.electron?.ipcRenderer.invoke("logs:read-client", { limit: 600 });
    if (!res?.ok) {
      throw new Error(res?.error || "Unable to read logs");
    }

    entries.value = Array.isArray(res.entries) ? res.entries : [];
    meta.value = {
      file: String(res.file || ""),
      logDir: String(res.logDir || ""),
    };
  } catch (e: any) {
    error.value = e?.message || String(e);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  if (source.value === 'client') {
    await refreshClient();
  } else {
    await Promise.all([loadServerPage(serverPagination.value.page), loadAuditStatus()]);
  }
}

function close() {
  emit("close");
}

onMounted(() => {
  refresh();
  if (!onboarding.value.viewLogsTourDone) {
    setTimeout(() => {
      requestTour('view-logs', logsTourSteps, () => markDone('viewLogsTourDone'))
    }, 400)
  }
});
</script>
