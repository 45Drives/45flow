<template>
	<CardContainer class="dashboard-shell overflow-y-auto h-full min-h-0">
		<template #header>
			<div class="dashboard-top">
				<div class="dashboard-intro">
					<h2 class="dashboard-title">Control Center</h2>
					<p class="dashboard-subtitle">Create links, monitor activity, and manage access from one place.</p>
				</div>

				<div class="dashboard-utility button-group-row">
					<button @click="goToManageUsers" data-tour="manage-users" class="btn btn-secondary px-5 py-2.5">Manage Users</button>
					<button @click="goToLogs" data-tour="view-logs" class="btn btn-secondary px-5 py-2.5">View Logs</button>
					<button @click="goToSettings" data-tour="settings" class="btn btn-secondary px-5 py-2.5">Settings</button>
					<!-- <button @click="openUserGuide" class="btn btn-secondary px-5 py-2.5">User Guide</button> -->
				</div>
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

		<template #footer>
			<div class="dashboard-footer">
				<button @click="leaveServer" data-tour="logout" class="btn btn-danger px-6 py-2.5 rounded-md">
					Log Out
				</button>
			</div>
		</template>
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
import { ref, onMounted } from 'vue'
import { useApi } from '../composables/useApi'
import { useTransferProgress } from '../composables/useTransferProgress'
import { clearLastSession } from '../composables/useSessionPersistence'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import { tourQuickShareOpen, tourQuickShareStep, tourQuickShareShowDone } from '../composables/useQuickShareTour'

useHeader('Dashboard')
const { to } = useResilientNav()
const { apiFetch } = useApi()
const transfer = useTransferProgress()
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

/** When true, ManageLinks shows demo rows so the tour can highlight them */
const tourShowDemoLinks = ref(false)

/** Cleanup helper — reset all Quick Share tour state */
function cleanupQuickShareTour() {
	tourQuickShareShowDone.value = false
	tourQuickShareStep.value = 1
	tourQuickShareOpen.value = false
}

