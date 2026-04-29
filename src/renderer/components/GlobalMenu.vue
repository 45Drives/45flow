<template>
    <div class="z-50">
        <!-- Trigger button -->
        <button ref="menuButton" @click="toggle" class="theme-trigger" title="Change theme">
            Themes <SwatchIcon class="ml-2 w-5 h-5" />
        </button>

        <!-- Popover -->
        <teleport to="body">
            <transition name="theme-pop">
                <div v-if="show" ref="menuRef" class="theme-popover"
                    :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }">

                    <!-- Header -->
                    <div class="tp-header">
                        <SwatchIcon class="w-4 h-4 opacity-70" />
                        <span class="tp-title">Studio Palette</span>
                    </div>

                    <!-- Palette grid -->
                    <div class="tp-grid">
                        <button v-for="palette in studioPalettes" :key="palette.theme"
                            class="tp-swatch"
                            :class="[palette.className, currentTheme === palette.theme ? 'tp-swatch-active' : '']"
                            :title="palette.label"
                            @click="selectTheme(palette.theme)">
                            {{ palette.label }}
                        </button>
                    </div>
                </div>
            </transition>
        </teleport>
    </div>
</template>


<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { SwatchIcon } from '@heroicons/vue/24/outline'
import { useThemeFromAlias, type Theme } from '../composables/useThemeFromAlias'

// --- Popover state & positioning ---
const show = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const menuButton = ref<HTMLElement | null>(null)
const menuPosition = ref({ top: 0, left: 0 })

const toggle = async () => {
    show.value = !show.value
    if (show.value && menuButton.value) {
        await nextTick()
        const rect = menuButton.value.getBoundingClientRect()
        const popoverWidth = 340
        menuPosition.value = {
            top: rect.bottom + 8,
            left: Math.max(8, rect.right - popoverWidth),
        }
    }
}

const handleClickOutside = (event: MouseEvent) => {
    const path = event.composedPath()
    if (show.value && menuRef.value && !path.includes(menuRef.value) && !path.includes(menuButton.value as Node)) {
        show.value = false
    }
}
const handleKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') show.value = false }

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('keydown', handleKeydown)
})

const { setTheme, currentTheme } = useThemeFromAlias()

const studioPalettes: Array<{ label: string; theme: Theme; className: string }> = [

    { label: 'Flow', theme: 'theme-studio-grad-logo-flow', className: 'tp-grad-logo-flow' },
    { label: 'Party', theme: 'theme-studio-grad-purple-pink-orange', className: 'tp-grad-purple-pink-orange' },
    { label: 'Prism', theme: 'theme-studio-grad-red-purple-blue', className: 'tp-grad-red-purple-blue' },
    { label: 'Synthwave', theme: 'theme-studio-grad-sunset-laser', className: 'tp-grad-sunset-laser' },
    { label: 'Cyber Pulse', theme: 'theme-studio-grad-neon-studio', className: 'tp-grad-neon-studio' },

    { label: 'Moon Mist', theme: 'theme-studio-grad-moon-mist', className: 'tp-grad-moon-mist' },
    { label: 'Flamingo', theme: 'theme-studio-grad-pink-orange', className: 'tp-grad-pink-orange' },
    { label: 'Spectrum', theme: 'theme-studio-grad-red-blue-green', className: 'tp-grad-red-blue-green' },
    { label: 'Borealis', theme: 'theme-studio-grad-aurora', className: 'tp-grad-aurora' },

    { label: 'Solstice', theme: 'theme-studio-grad-yellow-orange-red', className: 'tp-grad-yellow-orange-red' },
    { label: 'Ultraviolet', theme: 'theme-studio-grad-electric-violet', className: 'tp-grad-electric-violet' },
    { label: 'Infrared', theme: 'theme-studio-grad-infrared', className: 'tp-grad-infrared' },

    { label: 'Blue Steel', theme: 'theme-studio-blue-steel', className: 'tp-studio-balanced' },
    { label: 'Graphite', theme: 'theme-studio-slate', className: 'tp-studio-slate' },
    { label: 'Deep Sea', theme: 'theme-studio-ocean', className: 'tp-studio-ocean' },
    { label: 'Titanium', theme: 'theme-studio-grad-chrome', className: 'tp-grad-chrome' },

    { label: 'Enterprise', theme: 'theme-studio-grad-enterprise', className: 'tp-grad-enterprise' },
    { label: 'Homelab', theme: 'theme-studio-grad-homelab', className: 'tp-grad-homelab' },
    { label: 'Professional', theme: 'theme-studio-grad-professional', className: 'tp-grad-professional' },
    { label: 'Studio', theme: 'theme-studio-original-purple', className: 'tp-studio-original-purple' },
]

function selectTheme(theme: Theme) {
    setTheme(theme)
}
</script>

<style scoped>
/* ── Trigger button ─────────────────────────────── */
.theme-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: #7262b2;
    text-shadow: 0 0 10px rgba(196, 181, 253, 0.4);
    cursor: pointer;
    transition: color 0.2s ease, transform 0.15s ease;
    line-height: 1;
}
.theme-trigger:hover {
    color: #8c4eff;
    transform: scale(1.12);
}

/* ── Popover ────────────────────────────────────── */
.theme-popover {
    position: fixed;
    z-index: 1002;
    width: 340px;
    max-height: 80vh;
    overflow-y: auto;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(16px);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
    padding: 0.65rem;
    color: #e2e8f0;
}

