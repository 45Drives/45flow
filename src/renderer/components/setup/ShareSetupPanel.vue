<template>
  <section class="space-y-4">
    <p class="text-sm text-muted">
      Choose the public address for share links. People outside your local network need a public address and router access to reach this server.
    </p>

    <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
    <FlowNotice v-if="saved" tone="success" size="sm" live>{{ saved }}</FlowNotice>

    <FlowField
      label="Public share address"
      help="Enter the full address, such as https://files.example.com, with no path. A domain is recommended for a trusted certificate."
    >
      <template #default="{ id, describedBy }">
        <input
          :id="id"
          v-model.trim="address"
          type="url"
          autocomplete="url"
          spellcheck="false"
          class="input-textlike w-full max-w-xl rounded border border-default px-3 py-2 text-sm"
          :disabled="busy"
          :aria-describedby="describedBy"
        />
      </template>
    </FlowField>

    <div class="flex flex-wrap gap-2">
      <FlowButton variant="primary" :disabled="busy || !address.trim()" :loading="activity === 'save'" loading-text="Saving…" @click="saveAddress">
        Save address
      </FlowButton>
      <FlowButton :disabled="busy" :loading="activity === 'auto'" loading-text="Detecting…" @click="useAutomaticAddress">
        Use automatic address
      </FlowButton>
      <FlowButton :disabled="busy" :loading="activity === 'check'" loading-text="Checking…" @click="checkInternetAccess">
        Test internet access
      </FlowButton>
    </div>

    <p v-if="activityMessage" class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <ArrowPathIcon class="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      {{ activityMessage }}
    </p>

    <FlowNotice v-if="internetResult && !internetResult.issues?.length" tone="success" size="sm" live>
      Internet sharing is reachable.
    </FlowNotice>
    <FlowNotice v-if="internetResult?.issues?.length" tone="warning" size="sm" live title="Internet sharing needs attention">
      <ul class="list-disc space-y-1 pl-5">
        <li v-for="(issue, index) in internetResult.issues" :key="index">{{ issue.message || issue }}</li>
      </ul>
    </FlowNotice>

    <details class="rounded-lg border border-default p-3" @toggle="onAdvancedToggle">
      <summary class="cursor-pointer font-medium">Advanced: HTTPS certificate</summary>
      <div class="mt-3 space-y-4">
        <p class="text-sm text-muted">
          A trusted certificate prevents browser warnings on public share links. It requires a domain that points to this server and a contact email.
        </p>

        <p v-if="certificateLoading" class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
          <ArrowPathIcon class="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          Checking certificate…
        </p>
        <template v-else-if="certificateStatus">
          <FlowNotice :tone="certificateStatus.certMode === 'letsencrypt' && certificateStatus.valid ? 'success' : 'warning'" size="sm">
            <template v-if="certificateStatus.certMode === 'letsencrypt' && certificateStatus.valid">
              Trusted certificate active for {{ certificateStatus.certDomain }}.
            </template>
            <template v-else>
              This server is using a local certificate. Browsers may show a security warning.
            </template>
          </FlowNotice>
        </template>

        <FlowNotice v-if="certificateError" tone="danger" size="sm" live>{{ certificateError }}</FlowNotice>

        <FlowField label="Domain" help="The domain must resolve to this server's public IP address." required>
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model.trim="domain"
              type="text"
              autocomplete="url"
              spellcheck="false"
              class="input-textlike w-full max-w-xl rounded border border-default px-3 py-2 text-sm"
              :disabled="busy"
              :aria-describedby="describedBy"
              placeholder="files.example.com"
            />
          </template>
        </FlowField>
        <FlowField label="Contact email" help="Used for certificate renewal notices." required>
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model.trim="email"
              type="email"
              autocomplete="email"
              class="input-textlike w-full max-w-xl rounded border border-default px-3 py-2 text-sm"
              :disabled="busy"
              :aria-describedby="describedBy"
              placeholder="admin@example.com"
            />
          </template>
        </FlowField>
        <FlowButton
          :disabled="busy || !domain.trim() || !email.trim()"
          :loading="activity === 'certificate'"
          loading-text="Installing certificate…"
          @click="installCertificate"
        >
          Set up trusted certificate
        </FlowButton>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import { useApi } from '../../composables/useApi'
import type { SetupStatus } from '../../composables/useSetupStatus'
import FlowButton from '../../ui/FlowButton.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowNotice from '../../ui/FlowNotice.vue'

