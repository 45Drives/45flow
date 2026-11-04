type UploadFile = { name: string; size: number }
type ApiFetch = (path: string, init: { method: string; body: string; retry: number }) => Promise<unknown>
type ValidationResult = { name: string; allowed: boolean; reason?: string }

function isValidationResult(value: unknown): value is ValidationResult {
  return typeof value === 'object' && value !== null &&
    'name' in value && typeof value.name === 'string' &&
    'allowed' in value && typeof value.allowed === 'boolean' &&
    (value.allowed || ('reason' in value && typeof value.reason === 'string'))
}

export async function validateUploadBatch(apiFetch: ApiFetch, files: readonly UploadFile[], dest: string): Promise<void> {
  if (!files.length) throw new Error('No files selected. Nothing was uploaded.')
  const rejected: string[] = []
  for (let offset = 0; offset < files.length; offset += 500) {
    const batch = files.slice(offset, offset + 500)
    let response: unknown
    try {
      response = await apiFetch('/api/local-upload/validate', {
        method: 'POST',
        body: JSON.stringify({ dest, files: batch.map(file => ({ filename: file.name, fileSize: file.size })) }),
        retry: 0,
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
        throw new Error('This server needs an update to check Quick Share uploads before uploading. Nothing was uploaded.')
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not check the upload batch: ${message}. Nothing was uploaded.`)
    }
    if (typeof response !== 'object' || response === null ||
      !('ok' in response) || response.ok !== true ||
      !('allAllowed' in response) || typeof response.allAllowed !== 'boolean' ||
      !('files' in response) || !Array.isArray(response.files) ||
      response.files.length !== batch.length ||
      !response.files.every(isValidationResult) ||
      !response.files.every((file, index) => file.name === batch[index]?.name) ||
      response.allAllowed !== response.files.every(file => file.allowed)) {
      throw new Error('The server returned an invalid upload check. Nothing was uploaded.')
    }
    for (const file of response.files) {
      if (!file.allowed) rejected.push(`${file.name}: ${file.reason}`)
    }
  }
  if (rejected.length) {
    throw new Error(`Nothing was uploaded. Fix or remove these files and try again:\n${rejected.join('\n')}`)
  }
}
