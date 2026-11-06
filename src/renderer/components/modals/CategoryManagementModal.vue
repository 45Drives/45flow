<!-- src/renderer/components/modals/CategoryManagementModal.vue -->
<template>
  <FlowModal :model-value="isOpen" title="Comment Categories" size="lg" surface="default" :busy="isSaving" @close="cancel">
          <!-- Add New Category -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-default mb-2">Add New Category</label>
            <div class="flex gap-2">
              <div class="relative flex-shrink-0">
                <input
                  v-model="newCategoryColor"
                  type="color"
                  class="w-10 h-10 rounded cursor-pointer border border-default bg-accent"
                  title="Pick a color"
                />
              </div>
              <input
                v-model="newCategoryName"
                type="text"
                placeholder="Category name"
                class="flex-1 px-3 py-2 border border-default rounded-md text-sm text-default bg-default focus:outline-none focus:ring-2 focus:ring-primary"
                @keyup.enter="submitNewCategory"
              />
              <button
                @click="submitNewCategory"
                :disabled="!newCategoryName.trim()"
                class="px-3 py-2 bg-primary text-default text-sm rounded-md hover:bg-primary/80 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div v-if="addError" class="mt-1 text-sm text-flow-danger">{{ addError }}</div>
          </div>

          <!-- Default Categories Suggestion -->
          <div class="mb-4 p-3 bg-well/40 rounded-md">
            <p class="text-xs font-medium text-muted mb-2">Suggested categories:</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="defaultCat in defaultCategories"
                :key="defaultCat.name"
                @click="addSuggestedCategory(defaultCat.name, defaultCat.color)"
                :disabled="categoryExists(defaultCat.name)"
                class="px-2 py-1 text-xs text-default bg-default border border-default rounded hover:bg-well/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ defaultCat.name }}
              </button>
            </div>
          </div>

          <!-- Categories List -->
          <div>
            <label class="block text-sm font-medium text-default mb-2">Current Categories</label>
            <div v-if="draftCategories.length === 0" class="text-sm text-muted italic">No categories yet</div>
            <div v-else class="space-y-2">
              <div
                v-for="category in draftCategories"
                :key="category.id || category.tempId"
                class="flex items-center gap-3 p-2 bg-well/40 rounded-md"
              >
                <div class="relative flex-shrink-0">
                  <input
                    :value="category.color || '#E5E7EB'"
                    type="color"
                    class="w-6 h-6 rounded cursor-pointer border border-default bg-accent"
                    :title="'Change color for ' + category.name"
                    @input="(e) => updateCategoryColor((category.id || category.tempId)!, (e.target as HTMLInputElement).value)"
                  />
                </div>
                <span class="flex-1 text-sm text-default">{{ category.name }}</span>
                <button
                  @click="removeCategory((category.id || category.tempId)!)"
                  class="btn btn-danger text-xs px-2 py-1 h-fit"
                  aria-label="Remove"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

        <template #footer>
          <button
            @click="cancel"
            class="btn btn-dismiss"
          >
            Cancel
          </button>
          <button
            @click="saveCategories"
            :disabled="isSaving"
            class="btn btn-success"
          >
            {{ isSaving ? 'Saving...' : 'Save Categories' }}
          </button>
        </template>
  </FlowModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCommentCategories } from '../../composables/useCommentCategories';
import { pushNotification, Notification } from '@45drives/houston-common-ui';
import FlowModal from '../../ui/FlowModal.vue';

interface Props {
  isOpen: boolean;
  token?: string;
  linkId?: number;
  categories?: Array<{ id?: number; name: string; color: string | null }>;
  // Set when the link does not exist yet; categories are returned to the caller instead of saved.
  staged?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  categoriesUpdated: [categories: Array<{ id?: number; name: string; color: string | null }>];
}>();

const { createCategory: apiCreateCategory, deleteCategory: apiDeleteCategory, updateCategory: apiUpdateCategory, getDefaultCategories, getCategoriesForLink, clearCategoryCache } = useCommentCategories();

interface DraftCategory {
  id?: number;
  tempId?: string;
  name: string;
  color: string | null;
  isNew?: boolean;
  isDeleted?: boolean;
  colorChanged?: boolean;
}

