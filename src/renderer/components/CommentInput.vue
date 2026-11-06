<!-- src/renderer/components/CommentInput.vue -->
<template>
  <form @submit.prevent="submitComment" class="flex flex-col gap-3 p-3 bg-default/50 rounded-md border border-default">
    <!-- Category Selection -->
    <div v-if="categories.length > 0" class="flex items-end gap-2">
      <div class="flex-1">
        <label class="block text-xs font-semibold text-muted mb-1">Category (Optional)</label>
        <select
          v-model="selectedCategoryId"
          class="w-full px-3 py-1.5 text-sm border border-default rounded bg-default"
        >
          <option :value="null">— None —</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            <span v-if="cat.color">●</span>
            {{ cat.name }}
          </option>
        </select>
      </div>

      <!-- Show color preview if category selected -->
      <div
        v-if="selectedCategory"
        class="w-8 h-8 rounded border-2 border-default"
        :style="{ backgroundColor: selectedCategory.color || '#E5E7EB' }"
        :title="selectedCategory.name"
      />
    </div>

    <!-- Author Name (for open links) -->
    <div v-if="showAuthorName" class="flex items-end gap-2">
      <input
        v-model="authorName"
        type="text"
        placeholder="Your name"
        class="flex-1 px-3 py-1.5 text-sm border border-default rounded bg-default"
        required
      />
    </div>

    <!-- Comment Text -->
    <textarea
      v-model="commentBody"
      placeholder="Add a comment..."
      class="w-full px-3 py-2 text-sm border border-default rounded bg-default min-h-[60px] resize-none"
      required
    />

    <!-- Submit Button -->
    <div class="flex justify-end gap-2">
      <button
        type="button"
        @click="resetForm"
        class="btn btn-dismiss text-sm px-3 py-1.5"
      >
        Cancel
      </button>
      <button
        type="submit"
        :disabled="isSubmitting || !commentBody.trim()"
        class="btn btn-primary text-sm px-3 py-1.5"
      >
        {{ isSubmitting ? 'Posting...' : 'Post Comment' }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Category {
  id: number;
  name: string;
  color: string | null;
}

interface Props {
  categories?: Category[];
  showAuthorName?: boolean;
  authorNamePlaceholder?: string;
  isSubmitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  categories: () => [],
  showAuthorName: true,
  authorNamePlaceholder: 'Your name',
  isSubmitting: false,
});

const emit = defineEmits<{
  submit: [data: { body: string; categoryId: number | null; authorName?: string }];
  cancel: [];
}>();

const commentBody = ref('');
const authorName = ref('');
const selectedCategoryId = ref<number | null>(null);

const selectedCategory = computed(() => {
  if (selectedCategoryId.value === null) return null;
  return props.categories.find((c) => c.id === selectedCategoryId.value);
});

function submitComment() {
  if (!commentBody.value.trim()) return;

  emit('submit', {
    body: commentBody.value.trim(),
    categoryId: selectedCategoryId.value,
    authorName: props.showAuthorName ? authorName.value.trim() : undefined,
  });

  resetForm();
}

function resetForm() {
  commentBody.value = '';
  authorName.value = '';
  selectedCategoryId.value = null;
  emit('cancel');
}
</script>