type Activity = 'save' | 'auto' | 'check' | 'certificate' | null
type CertificateStatus = {
  certMode: 'self-signed' | 'letsencrypt'
  certDomain?: string | null
  certEmail?: string | null
  valid?: boolean
}

const props = defineProps<{ status: SetupStatus; connectionId?: string }>()
const emit = defineEmits<{ refreshed: [status: SetupStatus] }>()
const { apiFetch } = useApi(props.connectionId)
const address = ref(props.status.shareAddress?.externalBase || '')
const domain = ref('')
const email = ref('')
const activity = ref<Activity>(null)
const activityMessage = ref('')
const error = ref('')
const saved = ref('')
const internetResult = ref<{ issues?: { message?: string }[] } | null>(null)
const certificateStatus = ref<CertificateStatus | null>(null)
const certificateLoading = ref(false)
const certificateLoaded = ref(false)
const certificateError = ref('')
const busy = computed(() => activity.value !== null)

function updateStatus(externalBase: string) {
  emit('refreshed', {
    ...props.status,
    shareAddress: {
      externalBase,
      httpsPort: props.status.shareAddress?.httpsPort ?? 443,
    },
  })
}

function validateAddress() {
  try {
    const url = new URL(address.value.trim())
    return ['http:', 'https:'].includes(url.protocol)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
  } catch {
    return false
  }
}

async function run(action: Exclude<Activity, null>, message: string, work: () => Promise<void>) {
  if (busy.value) return
  activity.value = action
  activityMessage.value = message
  error.value = ''
  saved.value = ''
  internetResult.value = null
  try {
    await work()
  } catch (e: any) {
    error.value = e?.message || 'The sharing setting could not be updated. Check the server connection and try again.'
  } finally {
    activity.value = null
    activityMessage.value = ''
  }
}

async function saveAddress() {
  if (!validateAddress()) {
    error.value = 'Enter a complete http:// or https:// address with no path.'
    return
  }
  const normalized = new URL(address.value.trim()).origin
  await run('save', 'Saving share address…', async () => {
    await apiFetch('/api/admin/setup/settings', {
      method: 'POST',
      body: JSON.stringify({ externalBase: normalized }),
    })
    address.value = normalized
    updateStatus(normalized)
    saved.value = 'Share address saved.'
  })
}

async function useAutomaticAddress() {
  await run('auto', 'Detecting the public address…', async () => {
    await apiFetch('/api/admin/setup/settings', {
      method: 'POST',
      body: JSON.stringify({ externalBase: 'auto' }),
    })
    const status: SetupStatus = await apiFetch('/api/setup/status')
    address.value = status.shareAddress?.externalBase || ''
    emit('refreshed', status)
    saved.value = 'Using the automatically detected address.'
  })
}

async function checkInternetAccess() {
  await run('check', 'Checking access from the internet…', async () => {
    internetResult.value = await apiFetch('/api/settings/public-sharing/check', {
      method: 'POST',
      timeoutMs: 30_000,
    })
  })
}

async function loadCertificateStatus() {
  if (certificateLoading.value) return
  certificateLoading.value = true
  certificateError.value = ''
  try {
    certificateStatus.value = await apiFetch('/api/settings/letsencrypt/status', { timeoutMs: 15_000 })
    if (!domain.value && certificateStatus.value?.certDomain) domain.value = certificateStatus.value.certDomain || ''
    if (!email.value && certificateStatus.value?.certEmail) email.value = certificateStatus.value.certEmail || ''
    certificateLoaded.value = true
  } catch (e: any) {
    certificateError.value = e?.message || 'Certificate status could not be loaded.'
  } finally {
    certificateLoading.value = false
  }
}

function onAdvancedToggle(event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open && !certificateLoaded.value) void loadCertificateStatus()
}

async function installCertificate() {
  if (!domain.value.trim() || !email.value.trim()) {
    certificateError.value = 'Enter a domain and contact email to set up a trusted certificate.'
    return
  }
  certificateError.value = ''
  await run('certificate', 'Installing the certificate. This can take a few minutes…', async () => {
    const result = await apiFetch('/api/settings/letsencrypt/setup', {
      method: 'POST',
      body: JSON.stringify({ domain: domain.value.trim(), email: email.value.trim() }),
      timeoutMs: 120_000,
    })
    certificateStatus.value = {
      certMode: 'letsencrypt',
      certDomain: result.domain || domain.value.trim(),
      certEmail: email.value.trim(),
      valid: true,
    }
    certificateLoaded.value = true
    saved.value = result.message || 'Trusted certificate installed.'
  })
}
</script>
