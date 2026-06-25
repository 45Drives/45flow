// src/renderer/composables/useLinkOptions.ts
// Shared link-option state & helpers extracted from CreateLinkView and QuickShareOverlay.

import { ref, computed, watch, type Ref } from 'vue'
import { useApi } from './useApi'
import { Notification } from '@45drives/houston-common-ui'
import { pushNotification } from './useNotificationQueue'
import type { Commenter } from '../typings/electron'

export type AccessMode = 'open' | 'open_password' | 'restricted'
export type ExpiresUnit = 'hours' | 'days' | 'weeks'

export interface AccessGroup {
	id: number
	name: string
	member_count?: number
	display_color?: string | null
	role_id: number | null
	role_name: string | null
}

export interface LinkOptionsState {
	// Expiry
	expiresValue: Ref<number>
	expiresUnit: Ref<ExpiresUnit>
	expiresSec: Ref<number>
	setPreset: (v: number, u: ExpiresUnit) => void
	setNever: () => void

	// Title
	linkTitle: Ref<string>

	// Network
	usePublicBase: Ref<boolean>
	externalHttpsPort: Ref<number>

	// Access control
	accessMode: Ref<AccessMode>
	password: Ref<string>
	showPassword: Ref<boolean>
	allowOpenComments: Ref<boolean>
	accessUsers: Ref<Commenter[]>
	accessGroups: Ref<AccessGroup[]>
	accessCount: Ref<number>
	accessSatisfied: Ref<boolean>
	passwordRequired: Ref<boolean>

	// Capabilities (for combined links)
	uploadEnabled: Ref<boolean>
	shareEnabled: Ref<boolean>

	// Project
	projectId: Ref<number | null>

	// Defaults
	defaultUsePublicBase: Ref<boolean>
	defaultAccessMode: Ref<AccessMode>
	defaultAllowOpenComments: Ref<boolean>

	// Loading
	loadLinkDefaults: () => Promise<void>
	linkDefaultsLoaded: Ref<boolean>

	// Reset
	resetOptions: () => void

	// Body builder — builds the common options portion of any link request body
	buildOptionsBody: () => Record<string, any>
}

const UNIT_TO_SECONDS = {
	hours: 3600,
	days: 86400,
	weeks: 604800,
} as const

export function useLinkOptions(): LinkOptionsState {
	const { apiFetch } = useApi()

	// ── Expiry ──
	const expiresValue = ref(1)
	const expiresUnit = ref<ExpiresUnit>('days')

	const expiresSec = computed(() => {
		const raw = Math.floor(expiresValue.value || 0)
		if (raw <= 0) return 0
		return raw * UNIT_TO_SECONDS[expiresUnit.value]
	})

	function setPreset(v: number, u: ExpiresUnit) {
		expiresValue.value = v
		expiresUnit.value = u
	}

	function setNever() {
		expiresValue.value = 0
		expiresUnit.value = 'hours'
	}

	// ── Title ──
	const linkTitle = ref('')

	// ── Network ──
	const usePublicBase = ref(false)
	const defaultUsePublicBase = ref(false)
	const externalHttpsPort = ref(443)

	// ── Access control ──
	const accessMode = ref<AccessMode>('open')
	const defaultAccessMode = ref<AccessMode>('open')
	const password = ref('')
	const showPassword = ref(false)
	const allowOpenComments = ref(true)
	const defaultAllowOpenComments = ref(true)
	const accessUsers = ref<Commenter[]>([])
	const accessGroups = ref<AccessGroup[]>([])

	const accessCount = computed(() => accessUsers.value.length + accessGroups.value.length)
	const accessSatisfied = computed(() => accessMode.value !== 'restricted' || accessCount.value > 0)
	const passwordRequired = computed(() => accessMode.value === 'open_password' && !password.value.trim())

	// ── Capabilities ──
	const uploadEnabled = ref(true)
	const shareEnabled = ref(true)

	// ── Project ──
	const projectId = ref<number | null>(null)

	// ── Defaults loading ──
	const linkDefaultsLoaded = ref(false)

	async function loadLinkDefaults() {
		try {
			const s = await apiFetch('/api/settings', { method: 'GET' })
			const isInternal = s?.defaultLinkAccess === 'internal'
			defaultUsePublicBase.value = !isInternal
			usePublicBase.value = defaultUsePublicBase.value
			externalHttpsPort.value = Number(s?.externalHttpsPort ?? 443)

			const defaultRestrict = typeof s?.defaultRestrictAccess === 'boolean' ? s.defaultRestrictAccess : false
			defaultAccessMode.value = defaultRestrict ? 'restricted' : 'open'
			defaultAllowOpenComments.value =
				typeof s?.defaultAllowComments === 'boolean' ? s.defaultAllowComments : true

			accessMode.value = defaultAccessMode.value
			allowOpenComments.value = defaultAllowOpenComments.value
		} catch {
			defaultUsePublicBase.value = false
			usePublicBase.value = false
			defaultAccessMode.value = 'open'
			defaultAllowOpenComments.value = true
			accessMode.value = 'open'
			allowOpenComments.value = true
		}
		linkDefaultsLoaded.value = true
	}

	// ── Port forwarding notification ──
	watch(usePublicBase, (isExternal) => {
		if (isExternal && linkDefaultsLoaded.value) {
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

	// ── Reset ──
	function resetOptions() {
		expiresValue.value = 1
		expiresUnit.value = 'days'
		linkTitle.value = ''
		usePublicBase.value = defaultUsePublicBase.value
		accessMode.value = defaultAccessMode.value
		allowOpenComments.value = defaultAllowOpenComments.value
		password.value = ''
		showPassword.value = false
		accessUsers.value = []
		accessGroups.value = []
		uploadEnabled.value = true
		shareEnabled.value = true
		projectId.value = null
	}

	// ── Body builder ──
	function buildOptionsBody(): Record<string, any> {
		const body: Record<string, any> = {
			expiresIn: Number(expiresSec.value) || 0,
			title: linkTitle.value || undefined,
			baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
			access_mode: accessMode.value === 'restricted' ? 'restricted' : 'open',
			auth_mode: accessMode.value === 'open_password' ? 'password' : 'none',
			uploadEnabled: uploadEnabled.value,
			shareEnabled: shareEnabled.value,
		}

		if (projectId.value) {
			body.projectId = projectId.value
		}

		if (accessMode.value === 'open' || accessMode.value === 'open_password') {
			body.allowComments = allowOpenComments.value
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
				roleName: g.role_name,
			}))
		}

		return body
	}

	return {
		expiresValue,
		expiresUnit,
		expiresSec,
		setPreset,
		setNever,
		linkTitle,
		usePublicBase,
		externalHttpsPort,
		accessMode,
		password,
		showPassword,
		allowOpenComments,
		accessUsers,
		accessGroups,
		accessCount,
		accessSatisfied,
		passwordRequired,
		uploadEnabled,
		shareEnabled,
		projectId,
		defaultUsePublicBase,
		defaultAccessMode,
		defaultAllowOpenComments,
		linkDefaultsLoaded,
		loadLinkDefaults,
		resetOptions,
		buildOptionsBody,
	}
}
