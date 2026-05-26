// src/renderer/composables/useNotificationQueue.ts
import { 
  pushNotification as houstonPushNotification, 
  Notification,
  reportError as houstonReportError,
  reportSuccess as houstonReportSuccess
} from '@45drives/houston-common-ui'

/**
 * Push a notification with automatic grouping support.
 * 
 * This is a thin wrapper around houston-common's pushNotification that:
 * 1. Passes through to houston-common (which handles group coalescing)
 * 2. Re-exports for consistency with the rest of the codebase
 * 
 * To group related notifications, pass a `group` parameter to the Notification:
 * @example
 * ```ts
 * pushNotification(new Notification('Link Disabled', 'Link has been disabled', 'info', 5000, 'link-disable'))
 * ```
 * 
 * Subsequent notifications with the same group will update in place and increment the count.
 */
export function pushNotification(notif: Notification): Notification {
  return houstonPushNotification(notif)
}

/**
 * Report an error via notification
 */
export function reportError<TErr extends Error | Error[]>(e: TErr, context: string = ""): TErr {
  return houstonReportError(e, context)
}

/**
 * Report a success message via notification
 */
export function reportSuccess(message: string = "") {
  houstonReportSuccess(message)
}

export function useNotificationQueue() {
  return {
    pushNotification,
    reportError,
    reportSuccess,
  }
}
