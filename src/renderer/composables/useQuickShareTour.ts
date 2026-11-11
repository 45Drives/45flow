import { ref } from 'vue'

/**
 * Shared reactive state that lets the guided tour open the Quick Share
 * overlay with mock data and control which view it shows.
 *
 * QuickShareOverlay watches these refs and reacts accordingly.
 * DashboardView sets them from tour step beforeShow/cleanup callbacks.
 */

/** When true the Quick Share modal is shown in tour/demo mode */
export const tourQuickShareOpen = ref(false)

/** Which view to display during the tour: the one-screen setup, or upload progress/result */
export const tourQuickShareStep = ref<'setup' | 'progress'>('setup')

/** When true, the progress view should show the mock "done" state */
export const tourQuickShareShowDone = ref(false)

/** Tracks whether the real Quick Share overlay modal is currently visible */
export const quickShareOverlayOpen = ref(false)
