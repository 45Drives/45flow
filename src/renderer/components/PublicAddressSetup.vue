<template>
  <section aria-label="Set up a public address" class="mb-6" data-testid="public-address-setup">
    <p class="flow-subhead flow-subhead--first">Set up a public address</p>
    <p class="text-xs text-accent mb-3">
      Clients outside your network need a hostname with a trusted HTTPS certificate. 45Flow never puts this server's IP address in
      internet links.
    </p>

    <ol class="flow-group">
      <!-- Step 1: a hostname -->
      <li class="py-3">
        <p class="text-sm font-medium text-default">1. Get a hostname</p>
        <div class="settings-segmented mt-2" role="radiogroup" aria-label="Where the hostname comes from">
          <button type="button" role="radio" :aria-checked="source === 'domain'" :class="{ 'is-on': source === 'domain' }"
            @click="source = 'domain'">My own domain</button>
          <button type="button" role="radio" :aria-checked="source === 'noip'" :class="{ 'is-on': source === 'noip' }"
            @click="source = 'noip'">No-IP (Pro)</button>
        </div>

        <div v-if="source === 'domain'" class="text-xs text-muted mt-2 space-y-1">
          <p>At your domain provider, add an <b>A record</b> for a name such as <span class="font-mono">share.yourstudio.com</span>
            pointing at this server's public IP<template v-if="publicIp"> (<span class="font-mono">{{ publicIp }}</span>)</template>.</p>
          <p>Forward port 443 on your router to this server, then continue with step 2.</p>
          <FlowField label="Hostname" class="mt-2">
            <template #default="{ id }">
              <input :id="id" v-model.trim="domainHost" type="text" placeholder="share.yourstudio.com" autocomplete="off"
                class="input-textlike border border-default px-2 py-1 rounded text-sm w-64" />
            </template>
          </FlowField>
        </div>

        <div v-else class="mt-2">
          <FlowNotice v-if="noipLoadError" tone="danger" size="sm" class="mb-2">{{ noipLoadError }}</FlowNotice>
          <FlowNotice v-else-if="noip && !noip.entitled" tone="info" size="sm" data-testid="noip-upgrade">
            No-IP setup is part of 45Flow Pro. Without Pro, use your own domain, or create and update a No-IP hostname
            on noip.com yourself.
          </FlowNotice>
          <FlowNotice v-else-if="noipAdminOnly" tone="info" size="sm">Ask an admin to set up No-IP for this server.</FlowNotice>
          <template v-else-if="noip">
            <p class="text-xs text-muted mb-2">
              Create a free hostname at <span class="font-mono">noip.com</span> (for example
              <span class="font-mono">yourstudio.ddns.net</span>), then enter it with your No-IP sign-in. 45Flow keeps it
              pointed at this server whenever your internet address changes.
            </p>
            <div class="grid gap-2 sm:grid-cols-2">
              <FlowField label="No-IP hostname">
                <template #default="{ id }">
                  <input :id="id" v-model.trim="form.hostname" type="text" placeholder="yourstudio.ddns.net" autocomplete="off"
                    class="input-textlike border border-default px-2 py-1 rounded text-sm w-full" :disabled="saving" />
                </template>
              </FlowField>
              <FlowField label="No-IP username or email">
                <template #default="{ id }">
                  <input :id="id" v-model.trim="form.username" type="text" autocomplete="off"
                    :placeholder="noip.hasCredentials ? 'Saved — type to replace' : ''"
                    class="input-textlike border border-default px-2 py-1 rounded text-sm w-full" :disabled="saving" />
                </template>
              </FlowField>
              <FlowField label="No-IP password">
                <template #default="{ id }">
                  <input :id="id" v-model="form.password" type="password" autocomplete="new-password"
                    :placeholder="noip.hasCredentials ? 'Saved — type to replace' : ''"
                    class="input-textlike border border-default px-2 py-1 rounded text-sm w-full" :disabled="saving" />
                </template>
              </FlowField>
              <label class="inline-flex items-center gap-2 text-sm self-end pb-1">
                <FlowSwitch v-model="form.enabled" :disabled="saving" label="Keep the hostname updated" />
                Keep it updated
              </label>
            </div>
            <FlowNotice v-if="noipError" tone="danger" size="sm" live class="mt-2">{{ noipError }}</FlowNotice>
            <div class="flex flex-wrap items-center gap-2 mt-2">
              <FlowButton size="sm" variant="primary" :loading="saving" loading-text="Saving…" :disabled="!canSaveNoip" @click="saveNoip">
                Save No-IP
              </FlowButton>
              <FlowButton v-if="noip.hostname && noip.hasCredentials" size="sm" :loading="updating" loading-text="Updating…"
                :disabled="saving || updating" @click="updateNow">Update now</FlowButton>
              <FlowButton v-if="noip.hasCredentials" size="sm" variant="ghost" :disabled="saving" @click="removeNoip">Remove</FlowButton>
            </div>
            <p v-if="noipStatusLine" class="text-xs mt-2" :class="noipStatusTone" role="status" data-testid="noip-status">{{ noipStatusLine }}</p>
          </template>
          <p v-else class="text-xs text-muted" role="status">Checking No-IP…</p>
        </div>
      </li>

      <!-- Step 2: use it for links -->
      <li class="py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 items-center">
        <div class="min-w-0">
          <p class="text-sm font-medium text-default">2. Use it for share links</p>
          <p class="text-xs text-muted mt-0.5">
            <template v-if="!hostname">Finish step 1 first.</template>
            <template v-else-if="usingHostname">Internet links use <span class="font-mono">{{ hostname }}</span>.</template>
            <template v-else>Sets the internet address below to <span class="font-mono">https://{{ hostname }}</span>. Click Save afterwards.</template>
          </p>
        </div>
        <FlowChip v-if="usingHostname" size="sm" tone="success" dot>Done</FlowChip>
        <FlowButton v-else size="sm" :disabled="!hostname" @click="emit('use-hostname', hostname)">Use {{ hostname || 'hostname' }}</FlowButton>
      </li>

      <!-- Step 3: certificate -->
      <li class="py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 items-center">
        <div class="min-w-0">
          <p class="text-sm font-medium text-default">3. Get a trusted certificate</p>
          <p class="text-xs text-muted mt-0.5">{{ readinessLine }}</p>
        </div>
        <FlowChip v-if="readiness?.ready" size="sm" tone="success" dot>Ready</FlowChip>
        <FlowButton v-else size="sm" @click="emit('open-section', 'certificate')">HTTPS certificate</FlowButton>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
