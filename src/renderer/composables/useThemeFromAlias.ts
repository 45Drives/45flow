// src/renderer/composables/useThemeFromAlias.ts
import { ref, watchEffect } from 'vue'

export type Theme =
  | 'theme-homelab'
  | 'theme-professional'
  | 'theme-default'
  | 'theme-studio'
  | 'theme-studio-original-purple'
  | 'theme-studio-blue-steel'
  | 'theme-studio-grad-logo-flow'
  | 'theme-studio-grad-purple-orange'
  | 'theme-studio-grad-purple-pink-orange'
  | 'theme-studio-grad-purple-pink-blue'
  | 'theme-studio-grad-purple-blue'
  | 'theme-studio-grad-red-purple-blue'
  | 'theme-studio-grad-sunset-laser'
  | 'theme-studio-grad-neon-studio'
  | 'theme-studio-slate'
  | 'theme-studio-ocean'
  | 'theme-studio-grad-moon-mist'
  | 'theme-studio-grad-pink-orange'
  | 'theme-studio-grad-red-blue-green'
  | 'theme-studio-grad-red-orange-yellow'
  | 'theme-studio-grad-yellow-orange-red'
  | 'theme-studio-grad-orange-pink'
  | 'theme-studio-grad-electric-violet'
  | 'theme-studio-grad-infrared'
  | 'theme-studio-grad-chrome'
  | 'theme-studio-grad-aurora'
  | 'theme-studio-grad-coral-reef'
  | 'theme-studio-grad-plasma'
  | 'theme-studio-grad-enterprise'
  | 'theme-studio-grad-professional'
  | 'theme-studio-grad-homelab'
type Division = 'studio' | 'homelab' | 'professional' | 'default'

const aliasToTheme: Record<string, Theme> = {
  homelab: 'theme-homelab',
  professional: 'theme-professional',
  default: 'theme-default',
  studio: 'theme-studio',
}

const themeToDivision: Record<Theme, Division> = {
  'theme-homelab': 'homelab',
  'theme-professional': 'professional',
  'theme-studio-blue-steel': 'studio',
  'theme-studio': 'studio',
  'theme-studio-original-purple': 'studio',
  'theme-studio-grad-logo-flow': 'studio',
  'theme-studio-grad-purple-orange': 'studio',
  'theme-studio-grad-purple-pink-orange': 'studio',
  'theme-studio-grad-purple-pink-blue': 'studio',
  'theme-studio-grad-purple-blue': 'studio',
  'theme-studio-grad-red-purple-blue': 'studio',
  'theme-studio-grad-sunset-laser': 'studio',
  'theme-studio-grad-neon-studio': 'studio',
  'theme-studio-slate': 'studio',
  'theme-studio-ocean': 'studio',
  'theme-studio-grad-moon-mist': 'studio',
  'theme-studio-grad-pink-orange': 'studio',
  'theme-studio-grad-red-blue-green': 'studio',
  'theme-studio-grad-red-orange-yellow': 'studio',
  'theme-studio-grad-yellow-orange-red': 'studio',
  'theme-studio-grad-orange-pink': 'studio',
  'theme-studio-grad-electric-violet': 'studio',
  'theme-studio-grad-infrared': 'studio',
  'theme-studio-grad-chrome': 'studio',
  'theme-studio-grad-aurora': 'studio',
  'theme-studio-grad-coral-reef': 'studio',
  'theme-studio-grad-plasma': 'studio',
  'theme-studio-grad-enterprise': 'default',
  'theme-studio-grad-professional': 'professional',
  'theme-studio-grad-homelab': 'homelab',
  'theme-default': 'default'
}

const STORAGE_KEY = '45flow-theme-v1'
const THEME_UNLOCK_KEY = '45flow-theme-unlock-v1'
// const FORCED_THEME: Theme = 'theme-studio-grad-purple-pink-orange'
const FORCED_THEME: Theme = 'theme-studio-grad-logo-flow'
function isTheme(value: string): value is Theme {
  return [
    'theme-default',
    'theme-homelab',
    'theme-professional',
    'theme-studio-blue-steel',
    'theme-studio',
    'theme-studio-original-purple',
    'theme-studio-grad-logo-flow',
    'theme-studio-grad-purple-orange',
    'theme-studio-grad-purple-pink-orange',
    'theme-studio-grad-purple-pink-blue',
    'theme-studio-grad-purple-blue',
    'theme-studio-grad-red-purple-blue',
    'theme-studio-grad-sunset-laser',
    'theme-studio-grad-neon-studio',
    'theme-studio-slate',
    'theme-studio-ocean',
    'theme-studio-grad-moon-mist',
    'theme-studio-grad-pink-orange',
    'theme-studio-grad-red-blue-green',
    'theme-studio-grad-red-orange-yellow',
    'theme-studio-grad-yellow-orange-red',
    'theme-studio-grad-orange-pink',
    'theme-studio-grad-electric-violet',
    'theme-studio-grad-infrared',
    'theme-studio-grad-chrome',
    'theme-studio-grad-aurora',
    'theme-studio-grad-coral-reef',
    'theme-studio-grad-plasma',
    'theme-studio-grad-enterprise',
    'theme-studio-grad-professional',
    'theme-studio-grad-homelab',
  ].includes(value)
}

function loadStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'theme-studio-grad-logo-flow') return 'theme-studio-grad-logo-flow'
    return raw && isTheme(raw) ? raw : null
  } catch {
    return null
  }
}

function saveStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // no-op
  }
}

function loadThemeUnlockState() {
  try {
    return window.localStorage.getItem(THEME_UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

function saveThemeUnlockState(unlocked: boolean) {
  try {
    window.localStorage.setItem(THEME_UNLOCK_KEY, unlocked ? '1' : '0')
  } catch {
    // no-op
  }
}

const themeControlsUnlocked = ref<boolean>(loadThemeUnlockState())
const currentTheme = ref<Theme>(loadStoredTheme() ?? FORCED_THEME)
const currentDivision = ref<Division>('studio')
let isInitialLoad = true

function setHtmlThemeClass(theme: Theme) {
  const root = document.documentElement
  root.classList.remove(
    'theme-default',
    'theme-homelab',
    'theme-professional',
    'theme-studio-blue-steel',
    'theme-studio',
    'theme-studio-original-purple',
    'theme-studio-grad-logo-flow',
    'theme-studio-grad-purple-orange',
    'theme-studio-grad-purple-pink-orange',
    'theme-studio-grad-purple-pink-blue',
    'theme-studio-grad-purple-blue',
    'theme-studio-grad-red-purple-blue',
    'theme-studio-grad-sunset-laser',
    'theme-studio-grad-neon-studio',
    'theme-studio-slate',
    'theme-studio-ocean',
    'theme-studio-grad-moon-mist',
    'theme-studio-grad-pink-orange',
    'theme-studio-grad-red-blue-green',
    'theme-studio-grad-red-orange-yellow',
    'theme-studio-grad-yellow-orange-red',
    'theme-studio-grad-orange-pink',
    'theme-studio-grad-electric-violet',
    'theme-studio-grad-infrared',
    'theme-studio-grad-chrome',
    'theme-studio-grad-aurora',
    'theme-studio-grad-coral-reef',
    'theme-studio-grad-plasma',
    'theme-studio-grad-enterprise',
    'theme-studio-grad-professional',
    'theme-studio-grad-homelab',
    'theme-studio-carbon'
  )
  root.classList.add(theme)
}

watchEffect(() => {
  // Only force theme when controls are locked AFTER initial load
  // This prevents overriding stored themes on app startup
  if (!isInitialLoad && !themeControlsUnlocked.value && currentTheme.value !== FORCED_THEME) {
    currentTheme.value = FORCED_THEME
  }
  setHtmlThemeClass(currentTheme.value)
  currentDivision.value = themeToDivision[currentTheme.value]
  saveStoredTheme(currentTheme.value)
  isInitialLoad = false
})

/** Apply a theme using the 45Drives alias coming from the server (e.g. "homelab"|"professional") */
function applyThemeFromAlias(aliasStyle?: string) {
  if (!themeControlsUnlocked.value) {
    void aliasStyle
    currentTheme.value = FORCED_THEME
    return
  }

  // currentTheme.value = mapped ?? 'theme-studio'
  const normalized = (aliasStyle || '').toLowerCase()
  const mapped = aliasToTheme[normalized]

  if (mapped && mapped !== 'theme-studio') {
    currentTheme.value = mapped
    return
  }

  // Keep selected studio variant when server reports "studio"
  if (mapped === 'theme-studio' && themeToDivision[currentTheme.value] === 'studio') {
    return
  }

  currentTheme.value = mapped ?? 'theme-studio'
}

/** Directly set a theme */
function setTheme(theme: Theme) {
  currentTheme.value = theme
}

function setThemeControlsUnlocked(unlocked: boolean) {
  themeControlsUnlocked.value = unlocked
  saveThemeUnlockState(unlocked)
  if (!unlocked) {
    currentTheme.value = FORCED_THEME
  }
}

export function useThemeFromAlias() {
  return {
    currentTheme,         // reactive (theme-homelab|theme-studio|theme-professional|theme-default)
    currentDivision,      // reactive (homelab|studio|professional|default)
    applyThemeFromAlias,  // call with aliasStyle from server info
    setTheme,             // manual setter
    themeControlsUnlocked,
    setThemeControlsUnlocked,
  }
}
