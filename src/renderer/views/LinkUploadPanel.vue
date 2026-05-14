<template>
	<div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
		<div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 ">
			<div class="grid w-full grid-cols-1 gap-4 text-xl min-w-0">
				<CardContainer class="w-full bg-well rounded-md shadow-xl min-w-0">
					<div class="ss-toned-panel flex flex-col gap-2 text-left min-w-0 p-3">
						<div data-tour="upload-link-heading" class="flex flex-col gap-2 text-left min-w-0">
							<h2 class="text-xl font-semibold">Share a Link for Remote Uploads</h2>
							<div class="text-sm opacity-80 -mt-1">
								Pick a folder on the server and generate a shareable link users can upload to.
							</div>
						</div>

						<div data-tour="upload-link-folder" class="min-w-0">
							<FolderPicker
								v-model="destFolderRel"
								:apiFetch="apiFetch"
								useCase="upload"
								subtitle="Pick the folder on the server where these files will be uploaded."
								:auto-detect-roots="true"
								:allow-entire-tree="true"
								v-model:project="projectBase"
								v-model:dest="destFolderRel"
								:uploadLink="true"
							/>
						</div>

						<div data-tour="upload-link-options" class="border-t border-default mt-2 pt-3 min-w-0">
							<CommonLinkControls>
							<template #expiry>
								<div data-tour="upload-link-expiry" class="flex flex-col gap-3 min-w-0">
									<div class="flex items-center gap-3 min-w-0">
										<label class="font-semibold whitespace-nowrap flex-shrink-0">Expires in:</label>
										<div class="flex items-center gap-2 min-w-0 flex-1">
											<input
												type="number"
												min="1"
												step="1"
												v-model.number="expiresValue"
												class="input-textlike border rounded px-3 py-2 w-24"
											/>
											<select v-model="expiresUnit" class="input-textlike border rounded px-3 py-2 w-32">
												<option value="hours">hours</option>
												<option value="days">days</option>
												<option value="weeks">weeks</option>
											</select>
										</div>
									</div>
									<div class="flex flex-nowrap gap-1 text-xs min-w-0">
										<button type="button" class="btn btn-secondary w-20" @click="setPreset(1, 'hours')">1 hour</button>
										<button type="button" class="btn btn-secondary w-20" @click="setPreset(1, 'days')">1 day</button>
										<button type="button" class="btn btn-secondary w-20" @click="setPreset(1, 'weeks')">1 week</button>
										<button type="button" class="btn btn-secondary w-20" @click="setNever()">Never</button>
									</div>
								</div>
							</template>

							<template #access>
								<div data-tour="upload-link-network" class="flex flex-col gap-1 min-w-0">
									<div class="flex flex-wrap items-center gap-3 min-w-0">
										<span class="font-semibold sm:whitespace-nowrap">
											Network Access:
										</span>

										<div class="flex flex-wrap gap-2 min-w-0" role="radiogroup"
											aria-label="Network Access">
											<!-- Local (false) -->
											<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition
                border border-default bg-default hover:bg-well/40">
												<input type="radio" name="link-access" :value="false"
													:checked="usePublicBase === false" @change="usePublicBase = false"
													class="h-4 w-4" />
												<span class="text-sm truncate">
													Share Locally (Over LAN)
												</span>
											</label>

											<!-- External (true) -->
											<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition
                 border border-default bg-default hover:bg-well/40">
												<input type="radio" name="link-access" :value="true"
													:checked="usePublicBase === true" @change="usePublicBase = true"
													class="h-4 w-4" />
												<span class="text-sm truncate">
													Share Externally (Over Internet)
												</span>
											</label>
										</div>
									</div>

									<p class="text-xs text-muted">
										External sharing needs working port forwarding.
									</p>
								</div>
							</template>

							<template #accessExtra>
								<div v-if="usePublicBase" class="flex flex-col gap-3 min-w-0">
									<CheckPortForwarding
										:apiFetch="apiFetch"
										endpoint="/api/forwarding/check"
										:autoCheckOnMount="false"
										:showDetails="true"
									/>
								</div>
							</template>

							<template #title>
								<div data-tour="upload-link-title" class="flex flex-wrap items-center gap-3 min-w-0">
									<label class="font-semibold sm:whitespace-nowrap">Link Title:</label>
									<input
										type="text"
										v-model.trim="linkTitle"
										class="input-textlike border rounded px-3 py-2 w-full min-w-[12rem]"
										placeholder="Optional title for the shared link"
									/>
								</div>
							</template>

							<!-- Link Access row -->
							<template #after class="">
								<div data-tour="upload-link-access-mode" class="border-t border-default mt-2 pt-2 min-w-0 text-left">
									<LinkAccessMode
										v-model="accessMode"
										v-model:password="password"
										v-model:showPassword="showPassword"
										:accessCount="accessCount"
										:accessSatisfied="accessSatisfied"
										dataTour=""
										radioName="upload-access-mode"
										:showComments="false"
										openWarning="WARNING! Anybody with the link can upload a file to your server!"
										restrictedHelpText="Invited users and groups sign in with their own credentials. Roles control permissions."
										wrapperClass="ss-toned-panel min-w-0 p-3"
										@openUserModal="openUserModal()"
									/>
								</div>
							</template>
							</CommonLinkControls>
						</div>
					</div>

					<AddUsersModal
						v-model="userModalOpen"
						:apiFetch="apiFetch"
						:link="linkContext"
						roleHint="upload"
						:preselected="accessUsers.map(c => ({
							id: c.id,
							username: c.username || '',
							name: c.name,
							user_email: c.user_email,
							display_color: c.display_color,
							role_id: c.role_id ?? undefined,
							role_name: c.role_name ?? undefined,
						}))"
						:preselectedGroups="accessGroups"
						@apply="onApplyUsers"
					/>

					<template #footer>
						<div class="flex flex-col min-w-0">
							<div class="flex flex-wrap gap-2 w-full min-w-0">
								<button class="btn btn-secondary" :disabled="loading" @click="resetAll">
									Reset
								</button>
								<button
									data-tour="upload-link-generate-btn"
									class="btn btn-primary flex-1 min-w-[14rem]"
									:disabled="!canGenerate || loading"
									@click="generateLink"
									title="Create a Flow link with the selected options"
								>
									<span v-if="loading" class="inline-flex items-center gap-2">
										<span class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										Generating…
									</span>
									<span v-else>Generate Flow link</span>
								</button>
							</div>

							<div v-if="result" class="flex flex-col min-w-0">
								<div v-if="result.url" class="p-3 border rounded flex flex-col items-center mt-1 min-w-0">
									<code class="max-w-full break-all">{{ result.url }}</code>
									<div class="flex flex-wrap gap-2 mt-2">
										<button class="btn btn-secondary" @click="copyLink">Copy</button>
										<button class="btn btn-primary" @click="openInBrowser">Open</button>
									</div>
								</div>
							</div>
						</div>
					</template>
				</CardContainer>

				<div class="button-group-row col-span-1 min-w-0">
					<button @click="goBack" class="btn btn-danger justify-start">
						Return to Dashboard
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import FolderPicker from '../components/FolderPicker.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import LinkAccessMode from '../components/LinkAccessMode.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import { useHeader } from '../composables/useHeader'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { appLog } from '../composables/useLog'
import { useResilientNav } from '../composables/useResilientNav'

