<template>
	<CardContainer class="dashboard-shell overflow-y-auto h-full min-h-0">
		<template #header>
			<div class="dashboard-top">
				<div class="dashboard-intro">
					<h2 class="dashboard-title">Control Center</h2>
					<p class="dashboard-subtitle">Create links, monitor activity, and manage access from one place.</p>
				</div>

				<div class="dashboard-utility button-group-row">
					<button @click="goToManageUsers" data-tour="manage-users" class="btn btn-secondary px-5 py-2.5">Manage Access</button>
					<button @click="goToLogs" data-tour="view-logs" class="btn btn-secondary px-5 py-2.5">View Logs</button>
					<button @click="goToSettings" data-tour="settings" class="btn btn-secondary px-5 py-2.5">Settings</button>
					<button @click="leaveServer" class="btn btn-danger px-5 py-2.5">Log Out</button>
					<!-- <button @click="openUserGuide" class="btn btn-secondary px-5 py-2.5">User Guide</button> -->
				</div>
			</div>

			<div v-if="showUnlicensedBanner" class="dashboard-license-banner">
				<div class="dashboard-license-copy">
					{{ unlicensedBannerMessage }}
				</div>
				<button type="button" class="btn btn-secondary h-fit" @click="goToSettings">Open Settings</button>
			</div>

			<div class="dashboard-actions" data-tour="action-cards">
				<button @click="goToShareFiles" class="btn btn-primary dashboard-action" data-tour="new-share-link">
					<span class="dashboard-action-title">New File Share Link</span>
					<span class="dashboard-action-copy">Generate a secure download or review link.</span>
				</button>
				<button @click="goToUploadFiles" class="btn btn-primary dashboard-action" data-tour="upload-files">
					<span class="dashboard-action-title">Upload Files Locally</span>
					<span class="dashboard-action-copy">Send files from this workstation to the server.</span>
				</button>
				<button @click="goToLinkUploadPanel" class="btn btn-primary dashboard-action" data-tour="new-upload-link">
					<span class="dashboard-action-title">New Upload Link</span>
					<span class="dashboard-action-copy">Create an intake link for collaborators.</span>
				</button>
			</div>
		</template>

		<div class="dashboard-links-wrap" data-tour="manage-links">
			<ManageLinks :tourActive="tourShowDemoLinks"/>
		</div>
	</CardContainer>
	<SettingsModal v-if="showSettings" @close="showSettings = false" />
	<LogViewModal v-if="showLogs" @close="showLogs = false" />
	<AddUsersModal v-model="usersModalOpen" :apiFetch="apiFetch" />

</template>

