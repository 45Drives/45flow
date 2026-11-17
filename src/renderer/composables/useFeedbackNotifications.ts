import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useApi } from './useApi'
import { useConnections } from './useConnections'
import { BACKGROUND_REQUEST } from '../background-request'

export interface FeedbackNotification {
    id: number
    kind: 'comments' | 'replies' | 'reopened'
    body: string
    actor: string
    created_at: string
    link_title: string | null
    filename: string
    version_index: number | null
    token: string
    read: boolean
}
type Events = Record<'comments' | 'replies' | 'reopened', boolean>
const defaultEvents = (): Events => ({ comments: true, replies: true, reopened: true })
const endpoint = '/api/feedback/notifications'

export function useFeedbackNotifications(open: Ref<boolean>) {
    const { apiFetch } = useApi()
    const { activeConnection } = useConnections()
    const serverName = computed(() => activeConnection.value?.name || '')
    const items = ref<FeedbackNotification[]>([])
    const unreadCount = ref(0)
    const events = ref(defaultEvents())
    const error = ref('')
    const unsupported = ref(false)
    const loading = ref(false)
    const saving = ref(false)
    let cursor = 0
    let generation = 0
    let timer: ReturnType<typeof setInterval> | undefined

    function apply(data: unknown) {
        if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)
            || !('cursor' in data) || !Number.isSafeInteger(data.cursor)
            || !('unreadCount' in data) || typeof data.unreadCount !== 'number'
            || !('events' in data) || !data.events || typeof data.events !== 'object'
            || !('comments' in data.events) || typeof data.events.comments !== 'boolean'
            || !('replies' in data.events) || typeof data.events.replies !== 'boolean'
            || !('reopened' in data.events) || typeof data.events.reopened !== 'boolean') {
            throw new Error('Invalid feedback inbox response')
        }
        if (!data.items.every(item => Number.isSafeInteger(item?.id) && typeof item.body === 'string'
            && typeof item.token === 'string' && ['comments', 'replies', 'reopened'].includes(item.kind))) {
            throw new Error('Invalid feedback notification')
        }
        items.value = data.items
        cursor = Number(data.cursor)
        unreadCount.value = data.unreadCount
        events.value = { comments: data.events.comments, replies: data.events.replies, reopened: data.events.reopened }
    }

    async function refresh() {
        if (!activeConnection.value?.token || saving.value || unsupported.value) return
        const mine = ++generation
        loading.value = true
        error.value = ''
        try {
            const data = await apiFetch(endpoint, { headers: BACKGROUND_REQUEST, retry: 0 })
            if (mine === generation) apply(data)
        } catch (e: unknown) {
            if (mine !== generation) return
            if (e instanceof Error && 'status' in e && e.status === 404) unsupported.value = true
            else error.value = "Couldn't refresh feedback. Showing the last loaded updates."
        } finally { if (mine === generation) loading.value = false }
    }
    async function update(body: { action?: 'read' | 'clear'; events?: Events }) {
        if (saving.value || unsupported.value || !activeConnection.value?.token) return
        const mine = ++generation
        saving.value = true
        error.value = ''
        try {
            const data = await apiFetch(endpoint, { method: 'PATCH', retry: 0,
                body: JSON.stringify({ ...body, cursor }) })
            if (mine === generation) apply(data)
        } catch {
            if (mine === generation) error.value = "Couldn't save feedback settings. Reload to check the current state."
        } finally { if (mine === generation) { saving.value = false; loading.value = false } }
    }
    watch(() => [activeConnection.value?.connectionId, activeConnection.value?.username, activeConnection.value?.token], () => {
        generation++
        items.value = []
        unreadCount.value = 0
        events.value = defaultEvents()
        cursor = 0
        error.value = ''
        unsupported.value = false
        saving.value = false
        loading.value = false
        void refresh()
    }, { immediate: true })
    watch(open, value => { if (value && unreadCount.value) void update({ action: 'read' }) })
    onMounted(() => { timer = setInterval(() => { void refresh() }, 30_000) })
    onUnmounted(() => { generation++; clearInterval(timer) })

    function reviewUrl(item: FeedbackNotification) {
        return `${activeConnection.value?.baseUrl.replace(/\/+$/, '')}/link/${encodeURIComponent(item.token)}`
    }
    return {
        serverName, items, unreadCount, events, error, unsupported, loading, saving, refresh, reviewUrl,
        markRead: () => update({ action: 'read' }),
        clear: () => update({ action: 'clear' }),
        setEvents: (next: Events) => update({ events: next }),
    }
}
