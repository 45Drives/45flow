<template>
    <div class="relative w-full" data-path-input-root>
        <input :value="input" @input="onInput" @focus="openMenu" @keydown="onKey"
            :placeholder="placeholder || 'Type a path… (e.g. /, /projects, /media/foo.mp4)'"
            class="input-textlike text-default w-full" autocomplete="off" spellcheck="false" />
        <div v-if="open && suggestions.length"
            class="absolute z-50 w-full max-h-72 overflow-auto rounded-md border border-default bg-default shadow-lg"
            role="listbox">
            <div v-for="(s, i) in suggestions" :key="s.path"
                class="flex items-center px-3 py-2 cursor-pointer text-base"
                :class="i === highlighted ? 'bg-accent' : ''" @mouseenter="highlighted = i"
                @mousedown.prevent="accept(s)" data-option>
                <FolderIcon v-if="s.isDir" class="w-4 h-4 mr-2 opacity-70 shrink-0" />
                <DocumentIcon v-else class="w-4 h-4 mr-2 opacity-70 shrink-0" />
                <span class="truncate">{{ s.path }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { FolderIcon, DocumentIcon } from '@heroicons/vue/24/outline'

// Required: a function that calls your authenticated API
const props = defineProps<{
    modelValue: string
    apiFetch: (path: string, init?: RequestInit) => Promise<any>
    placeholder?: string
    // If true, only suggest directories (common for “choose a folder”)
    dirsOnly?: boolean
}>()
const emit = defineEmits<{
    (e: 'update:modelValue', v: string): void
    (e: 'choose', v: { path: string; isDir: boolean }): void
}>()

// Textbox state
const input = ref(props.modelValue ?? '')

// Dropdown state
const open = ref(false)
const suggestions = ref<Array<{ name: string; isDir: boolean; path: string }>>([])
const highlighted = ref(0)

// Click outside to close
function onDocClick(e: MouseEvent) {
    const root = (e.target as HTMLElement)?.closest('[data-path-input-root]')
    if (!root) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

watch(() => props.modelValue, v => { if (v !== input.value) input.value = v ?? '' })

function normalize(p: string) {
    if (!p) return ''
    // collapse // and trailing/leading
    return '/' + p.replace(/^\/+/, '').replace(/\/{2,}/g, '/')
}
function join(a: string, b: string) {
    const left = a.replace(/\/+$/, '')
    const right = b.replace(/^\/+/, '')
    return normalize(left ? `${left}/${right}` : `/${right}`)
}

// Parse the text into parent + partial
const parentAndLeaf = computed(() => {
    const v = normalize(input.value || '')
    const i = v.lastIndexOf('/')
    // "/" or "" => parent "", leaf ""
    if (i <= 0) return { parent: '', leaf: v.replace('/', '') }
    return { parent: v.slice(0, i), leaf: v.slice(i + 1) }
})

// Debounce fetch
let t: number | undefined
watch(parentAndLeaf, ({ parent }) => {
    window.clearTimeout(t)
    t = window.setTimeout(() => loadDir(parent), 80)
}, { immediate: true })

async function loadDir(parent: string) {
    const rel = parent.replace(/^\//, '')
    try {
        const data = await props.apiFetch(`/api/files?dir=${encodeURIComponent(rel)}`)
        const base = normalize(parent)
        suggestions.value = (data.entries || [])
            .filter((e: any) => props.dirsOnly ? e.isDir : true)
            .map((e: any) => ({ name: e.name, isDir: e.isDir, path: join(base, e.name) }))
            .sort((a: { isDir: any; name: string; }, b: { isDir: any; name: any; }) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
        filterByLeaf()
        clampHighlight()
    } catch {
        suggestions.value = []
    }
}

function filterByLeaf() {
    const leaf = (parentAndLeaf.value.leaf || '').toLowerCase()
    const list = suggestions.value
    const filtered = leaf ? list.filter(s => s.name.toLowerCase().includes(leaf)) : list
    suggestions.value = filtered
    clampHighlight()
}

function openMenu() {
    open.value = true
    highlighted.value = suggestions.value.length ? 0 : 0
    nextTick(scrollHighlightedIntoView)
}

function onInput(e: Event) {
    emit('update:modelValue', normalize((e.target as HTMLInputElement).value))
    openMenu()
    filterByLeaf()
}

watch(suggestions, () => {
    clampHighlight()
    highlighted.value = suggestions.value.length ? 0 : 0
    nextTick(scrollHighlightedIntoView)
})


function accept(item?: { path: string; isDir: boolean }) {
    const pick = item ?? suggestions.value[highlighted.value]
    if (!pick) return
    // If dir, append trailing slash and keep menu open (like your screenshots)
    if (pick.isDir) {
        const next = normalize(pick.path + '/')
        input.value = next
        emit('update:modelValue', next)
        // Load that directory right away
        loadDir(next)
        nextTick(() => openMenu())
    } else {
        input.value = normalize(pick.path)
        emit('update:modelValue', input.value)
        open.value = false
    }
    emit('choose', pick)
}

function autocomplete() {
    const cur = suggestions.value[highlighted.value]
    if (cur) {
        if (cur.isDir) {
            const next = normalize(cur.path + '/')
            input.value = next
            emit('update:modelValue', next)
            loadDir(next)
        } else {
            input.value = normalize(cur.path)
            emit('update:modelValue', input.value)
            open.value = false
        }
    }
}

function clampHighlight() {
    const max = suggestions.value.length - 1
    if (max < 0) { highlighted.value = 0; return }
    highlighted.value = Math.max(0, Math.min(highlighted.value, max))
}

function scrollHighlightedIntoView() {
    // Find the listbox and its option rows
    const list = document.querySelector('[data-path-input-root] [role="listbox"]') as HTMLElement | null
    if (!list) return
    const rows = list.querySelectorAll<HTMLElement>('[data-option]')
    const el = rows[highlighted.value]
    if (!el) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    const viewTop = list.scrollTop
    const viewBottom = viewTop + list.clientHeight
    if (top < viewTop) list.scrollTop = top
    else if (bottom > viewBottom) list.scrollTop = bottom - list.clientHeight
}

function onKey(e: KeyboardEvent) {
    const k = e.key 
    switch (k) {
        case 'ArrowDown':
        case 'Down':
            e.preventDefault()
            if (!open.value) { open.value = true; highlighted.value = 0; return }
            if (suggestions.value.length) {
                highlighted.value = Math.min(highlighted.value + 1, suggestions.value.length - 1)
                nextTick(scrollHighlightedIntoView)
            }
            return

        case 'ArrowUp':
        case 'Up':
            e.preventDefault()
            if (!open.value) { open.value = true; highlighted.value = 0; return }
            if (suggestions.value.length) {
                highlighted.value = Math.max(highlighted.value - 1, 0)
                nextTick(scrollHighlightedIntoView)
            }
            return

        case 'Enter':
            e.preventDefault(); accept(); return
        case 'Tab':
            e.preventDefault(); autocomplete(); return
        case 'Escape':
            open.value = false; return
    }
}


</script>