/* Light-mode override */
:root:not(.dark) .theme-popover {
    background: rgba(255, 255, 255, 0.94);
    border-color: rgba(148, 163, 184, 0.35);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.04) inset;
    color: #1e293b;
}

/* ── Header ─────────────────────────────────────── */
.tp-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.25rem 0.45rem;
}

.tp-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.7;
}

/* ── Palette grid ───────────────────────────────── */
.tp-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.3rem;
    margin-bottom: 0.55rem;
}

/* ── Swatch button ──────────────────────────────── */
.tp-swatch {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    padding: 0.4rem 0.25rem;
    border-radius: 0.35rem;
    color: white;
    border: 2px solid rgba(0, 0, 0, 0.18);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
    cursor: pointer;
    text-align: center;
    line-height: 1.2;
    transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tp-swatch:hover {
    transform: scale(1.04);
    filter: brightness(1.08);
}

.tp-swatch-active {
    border-color: white;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 0 12px rgba(255, 255, 255, 0.2);
}

/* ── Transition ─────────────────────────────────── */
.theme-pop-enter-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}
.theme-pop-leave-active {
    transition: opacity 0.12s ease, transform 0.12s ease;
}
.theme-pop-enter-from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
}
.theme-pop-leave-to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
}

/* ── Swatch colors ──────────────────────────────── */
.tp-studio-balanced         { background: linear-gradient(135deg, #2C3E5A, #4E6B93 50%, #7A9BC0); }
.tp-studio-balanced:hover   { background: linear-gradient(135deg, #223250, #3F587A 50%, #6888AE); }

.tp-studio-original-purple       { background: linear-gradient(135deg, #3D2D78, #6557A5 50%, #9B8ADB); }
.tp-studio-original-purple:hover { background: linear-gradient(135deg, #312462, #504584 50%, #8474C5); }

.tp-studio-slate       { background: linear-gradient(135deg, #374151, #5F6E82 50%, #8B9DB3); }
.tp-studio-slate:hover { background: linear-gradient(135deg, #2D3643, #4E5D71 50%, #7889A0); }

.tp-studio-ocean       { background: linear-gradient(135deg, #1B3D4F, #3E6D84 50%, #6BA4BE); }
.tp-studio-ocean:hover { background: linear-gradient(135deg, #153242, #31596D 50%, #5890A8); }

.tp-grad-purple-orange       { background: linear-gradient(135deg, #6F58B8, #C96E36); }
.tp-grad-logo-flow           { background: linear-gradient(135deg, #2EA8FF 0%, #7A4DFF 30%, #D02BD6 56%, #F1578A 76%, #FF9A2A 100%); }
/* .tp-grad-purple-pink-orange {
    background: linear-gradient(135deg, #7A4FD8, #D95AA5 52%, #E57A4A);
} */
.tp-grad-purple-pink-orange {
    background: linear-gradient(135deg, #9A24E4 0%, #CF20AE 32%, #F6336E 64%, #FE774F 100%);
}
.tp-grad-purple-pink-blue    { background: linear-gradient(135deg, #6D4FE0, #D65EAE 50%, #4C7CF4); }
.tp-grad-purple-blue         { background: linear-gradient(135deg, #7A3CFF, #4A7CEB); }
.tp-grad-red-purple-blue     { background: linear-gradient(135deg, #F43F5E, #8B5CF6 52%, #3B82F6); }
.tp-grad-sunset-laser        { background: linear-gradient(135deg, #FF6A00, #FF2D95 48%, #2CF3E9); }
.tp-grad-neon-studio         { background: linear-gradient(135deg, #14B8A6, #6D28D9 45%, #F43F5E); }
.tp-grad-moon-mist           { background: linear-gradient(135deg, #7A2CFF, #2EA8FF 52%, #FFE44D); }
.tp-grad-pink-orange         { background: linear-gradient(135deg, #E84393, #F39C12); }
.tp-grad-red-blue-green      { background: linear-gradient(135deg, #EF4444, #3B82F6 50%, #22C55E); }
.tp-grad-red-orange-yellow   { background: linear-gradient(135deg, #EF4444, #F97316 50%, #EAB308); }
.tp-grad-yellow-orange-red   { background: linear-gradient(135deg, #EAB308, #F97316 50%, #EF4444); }
.tp-grad-orange-pink         { background: linear-gradient(135deg, #F97316, #EC4899); }
.tp-grad-electric-violet     { background: linear-gradient(135deg, #7C3AED, #06B6D4); }
.tp-grad-infrared            { background: linear-gradient(135deg, #F43F7F, #E11D48 50%, #9F1239); }
.tp-grad-chrome              { background: linear-gradient(135deg, #64748B, #94A3B8 50%, #475569); }
.tp-grad-aurora              { background: linear-gradient(135deg, #10B981, #0891B2 50%, #7C3AED); }
.tp-grad-coral-reef          { background: linear-gradient(135deg, #F97068, #2DD4BF); }
.tp-grad-plasma              { background: linear-gradient(135deg, #D946EF, #2563EB 34%, #84CC16 68%, #F59E0B); }
.tp-grad-enterprise          { background: linear-gradient(135deg, #8B1A1E, #D92B2F 50%, #FF6B6B); }
.tp-grad-professional        { background: linear-gradient(135deg, #2D6A1E, #65A443 50%, #A8E063); }
.tp-grad-homelab             { background: linear-gradient(135deg, #1E3A8A, #2563EB 50%, #60A5FA); }
</style>
