import { ref } from 'vue'

/**
 * Shared reactive state that lets the guided tour open the Quick Share
 * overlay with mock data and control its wizard step.
 *
 * QuickShareOverlay watches these refs and reacts accordingly.
 * DashboardView sets them from tour step beforeShow/cleanup callbacks.
 */

/** When true the Quick Share modal is shown in tour/demo mode */
export const tourQuickShareOpen = ref(false)

/** Which wizard step to display during the tour (1, 2, or 3) */
export const tourQuickShareStep = ref<1 | 2 | 3>(1)

/** When true, step 3 should show the mock "done" state */
export const tourQuickShareShowDone = ref(false)

/** Tracks whether the real Quick Share overlay modal is currently visible */
export const quickShareOverlayOpen = ref(false)
