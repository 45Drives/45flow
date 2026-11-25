<template>
    <FlowModal :model-value="modelValue" title="Review backup records" size="lg" :busy="busy"
        description="Assign the correct account and installation, or remove records for backups that no longer exist."
        @update:model-value="value => emit('update:modelValue', value)">
        <p v-if="loading" role="status" class="text-sm">Loading backup records…</p>
        <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
            {{ error }}
            <template #actions><FlowButton type="button" size="xs" :disabled="busy" @click="load">Refresh records</FlowButton></template>
        </FlowNotice>
        <template v-if="!loading && !error">
            <p v-if="!records.length" class="text-sm">All backup records have an account and installation.</p>
            <div v-else class="space-y-4">
                <p class="text-sm text-muted">
                    Confirm the account and installation with the person who runs each backup. A saved Samba username
                    is a hint, not proof of ownership. Scheduled backups do not need an authenticator code.
                </p>
                <section v-for="record in records" :key="record.uuid" class="flow-group p-3 space-y-3">
                    <div class="space-y-1 text-sm">
                        <h3 class="font-semibold break-all">{{ record.name || 'Unnamed backup' }}</h3>
                        <p class="break-all">Source: {{ record.source }}</p>
                        <p class="break-all">Destination: {{ record.target }}</p>
                        <p v-if="record.smb_user" class="break-all">Saved Samba username (unverified): {{ record.smb_user }}</p>
                        <p class="text-muted break-all">Record ID: {{ record.uuid }}</p>
                    </div>
                    <div v-if="editing === record.uuid" class="space-y-3">
                        <FlowField :id="`backup-owner-${record.uuid}`" label="Server sign-in username"
                            help="Use the account that signs in for this backup, not necessarily the Samba username.">
                            <template #default="{ id, describedBy }">
                                <input :id="id" v-model="owner" type="text" autocomplete="off" :aria-describedby="describedBy"
                                    :disabled="busy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
                            </template>
                        </FlowField>
                        <FlowField :id="`backup-client-${record.uuid}`" label="Storage Wizard installation ID"
                            help="Verify this ID on the computer running the backup; it is stored in Storage Wizard's client-id.txt.">
                            <template #default="{ id, describedBy }">
                                <input :id="id" v-model="clientId" type="text" autocomplete="off" :aria-describedby="describedBy"
                                    :disabled="busy" class="input-textlike w-full px-3 py-2 rounded-lg border border-default font-mono" />
                            </template>
                        </FlowField>
                        <label class="flex items-start gap-2 text-sm">
                            <input v-model="verified" type="checkbox" :disabled="busy" />
                            <span>I verified this account and installation with the backup owner.</span>
                        </label>
                        <div class="flex flex-wrap gap-2">
                            <FlowButton type="button" size="sm" variant="primary" :disabled="busy || !validAssignment" @click="assign(record)">
                                Assign owner
                            </FlowButton>
                            <FlowButton type="button" size="sm" variant="dismiss" :disabled="busy" @click="editing = null">Cancel</FlowButton>
                        </div>
                    </div>
                    <div v-else class="flex flex-wrap gap-2">
                        <FlowButton type="button" size="sm" :disabled="busy" @click="edit(record)">Assign owner</FlowButton>
                        <FlowButton type="button" size="sm" variant="danger" :disabled="busy" @click="deleting = record">Remove record</FlowButton>
                    </div>
                </section>
            </div>
        </template>
    </FlowModal>
    <ConfirmDeleteModal :model-value="!!deleting" title="Remove backup record?" confirm-text="Remove record"
        :busy="busy" :error="deleteError || null" @update:model-value="value => { if (!value) deleting = null }" @confirm="remove">
        Remove the server record for <strong>{{ deleting?.name || 'this backup' }}</strong>?
        This does not delete backup files or stop a schedule on any computer. Only remove it if the backup is no longer needed.
    </ConfirmDeleteModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApi } from '../composables/useApi'
import FlowButton from '../ui/FlowButton.vue'
import FlowField from '../ui/FlowField.vue'
import FlowModal from '../ui/FlowModal.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import ConfirmDeleteModal from './modals/ConfirmDeleteModal.vue'

const props = defineProps<{ modelValue: boolean; connectionId: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; changed: [] }>()
const { apiFetch } = useApi(props.connectionId, { transport: 'nginx-https' })

type BackupRecord = {
    uuid: string; name: string | null; source: string; target: string
    owner_user: string | null; client_id: string | null; smb_user: string | null
}

const records = ref<BackupRecord[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const deleteError = ref('')
const editing = ref<string | null>(null)
const deleting = ref<BackupRecord | null>(null)
const owner = ref('')
const clientId = ref('')
const verified = ref(false)
const validAssignment = computed(() => verified.value &&
    /^[A-Za-z0-9._][A-Za-z0-9._-]{0,255}$/.test(owner.value.trim()) &&
    /^[A-Za-z0-9._-]{1,64}$/.test(clientId.value.trim()))

async function load() {
    loading.value = true
    error.value = ''
    try {
        const data: { ownershipReviewVersion?: number; unassigned?: BackupRecord[] } =
            await apiFetch('/api/storage-wizard/backup-ownership-preflight')
        if (data.ownershipReviewVersion !== 1 || !Array.isArray(data.unassigned)) {
            throw new Error('Update the server before reviewing backup records here.')
        }
        records.value = data.unassigned
        editing.value = null
    } catch (e: unknown) {
        error.value = e instanceof Error ? e.message : 'Could not load backup records.'
    } finally {
        loading.value = false
    }
}

function edit(record: BackupRecord) {
    editing.value = record.uuid
    owner.value = record.owner_user || ''
    clientId.value = record.client_id || ''
    verified.value = false
}

async function assign(record: BackupRecord) {
    if (!validAssignment.value) return
    busy.value = true
    error.value = ''
    try {
        await apiFetch(`/api/storage-wizard/backup-configs/${encodeURIComponent(record.uuid)}?all=true`, {
            method: 'PUT', retry: 0,
            body: JSON.stringify({
                owner_user: owner.value.trim(), client_id: clientId.value.trim(),
                expected_owner_user: record.owner_user, expected_client_id: record.client_id,
            }),
        })
        emit('changed')
        await load()
    } catch (e: unknown) {
        error.value = e instanceof Error ? e.message : 'Could not assign this backup.'
    } finally {
        busy.value = false
    }
}

async function remove() {
    const record = deleting.value
    if (!record) return
    busy.value = true
    deleteError.value = ''
    try {
        await apiFetch(`/api/storage-wizard/backup-configs/${encodeURIComponent(record.uuid)}?all=true`, {
            method: 'DELETE', retry: 0,
            body: JSON.stringify({ expected_owner_user: record.owner_user, expected_client_id: record.client_id }),
        })
        deleting.value = null
        emit('changed')
        await load()
    } catch (e: unknown) {
        deleteError.value = e instanceof Error ? e.message : 'Could not remove this record.'
    } finally {
        busy.value = false
    }
}

watch(() => props.modelValue, open => {
    if (open) void load()
    else { deleting.value = null; deleteError.value = ''; editing.value = null }
}, { immediate: true })
</script>
