<template>
    <div class="flex flex-col gap-2 items-end">
        <div class="flex items-center gap-2">
            <input ref="fileInput" type="file" :accept="accept" class="hidden" :aria-label="`Choose ${label}`" @change="onFile" />
            <button class="btn btn-secondary text-xs px-2 py-1" type="button" :disabled="disabled" @click="fileInput?.click()">
                {{ asset.filename ? 'Replace' : 'Upload' }}
            </button>
            <button v-if="asset.filename" class="btn btn-danger text-xs px-2 py-1" type="button" :disabled="disabled"
                @click="emit('remove')">
                Remove
            </button>
        </div>
        <div v-if="asset.previewUrl" class="flex items-start gap-3 p-2 border border-default rounded bg-well/30 max-w-[16rem]">
            <img :src="asset.previewUrl" :alt="`${label} preview`" class="w-16 h-16 object-contain rounded border border-default bg-default" />
            <div class="flex-1 min-w-0 text-xs space-y-0.5">
                <div v-if="asset.info?.name" class="font-medium text-default truncate">{{ asset.info.name }}</div>
                <div class="text-accent">
                    <span v-if="asset.info?.width && asset.info?.height">{{ asset.info.width }} × {{ asset.info.height }}px</span>
                    <span v-if="asset.info?.size" class="ml-2">{{ (asset.info.size / 1024).toFixed(1) }} KB</span>
                </div>
            </div>
        </div>
        <div v-else-if="!disabled && !asset.filename" class="text-xs text-accent">{{ emptyText }}</div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { BrandingAsset } from '../composables/useBrandingSettings';

defineProps<{
    asset: BrandingAsset
    label: string
    accept: string
    emptyText: string
    disabled?: boolean
}>();
const emit = defineEmits<{ (e: 'upload', file: File): void; (e: 'remove'): void }>();

const fileInput = ref<HTMLInputElement | null>(null);

function onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) emit('upload', file);
    input.value = '';
}
</script>