import type { Commenter } from '../typings/electron'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'

const { to } = useResilientNav()
useHeader('Upload Files via Link')

const { apiFetch } = useApi()
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const uploadLinkTourSteps: TourStep[] = [
	{
		target: '[data-tour="upload-link-heading"]',
		message: 'Welcome to Upload Link creation!\n\nThis page lets you create a shareable link that others can use to upload files directly to a folder on your server.',
	},
	{
		target: '[data-tour="upload-link-folder"]',
		message: 'Pick the destination folder on the server.\n\nBrowse directories, create new folders, and switch between tree and icon view. This is where uploaded files will land when collaborators use the link.',
	},
	{
		target: '[data-tour="upload-link-expiry"]',
		message: 'Set how long the upload link stays active.\n\nUse the input fields or preset buttons (1 hour, 1 day, 1 week, Never). After expiry, no new uploads can be submitted through this link.',
	},
	{
		target: '[data-tour="upload-link-title"]',
		message: 'Give your link an optional title.\n\nThis makes it easier to identify in the link management table on the dashboard.',
	},
	{
		target: '[data-tour="upload-link-network"]',
		message: 'Choose how the link is accessed on the network.\n\n"Share Locally" creates a link accessible over your LAN. "Share Externally" creates a public link — requires port forwarding to be configured.',
	},
	{
		target: '[data-tour="upload-link-access-mode"]',
		message: 'Control who can upload through this link.\n\n• "Anyone with the link" — WARNING: anyone can upload files to your server!\n• "Anyone + password" — one shared password for all uploaders.\n• "Only invited users and groups" — each user signs in with their own account. Groups let you manage access for multiple users at once.',
	},
	{
		target: '[data-tour="upload-link-generate-btn"]',
		message: 'Once everything looks good, click here to generate the upload link.\n\nThe link appears below — copy it or open it directly. Share it with collaborators so they can upload files to your server.',
	},
]
const linkContext = { type: 'upload' as const }

