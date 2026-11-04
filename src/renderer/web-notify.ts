// Opt-in browser notifications for transfers that finish while the tab is in the background.
// The in-app toasts only help while the page is visible; a browser has no tray or OS
// notification channel like the desktop app, so this is how someone who switched tabs
// finds out. It never asks for permission on its own: the user turns it on in Settings.

const ENABLED_KEY = '45flow:web_notifications'

type Permission = NotificationPermission | 'unsupported'

export function notificationPermission(): Permission {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export function notificationsEnabled(): boolean {
    try {
        return localStorage.getItem(ENABLED_KEY) === '1' && notificationPermission() === 'granted'
    } catch {
        return false
    }
}

/** Must be called from a click: browsers only show the permission prompt for a user gesture. */
export async function enableNotifications(): Promise<Permission> {
    if (notificationPermission() === 'unsupported') return 'unsupported'
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    try { localStorage.setItem(ENABLED_KEY, permission === 'granted' ? '1' : '0') } catch { /* preference not saved */ }
    return permission
}

export function disableNotifications() {
    try { localStorage.setItem(ENABLED_KEY, '0') } catch { /* preference not saved */ }
}

/** Show a notification only when the user opted in and is not looking at the page. */
export function notifyIfHidden(title: string, body: string, tag?: string) {
    if (!notificationsEnabled() || document.visibilityState === 'visible') return false
    try {
        const shown = new Notification(title, { body, tag, icon: './assets/45Flow-w.png' })
        shown.onclick = () => { window.focus(); shown.close() }
        return true
    } catch {
        return false
    }
}
