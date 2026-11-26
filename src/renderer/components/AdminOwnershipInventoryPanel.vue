<template>
    <section aria-label="Quarterly account review" class="mt-6">
        <p class="flow-subhead">Quarterly account review</p>
        <p class="text-sm text-muted mb-3">
            Review staff access every quarter. Accounts inactive for 90 days are flagged for review only; they are never automatically disabled.
        </p>
        <FlowNotice tone="warning" size="sm" class="mb-3">
            Ownership is recorded only for resources created after staff identity tracking is available.
            Legacy resources stay unassigned until an administrator reviews and assigns them.
        </FlowNotice>

        <FlowNotice v-if="reviewError" tone="danger" size="sm" live class="mb-3">
            {{ reviewError }}
            <template #actions><FlowButton size="xs" :disabled="reviewLoading" @click="loadReview">Try again</FlowButton></template>
        </FlowNotice>
        <p v-if="reviewLoading && !review" class="text-sm text-muted" role="status">Loading account review…</p>
        <template v-if="review">
            <div class="flow-group px-3 py-3 mb-3 text-sm">
                <p class="font-medium">{{ review.period }} · Staff group: {{ review.group || 'Unavailable' }}</p>
                <p v-if="!review.groupExists">The staff group does not exist.</p>
                <p v-else>Members: {{ review.members.length ? review.members.join(', ') : 'None' }}</p>
                <p v-if="review.review">
                    Review recorded {{ formatDate(review.review.reviewedAt) }} by {{ reviewerName(review.review.reviewedBy) }}.
                </p>
                <p v-else>No review has been recorded for this quarter.</p>
                <p class="text-muted">
                    Legacy unassigned records: {{ review.legacyUnassigned.projects }} projects and
                    {{ review.legacyUnassigned.links }} links.
                </p>
            </div>
            <div v-for="account in review.accounts" :key="account.staffAccountId || account.username" class="flow-group px-3 py-3 mb-2 text-sm">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="font-medium break-all">{{ account.username }}<span v-if="account.member"> · Staff member</span><span v-else-if="account.removedFromSystem"> · No longer a local account</span></p>
                        <p class="text-muted">
                            UID {{ account.uid ?? 'unavailable' }} · Last successful sign-in:
                            {{ account.lastSuccessfulLoginAt ? formatDate(account.lastSuccessfulLoginAt) : 'not recorded' }}
                        </p>
                        <p v-if="account.inactive90Days" class="text-flow-warning">No successful sign-in in 90 days; review this account.</p>
                        <p v-else-if="account.loginRecordUnavailable && account.member" class="text-muted">No sign-in history is available yet; review manually.</p>
                        <p>Owned resources: {{ account.ownedProjects }} projects, {{ account.ownedLinks }} links</p>
                    </div>
                </div>
                <div v-if="account.staffAccountId && account.ownedProjects + account.ownedLinks > 0" class="mt-3 flex flex-wrap items-end gap-2">
                    <label class="flex flex-col gap-1 text-xs">
                        Transfer ownership to
                        <select v-model="transferTargets[account.staffAccountId]" class="input-textlike min-w-48 px-2 py-1.5 text-sm"
                            :aria-label="`Transfer ownership from ${account.username} to`">
                            <option value="">Select a current staff member</option>
                            <option v-for="target in transferTargetsFor(account)" :key="target.staffAccountId || target.username" :value="target.staffAccountId || ''">
                                {{ target.username }}
                            </option>
                        </select>
                    </label>
                    <FlowButton size="xs" :disabled="!transferTargets[account.staffAccountId] || actionBusy !== ''"
                        :loading="actionBusy === `transfer:${account.staffAccountId}`" @click="transferOwnership(account)">
                        Transfer owned resources
                    </FlowButton>
                </div>
                <p v-if="!account.identityAvailable && account.member" class="text-muted mt-2">
                    Stable identity is unavailable. Review this account's host identity before relying on staff attribution.
                </p>
            </div>
            <FlowNotice v-if="review.accounts.length === 0" tone="info" size="sm">No local accounts are available for review.</FlowNotice>
            <div class="flex flex-wrap gap-2 mt-3">
                <FlowButton :disabled="reviewLoading || actionBusy !== ''" :loading="actionBusy === 'review'"
                    @click="recordReview">
                    {{ review.review ? 'Update quarterly review record' : 'Record quarterly review' }}
                </FlowButton>
                <FlowButton size="xs" :disabled="reviewLoading || actionBusy !== ''" @click="loadReview">Refresh review</FlowButton>
            </div>
        </template>

        <FlowNotice v-if="error" tone="danger" size="sm" live class="mt-3">
            {{ error }}
            <template #actions><FlowButton size="xs" :disabled="loading" @click="loadPage">Try again</FlowButton></template>
        </FlowNotice>
        <FlowNotice v-if="unsupported" tone="info" size="sm" class="mt-3">
            Update the server to view the ownership inventory.
        </FlowNotice>
        <template v-else>
            <div class="flex gap-2 my-3">
                <FlowButton size="xs" :disabled="loading || kind === 'project'" @click="selectKind('project')">Projects</FlowButton>
                <FlowButton size="xs" :disabled="loading || kind === 'link'" @click="selectKind('link')">Links</FlowButton>
            </div>
            <p v-if="loading && !items.length" class="text-sm text-muted" role="status">Loading inventory…</p>
            <p v-else-if="loaded && !items.length" class="text-sm text-muted">No {{ kind === 'project' ? 'projects' : 'links' }} found.</p>
            <div v-for="item in items" :key="item.id" class="flow-group px-3 py-2 mb-2 text-sm">
                <p class="font-medium break-all">{{ item.label || 'Untitled' }} (ID {{ item.id }})</p>
                <p class="text-muted">
                    {{ ownershipLabel(item) }}<span v-if="item.disabled"> · Disabled</span><span v-if="item.archived"> · Archived</span>
                </p>
                <div v-if="item.ownership === 'unassigned' && review?.members.length" class="mt-2 flex flex-wrap items-end gap-2">
                    <label class="flex flex-col gap-1 text-xs">
                        Assign to
                        <select v-model="assignmentTargets[`${kind}:${item.id}`]" class="input-textlike min-w-48 px-2 py-1.5 text-sm"
                            :aria-label="`Assign ${kind} ${item.id} to staff member`">
                            <option value="">Select a current staff member</option>
                            <option v-for="target in currentStaffAccounts" :key="target.staffAccountId || target.username" :value="target.staffAccountId || ''">
                                {{ target.username }}
                            </option>
                        </select>
                    </label>
                    <FlowButton size="xs" :disabled="!assignmentTargets[`${kind}:${item.id}`] || actionBusy !== ''"
                        :loading="actionBusy === `assign:${kind}:${item.id}`" @click="assignOwnership(item)">
                        Assign ownership
                    </FlowButton>
                </div>
            </div>
            <FlowButton v-if="nextAfter !== null" class="mt-2" size="xs" :disabled="loading" @click="loadPage">
                {{ loading ? 'Loading…' : 'Load more' }}
            </FlowButton>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId)