<script setup lang="ts">
import { CardContainer } from '@45drives/houston-common-ui'
import { useHeader } from '../composables/useHeader'
import { useResilientNav } from '../composables/useResilientNav'
import ManageLinks from './ManageLinks.vue'
import SettingsModal from '../components/modals/SettingsModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import LogViewModal from '../components/modals/LogViewModal.vue'
// import { Cog6ToothIcon } from '@heroicons/vue/24/solid'
import { ref, onMounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import { useTransferProgress } from '../composables/useTransferProgress'
import { clearLastSession } from '../composables/useSessionPersistence'
import { useConnections } from '../composables/useConnections'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'

useHeader('Dashboard')
const { to } = useResilientNav()
const { apiFetch } = useApi()
const transfer = useTransferProgress()
const { activeConnection, updateConnection } = useConnections()
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()
const showUnlicensedBanner = ref(false)
const unlicensedBannerMessage = ref('')

async function refreshActiveConnectionLicenseStatus() {
	const conn = activeConnection.value
	if (!conn?.baseUrl || !conn?.token) {
		showUnlicensedBanner.value = false
		unlicensedBannerMessage.value = ''
		return
	}

	try {
		const res = await fetch(`${conn.baseUrl}/api/license/status`, {
			headers: { 'Authorization': `Bearer ${conn.token}` },
		})
		if (!res.ok) {
			showUnlicensedBanner.value = false
			unlicensedBannerMessage.value = ''
			return
		}
		const body = await res.json().catch(() => null)
		if (!body?.ok) {
			showUnlicensedBanner.value = false
			unlicensedBannerMessage.value = ''
			return
		}

		updateConnection(conn.connectionId, {
			licensed: !!body.licensed,
			licenseCheckedAt: Date.now(),
		})

		if (body.enforcement && !body.licensed) {
			showUnlicensedBanner.value = true
			unlicensedBannerMessage.value =
				`Connected to ${conn.name || conn.serverIp}, but the server license is not active. Premium features are disabled until re-activated.`
		} else {
			showUnlicensedBanner.value = false
			unlicensedBannerMessage.value = ''
		}
	} catch {
		showUnlicensedBanner.value = false
		unlicensedBannerMessage.value = ''
	}
}

/** When true, ManageLinks shows demo rows so the tour can highlight them */
const tourShowDemoLinks = ref(false)

const dashboardTourSteps: TourStep[] = [
	// ── Welcome ──────────────────────
	{
		target: '[data-tour="flow-logo"]',
		message: 'Welcome to 45Flow!\n\nTip: You can drag and drop files anywhere onto the app to open Quick Share — the fastest way to upload and share files. A guided tour of Quick Share will appear the first time you drop a file.\n\nLet\'s explore the dashboard.',
		beforeShow: () => { transfer.setOpen(false) }, // Close transfer dock if open
	},
	// ── Multi-Server Features ──────────────────────
	{
		target: '[data-tour="connection-switcher"]',
		message: 'This is your Active Server selector.\n\n45Flow can connect to multiple servers at once. The server shown here is where your actions will take effect — creating links, uploading files, managing users, etc.\n\nClick the dropdown to switch between connected servers or add new ones.',
	},
	// ── Dashboard actions ──────────────────────
	{
		target: '[data-tour="action-cards"]',
		message: 'These are your three main actions: create a File Share Link for review, upload files directly from your workstation, or generate an Upload Link for collaborators.',
	},
	{
		target: '[data-tour="new-share-link"]',
		message: 'Click here to create a new File Share Link.\n\nYou\'ll select files from your server, set an expiry, and choose access controls. Recipients get a secure link to view and download the files.',
	},
	{
		target: '[data-tour="upload-files"]',
		message: 'Upload Files Locally lets you transfer files from this computer directly to the server.\n\nA step-by-step wizard walks you through selecting files (or drag-and-drop them), choosing a destination folder, and monitoring the upload. When client-side transcoding is enabled, video files are processed on your machine first (Transcode → Upload).',
	},
	{
		target: '[data-tour="new-upload-link"]',
		message: 'New Upload Link creates a shareable link that others can use to upload files to a specific folder on your server.\n\nGreat for collecting media from collaborators.',
	},
	{
		target: '[data-tour="manage-users"]',
		message: 'Manage Users lets you create and manage collaborator accounts and groups.\n\nYou can assign roles, set passwords, and control which users and groups have access to your shared links. A detailed tour will appear when you first open it.',
	},
	{
		target: '[data-tour="view-logs"]',
		message: 'View Logs opens the client log viewer — useful for troubleshooting or tracking link usage.\n\nFilter by level, search events, and expand entries for details.',
	},
	{
		target: '[data-tour="settings"]',
		message: 'Settings lets you configure external/internal URLs, default link options, project roots, and maintenance cleanup.\n\nYou can also re-enable all guided tours from Settings → Guides.',
	},
	{
		target: '[data-tour="manage-links"]',
		message: 'This is your link management table.\n\nAll your share and upload links appear here. You can search, filter by type or status, edit titles, copy links, enable/disable access, and view details.\n\nLet\'s walk through the key features with some example links.',
		beforeShow: () => { tourShowDemoLinks.value = true },
	},
	{
		target: '[data-tour="server-filter"]',
		message: 'The "Show links from" filter lets you view links from all connected servers at once, or filter to just one server.\n\nWhen viewing "All Servers", links are aggregated and each row shows which server it belongs to. This is useful for managing links across multiple servers from one view.',
		beforeShow: () => { tourShowDemoLinks.value = true },
	},
	{
		target: '[data-tour="manage-links-toolbar"]',
		message: 'Use the toolbar to search links by title, directory, or file name.\n\nYou can also filter by link type (Upload, Share) and status (Active, Expired, Disabled). The Refresh button fetches the latest data from all filtered servers.',
		beforeShow: () => { tourShowDemoLinks.value = true },
	},
	{
		target: '[data-tour="manage-links-table"]',
		message: 'The table shows all your links at a glance.\n\nEach row displays the link\'s title, type, a short URL you can copy, expiry countdown, status badge, access mode, creation date, server name/IP, and action buttons.\n\nWhen viewing links from multiple servers, the Server column shows which server each link belongs to. Click any column header to sort. These are example links for the tour — your real links will appear here.',
		beforeShow: () => { tourShowDemoLinks.value = true },
	},
	{
		target: '[data-tour="manage-links-actions"]',
		message: 'Each link has three action buttons:\n\n• Details — opens a full modal with all link settings, access logs, file lists, and version management.\n• Open — opens the link in a new browser tab (disabled when the link is disabled).\n• Disable/Enable — toggles the link on or off without deleting it.',
		beforeShow: () => { tourShowDemoLinks.value = true },
		cleanup: () => { tourShowDemoLinks.value = false },
	},
]

// Restore any active transcodes from the server (survives logout/app restart)
// Also restore persisted uploads (detached rsync that survived app closure)
onMounted(() => {
	transfer.restoreActiveTranscodes(apiFetch)
	transfer.restorePersistedUploads()
	void refreshActiveConnectionLicenseStatus()

	if (!onboarding.value.dashboardTourDone) {
		setTimeout(() => {
			requestTour('dashboard', dashboardTourSteps, () => markDone('dashboardTourDone'))
		}, 500)
	}
})

watch(() => activeConnection.value?.connectionId, () => {
	void refreshActiveConnectionLicenseStatus()
})

const leaveServer = () => {
	// Mark the active connection as disconnected
	if (activeConnection.value) {
		updateConnection(activeConnection.value.connectionId, {
			status: 'disconnected',
			lastError: 'User logged out'
		})
	}
	clearLastSession()
	to('server-selection')
}

const showSettings = ref(false);
const goToSettings = () => {
	showSettings.value = true;
}

const showLogs = ref(false);
const goToLogs = () => {
	showLogs.value = true;
}

const usersModalOpen = ref(false);
const goToManageUsers = () => {
	usersModalOpen.value = true;
}

const openUserGuide = () => {
	window.open('https://github.com/45Drives/45flow-premium-dev/blob/main/docs/45Flow_User_Guide.md', '_blank', 'noopener,noreferrer');
}

const goToShareFiles = () => {
	// router.push({ name: 'select-file'})
	to('select-file');
}

const goToUploadFiles = () => {
	// router.push({ name: 'upload-file'});
	to('upload-file');

}

const goToLinkUploadPanel = () => {
	// router.push({ name: 'create-upload-link' });
	to('create-upload-link');
}

</script>

<style scoped>
.dashboard-shell {
	--local-border: color-mix(in srgb, var(--btn-primary-bg) 28%, #545463);
	background: color-mix(in srgb, var(--ui-panel-bg) 0%, transparent) !important;
}

.dashboard-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem;
	justify-content: space-between;
	margin-bottom: 0.9rem;
}

.dashboard-intro {
	min-width: 0;
}

.dashboard-title {
	font-size: 1.3rem;
	line-height: 1.2;
	font-weight: 700;
}

.dashboard-subtitle {
	margin-top: 0.2rem;
	font-size: 0.9rem;
	opacity: 0.95;
}

.dashboard-utility {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.dashboard-actions {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.95rem;
}

.dashboard-license-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.65rem 0.8rem;
	margin-bottom: 0.8rem;
	border: 1px solid color-mix(in srgb, #d97706 45%, var(--local-border));
	border-radius: 0.72rem;
	background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.dashboard-license-copy {
	font-size: 0.82rem;
	line-height: 1.35;
	opacity: 0.95;
}

.dashboard-action {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	text-align: left;
	gap: 0.25rem;
	padding: 0.8rem 0.95rem;
	border: 1px solid var(--local-border);
	border-radius: 0.72rem;
}

.dashboard-action-title {
	font-size: 0.95rem;
	font-weight: 700;
	line-height: 1.25;
}

.dashboard-action-copy {
	font-size: 0.76rem;
	line-height: 1.3;
	opacity: 0.86;
}

.dashboard-links-wrap {
	border: 1px solid var(--local-border);
	border-radius: 0.85rem;
	padding: 0.45rem;
	background: color-mix(in srgb, var(--btn-primary-bg) 8%, transparent);
}

.dashboard-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

@media (max-width: 1100px) {
	.dashboard-actions {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 780px) {
	.dashboard-actions {
		grid-template-columns: minmax(0, 1fr);
	}

	.dashboard-title {
		font-size: 1.15rem;
	}
}
</style>
