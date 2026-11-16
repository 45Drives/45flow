export function uploadErrorMessage(error?: string): string {
  if (error === 'scanner_unavailable' || /malware scanner unavailable/i.test(error || '')) {
    return 'Malware scanning is required but not installed. An administrator can install it or turn scanning off in Settings.'
  }
  return error || 'Upload failed'
}
