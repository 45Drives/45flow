<template>
    <section aria-label="Staff login lockouts" class="mt-6">
        <p class="flow-subhead">Staff login lockouts</p>
        <p class="text-sm text-muted mb-3">
            Five failed passwords within 15 minutes lock a staff account for 15 minutes.
            A successful sign-in resets the counter. Staff passwords must be at least 16 characters;
            the host PAM password-change policy must enforce password length and quality.
        </p>
        <p v-if="loading && !loaded" class="text-sm text-muted py-2" role="status">Loading locked accounts…</p>
        <FlowNotice v-else-if="unsupported" tone="info" size="sm">
            Update the server to manage staff login lockouts here.
        </FlowNotice>
        <template v-else>
            <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
                {{ error }}
                <template v-if="!loaded && !loading" #actions>
                    <FlowButton size="xs" @click="load">Try again</FlowButton>
                </template>
            </FlowNotice>
            <div v-if="loaded && !lockouts.length" class="flow-group py-3 text-sm text-muted">
                No staff accounts are locked.
            </div>
            <div v-for="lockout in lockouts" :key="lockout.username"
                class="flow-group flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <div class="min-w-0">
                    <p class="font-medium break-all">{{ lockout.username }}</p>
                    <p class="text-sm text-muted">
                        {{ lockout.failedAttempts }} failed attempts.
                        Locked until {{ dateTime(lockout.lockedUntil) }}.
                    </p>
                </div>
                <FlowButton size="xs" :disabled="busyUsername !== ''" :loading="busyUsername === lockout.username"
                    loading-text="Unlocking…" @click="unlock(lockout.username)">
                    Unlock account
                </FlowButton>
            </div>
            <FlowNotice v-if="unlocked" tone="success" size="sm" live class="mt-3">
                {{ unlocked }} was unlocked.
            </FlowNotice>
        </template>
    </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId)

type LoginLockout = { username: string; failedAttempts: number; lockedUntil: string }
const loading = ref(false)
const loaded = ref(false)
const unsupported = ref(false)
const error = ref('')
const lockouts = ref<LoginLockout[]>([])
const busyUsername = ref('')
const unlocked = ref('')

function dateTime(iso: string) {
    return new Date(iso).toLocaleString()
}

async function load() {
    loading.value = true
    error.value = ''
    try {
        const result = await apiFetch('/api/admin/login-lockouts')
        lockouts.value = result.lockouts
        loaded.value = true
    } catch (e: any) {
        if (e?.status === 404) unsupported.value = true
        else error.value = `Couldn't load locked accounts: ${e?.message || 'request failed'}.`
    } finally {
        loading.value = false
    }
}

async function unlock(username: string) {
    busyUsername.value = username
    error.value = ''
    unlocked.value = ''
    try {
        await apiFetch(`/api/admin/login-lockouts/${encodeURIComponent(username)}`, { method: 'DELETE', retry: 0 })
        lockouts.value = lockouts.value.filter(lockout => lockout.username !== username)
        unlocked.value = username
    } catch (e: any) {
        error.value = `Couldn't unlock ${username}: ${e?.message || 'request failed'}.`
    } finally {
        busyUsername.value = ''
    }
}

onMounted(load)
</script>
