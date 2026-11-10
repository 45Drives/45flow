// Loads a link's C2 review state (approver, current status per file, history)
// from GET /api/links/:id/review-decisions and changes the approver.
import { ref, type Ref } from 'vue'
import type { ReviewDecision } from '../utils/reviewStatus'

export type ReviewApprover = { user_id: number; name: string | null; user_name: string | null; updated_at?: string }
export type ReviewFileStatus = {
  fileId: number
  name: string
  currentAssetVersionId: number | null
  currentVersionIndex: number | null
  status: ReviewDecision | 'pending'
  latest: { id: number; decision: ReviewDecision; note: string | null; decided_at: string } | null
}
export type ReviewHistoryEntry = {
  id: number
  fileId: number | null
  fileName: string | null
  assetVersionId: number
  versionIndex: number | null
  decision: ReviewDecision
  note: string | null
  decided_at: string
  actor: { name: string | null; user_name: string | null }
  superseded: boolean
}
export type LinkReviewState = {
  accessMode: 'open' | 'restricted'
  approver: ReviewApprover | null
  files: ReviewFileStatus[]
  history: ReviewHistoryEntry[]
}

type ApiFetch = (url: string, opts?: any) => Promise<any>

export function useLinkReview(linkId: Ref<number | null | undefined>, apiFetch: ApiFetch) {
  const state = ref<LinkReviewState | null>(null)
  const loading = ref(false)
  const error = ref('')
  const savingApprover = ref(false)
  // Ignore a late response for a link the user already moved away from.
  let generation = 0

  async function load() {
    const id = linkId.value
    generation += 1
    const mine = generation
    if (!id) { state.value = null; return }
    loading.value = true
    error.value = ''
    try {
      const data = await apiFetch(`/api/links/${id}/review-decisions`)
      if (mine !== generation) return
      state.value = {
        accessMode: data?.accessMode === 'restricted' ? 'restricted' : 'open',
        approver: data?.approver ?? null,
        files: Array.isArray(data?.files) ? data.files : [],
        history: Array.isArray(data?.history) ? data.history : [],
      }
    } catch (e: any) {
      if (mine !== generation) return
      // Older servers don't have this route; show nothing rather than an error.
      if (e?.status === 404) { state.value = null; return }
      error.value = e?.message ? `Couldn't load review status: ${e.message}` : "Couldn't load review status."
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  async function setApprover(userId: number | null) {
    const id = linkId.value
    if (!id) return false
    savingApprover.value = true
    error.value = ''
    try {
      if (userId === null) {
        await apiFetch(`/api/links/${id}/review-approver`, { method: 'DELETE', retry: 0 })
      } else {
        await apiFetch(`/api/links/${id}/review-approver`, {
          method: 'POST', body: JSON.stringify({ userId }), retry: 0, exposeServerMessage: true,
        })
      }
      await load()
      return true
    } catch (e: any) {
      error.value = e?.code === 'user_not_authorized_for_link' || /active access/.test(e?.message || '')
        ? 'That person no longer has access to this link. Invite them first, then choose them as approver.'
        : (e?.message ? `Couldn't change the approver: ${e.message}` : "Couldn't change the approver.")
      return false
    } finally {
      savingApprover.value = false
    }
  }

  function reset() {
    generation += 1
    state.value = null
    error.value = ''
    loading.value = false
  }

  return { state, loading, error, savingApprover, load, setApprover, reset }
}
