<template>
    <!-- Inline: one small button plus a status light, for a single form row -->
    <div v-if="inline" class="inline-flex items-center gap-2 min-w-0" :title="inlineTitle">
        <button type="button" class="btn btn-secondary btn-xs whitespace-nowrap" :class="buttonClass"
            :disabled="disabled || checking || turnedOff" @click="runCheck">
            {{ checking ? checkingLabel : status ? 'Check Again' : buttonLabel }}
        </button>
        <span class="inline-flex items-center gap-1.5 text-xs whitespace-nowrap" role="status" aria-live="polite">
            <span class="flow-dot cpf-light" :class="[`flow-dot--${lightTone}`, { 'cpf-light--checking': checking }]"
                aria-hidden="true"></span>
            <span :class="inlineTextClass">{{ inlineText }}</span>
        </span>
    </div>

    <div v-else class="w-full min-w-0 text-center">
        <div class="flex items-center gap-2 min-w-0">
            <button type="button" class="btn btn-primary whitespace-nowrap px-3 py-2 text-base w-full" :class="buttonClass"
                :disabled="disabled || checking || turnedOff" @click="runCheck">
                {{ checking ? checkingLabel : buttonLabel }}
            </button>

          

            <button type="button" class="btn btn-danger w-full text-base"
                :disabled="checking" @click="reset" title="Reset status">
                Reset
            </button>
        </div>
        <div>
            <span
                class="inline-flex items-center justify-center whitespace-nowrap select-none rounded-full border text-[0.72rem] font-bold h-5 px-2 w-full"
                :class="badgeTwClass">
                {{ badgeText }}
            </span>
        </div>

        <p class="mt-2 mb-0 min-w-0 opacity-90 leading-5 break-words text-sm">
            <span v-if="turnedOff">{{ EGRESS_OFF_TEXT.port_check }}</span>
            <span v-else-if="message">{{ message }}</span>
            <span v-else class="opacity-70">Run a check to verify port forwarding.</span>
        </p>

        <p v-if="showDetails && detailsLine" class="mt-1 mb-0 text-xs opacity-70 break-words">
            {{ detailsLine }}
        </p>
      
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { EGRESS_OFF_TEXT, useEgressSwitches } from "../composables/useEgressSwitches";

type VerifyForwardingResponse = {
    ok: boolean;
    observedIp?: string;
    port?: number;
    forwardedToThisStudio?: boolean;
    stage?: string;
    tlsReachable?: boolean;
    httpOk?: boolean;
    httpStatus?: number;
    tokenMatched?: boolean;
    gotToken?: "present" | "missing" | string;
    error?: string;
    detail?: string;
    [k: string]: unknown;
};

type ResultEvent =
    | { ok: true; enabled: boolean; response: VerifyForwardingResponse }
    | { ok: false; status?: number; response?: unknown; error?: string; detail?: string };

type ApiFetch = (path: string, init?: RequestInit) => Promise<any>;

const props = withDefaults(
    defineProps<{
        endpoint?: string;

        buttonLabel?: string;
        checkingLabel?: string;

        autoCheckOnMount?: boolean;
        disabled?: boolean;

        showDetails?: boolean;
        buttonClass?: string | string[] | Record<string, boolean>;

        apiFetch?: ApiFetch;

        requestBody?: Record<string, unknown> | string | null;

        /** Compact single-row layout: small button + status light (details in the tooltip). */
        inline?: boolean;
    }>(),
    {
        endpoint: "/api/forwarding/check",
        buttonLabel: "Check Port",
        checkingLabel: "Testing...",
        autoCheckOnMount: false,
        disabled: false,
        showDetails: true,
        buttonClass: "",
        apiFetch: undefined,
        requestBody: null,
        inline: false,
    }
);

const emit = defineEmits<{
    (e: "result", payload: ResultEvent): void;
    (e: "reset"): void;
}>();

const checking = ref(false);
const status = ref<null | "enabled" | "disabled" | "error">(null);
const message = ref("");
const lastResponse = ref<VerifyForwardingResponse | null>(null);
// The server's own check can be switched off in Settings → Scanner & outbound calls.
const checksServer = computed(() => !!props.apiFetch && props.endpoint === "/api/forwarding/check");
const egress = props.apiFetch ? useEgressSwitches(props.apiFetch) : null;
const turnedOffByServer = ref(false);
const turnedOff = computed(() => checksServer.value && (turnedOffByServer.value || !!egress?.isOff("port_check")));

const detailsLine = computed(() => {
    const r = lastResponse.value;
    if (!r) return "";
    const bits: string[] = [];
    if (r.observedIp) bits.push(`Observed IP: ${r.observedIp}`);
    if (typeof r.port === "number") bits.push(`Port: ${r.port}`);
    // if (typeof r.httpStatus === "number") bits.push(`HTTP: ${r.httpStatus}`);
    // if (typeof r.stage === "string") bits.push(`Stage: ${r.stage}`);
    return bits.join(" | ");
});

const badgeText = computed(() => {
    if (turnedOff.value) return "Check turned off";
    // if (status.value === "enabled") return "Port forwarding working";
    if (status.value === "enabled") return "External access is working!";
    // if (status.value === "disabled") return "Port forwarding not working";
    if (status.value === "disabled") return "External access not working (check your Port Forwarding)";
    if (status.value === "error") return "Test Failed";
    return "Not Tested";
});

