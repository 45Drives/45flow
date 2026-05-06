// src/renderer/composables/useClientTranscode.ts
import { ref, watch } from 'vue';

const ENABLED_KEY = '45flow:client_transcode_enabled';
const PRESET_KEY = '45flow:client_transcode_preset';
const HW_KEY = '45flow:client_transcode_hw_accel';

export type TranscodePreset = 'fast' | 'balanced' | 'quality';

// Default: enabled, balanced preset, hardware on
const enabled = ref(loadBool(ENABLED_KEY, true));
const preset = ref<TranscodePreset>(loadPreset());
const hwAccel = ref(loadBool(HW_KEY, true));

function loadBool(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === 'true';
  } catch {
    return defaultValue;
  }
}

function loadPreset(): TranscodePreset {
  try {
    const stored = localStorage.getItem(PRESET_KEY);
    if (stored === 'fast' || stored === 'balanced' || stored === 'quality') return stored;
    return 'balanced';
  } catch {
    return 'balanced';
  }
}

// Persist changes
watch(enabled, (val) => localStorage.setItem(ENABLED_KEY, String(val)));
watch(preset, (val) => localStorage.setItem(PRESET_KEY, val));
watch(hwAccel, (val) => localStorage.setItem(HW_KEY, String(val)));

export function useClientTranscode() {
  return {
    enabled,
    preset,
    hwAccel,
    setEnabled: (value: boolean) => { enabled.value = value; },
    setPreset: (value: TranscodePreset) => { preset.value = value; },
    setHwAccel: (value: boolean) => { hwAccel.value = value; },
  };
}
