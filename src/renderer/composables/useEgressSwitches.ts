// Which optional outbound calls an admin has turned off on the connected
// server (houston-broadcaster GET /api/egress/switches), so screens that rely
// on one can say so. Older servers without the endpoint count as all on.
import { computed, ref } from 'vue'

export type EgressId = 'smtp' | 'port_check' | 'public_ip' | 'update_check' | 'registry_heartbeat'

type ApiFetch = (path: string, init?: any) => Promise<any>

const WHERE = 'An admin can turn it back on in Settings → Scanning & privacy.'

/** What stops working when each call is off, in one or two sentences. */
export const EGRESS_OFF_TEXT: Record<EgressId, string> = {
    smtp: `Email is turned off on this server, so no emails are sent. Share links still work: copy and send them yourself. ${WHERE}`,
    port_check: `The port-forwarding check is turned off on this server, so it can't confirm clients outside your network can reach your links. ${WHERE}`,
    public_ip: `Public IP lookup is turned off on this server, so links keep using the last internet address it found. If your address changes, set a custom address here. ${WHERE}`,
    update_check: `Update checks are turned off on this server, so you won't be told about new Broadcaster versions. ${WHERE}`,
    registry_heartbeat: `The registry heartbeat is turned off, so desktop apps on other networks can't find this server automatically. Connect by address instead. ${WHERE}`,
}

export function useEgressSwitches(apiFetch: ApiFetch) {
    const switches = ref<Partial<Record<EgressId, boolean>>>({})
    const loaded = ref(false)

    async function load() {
        try {
            const data = await apiFetch('/api/egress/switches')
            switches.value = data?.switches && typeof data.switches === 'object' ? data.switches : {}
        } catch {
            switches.value = {}
        } finally {
            loaded.value = true
        }
    }

    const isOff = (id: EgressId) => switches.value[id] === false
    const anyOff = computed(() => Object.values(switches.value).some((v) => v === false))

    return { switches, loaded, load, isOff, anyOff }
}