const badgeTwClass = computed(() => {
    if (status.value === "enabled") return "bg-green-500/15 border-green-500/30 text-green-800 dark:text-green-100";
    if (status.value === "disabled") return "bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-100";
    if (status.value === "error") return "bg-red-500/15 border-red-500/30 text-red-800 dark:text-red-100";
    return "bg-zinc-500/10 border-zinc-500/20 text-zinc-700 dark:bg-white/10 dark:border-white/15 dark:text-white/85";
});

const lightTone = computed(() => {
    if (checking.value) return "info";
    if (status.value === "enabled") return "success";
    if (status.value === "disabled") return "danger";
    if (status.value === "error") return "warning";
    return "neutral";
});

const inlineText = computed(() => {
    if (turnedOff.value) return "Check turned off";
    if (checking.value) return "Testing from the internet…";
    if (status.value === "enabled") return "Reachable from the internet";
    if (status.value === "disabled") return "Not reachable. Check port forwarding";
    if (status.value === "error") return "Couldn't run the check";
    return "Not checked";
});

const inlineTextClass = computed(() => {
    if (status.value === "enabled") return "text-flow-success";
    if (status.value === "disabled") return "text-flow-danger";
    if (status.value === "error") return "text-flow-warning";
    return "text-muted";
});

const inlineTitle = computed(() =>
    turnedOff.value ? EGRESS_OFF_TEXT.port_check : [message.value, detailsLine.value].filter(Boolean).join("\n") || "Checks whether this server can be reached from outside your network."
);

function reset() {
    checking.value = false;
    status.value = null;
    message.value = "";
    lastResponse.value = null;
    emit("reset");
}

async function runCheck() {
    if (checking.value) return;

    checking.value = true;
    message.value = "";
    lastResponse.value = null;

    try {
        const body =
            props.requestBody == null
                ? undefined
                : typeof props.requestBody === "string"
                    ? props.requestBody
                    : JSON.stringify(props.requestBody);

        let json: VerifyForwardingResponse | null = null;

        if (props.apiFetch) {
            const resp = await props.apiFetch(props.endpoint, {
                method: "POST",
                ...(body ? { body } : {}),
            });
            json = (resp ?? null) as VerifyForwardingResponse | null;
        } else {
            const res = await fetch(props.endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                ...(body ? { body } : {}),
            });
            json = (await res.json().catch(() => null)) as VerifyForwardingResponse | null;
            if (!res.ok) {
                const requestId = String(
                    res.headers.get('x-request-id') ||
                    (typeof (json as any)?.requestId === 'string' ? (json as any).requestId : '')
                ).trim();
                const baseMsg = json?.error ? String(json.error) : `HTTP ${res.status}`;
                status.value = "error";
                message.value = requestId && !baseMsg.includes(requestId)
                    ? `${baseMsg} (request ${requestId})`
                    : baseMsg;
                emit("result", { ok: false, status: res.status, response: json ?? undefined });
                return;
            }
        }

        if (!json) {
            status.value = "error";
            message.value = "No response";
            emit("result", { ok: false, error: "bad_response", detail: "No JSON body" });
            return;
        }

        if (json.ok === false && typeof json.error === "string") {
            status.value = "error";
            message.value = json.detail ? String(json.detail) : String(json.error);
            emit("result", { ok: false, response: json, error: json.error, detail: json.detail });
            return;
        }

        lastResponse.value = json;

        const enabled =
            json.forwardedToThisStudio === true &&
            // Backward/forward compatibility:
            // - old checkers: no tokenMatched field
            // - new checkers: explicit boolean
            json.tokenMatched !== false;

        if (enabled) {
            status.value = "enabled";
            message.value = "Forwarding is correctly reaching this Studio.";
        } else {
            status.value = "disabled";
            // const gotToken = json.gotToken ?? "missing";
            const httpStatus = typeof json.httpStatus === "number" ? json.httpStatus : "unknown";
            // message.value = `Probe did not match this Studio (HTTP ${httpStatus}, token ${gotToken}).`;
            message.value = `Probe did not reach this Studio (HTTP ${httpStatus}).`;
        }

        emit("result", { ok: true, enabled, response: json });
    } catch (e) {
        if ((e as any)?.code === "egress_disabled") {
            turnedOffByServer.value = true;
            status.value = null;
            emit("result", { ok: false, error: "egress_disabled" });
            return;
        }
        status.value = "error";
        message.value = String((e as any)?.message || e);
        emit("result", { ok: false, error: "network_error", detail: message.value });
    } finally {
        checking.value = false;
    }
}

onMounted(async () => {
    if (checksServer.value) await egress?.load();
    if (props.autoCheckOnMount && !turnedOff.value) runCheck();
});

defineExpose({ runCheck, reset });
</script>

<style scoped>
.cpf-light {
    width: 0.65rem;
    height: 0.65rem;
}

.cpf-light--checking {
    animation: cpf-pulse 1s ease-in-out infinite;
}

@keyframes cpf-pulse {
    50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
    .cpf-light--checking { animation: none; }
}
</style>
