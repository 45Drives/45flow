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
  | 'theme-custom'
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
  'theme-custom': 'studio',
  'theme-default': 'default'
}

const STORAGE_KEY = '45flow-theme-v1'
const THEME_UNLOCK_KEY = '45flow-theme-unlock-v1'
const CUSTOM_COLORS_KEY = '45flow-custom-theme-colors'
const CUSTOM_ENABLED_KEY = '45flow-custom-theme-enabled'
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
    'theme-custom',
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

// ── Custom theme colors ──────────────────────────────────────────────────────
export interface CustomThemeColors { primary: string; secondary: string }

function loadCustomColors(): CustomThemeColors {
  try {
    const raw = window.localStorage.getItem(CUSTOM_COLORS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.primary && parsed.secondary) return parsed
    }
  } catch { /* no-op */ }
  return { primary: '#D92B2F', secondary: '#b02428' }
}

function saveCustomColors(colors: CustomThemeColors) {
  try {
    window.localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors))
  } catch { /* no-op */ }
}

const customThemeColors = ref<CustomThemeColors>(loadCustomColors())

const customThemeEnabled = ref<boolean>((() => {
  try { return window.localStorage.getItem(CUSTOM_ENABLED_KEY) === '1' } catch { return false }
})())

function darkenHex(hex: string, amount = 0.15): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)))
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** Apply the custom theme CSS vars inline on :root */
function applyCustomThemeVars() {
  const root = document.documentElement
  const { primary, secondary } = customThemeColors.value
  const pDark = darkenHex(primary)
  const sDark = darkenHex(secondary)
  const grad = `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
  const gradHover = `linear-gradient(135deg, ${pDark} 0%, ${sDark} 100%)`

  root.style.setProperty('--btn-primary-bg', primary)
  root.style.setProperty('--btn-primary-border', primary)
  root.style.setProperty('--btn-primary-hover-bg', pDark)
  root.style.setProperty('--btn-primary-hover-border', pDark)
  root.style.setProperty('--btn-primary-fill', grad)
  root.style.setProperty('--btn-primary-hover-fill', gradHover)
  root.style.setProperty('--btn-secondary-bg', secondary)
  root.style.setProperty('--btn-secondary-border', secondary)
  root.style.setProperty('--btn-secondary-hover-bg', sDark)
  root.style.setProperty('--btn-secondary-hover-border', sDark)
  root.style.setProperty('--btn-secondary-fill', grad)
  root.style.setProperty('--btn-secondary-hover-fill', gradHover)
  root.style.setProperty('--flow-logo-theme-fill', grad)
  root.style.setProperty('--ui-app-bg', [
    `radial-gradient(76rem 36rem at -8% -12%, color-mix(in srgb, ${primary} 20%, transparent), transparent 54%)`,
    `radial-gradient(68rem 30rem at 108% -10%, color-mix(in srgb, ${secondary} 18%, transparent), transparent 58%)`,
    `linear-gradient(140deg, color-mix(in srgb, ${primary} 8%, #f3f5f8) 0%, color-mix(in srgb, ${secondary} 8%, #f3f5f8) 100%)`,
  ].join(', '))
}

function setCustomThemeColors(colors: CustomThemeColors) {
  customThemeColors.value = colors
  saveCustomColors(colors)
  if (currentTheme.value === 'theme-custom') {
    applyCustomThemeVars()
  }
}

function setCustomThemeEnabled(enabled: boolean) {
  customThemeEnabled.value = enabled
  try { window.localStorage.setItem(CUSTOM_ENABLED_KEY, enabled ? '1' : '0') } catch { /* no-op */ }
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
    'theme-studio-carbon',
    'theme-custom'
  )
  // Clear any inline custom-theme CSS vars
  for (const prop of [
    '--btn-primary-bg', '--btn-primary-border',
    '--btn-primary-hover-bg', '--btn-primary-hover-border',
    '--btn-primary-fill', '--btn-primary-hover-fill',
    '--btn-secondary-bg', '--btn-secondary-border',
    '--btn-secondary-hover-bg', '--btn-secondary-hover-border',
    '--btn-secondary-fill', '--btn-secondary-hover-fill',
    '--flow-logo-theme-fill',
    '--ui-app-bg',
  ]) root.style.removeProperty(prop)
  root.classList.add(theme)
}

watchEffect(() => {
  // Only force theme when controls are locked AFTER initial load
  // This prevents overriding stored themes on app startup
  if (!isInitialLoad && !themeControlsUnlocked.value && currentTheme.value !== FORCED_THEME) {
    currentTheme.value = FORCED_THEME
  }
  setHtmlThemeClass(currentTheme.value)
  // Apply inline CSS vars for the custom theme
  if (currentTheme.value === 'theme-custom') {
    applyCustomThemeVars()
  }
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
    currentTheme,         // reactive (theme-homelab|theme-studio|theme-professional|theme-default|theme-custom)
    currentDivision,      // reactive (homelab|studio|professional|default)
    applyThemeFromAlias,  // call with aliasStyle from server info
    setTheme,             // manual setter
    themeControlsUnlocked,
    setThemeControlsUnlocked,
    customThemeColors,    // reactive { primary, secondary }
    setCustomThemeColors, // update colors and re-apply if active
    customThemeEnabled,   // reactive — true when branding has custom colors configured
    setCustomThemeEnabled,
  }
}