// C1: guided public-address setup — a hostname (own domain or No-IP, Pro),
// used for share links, with a trusted certificate. The server enforces
// No-IP entitlement; this screen only explains it.
import { computed, reactive, ref, watch } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import FlowSwitch from '../ui/FlowSwitch.vue'
import { useApi } from '../composables/useApi'
import { useExternalAddressReadiness, describeExternalAddressNotReady, type ExternalAddressReadiness } from '../composables/useExternalAddressReadiness'
import { noipSkipText, noipStatusView, type NoipStatus } from '../utils/noipStatus'

const props = defineProps<{
  connectionId: string
  /** The internet address currently entered below (may be unsaved). */
  externalBase: string
  externalAuto: boolean
  publicIp?: string | null
}>()

const emit = defineEmits<{
  (e: 'use-hostname', hostname: string): void
  (e: 'open-section', section: 'certificate'): void
}>()

const { apiFetch } = useApi(props.connectionId)
const { checkExternalAddressReady } = useExternalAddressReadiness()

const source = ref<'domain' | 'noip'>('domain')
const domainHost = ref('')
const noip = ref<NoipStatus | null>(null)
const noipLoadError = ref('')
const noipAdminOnly = ref(false)
const noipError = ref('')
const saving = ref(false)
const updating = ref(false)
const form = reactive({ hostname: '', username: '', password: '', enabled: true })
const readiness = ref<ExternalAddressReadiness | null>(null)

