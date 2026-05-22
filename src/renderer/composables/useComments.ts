import { ref } from 'vue'
import { useApi } from './useApi'

export interface Comment {
  id: number
  file_id: number | null
  parent_id: number | null
  author_id: number | null
  body: string
  body_format: string | null
  author_name: string | null
  author_color: string | null
  start_seconds: number | null
  end_seconds: number | null
  start_frame: number | null
  end_frame: number | null
  fps: number | null
  tc_mode: string | null
  start_tc: string | null
  end_tc: string | null
  is_edited: boolean
  edited_at: string | null
  edited_by: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  depth: number
  draw_data: string | null
  annotation_type: string | null
  link_id: number
  resolved: boolean
  resolved_at: string | null
  resolved_by: number | null
  tags: string | null
  user_name: string | null
  display_color: string | null
  file_name: string | null
  file_path: string | null
}

export function useComments() {
  const { apiFetch } = useApi()
  const comments = ref<Comment[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchComments(linkId: number) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/links/${linkId}/comments`)
      comments.value = response.comments || []
      return comments.value
    } catch (err: any) {
      error.value = err.message || 'Failed to load comments'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function addComment(linkId: number, commentText: string, timecode: number | null = null) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/links/${linkId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: commentText, timecode }),
      })
      if (response.comment) {
        comments.value.push(response.comment)
      }
      return response.comment
    } catch (err: any) {
      error.value = err.message || 'Failed to add comment'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateComment(linkId: number, commentId: number, commentText: string, timecode: number | null = null) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/links/${linkId}/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ comment: commentText, timecode }),
      })
      if (response.comment) {
        const index = comments.value.findIndex((c) => c.id === commentId)
        if (index !== -1) {
          comments.value[index] = response.comment
        }
      }
      return response.comment
    } catch (err: any) {
      error.value = err.message || 'Failed to update comment'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteComment(linkId: number, commentId: number) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/api/links/${linkId}/comments/${commentId}`, {
        method: 'DELETE',
      })
      comments.value = comments.value.filter((c) => c.id !== commentId)
    } catch (err: any) {
      error.value = err.message || 'Failed to delete comment'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    comments,
    loading,
    error,
    fetchComments,
    addComment,
    updateComment,
    deleteComment,
  }
}