type Kind = 'project' | 'link'
type Account = {
    staffAccountId: string | null
    username: string
    uid: number | null
    member: boolean
    identityAvailable: boolean
    removedFromSystem?: boolean
    lastSuccessfulLoginAt: number | null
    inactive90Days: boolean
    loginRecordUnavailable: boolean
    ownedProjects: number
    ownedLinks: number
}
type Review = {
    period: string
    group: string | null
    groupExists: boolean
    members: string[]
    accounts: Account[]
    legacyUnassigned: { projects: number; links: number }
    review: { reviewedAt: number; reviewedBy: string; snapshot: unknown } | null
}
type Item = {
    id: number
    label: string | null
    disabled: boolean
    archived?: boolean
    ownership: 'assigned' | 'unassigned' | 'unresolved'
    owner: string | null
}
const kind = ref<Kind>('project')
const items = ref<Item[]>([])
const nextAfter = ref<number | null>(null)
const loading = ref(false)
const loaded = ref(false)
const unsupported = ref(false)
const error = ref('')
const review = ref<Review | null>(null)
const reviewLoading = ref(false)
const reviewError = ref('')
const actionBusy = ref('')
const transferTargets = ref<Record<string, string>>({})
const assignmentTargets = ref<Record<string, string>>({})

const currentStaffAccounts = computed(() => review.value?.accounts.filter(account =>
    account.member && account.staffAccountId) || [])

function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString()
}

function reviewerName(staffAccountId: string) {
    return review.value?.accounts.find(account => account.staffAccountId === staffAccountId)?.username || staffAccountId
}

function ownershipLabel(item: Item) {
    if (item.ownership === 'assigned') return `Owner: ${item.owner || 'unavailable'}`
    if (item.ownership === 'unresolved') return 'Owner identity unavailable; review manually'
    return 'Unassigned legacy record'
}

function transferTargetsFor(source: Account) {
    return currentStaffAccounts.value.filter(account => account.staffAccountId !== source.staffAccountId)
}

async function loadReview() {
    reviewLoading.value = true
    reviewError.value = ''
    try {
        review.value = await apiFetch('/api/admin/account-review')
    } catch (e: any) {
        reviewError.value = `Couldn't load the quarterly account review: ${e?.message || 'request failed'}.`
    } finally {
        reviewLoading.value = false
    }
}

async function loadPage() {
    loading.value = true
    error.value = ''
    try {
        const after = loaded.value ? nextAfter.value : null
        const result = await apiFetch(`/api/admin/ownership-inventory?kind=${kind.value}${after === null ? '' : `&after=${after}`}`)
        items.value = [...items.value, ...result.items]
        nextAfter.value = result.nextAfter
        loaded.value = true
    } catch (e: any) {
        if (e?.status === 404) unsupported.value = true
        else error.value = `Couldn't load the ownership inventory: ${e?.message || 'request failed'}.`
    } finally {
        loading.value = false
    }
}

function selectKind(value: Kind) {
    kind.value = value
    items.value = []
    nextAfter.value = null
    loaded.value = false
    void loadPage()
}

async function runAction(key: string, url: string, body: Record<string, unknown>) {
    if (actionBusy.value) return
    actionBusy.value = key
    error.value = ''
    reviewError.value = ''
    try {
        await apiFetch(url, { method: 'POST', body: JSON.stringify(body), retry: 0 })
        await loadReview()
        items.value = []
        nextAfter.value = null
        loaded.value = false
        await loadPage()
    } catch (e: any) {
        error.value = e?.message || 'The account review action failed.'
    } finally {
        actionBusy.value = ''
    }
}

function recordReview() {
    return runAction('review', '/api/admin/account-review/complete', {})
}

function transferOwnership(account: Account) {
    if (!account.staffAccountId) return
    const targetStaffId = transferTargets.value[account.staffAccountId]
    return runAction(`transfer:${account.staffAccountId}`, '/api/admin/account-review/transfer', {
        sourceStaffId: account.staffAccountId, targetStaffId,
    })
}

function assignOwnership(item: Item) {
    const targetStaffId = assignmentTargets.value[`${kind.value}:${item.id}`]
    return runAction(`assign:${kind.value}:${item.id}`, '/api/admin/account-review/assign', {
        resourceType: kind.value, resourceId: item.id, targetStaffId,
    })
}

onMounted(() => { void loadReview(); void loadPage() })
</script>
