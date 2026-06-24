import { ref, watch } from 'vue'

const STORAGE_KEY = '45flow:linkListDefault'

type LinkFilterDefault = '' | 'active'

function loadPreference(): LinkFilterDefault {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'active') return 'active'
    if (v === '') return ''
  } catch {}
  // Default: show all links
  return ''
}

/** Shared reactive — all consumers see the same value */
const linkListDefault = ref<LinkFilterDefault>(loadPreference())

watch(linkListDefault, (v) => {
  try { localStorage.setItem(STORAGE_KEY, v) } catch {}
})

export function useLinkListDefault() {
  return { linkListDefault }
}