const dashboardTourSteps: TourStep[] = [
	// ── Welcome + Quick Share introduction ──────────────────────
	{
		target: '[data-tour="flow-logo"]',
		message: 'Welcome to 45Flow!\n\nTip: You can drag and drop files anywhere onto the app to open Quick Share — the fastest way to upload and share files. (Drag-and-drop is disabled while the Local Upload Wizard is open — drop files directly into its file table instead.)\n\nLet\'s walk through Quick Share first, then explore the rest of the dashboard.',
	},
	// ── Quick Share Step 1: Modal overview ──
	{
		target: '[data-tour="qs-modal"]',
		message: 'This is the Quick Share screen.\n\nWhen you drop files onto 45Flow from most screens, this wizard opens automatically. It walks you through uploading files to the server and generating a share link — all in three quick steps.\n\nThe file list at the top shows what you dropped. Here we\'re using a sample file for the tour.',
		beforeShow: () => {
			tourQuickShareStep.value = 1
			tourQuickShareShowDone.value = false
			tourQuickShareOpen.value = true
		},
	},
	// ── Quick Share Step 1: Step indicator ──
	{
		target: '[data-tour="qs-steps"]',
		message: 'The step indicator shows your progress.\n\nStep 1 is Destination — choose where on the server to upload. Step 2 is Link Options — set expiry, access, and video settings. Step 3 is Upload & Share — monitor the upload and grab your link.',
		beforeShow: () => {
			tourQuickShareStep.value = 1
			tourQuickShareOpen.value = true
		},
	},
	// ── Quick Share Step 1: Destination picker ──
	{
		target: '[data-tour="qs-step-destination"]',
		message: 'In Step 1, you pick a destination folder on the server.\n\nUse the folder browser to navigate your project directories. Once you\'ve selected a folder, click Next to continue.',
		beforeShow: () => {
			tourQuickShareStep.value = 1
			tourQuickShareOpen.value = true
		},
	},
	// ── Quick Share Step 2: Link Options overview ──
	{
		target: '[data-tour="qs-step-options"]',
		message: 'Step 2 is where you configure your share link before uploading.\n\nLet\'s walk through each option.',
		beforeShow: () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
		},
	},
	// ── Quick Share Step 2: Expiry ──
	{
		target: '[data-tour="qs-expiry"]',
		message: 'Set how long the link stays active.\n\nType a custom value or use the quick presets — 1 hour, 1 day, 1 week, or Never for a permanent link.',
		beforeShow: () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
		},
	},
	// ── Quick Share Step 2: Network ──
	{
		target: '[data-tour="qs-network"]',
		message: 'Choose the network for your share link.\n\nLocal (LAN) generates an internal URL for your network. External (Internet) uses your public domain or IP so anyone outside your network can access it.',
		beforeShow: () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
		},
	},
	// ── Quick Share Step 2: Advanced Options ──
	{
		target: '[data-tour="qs-advanced-panel"]',
		message: 'The Advanced Options panel gives you finer control over your link.\n\nLet\'s go through each setting.',
		beforeShow: async () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
			// Open the disclosure if it's closed
			await new Promise(r => setTimeout(r, 100))
			const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
			const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
			if (btn && !panel) btn.click()
		},
	},
	// ── Quick Share Step 2: Link Title ──
	{
		target: '[data-tour="qs-link-title"]',
		message: 'Give your link a descriptive title.\n\nThis is optional but helps you identify the link later in the dashboard.',
		beforeShow: async () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
			await new Promise(r => setTimeout(r, 100))
			const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
			const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
			if (btn && !panel) btn.click()
		},
	},
	// ── Quick Share Step 2: Access Mode ──
	{
		target: '[data-tour="qs-access-mode"]',
		message: 'Control who can access your shared files.\n\n• Anyone with the link — no sign-in needed.\n• Password protected — recipients enter a shared password.\n• Invited users only — only specific user accounts can access it.\n\nComments can be toggled for open and password-protected links.',
		beforeShow: async () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
			await new Promise(r => setTimeout(r, 100))
			const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
			const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
			if (btn && !panel) btn.click()
		},
	},
	// ── Quick Share Step 2: Video Options ──
	{
		target: '[data-tour="qs-video-options"]',
		message: 'When sharing video files, two things happen automatically:\n\n• A browser stream is created so recipients can watch immediately — no download needed.\n• Review copies (720p, 1080p, or full-res MP4s) are generated for offline download and editing.\n\nWith client-side transcoding enabled (Settings → Performance), video processing happens on your machine before upload — using your local CPU or GPU. This is faster for most workstations and reduces server load. If disabled, the server processes videos after upload.\n\nYou can also overlay a watermark on review copies to protect your content.',
		beforeShow: async () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 2
			await new Promise(r => setTimeout(r, 100))
			const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
			const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
			if (btn && !panel) btn.click()
		},
	},
	// ── Quick Share Step 3: Upload & Share (done state) ──
	{
		target: '[data-tour="qs-step-upload"]',
		message: 'Step 3 handles the upload and link generation.\n\nYou\'ll see per-file progress bars while files transfer, then your share link appears with Copy and Open buttons. That\'s it — Quick Share in three steps!',
		beforeShow: () => {
			tourQuickShareOpen.value = true
			tourQuickShareStep.value = 3
			tourQuickShareShowDone.value = true
		},
	},
	// ── Close Quick Share, return to dashboard ──
	{
		target: '[data-tour="action-cards"]',
		message: 'Now let\'s explore the rest of the dashboard.\n\nThese are your three main actions: create a File Share Link for review, upload files directly from your workstation, or generate an Upload Link for collaborators.',
		beforeShow: () => { cleanupQuickShareTour() },
		cleanup: () => { cleanupQuickShareTour() },
	},
	// ── Normal dashboard tour continues ──────────────────────
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
		message: 'Manage Users lets you create and manage collaborator accounts.\n\nYou can assign roles, set passwords, and control which users have access to your shared links. A detailed tour will appear when you first open it.',
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
		target: '[data-tour="manage-links-toolbar"]',
		message: 'Use the toolbar to search links by title, directory, or file name.\n\nYou can also filter by link type (Upload, Share) and status (Active, Expired, Disabled). The Refresh button fetches the latest data from the server.',
		beforeShow: () => { tourShowDemoLinks.value = true },
	},
	{
		target: '[data-tour="manage-links-table"]',
		message: 'The table shows all your links at a glance.\n\nEach row displays the link\'s title, type, sharing mode (Original or Review Copy), a short URL you can copy, expiry countdown, status badge, access mode, creation date, and action buttons.\n\nClick any column header to sort. These are example links for the tour — your real links will appear here.',
		beforeShow: () => { tourShowDemoLinks.value = true },
	},
	{
		target: '[data-tour="manage-links-actions"]',
		message: 'Each link has three action buttons:\n\n• Details — opens a full modal with all link settings, access logs, file lists, and version management.\n• Open — opens the link in a new browser tab (disabled when the link is disabled).\n• Disable/Enable — toggles the link on or off without deleting it.',
		beforeShow: () => { tourShowDemoLinks.value = true },
		cleanup: () => { tourShowDemoLinks.value = false },
	},
	{
		target: '[data-tour="logout"]',
		message: 'When you\'re done, click Log Out to disconnect from the server.\n\nThat\'s the tour! You\'re all set to start using 45Flow.',
		placement: 'top',
		cleanup: () => { tourShowDemoLinks.value = false },
	},
]

// Restore any active transcodes from the server (survives logout/app restart)
// Also restore persisted uploads (detached rsync that survived app closure)
onMounted(() => {
	transfer.restoreActiveTranscodes(apiFetch)
	transfer.restorePersistedUploads()

	if (!onboarding.value.dashboardTourDone) {
		setTimeout(() => {
			requestTour('dashboard', dashboardTourSteps, () => markDone('dashboardTourDone'))
		}, 500)
	}
})

const leaveServer = () => {
	clearLastSession()
	to('server-selection');
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
