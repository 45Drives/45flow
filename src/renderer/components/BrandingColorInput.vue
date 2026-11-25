<template>
    <div class="flex items-center gap-2">
        <input :value="pickerValue" type="color" :disabled="disabled" :aria-label="`${label} picker`"
            class="w-8 h-8 rounded cursor-pointer border border-default"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
        <input :value="modelValue" type="text" :disabled="disabled" :aria-label="label" :placeholder="placeholder"
            class="input-textlike border border-default px-2 py-1 rounded text-sm w-24 font-mono" maxlength="7"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value.trim())" />
        <button v-if="clearable && modelValue" type="button" class="btn btn-secondary btn-xs" :disabled="disabled"
            :aria-label="`Reset ${label} to default`" @click="emit('update:modelValue', '')">
            Default
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    modelValue: string
    label: string
    placeholder?: string
    disabled?: boolean
    /** Empty means "use the 45Flow default". */
    clearable?: boolean
    /** Shown in the picker while the value is empty. */
    fallback?: string
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

// type="color" needs a full #rrggbb value; show the fallback while the text is partial or empty.
const pickerValue = computed(() =>
    /^#[0-9a-fA-F]{6}$/.test(props.modelValue) ? props.modelValue : (props.fallback || '#000000'));
</script>
