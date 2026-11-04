// src/renderer/composables/useResilientNav.ts
import { useRouter, isNavigationFailure } from 'vue-router'

export function useResilientNav() {
    const router = useRouter()

    async function to(name: string, params?: Record<string, any>) {
        try {
            const r = await router.push({ name, params })
            if (isNavigationFailure(r) || router.currentRoute.value.name !== name) {
                if (!window.electron?.isWeb) {
                    window.electron?.ipcRenderer?.send('action', 'show_dashboard')
                }
                setTimeout(() => {
                    if (router.currentRoute.value.name !== name) {
                        // Adjust if you’re not using hash mode:
                        window.location.hash = `#/${name}`
                    }
                }, 250)
            }
        } catch {
            if (!window.electron?.isWeb) {
                window.electron?.ipcRenderer?.send('action', 'show_dashboard')
            }
            setTimeout(() => { window.location.hash = `#/${name}` }, 250)
        }
    }

    return { to }
}
