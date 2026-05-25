/**
 * Composable for managing premium watermark customization settings
 */
import { ref, computed, watch } from 'vue'
import type {
  WatermarkSettings,
  WatermarkPreset,
  WatermarkPosition,
} from '../types/watermark'
import {
  DEFAULT_WATERMARK_PRESETS,
  createDefaultWatermarkSettings,
} from '../types/watermark'
import { useApi } from './useApi'

export interface UseWatermarkCustomizationOptions {
  autoSave?: boolean
}

export function useWatermarkCustomization(options: UseWatermarkCustomizationOptions = {}) {
  const { apiFetch } = useApi()

  // Current watermark settings
  const settings = ref<WatermarkSettings>(createDefaultWatermarkSettings())
  
  // Available presets (defaults + user custom)
  const presets = ref<WatermarkPreset[]>([...DEFAULT_WATERMARK_PRESETS])
  const selectedPresetId = ref<string | null>(DEFAULT_WATERMARK_PRESETS[1].id) // 'bottom-right-large'
  
  // Loading states
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  // Computed: Current preset
  const currentPreset = computed(() =>
    presets.value.find(p => p.id === selectedPresetId.value) || null
  )

  // Computed: Is using custom settings (not matching any preset)
  const isCustomSettings = computed(() => {
    return !presets.value.some(p => JSON.stringify(p.settings) === JSON.stringify(settings.value))
  })

  /**
   * Load user's custom presets from server
   */
  async function loadUserPresets() {
    loading.value = true
    error.value = null
    
    try {
      const response = await apiFetch('/api/watermarks/presets')
      
      if (response.ok && Array.isArray(response.presets)) {
        // Merge default presets with user custom presets
        // Convert numeric DB IDs to strings for consistency with default presets
        const userPresets = response.presets.map((p: any) => ({
          ...p,
          id: String(p.id),
          isCustom: true,
        }))
        presets.value = [...DEFAULT_WATERMARK_PRESETS, ...userPresets]
      }
    } catch (err: any) {
      // Premium feature - gracefully handle if server doesn't support
      console.warn('[watermark] Failed to load user presets:', err.message)
      error.value = null // Don't show error for missing premium feature
    } finally {
      loading.value = false
    }
  }

  /**
   * Save current settings as a new custom preset
   */
  async function saveAsPreset(name: string, description?: string): Promise<boolean> {
    saving.value = true
    error.value = null
    
    try {
      const response = await apiFetch('/api/watermarks/presets', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          settings: settings.value,
        }),
      })
      
      if (response.ok && response.preset) {
        const newPreset: WatermarkPreset = {
          ...response.preset,
          id: String(response.preset.id),
          isCustom: true,
        }
        presets.value.push(newPreset)
        selectedPresetId.value = newPreset.id
        return true
      }
      
      error.value = response.error || 'Failed to save preset'
      return false
    } catch (err: any) {
      error.value = err.message || 'Failed to save preset'
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Delete a custom preset
   */
  async function deletePreset(presetId: string): Promise<boolean> {
    const preset = presets.value.find(p => p.id === presetId)
    if (!preset?.isCustom) {
      error.value = 'Cannot delete default presets'
      return false
    }
    
    saving.value = true
    error.value = null
    
    try {
      const response = await apiFetch(`/api/watermarks/presets/${presetId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        presets.value = presets.value.filter(p => p.id !== presetId)
        if (selectedPresetId.value === presetId) {
          selectedPresetId.value = DEFAULT_WATERMARK_PRESETS[1].id
        }
        return true
      }
      
      error.value = response.error || 'Failed to delete preset'
      return false
    } catch (err: any) {
      error.value = err.message || 'Failed to delete preset'
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Apply a preset to current settings
   */
  function applyPreset(presetId: string) {
    const preset = presets.value.find(p => p.id === presetId)
    if (!preset) return
    
    settings.value = JSON.parse(JSON.stringify(preset.settings))
    selectedPresetId.value = presetId
  }

  /**
   * Update position settings
   */
  function updatePosition(position: Partial<WatermarkPosition>) {
    settings.value.position = { ...settings.value.position, ...position }
  }

  /**
   * Update scale (10-100)
   */
  function updateScale(scale: number) {
    settings.value.scale = Math.max(10, Math.min(100, scale))
  }

  /**
   * Update opacity (0-100)
   */
  function updateOpacity(opacity: number) {
    settings.value.opacity = Math.max(0, Math.min(100, opacity))
  }

  /**
   * Update rotation (0-360)
   */
  function updateRotation(rotation: number) {
    settings.value.rotation = ((rotation % 360) + 360) % 360
  }

  /**
   * Reset to default settings
   */
  function reset() {
    settings.value = createDefaultWatermarkSettings()
    selectedPresetId.value = DEFAULT_WATERMARK_PRESETS[1].id
  }

  // Auto-save to localStorage if enabled
  const STORAGE_KEY = '45flow-watermark-settings'
  
  if (options.autoSave) {
    // Load from localStorage on init
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        settings.value = parsed.settings || createDefaultWatermarkSettings()
        selectedPresetId.value = parsed.selectedPresetId || null
      } catch {
        // Invalid stored data, use defaults
      }
    }
    
    // Save to localStorage on changes
    watch(
      () => [settings.value, selectedPresetId.value],
      () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          settings: settings.value,
          selectedPresetId: selectedPresetId.value,
        }))
      },
      { deep: true }
    )
  }

  return {
    // State
    settings,
    presets,
    selectedPresetId,
    currentPreset,
    isCustomSettings,
    loading,
    saving,
    error,
    
    // Actions
    loadUserPresets,
    saveAsPreset,
    deletePreset,
    applyPreset,
    updatePosition,
    updateScale,
    updateOpacity,
    updateRotation,
    reset,
  }
}
