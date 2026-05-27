<template>
  <div class="fixed inset-0 z-[2100]">
    <div class="absolute inset-0 bg-black/60" @click="close" />

    <div class="absolute inset-0 flex items-center justify-center p-4">
      <div class="w-full max-w-7xl max-h-[calc(100vh-2rem)] rounded-lg border border-default bg-default shadow-2xl flex flex-col">
        <CardContainer class="flex-1 min-h-0 overflow-y-auto w-full bg-accent rounded-md shadow-xl min-w-0">
          <template #header>
            <div class="flex items-center justify-between px-6 py-4 shrink-0" data-tour="logs-modal-header">
              <div>
                <div class="text-xl font-semibold text-default text-left">Log Viewer</div>
                <div class="text-xs text-muted mt-1">
                  {{ source === 'client' ? 'Showing parsed entries from the local app log file.' : 'Showing audit log entries from the connected server.' }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading">
                  {{ loading ? 'Refreshing…' : 'Refresh' }}
                </button>
                <button class="btn btn-secondary" type="button" @click="close">
                  Close
                </button>
              </div>
            </div>
          </template>

          <div class="px-6 pb-4 text-left min-h-0" data-tour="logs-modal-body">
            <!-- Source selector tabs -->
            <div class="flex items-center gap-1 mb-4 border-b border-default">
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                :class="source === 'client' ? 'border-blue-500 text-blue-400' : 'border-transparent text-muted hover:text-default'"
                @click="switchSource('client')"
              >
                Client Logs
              </button>
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                :class="source === 'server' ? 'border-blue-500 text-blue-400' : 'border-transparent text-muted hover:text-default'"
                @click="switchSource('server')"
              >
                Server Logs
              </button>
            </div>

            <!-- Client log metadata -->
            <div v-if="source === 'client'" class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Log file</div>
                <div class="text-sm font-mono break-all">{{ meta.file || 'n/a' }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Directory</div>
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

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Errors</div>
                <div class="text-lg font-semibold text-red-400">{{ counts.error }}</div>
              </div>
              <div class="rounded-md border border-default p-3 bg-default">
                <div class="text-xs text-muted">Warnings</div>
                <div class="text-lg font-semibold text-amber-400">{{ counts.warn }}</div>
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

            <div v-if="error" class="p-3 rounded bg-red-900/20 border border-red-800 text-sm mb-3">
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
                      'bg-red-900/10': row.level === 'error',
                      'bg-amber-900/10': row.level === 'warn',
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
                  <tr v-else-if="serverAccessDenied">
                    <td colspan="6" class="p-4 text-center text-amber-400">
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
                      'bg-red-900/10': row.level === 'error',
                      'bg-amber-900/10': row.level === 'warn',
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
        </CardContainer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CardContainer } from "@45drives/houston-common-ui";
import { computed, onMounted, ref, watch } from "vue";
import { useTourManager, type TourStep } from "../../composables/useTourManager";
import { useOnboarding } from "../../composables/useOnboarding";
import { useApi } from "../../composables/useApi";

const { requestTour } = useTourManager();
const { onboarding, markDone } = useOnboarding();
const { apiFetch } = useApi();

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

function formatTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
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
    const params = new URLSearchParams({
      page: String(page),
      limit: String(serverPagination.value.limit),
    });
    if (levelFilter.value) params.set('level', levelFilter.value);

    const res = await apiFetch(`/api/admin/audit-log?${params.toString()}`);
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
    await loadServerPage(serverPagination.value.page);
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