const hostname = computed(() => {
  const h = (source.value === 'noip' ? noip.value?.hostname || '' : domainHost.value).trim().toLowerCase()
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : ''
})

const usingHostname = computed(() => {
  if (!hostname.value || props.externalAuto) return false
  try { return new URL(props.externalBase.includes('://') ? props.externalBase : `https://${props.externalBase}`).hostname === hostname.value } catch { return false }
})

const canSaveNoip = computed(() => {
  if (saving.value || !form.hostname) return false
  const credsGiven = !!form.username || !!form.password
  if (credsGiven) return !!form.username && !!form.password
  return !!noip.value?.hasCredentials
})

const noipStatusView_ = computed(() => (noip.value ? noipStatusView(noip.value) : null))
const noipStatusLine = computed(() => noipStatusView_.value?.text || '')
const noipStatusTone = computed(() => ({
  success: 'text-flow-success', warning: 'text-flow-warning', danger: 'text-flow-danger', muted: 'text-muted',
}[noipStatusView_.value?.tone || 'muted']))

const readinessLine = computed(() => {
  if (!readiness.value) return 'Checking…'
  if (readiness.value.ready) return 'Internet links can be created and copied.'
  return describeExternalAddressNotReady(readiness.value.reason)
})

function applyStatus(s: NoipStatus) {
  noip.value = s
  form.hostname = s.hostname || form.hostname
  form.enabled = s.hostname ? s.enabled : true
  form.username = ''
  form.password = ''
  if (s.hostname) source.value = 'noip'
}

async function loadNoip() {
  noipLoadError.value = ''
  try {
    applyStatus(await apiFetch('/api/admin/noip'))
  } catch (e: any) {
    if (e?.status === 403) { noipAdminOnly.value = true; noip.value = null; return }
    if (e?.status === 404) { noipLoadError.value = 'This server is too old for No-IP setup. Update 45Flow on the server.'; return }
    noipLoadError.value = e?.message ? `Couldn't check No-IP: ${e.message}` : "Couldn't check No-IP."
  }
}

async function saveNoip() {
  saving.value = true
  noipError.value = ''
  try {
    const body: Record<string, unknown> = { hostname: form.hostname, enabled: form.enabled }
    if (form.username || form.password) Object.assign(body, { username: form.username, password: form.password })
    applyStatus(await apiFetch('/api/admin/noip', { method: 'PUT', body: JSON.stringify(body), retry: 0 }))
    if (form.enabled && noip.value?.hasCredentials) await updateNow()
  } catch (e: any) {
    noipError.value = e?.code === 'premium_required' ? 'No-IP setup needs 45Flow Pro.' : (e?.message || "Couldn't save No-IP.")
  } finally {
    saving.value = false
  }
}

async function updateNow() {
  updating.value = true
  noipError.value = ''
  try {
    const data = await apiFetch('/api/admin/noip/update', { method: 'POST', body: '{}', retry: 0 })
    if (noip.value && data?.state) noip.value = { ...noip.value, state: data.state }
    if (data?.sent === false && data.reason) noipError.value = noipSkipText(data.reason)
  } catch (e: any) {
    noipError.value = e?.message || "Couldn't reach No-IP."
  } finally {
    updating.value = false
  }
}

async function removeNoip() {
  saving.value = true
  noipError.value = ''
  try {
    applyStatus(await apiFetch('/api/admin/noip', { method: 'DELETE', retry: 0 }))
    form.hostname = ''
  } catch (e: any) {
    noipError.value = e?.message || "Couldn't remove No-IP."
  } finally {
    saving.value = false
  }
}

async function loadReadiness() {
  readiness.value = await checkExternalAddressReady()
}

watch(() => [props.externalBase, props.externalAuto], () => { void loadReadiness() })
void loadNoip()
void loadReadiness()
defineExpose({ reload: () => { void loadNoip(); void loadReadiness() } })
</script>
