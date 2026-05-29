// Premium comment types for export and management

export type CommentExport = {
  id: number
  file_id: number
  file_name: string | null
  file_path: string | null
  parent_id: number | null
  author_id: number | null
  author_name: string | null
  author_color: string | null
  user_name: string | null
  display_color: string | null
  body: string
  start_seconds: number
  end_seconds: number | null
  start_frame: number | null
  end_frame: number | null
  fps: number | null
  tc_mode: string | null
  start_tc: string | null
  end_tc: string | null
  is_edited: boolean
  created_at: string
  updated_at: string | null
  deleted_at: string | null
  draw_data: string | null
  annotation_type: string | null
  link_id: number | null
  depth: number | null
  
  // Premium fields
  resolved: boolean
  resolved_at: string | null
  resolved_by: number | null
  tags: string[] | null
}

export type CommentStats = {
  total: number
  resolved: number
  unresolved: number
  withAnnotations: number
}

export type ExportFormat = 'json' | 'csv' | 'markdown' | 'md' | 'webvtt' | 'vtt'
