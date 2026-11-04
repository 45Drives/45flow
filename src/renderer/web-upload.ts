import { runChunkedUpload, type HttpUploadOpts, type HttpUploadProgress, type HttpUploadResult } from '../shared/chunkedUpload'

type Emit = (channel: string, payload: unknown) => void
type LocalFile = { path: string; name: string; size: number }

function openFilePicker(directory: boolean, accept?: string): Promise<File[]> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = !accept
        if (accept) input.accept = accept
        if (directory) input.webkitdirectory = true
        input.style.display = 'none'
        const finish = (files: File[]) => {
            input.remove()
            resolve(files)
        }
        input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true })
        input.addEventListener('cancel', () => finish([]), { once: true })
        document.body.appendChild(input)
        input.click()
    })
}

/**
 * Browser replacement for the desktop's path-based upload IPC. Files are referenced by a
 * synthetic path so the existing wizard and Quick Share code can keep treating them as paths.
 */
export function createWebUploadApi(emit: Emit) {
    const files = new Map<string, File>()
    const inflight = new Map<string, AbortController>()
    let counter = 0

    // A closed tab silently kills an upload; ask the browser to confirm first.
    window.addEventListener('beforeunload', (event) => {
        if (inflight.size === 0) return
        event.preventDefault()
        event.returnValue = ''
    })

    function register(file: File): LocalFile {
        const path = `browser-file://${file.lastModified}-${file.size}/${file.name}`
        files.set(path, file)
        return { path, name: file.name, size: file.size }
    }

    function run(id: string, opts: HttpUploadOpts, signal: AbortSignal,
        onProgress?: (progress: HttpUploadProgress) => void): Promise<HttpUploadResult> {
        const file = files.get(opts.src)
        if (!file) return Promise.resolve({ ok: false, error: 'File is no longer available. Select it again.' })

        return runChunkedUpload(
            opts,
            {
                name: file.name,
                size: file.size,
                mime: file.type || 'application/octet-stream',
                readChunk: (start, end) => file.slice(start, end + 1),
            },
            {
                signal,
                onProgress: (progress) => {
                    try { onProgress?.(progress) } catch { /* a faulty listener must not stop the upload */ }
                    emit(`http-upload:progress:${id}`, progress)
                },
                onIngest: (ingest) => {
                    const url = new URL(opts.apiBase || window.location.origin, window.location.origin)
                    emit(`upload:ingest:${id}`, {
                        ok: true,
                        ...ingest,
                        host: url.hostname,
                        apiPort: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
                    })
                },
            },
        )
    }

    return {
        // These must stay synchronous up to input.click() so the browser accepts the user gesture.
        pickFiles: () => openFilePicker(false).then(picked => picked.map(register)),
        // Matches the desktop folder picker: only the folder's direct children, not subfolders.
        pickFolder: () => openFilePicker(true).then(picked => picked
            .filter(file => (file.webkitRelativePath || '').split('/').length <= 2)
            .map(register)),
        pickWatermark: () => openFilePicker(false, 'image/*').then(async ([file]) => {
            if (!file) return null
            const dataUrl = await new Promise<string | null>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
                reader.onerror = () => resolve(null)
                reader.readAsDataURL(file)
            })
            return { ...register(file), dataUrl }
        }),
        getPathForFile: (file: File) => register(file).path,
        httpUploadStart: async (opts: HttpUploadOpts, onProgress?: (progress: HttpUploadProgress) => void) => {
            const id = `web-${Date.now().toString(36)}-${(counter++).toString(36)}`
            const controller = new AbortController()
            inflight.set(id, controller)
            const done = run(id, opts, controller.signal, onProgress)
                .catch((error: any): HttpUploadResult => ({ ok: false, error: error?.message || 'Upload failed' }))
                .finally(() => inflight.delete(id))
                .then((result) => {
                    emit(`http-upload:done:${id}`, result)
                    return result
                })
            return { id, done }
        },
        httpUploadCancel: (id: string) => inflight.get(id)?.abort(),
    }
}
