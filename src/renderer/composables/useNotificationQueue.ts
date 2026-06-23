// src/renderer/composables/useNotificationQueue.ts
import { 
  pushNotification as houstonPushNotification,
  Notification,
  reportError as houstonReportError,
  reportSuccess as houstonReportSuccess
} from '@45drives/houston-common-ui'

/**
 * Push a notification. The notification center (initialized in AppShell)
 * automatically tracks history and enforces the visible limit globally.
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
