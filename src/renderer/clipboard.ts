// navigator.clipboard only exists in secure contexts (HTTPS or localhost). The hosted web app
// is HTTPS, but a certificate warning, an embedded view or an older browser can still leave it
// missing, so fall back to the legacy selection-and-copy path instead of failing silently.
// Same contract as navigator.clipboard.writeText: resolves when copied, rejects when not.

export async function writeClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // Permission or focus problem: try the fallback before giving up.
        }
    }
    legacyCopy(text)
}

function legacyCopy(text: string) {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    // Off-screen, not display:none, because hidden elements cannot be selected.
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    const previouslyFocused = document.activeElement as HTMLElement | null
    document.body.appendChild(field)
    try {
        field.select()
        field.setSelectionRange(0, text.length)
        if (!document.execCommand('copy')) throw new Error('Copying to the clipboard is not allowed in this browser.')
    } finally {
        field.remove()
        previouslyFocused?.focus?.()
    }
}