const destFolderRel = ref<string>('')
const projectBase = ref<string>('')

const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const password = ref('')
const showPassword = ref(false)
const linkTitle = ref('')
const accessUsers = ref<Commenter[]>([])
const accessGroups = ref<{ id: number; name: string; member_count?: number; display_color?: string | null; role_id: number | null; role_name: string | null }[]>([])
const usePublicBase = ref(false)
const defaultUsePublicBase = ref(false)
const externalHttpsPort = ref(443)

type AccessMode = 'open' | 'open_password' | 'restricted'
const accessMode = ref<AccessMode>('open')
const defaultAccessMode = ref<AccessMode>('open')

const accessCount = computed(() => accessUsers.value.length + accessGroups.value.length)
const accessSatisfied = computed(() => accessMode.value !== 'restricted' || accessCount.value > 0)
const passwordRequired = computed(() => accessMode.value === 'open_password' && !password.value.trim())

const UNIT_TO_SECONDS = {
	hours: 3600,
	days: 86400,
	weeks: 604800,
} as const

const expiresSec = computed(() => {
	const raw = Math.floor(expiresValue.value || 0)
	if (raw <= 0) return 0
	return raw * UNIT_TO_SECONDS[expiresUnit.value]
})

function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
	expiresValue.value = v
	expiresUnit.value = u
}

function setNever() {
	expiresValue.value = 0
	expiresUnit.value = 'hours'
}

async function loadLinkDefaults() {
	try {
		const s = await apiFetch('/api/settings', { method: 'GET' })
		const isInternal = s?.defaultLinkAccess === 'internal'
		defaultUsePublicBase.value = !isInternal
		usePublicBase.value = defaultUsePublicBase.value
		externalHttpsPort.value = Number(s?.externalHttpsPort ?? 443)

		const defaultRestrict = typeof s?.defaultRestrictAccess === 'boolean' ? s.defaultRestrictAccess : false
		defaultAccessMode.value = defaultRestrict ? 'restricted' : 'open'

		accessMode.value = defaultAccessMode.value
	} catch {
		defaultUsePublicBase.value = false
		usePublicBase.value = false
		defaultAccessMode.value = 'open'
		accessMode.value = defaultAccessMode.value
	}
}

let linkDefaultsLoaded = false
watch(usePublicBase, (isExternal) => {
	if (isExternal && linkDefaultsLoaded) {
		const port = externalHttpsPort.value || 443
		pushNotification(
			new Notification(
				'Port Forwarding Required',
				`External sharing requires port forwarding to your configured HTTPS port (${port}). You can change this port in Settings → URLs & Access.`,
				'info',
				8000
			)
		)
	}
})

onMounted(async () => {
	await loadLinkDefaults()
	linkDefaultsLoaded = true
	if (!onboarding.value.uploadLinkTourDone) {
		setTimeout(() => {
			requestTour('upload-link', uploadLinkTourSteps, () => markDone('uploadLinkTourDone'))
		}, 500)
	}
})

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<null | { url: string; code?: string; password?: boolean; expiresAt?: string }>(null)

const canGenerate = computed(() =>
	!!destFolderRel.value &&
	!passwordRequired.value &&
	accessSatisfied.value
)