const draftCategories = ref<DraftCategory[]>([]);
const newCategoryName = ref('');
const newCategoryColor = ref('#4ECDC4');
const isSaving = ref(false);
const addError = ref('');
const defaultCategories = ref<Array<{ name: string; color: string }>>([]);
const originalCategoryIds = ref<number[]>([]);
let nextTempId = 1;

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      nextTempId = 1;
      // Staged categories have no server id yet, so give each row a stable local key.
      draftCategories.value = (props.categories || []).map(c =>
        c.id == null ? { ...c, tempId: `temp-${nextTempId++}`, isNew: true } : { ...c }
      );
      originalCategoryIds.value = (props.categories || []).map(c => c.id).filter((id): id is number => typeof id === 'number');
      defaultCategories.value = getDefaultCategories();
      newCategoryName.value = '';
      newCategoryColor.value = '#4ECDC4';
      addError.value = '';
    }
  }
);

function categoryExists(name: string): boolean {
  return draftCategories.value.some((c) => !c.isDeleted && c.name.toLowerCase() === name.toLowerCase());
}

function addCategory(categoryName: string, color: string | null = null) {
  if (!categoryName || !categoryName.trim()) {
    addError.value = 'Category name is required';
    return;
  }

  if (categoryExists(categoryName)) {
    addError.value = 'Category already exists';
    return;
  }

  addError.value = '';
  draftCategories.value.push({
    tempId: `temp-${nextTempId++}`,
    name: categoryName.trim(),
    color: color || null,
    isNew: true,
  });
  newCategoryName.value = '';
  newCategoryColor.value = '#4ECDC4';
}

function submitNewCategory() {
  addCategory(newCategoryName.value, newCategoryColor.value);
}

function addSuggestedCategory(name: string, color: string) {
  addCategory(name, color);
}

function updateCategoryColor(id: number | string, color: string) {
  const category = draftCategories.value.find(c => (c.id || c.tempId) === id);
  if (category) {
    category.color = color;
    if (category.id) {
      category.colorChanged = true;
    }
  }
}

function removeCategory(id: number | string) {
  const index = draftCategories.value.findIndex(c => (c.id || c.tempId) === id);
  if (index >= 0) {
    const category = draftCategories.value[index];
    if (category.isNew) {
      draftCategories.value.splice(index, 1);
    } else {
      category.isDeleted = true;
      draftCategories.value.splice(index, 1);
    }
  }
}

async function saveCategories() {
  if (props.staged) {
    const staged = draftCategories.value.map(c => ({ name: c.name, color: c.color }));
    emit('categoriesUpdated', staged);
    emit('close');
    pushNotification(
      new Notification(
        'Categories Ready',
        staged.length > 0
          ? `${staged.length} ${staged.length === 1 ? 'category' : 'categories'} will be created with the link`
          : 'No categories will be created with the link',
        'info',
        3500
      )
    );
    return;
  }

  if (!props.token || props.linkId === undefined || props.linkId === null) return;
  
  isSaving.value = true;
  try {
    let addedCount = 0;
    let updatedCount = 0;
    
    for (const category of draftCategories.value) {
      if (category.isNew) {
        const created = await apiCreateCategory(props.token, props.linkId, category.name, category.color);
        if (created?.id) {
          category.id = created.id;
          category.isNew = false;
        }
        addedCount++;
      } else if (category.colorChanged && category.id) {
        await apiUpdateCategory(props.token, category.id, undefined, category.color || undefined);
        updatedCount++;
      }
    }

    const currentIds = new Set(draftCategories.value.filter(c => c.id).map(c => c.id!));
    const deletedIds = originalCategoryIds.value.filter(id => !currentIds.has(id));
    
    for (const id of deletedIds) {
      await apiDeleteCategory(props.token, id);
    }
    const removedCount = deletedIds.length;
    
    clearCategoryCache(props.linkId);
    const updated = await getCategoriesForLink(props.token, props.linkId);
    emit('categoriesUpdated', updated);
    emit('close');
    
    const messages = [];
    if (addedCount > 0) messages.push(`Added ${addedCount} ${addedCount === 1 ? 'category' : 'categories'}`);
    if (updatedCount > 0) messages.push(`Updated ${updatedCount} ${updatedCount === 1 ? 'category' : 'categories'}`);
    if (removedCount > 0) messages.push(`Removed ${removedCount} ${removedCount === 1 ? 'category' : 'categories'}`);
    
    if (messages.length > 0) {
      pushNotification(
        new Notification(
          'Categories Saved',
          messages.join(', '),
          'success',
          4000
        )
      );
    } else {
      pushNotification(
        new Notification(
          'Categories Saved',
          'No changes were made',
          'info',
          3000
        )
      );
    }
  } catch (error: any) {
    console.error('[CategoryManagementModal] Failed to save categories:', error);
    addError.value = error?.message || 'Failed to save categories';
    pushNotification(
      new Notification(
        'Save Failed',
        error?.message || 'Could not save categories',
        'error',
        5000
      )
    );
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  emit('close');
}
</script>
