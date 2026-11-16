import { DEFAULT_45FLOW_WATERMARKS, type Default45FlowWatermark } from '../types/watermark'

export interface ProjectWatermark {
  name: string
  path: string
  source: 'builtin' | 'global' | 'project'
}

export async function loadProjectWatermarks(apiFetch: (url: string, init?: any) => Promise<any>, projectId?: number | null) {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  const data = await apiFetch(`/api/watermarks${query}`, { method: 'GET' })
  const items: ProjectWatermark[] = Array.isArray(data?.items) ? data.items : []
  const custom = items.filter(item => item.source !== 'builtin').map(item => item.path)
  const defaults: Default45FlowWatermark[] = items.filter(item => item.source === 'builtin').map(item => {
    const known = DEFAULT_45FLOW_WATERMARKS.find(defaultItem => defaultItem.path === item.path || defaultItem.path.split('/').pop() === item.path.split('/').pop())
    return { ...known, ...item, id: known?.id || item.path }
  })
  return { items, custom, defaults }
}

export function canonicalWatermarkSelection(selection: string, defaults: Default45FlowWatermark[]): string {
  const legacy = DEFAULT_45FLOW_WATERMARKS.find(item => item.id === selection || item.path === selection)
  return defaults.find(item => item.path === selection || item.id === selection || (legacy && item.id === legacy.id))?.path || selection
}
