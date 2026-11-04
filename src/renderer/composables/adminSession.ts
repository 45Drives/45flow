/** UX hint only. The server must independently verify the token and admin claims. */
export function isAdminSession(token?: string): boolean {
    try {
        const encoded = (token || '').split('.')[1]
        if (!encoded) return false
        const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
        return !payload.purpose && Array.isArray(payload.amr)
            && payload.amr.some((method: string) => method === 'pam' || method === 'env')
            && typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()
    } catch {
        return false
    }
}