async function generateLink() {
	if (!canGenerate.value) {
		pushNotification(
			new Notification(
				'Cannot Generate Link',
				'Pick a destination folder on the server and fix access settings before generating an upload link.',
				'denied',
				8000,
			),
		)
		return
	}

	if (passwordRequired.value) {
		pushNotification(
			new Notification(
				'Password Required',
				'Enter a password or switch access mode.',
				'warning',
				8000,
			),
		)
		return
	}

	loading.value = true
	error.value = null
	result.value = null

	try {
		const body: any = {
			path: '/' + destFolderRel.value.replace(/^\/+/, ''),
			kind: 'folder',
			allowUpload: true,
			expiresIn: Number(expiresSec.value) || 0,
			title: linkTitle.value || undefined,
			baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
			access_mode: accessMode.value === 'restricted' ? 'restricted' : 'open',
			auth_mode: accessMode.value === 'open_password' ? 'password' : 'none',
		}

		if (accessMode.value === 'open_password') {
			body.password = password.value.trim()
		}

		if (accessMode.value === 'restricted' && accessUsers.value.length) {
			body.users = accessUsers.value.map((c: any) => {
				const out: any = {}
				if (c.id != null) out.userId = c.id
				if (c.username) out.username = c.username
				if (c.user_email) out.user_email = c.user_email
				if (c.name) out.name = c.name
				if (c.role_id != null) out.roleId = c.role_id
				if (c.role_name) out.roleName = c.role_name
				return out
			})
		}

		if (accessMode.value === 'restricted' && accessGroups.value.length) {
			body.groups = accessGroups.value.map(g => ({
				groupId: g.id,
				roleId: g.role_id,
				rolleName: g.role_name,
			}))
		}

		// console.log('[create-upload-link] request body', JSON.stringify(body))
		const resp = await apiFetch('/api/create-upload-link', {
			method: 'POST',
			body: JSON.stringify(body),
		})

		if (!resp?.url) throw new Error(resp?.error || 'Failed to create link')

		result.value = {
			url: resp.url,
			code: resp.code,
			password: accessMode.value === 'open_password',
			expiresAt: resp.expiresAt,
		}

		appLog.info('upload_link.created', { dest: destFolderRel.value, mode: usePublicBase.value ? 'external' : 'local', accessMode: accessMode.value })

		const modeLabel = usePublicBase.value ? 'external (Internet)' : 'local (LAN)'

		pushNotification(
			new Notification(
				'Upload Link Created',
				`An ${modeLabel} upload link was created for “/${destFolderRel.value.replace(/^\/+/, '')}”.`,
				'success',
				8000,
			),
		)
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		const level: 'error' | 'denied' = /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'
		error.value = msg
		appLog.error('upload_link.create_failed', { error: msg })
		pushNotification(new Notification('Failed to Create Upload Link', msg, level, 8000))
	} finally {
		loading.value = false
	}
}

function resetAll() {
	destFolderRel.value = ''
	expiresValue.value = 7
	expiresUnit.value = 'days'
	password.value = ''
	showPassword.value = false
	linkTitle.value = ''
	accessUsers.value = []
	accessGroups.value = []
	accessMode.value = defaultAccessMode.value
	result.value = null
	error.value = null
	usePublicBase.value = defaultUsePublicBase.value
}

async function copyLink() {
	if (!result.value) return
	await navigator.clipboard.writeText(result.value.url)
	appLog.info('upload_link.copied')
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000, 'clipboard-copy'))
}

function openInBrowser() {
	if (!result.value?.url) return
	window.open(result.value.url, '_blank')
	pushNotification(new Notification('Opening Link', 'Upload link opened in your default browser.', 'info', 4000))
}

function goBack() {
	to('dashboard')
}

watch(accessMode, (mode) => {
	if (mode !== 'open_password') {
		password.value = ''
		showPassword.value = false
	}
})

watch(
	accessUsers,
	(arr) => {
		if (arr.length > 0 && accessMode.value !== 'restricted') accessMode.value = 'restricted'
	},
	{ deep: true },
)

const userModalOpen = ref(false)

function openUserModal() {
	userModalOpen.value = true
}

function makeKey(name?: string, user_email?: string, username?: string) {
	const u = (username ?? '').trim().toLowerCase()
	const e = (user_email ?? '').trim().toLowerCase()
	const n = (name ?? '').trim().toLowerCase()
	return (u || n) + '|' + e
}

function onApplyUsers(users: any[], groups?: any[]) {
	const next = users.map((u: any) => {
		const username = (u.username || '').trim()
		const name = (u.name || username).trim()
		const user_email = u.user_email?.trim() || undefined
		const display_color = u.display_color
		const key = makeKey(name, user_email, username)
		return {
			key,
			id: u.id,
			username,
			name,
			user_email,
			display_color,
			role_id: u.role_id ?? null,
			role_name: u.role_name ?? null,
		}
	})

	const seen = new Set<string>()
	const dedup: typeof next = []
	for (const c of next) {
		if (seen.has(c.key)) continue
		seen.add(c.key)
		dedup.push(c)
	}

	accessUsers.value = dedup
	accessGroups.value = groups || []
}
</script>
