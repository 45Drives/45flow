<template>
    <section aria-label="Branding">
        <FlowNotice v-if="branding.error.value" tone="danger" size="sm" class="mb-3" live>{{ branding.error.value }}</FlowNotice>
        <div class="flow-group">
            <SettingRow label="Enable custom branding" description="Apply your company name, logo, colors and page style to share, review and upload pages.">
                <FlowSwitch v-model="form.enabled" :disabled="busy" label="Toggle custom branding" />
            </SettingRow>
        </div>

        <template v-if="form.enabled">
            <div class="flow-tabs mt-4" role="tablist" aria-label="Branding settings">
                <button v-for="t in TABS" :id="`branding-tab-${t.id}`" :key="t.id" type="button" role="tab" class="flow-tab"
                    :aria-selected="tab === t.id" :aria-controls="`branding-panel-${t.id}`" :tabindex="tab === t.id ? 0 : -1"
                    @click="tab = t.id" @keydown="onTabKey">
                    {{ t.label }}
                    <span v-if="t.id === 'css' && form.customCss.trim()" class="flow-tab__count">On</span>
                </button>
            </div>

            <!-- Live preview: what recipients see, for everything except custom CSS -->
            <div v-if="tab !== 'css'" class="mt-4" data-testid="branding-preview">
                <p class="text-xs text-accent mb-2">Preview of a review page. Custom CSS is not shown here.</p>
                <div class="rounded-lg border border-default overflow-hidden text-[0.7rem]" :style="preview.page">
                    <div class="flex items-center justify-between gap-2 px-3 py-2" :style="{ borderBottom: `1px solid ${preview.border}` }">
                        <span class="w-4 h-4 rounded-sm shrink-0" :style="{ background: preview.fill, visibility: form.attribution === 'footer' ? 'hidden' : 'visible' }" />
                        <div class="flex flex-col items-center min-w-0">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <img v-if="previewLogo" :src="previewLogo" alt="" class="object-contain" :style="{ height: preview.logoHeight }" />
                                <span v-if="form.companyName" class="font-medium truncate" :style="{ color: preview.muted }">{{ form.companyName }}</span>
                            </div>
                            <span v-if="form.attribution === 'header'" class="text-[0.6rem]" :style="{ color: preview.muted }">Powered by 45Flow</span>
                        </div>
                        <span class="w-4 h-4 rounded-full shrink-0" :style="{ background: preview.border, visibility: form.colorMode ? 'hidden' : 'visible' }" />
                    </div>
                    <div class="p-3 space-y-2">
                        <div v-if="form.welcomeTitle || form.welcomeMessage" class="px-2 py-1.5" :style="preview.panel">
                            <div v-if="form.welcomeTitle" class="font-semibold">{{ form.welcomeTitle }}</div>
                            <div v-if="form.welcomeMessage" class="truncate" :style="{ color: preview.muted }">{{ form.welcomeMessage }}</div>
                        </div>
                        <div class="flex gap-2">
                            <div class="flex-1 aspect-video max-h-20" :style="preview.panel" />
                            <div class="w-1/3 p-2 space-y-1.5" :style="preview.panel">
                                <div class="h-1.5 w-3/4 rounded" :style="{ background: preview.muted, opacity: 0.4 }" />
                                <div class="h-1.5 w-1/2 rounded" :style="{ background: preview.muted, opacity: 0.4 }" />
                                <span class="underline" :style="{ color: form.linkColor || preview.accent }">Link</span>
                            </div>
                        </div>
                        <div class="text-center text-white font-semibold py-1" :style="{ background: preview.fill, borderRadius: preview.buttonRadius }">Download</div>
                    </div>
                    <div v-if="form.footerText || form.privacyUrl || form.termsUrl || form.attribution === 'footer'"
                        class="px-3 pb-2 text-center text-[0.6rem] space-y-0.5" :style="{ color: preview.muted }">
                        <div v-if="form.footerText" class="truncate">{{ form.footerText }}</div>
                        <div v-if="form.privacyUrl || form.termsUrl" class="flex justify-center gap-3">
                            <span v-if="form.privacyUrl" class="underline">Privacy policy</span>
                            <span v-if="form.termsUrl" class="underline">Terms of use</span>
                        </div>
                        <div v-if="form.attribution === 'footer'">Powered by 45Flow</div>
                    </div>
                </div>
            </div>

            <!-- ── Identity ─────────────────────────────── -->
            <div v-show="tab === 'identity'" id="branding-panel-identity" role="tabpanel" aria-labelledby="branding-tab-identity">
                <p class="flow-subhead">Company</p>
                <div class="flow-group">
                    <SettingRow label="Company name" description="Used in headers and link previews. Max 200 characters.">
                        <input v-model="form.companyName" type="text" :disabled="busy" aria-label="Company name"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="Your Company" maxlength="200" />
                    </SettingRow>
                </div>

                <p class="flow-subhead">Logos and icon</p>
                <p class="text-xs text-accent mb-3">Replaces the 45Studio logo on link pages. Recommended: transparent background, at least 200px tall.</p>
                <div class="flow-group">
                    <SettingRow label="Logo" description="PNG, JPEG, SVG or WebP, max 2 MB.">
                        <BrandingAssetInput :asset="branding.assets.logo_light" label="logo" :accept="BRANDING_SLOTS.logo_light.accept"
                            empty-text="No logo uploaded" :disabled="busy" @upload="branding.upload('logo_light', $event)" @remove="branding.remove('logo_light')" />
                    </SettingRow>
                    <SettingRow label="Use a separate logo for dark backgrounds" description="Recommended if your logo has poor contrast in dark mode.">
                        <FlowSwitch v-model="form.splitLogos" :disabled="busy" label="Toggle split logos" />
                    </SettingRow>
                    <SettingRow v-if="form.splitLogos" label="Dark background logo" description="Shown in dark mode and on dark themes.">
                        <BrandingAssetInput :asset="branding.assets.logo_dark" label="dark logo" :accept="BRANDING_SLOTS.logo_dark.accept"
                            empty-text="No dark logo uploaded" :disabled="busy" @upload="branding.upload('logo_dark', $event)" @remove="branding.remove('logo_dark')" />
                    </SettingRow>
                    <SettingRow label="Favicon" description="Browser tab icon. PNG, SVG or ICO, max 512 KB. Uses your logo when empty.">
                        <BrandingAssetInput :asset="branding.assets.favicon" label="favicon" :accept="BRANDING_SLOTS.favicon.accept"
                            empty-text="Using your logo" :disabled="busy" @upload="branding.upload('favicon', $event)" @remove="branding.remove('favicon')" />
                    </SettingRow>
                </div>

                <p class="flow-subhead">Support and contact</p>
                <div class="flow-group">
                    <SettingRow label="Support email" description="Shown on link pages and error screens.">
                        <input v-model="form.supportEmail" type="email" :disabled="busy" aria-label="Support email"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="support@example.com" maxlength="200" />
                    </SettingRow>
                    <SettingRow label="Support URL" description="Help documentation or support portal.">
                        <input v-model="form.supportUrl" type="url" :disabled="busy" aria-label="Support URL"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="https://support.example.com" maxlength="500" />
                    </SettingRow>
                </div>

                <p class="flow-subhead">Link previews</p>
                <p class="text-xs text-accent mb-3">How links look when pasted into Slack, Teams or social media.</p>
                <div class="flow-group">
                    <SettingRow label="Preview title" description="Defaults to the company name.">
                        <input v-model="form.linkPreviewTitle" type="text" :disabled="busy" aria-label="Link preview title"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="Your Company - Secure File Sharing" maxlength="200" />
                    </SettingRow>
                    <SettingRow label="Preview description" description="Short text shown under the title.">
                        <input v-model="form.linkPreviewDescription" type="text" :disabled="busy" aria-label="Link preview description"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="Secure file review and collaboration" maxlength="500" />
                    </SettingRow>
                </div>
            </div>

            <!-- ── Look ─────────────────────────────────── -->
            <div v-show="tab === 'look'" id="branding-panel-look" role="tabpanel" aria-labelledby="branding-tab-look">
                <p class="flow-subhead">Theme</p>
                <div class="flow-group">
                    <SettingRow label="Recipient theme" description="When set, recipients can't change the theme.">
                        <select v-model="form.enforcedTheme" :disabled="busy" aria-label="Recipient theme"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                            <option v-for="opt in THEMES" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
                        </select>
                    </SettingRow>
                    <SettingRow label="Light or dark mode" description="Lock link pages to one mode and hide the toggle.">
                        <select v-model="form.colorMode" :disabled="busy" aria-label="Light or dark mode"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                            <option value="">Recipient's choice</option>
                            <option value="light">Always light</option>
                            <option value="dark">Always dark</option>
                        </select>
                    </SettingRow>
                </div>

                <template v-if="form.enforcedTheme === 'custom'">
                    <p class="flow-subhead">Brand colors</p>
                    <div class="flow-group">
                        <SettingRow label="Primary brand color" description="Buttons, highlights and the gradient start.">
                            <div class="flex flex-col items-end gap-1.5">
                                <BrandingColorInput v-model="form.customPrimary" label="Primary brand color" placeholder="#D92B2F" :disabled="busy" />
                                <p v-if="primaryWarning" class="text-xs text-flow-warning">{{ primaryWarning }}</p>
                            </div>
                        </SettingRow>
                        <SettingRow label="Secondary brand color" description="Gradient end, borders and supporting accents.">
                            <div class="flex flex-col items-end gap-1.5">
                                <BrandingColorInput v-model="form.customSecondary" label="Secondary brand color" placeholder="#b02428" :disabled="busy" />
                                <p v-if="secondaryWarning" class="text-xs text-flow-warning">{{ secondaryWarning }}</p>
                            </div>
                        </SettingRow>
                    </div>
                </template>

                <p class="flow-subhead">Page style</p>
                <div class="flow-group">
                    <SettingRow label="Font" description="System fonts only, so pages load fast. Use custom CSS for a web font.">
                        <select v-model="form.fontFamily" :disabled="busy" aria-label="Font"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56"
                            :style="{ fontFamily: selectedFont.stack }">
                            <option v-for="f in BRANDING_FONTS" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
                        </select>
                    </SettingRow>
                    <SettingRow label="Corners" description="Roundness of panels, inputs and buttons.">
                        <select v-model="form.cornerStyle" :disabled="busy" aria-label="Corners"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                            <option value="">Rounded (default)</option>
                            <option value="subtle">Subtle</option>
                            <option value="sharp">Square</option>
                            <option value="pill">Extra round (pill buttons)</option>
                        </select>
                    </SettingRow>
                    <SettingRow label="Buttons" description="Gradient follows the theme; solid uses its main color.">
                        <select v-model="form.buttonStyle" :disabled="busy" aria-label="Button style"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                            <option value="">Gradient (default)</option>
                            <option value="solid">Solid</option>
                        </select>
                    </SettingRow>
                    <SettingRow label="Logo size" description="Size of your logo in the page header.">
                        <select v-model="form.logoSize" :disabled="busy" aria-label="Logo size"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                            <option value="small">Small</option>
                            <option value="">Medium (default)</option>
                            <option value="large">Large</option>
                            <option value="xlarge">Extra large</option>
                        </select>
                    </SettingRow>
                </div>

                <p class="flow-subhead">Page colors and background</p>
                <FlowNotice v-if="pageColorsNeedMode" tone="info" size="sm" class="mb-3">
                    Page colors apply in both light and dark mode. Lock the mode above so recipients can't switch to one that clashes.
                </FlowNotice>
                <div class="flow-group">
                    <SettingRow label="Background color" description="Empty uses the theme's background.">
                        <BrandingColorInput v-model="form.backgroundColor" label="Background color" placeholder="Theme" clearable :disabled="busy"
                            :fallback="form.colorMode === 'dark' ? '#11161f' : '#ffffff'" />
                    </SettingRow>
                    <SettingRow label="Background image" description="Covers the page behind panels. PNG, JPEG or WebP, max 5 MB.">
                        <BrandingAssetInput :asset="branding.assets.background" label="background image" :accept="BRANDING_SLOTS.background.accept"
                            empty-text="No background image" :disabled="busy" @upload="branding.upload('background', $event)" @remove="branding.remove('background')" />
                    </SettingRow>
                    <SettingRow label="Background texture" description="The subtle 45Flow pattern behind content.">
                        <FlowSwitch v-model="form.backgroundTexture" :disabled="busy" label="Toggle background texture" />
                    </SettingRow>
                    <SettingRow label="Text color" description="Empty uses the theme's text color.">
                        <div class="flex flex-col items-end gap-1.5">
                            <BrandingColorInput v-model="form.textColor" label="Text color" placeholder="Theme" clearable :disabled="busy"
                                :fallback="form.colorMode === 'dark' ? '#e7edf7' : '#0f1220'" />
                            <p v-if="textContrastWarning" class="text-xs text-flow-warning">{{ textContrastWarning }}</p>
                        </div>
                    </SettingRow>
                    <SettingRow label="Link color" description="Support, legal and other text links.">
                        <BrandingColorInput v-model="form.linkColor" label="Link color" placeholder="Theme" clearable :disabled="busy" />
                    </SettingRow>
                    <SettingRow label="Panel color" description="Cards and panels; shown slightly see-through.">
                        <BrandingColorInput v-model="form.panelColor" label="Panel color" placeholder="Theme" clearable :disabled="busy"
                            :fallback="form.colorMode === 'dark' ? '#151b25' : '#ffffff'" />
                    </SettingRow>
                </div>
            </div>

            <!-- ── Page content ─────────────────────────── -->
            <div v-show="tab === 'content'" id="branding-panel-content" role="tabpanel" aria-labelledby="branding-tab-content">
                <p class="flow-subhead">Welcome message</p>
                <p class="text-xs text-accent mb-3">Shown above the files and on the password page. Recipients can dismiss it on review pages.</p>
                <div class="flow-group">
                    <FlowField label="Title" optional class="py-3">
                        <template #default="{ id }">
                            <input :id="id" v-model="form.welcomeTitle" type="text" :disabled="busy" maxlength="120"
                                class="input-textlike border border-default px-2 py-1 rounded text-sm w-full" placeholder="Welcome to Acme Studio" />
                        </template>
                    </FlowField>
                    <FlowField label="Message" optional class="py-3" :help="`${form.welcomeMessage.length}/1000`">
                        <template #default="{ id, describedBy }">
                            <textarea :id="id" v-model="form.welcomeMessage" :aria-describedby="describedBy" :disabled="busy" maxlength="1000" rows="3"
                                class="input-textlike border border-default px-2 py-1 rounded text-sm w-full"
                                placeholder="Leave comments on the timeline. Final approvals are due Friday." />
                        </template>
                    </FlowField>
                </div>

                <p class="flow-subhead">Footer</p>
                <div class="flow-group">
                    <FlowField label="Footer text" optional class="py-3" help="Copyright, address or a short note. Line breaks are kept.">
                        <template #default="{ id, describedBy }">
                            <textarea :id="id" v-model="form.footerText" :aria-describedby="describedBy" :disabled="busy" maxlength="500" rows="2"
                                class="input-textlike border border-default px-2 py-1 rounded text-sm w-full" placeholder="© Acme Studio Ltd." />
                        </template>
                    </FlowField>
                    <SettingRow label="Privacy policy URL" description="Adds a Privacy policy link to the footer.">
                        <input v-model="form.privacyUrl" type="url" :disabled="busy" aria-label="Privacy policy URL"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="https://example.com/privacy" maxlength="500" />
                    </SettingRow>
                    <SettingRow label="Terms of use URL" description="Adds a Terms of use link to the footer.">
                        <input v-model="form.termsUrl" type="url" :disabled="busy" aria-label="Terms of use URL"
                            class="input-textlike border border-default px-2 py-1 rounded text-sm w-56" placeholder="https://example.com/terms" maxlength="500" />
                    </SettingRow>
                    <SettingRow label="45Flow credit" description="Where the small “Powered by 45Flow” credit appears.">
                        <select v-model="form.attribution" :disabled="busy" aria-label="45Flow credit placement"
                            class="text-sm bg-well border border-default rounded px-2 py-1 w-56">
                            <option value="header">Header, under your logo</option>
                            <option value="footer">Footer only (removes the 45Flow mark from the header)</option>
                        </select>
                    </SettingRow>
                </div>
            </div>

            <!-- ── Custom CSS ───────────────────────────── -->
            <div v-show="tab === 'css'" id="branding-panel-css" role="tabpanel" aria-labelledby="branding-tab-css">
                <p class="text-sm text-muted mt-4 mb-3">
                    Styles added after the built-in ones on every share, review and upload page.
                    Changes go live when you save.
                </p>
                <FlowNotice v-if="branding.errorCode.value === 'invalid_css'" tone="danger" size="sm" class="mb-3" live>
                    Not saved: {{ branding.error.value }}
                </FlowNotice>
                <FlowField label="Custom CSS" optional :help="cssHelp" :error="cssTooLong ? `Over the ${MAX_CUSTOM_CSS_CHARS.toLocaleString()} character limit.` : ''">
                    <template #default="{ id, describedBy }">
                        <textarea :id="id" v-model="form.customCss" :aria-describedby="describedBy" :disabled="busy" rows="14"
                            spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"
                            class="input-textlike border border-default px-3 py-2 rounded-lg text-xs font-mono w-full leading-relaxed"
                            :placeholder="CSS_STARTER" />
                    </template>
                </FlowField>
                <div class="flex items-center gap-2 mt-2">
                    <button v-if="!form.customCss.trim()" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="form.customCss = CSS_STARTER">
                        Start from example
                    </button>
                </div>

                <details class="mt-4 flow-group py-3 text-xs">
                    <summary class="cursor-pointer text-sm font-medium">CSS reference</summary>
                    <div class="mt-3 space-y-3 text-muted">
                        <div>
                            <p class="font-medium text-default mb-1">Theme variables (set them on <code>:root</code>)</p>
                            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                                <li v-for="v in CSS_VARIABLES" :key="v[0]"><span class="text-default">{{ v[0] }}</span> <span class="font-sans">{{ v[1] }}</span></li>
                            </ul>
                        </div>
                        <div>
                            <p class="font-medium text-default mb-1">Page hooks</p>
                            <ul class="space-y-0.5 font-mono">
                                <li v-for="v in CSS_HOOKS" :key="v[0]"><span class="text-default">{{ v[0] }}</span> <span class="font-sans">{{ v[1] }}</span></li>
                            </ul>
                        </div>
                        <div>
                            <p class="font-medium text-default mb-1">Rules</p>
                            <ul class="list-disc pl-4 space-y-0.5">
                                <li>Not allowed: <code>@import</code>, <code>expression()</code>, script URLs and <code>http://</code> resources.</li>
                                <li>Web fonts load from <code>https://</code> URLs in <code>@font-face</code>.</li>
                                <li>The page blocks images from other sites. Use the Background image upload or a <code>data:</code> URL.</li>
                                <li>Class names other than the hooks above can change between 45Flow releases.</li>
                            </ul>
                        </div>
                    </div>
                </details>
            </div>

            <div class="flex items-center gap-3 mt-6 pt-4 border-t border-default">
                <button class="btn btn-danger text-sm" type="button" :disabled="busy" @click="clear">
                    {{ busy ? 'Working…' : 'Clear custom branding' }}
                </button>
                <p class="text-xs text-accent">Resets every branding setting to 45Flow defaults and removes uploaded images.</p>
            </div>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SettingRow from './SettingRow';
import BrandingAssetInput from './BrandingAssetInput.vue';
import BrandingColorInput from './BrandingColorInput.vue';
import FlowField from '../ui/FlowField.vue';
import FlowNotice from '../ui/FlowNotice.vue';
import FlowSwitch from '../ui/FlowSwitch.vue';
import {
    BRANDING_FONTS, BRANDING_SLOTS, MAX_CUSTOM_CSS_CHARS, contrastRatio, type BrandingSettings,
} from '../composables/useBrandingSettings';

const props = defineProps<{ branding: BrandingSettings }>();

const form = props.branding.form;
const busy = computed(() => props.branding.busy.value);

type Tab = 'identity' | 'look' | 'content' | 'css';
const TABS: { id: Tab; label: string }[] = [
    { id: 'identity', label: 'Identity' },
    { id: 'look', label: 'Look' },
    { id: 'content', label: 'Page content' },
    { id: 'css', label: 'Custom CSS' },
];
const tab = ref<Tab>('identity');

// A rejected stylesheet is only fixable on the CSS tab, so take the admin there.
watch(() => props.branding.errorCode.value, (code) => { if (code === 'invalid_css') tab.value = 'css'; });

function onTabKey(event: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab.value);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    tab.value = TABS[(i + step + TABS.length) % TABS.length].id;
    document.getElementById(`branding-tab-${tab.value}`)?.focus();
}

const THEMES = [
    { id: '', label: 'Recipient\'s choice (no override)', preview: '' },
    { id: 'custom', label: 'Custom (your brand colors)', preview: '' },
    { id: 'theme-studio-grad-logo-flow', label: 'Flow', preview: 'linear-gradient(135deg, #2EA8FF 0%, #7A4DFF 30%, #D02BD6 56%, #F1578A 76%, #FF9A2A 100%)' },
    { id: 'theme-studio-grad-purple-pink-orange', label: 'Party', preview: 'linear-gradient(135deg, #9A24E4 0%, #CF20AE 32%, #F6336E 64%, #FE774F 100%)' },
    { id: 'theme-studio-grad-red-purple-blue', label: 'Prism', preview: 'linear-gradient(135deg, #F43F5E 0%, #8B5CF6 52%, #3B82F6 100%)' },
    { id: 'theme-studio-grad-sunset-laser', label: 'Synthwave', preview: 'linear-gradient(135deg, #FF6A00 0%, #FF2D95 48%, #2CF3E9 100%)' },
    { id: 'theme-studio-grad-neon-studio', label: 'Cyber Pulse', preview: 'linear-gradient(135deg, #14B8A6 0%, #6D28D9 45%, #F43F5E 100%)' },
    { id: 'theme-studio-grad-moon-mist', label: 'Moon Mist', preview: 'linear-gradient(135deg, #7A2CFF 0%, #2EA8FF 52%, #FFE44D 100%)' },
    { id: 'theme-studio-grad-pink-orange', label: 'Flamingo', preview: 'linear-gradient(135deg, #E84393 0%, #F39C12 100%)' },
    { id: 'theme-studio-grad-red-blue-green', label: 'Spectrum', preview: 'linear-gradient(135deg, #EF4444 0%, #3B82F6 50%, #22C55E 100%)' },
    { id: 'theme-studio-grad-red-orange-yellow', label: 'Fire', preview: 'linear-gradient(135deg, #EF4444 0%, #F97316 50%, #EAB308 100%)' },
    { id: 'theme-studio-grad-orange-pink', label: 'Sunset', preview: 'linear-gradient(135deg, #F97316 0%, #EC4899 100%)' },
    { id: 'theme-studio-grad-aurora', label: 'Borealis', preview: 'linear-gradient(135deg, #10B981 0%, #0891B2 50%, #7C3AED 100%)' },
    { id: 'theme-studio-grad-yellow-orange-red', label: 'Solstice', preview: 'linear-gradient(135deg, #EAB308 0%, #F97316 50%, #EF4444 100%)' },
    { id: 'theme-studio-grad-electric-violet', label: 'Ultraviolet', preview: 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)' },
    { id: 'theme-studio-grad-infrared', label: 'Infrared', preview: 'linear-gradient(135deg, #F43F7F 0%, #E11D48 50%, #9F1239 100%)' },
    { id: 'theme-studio-blue-steel', label: 'Blue Steel', preview: 'linear-gradient(135deg, #2C3E5A 0%, #4E6B93 50%, #7A9BC0 100%)' },
    { id: 'theme-studio-slate', label: 'Graphite', preview: 'linear-gradient(135deg, #374151 0%, #5F6E82 50%, #8B9DB3 100%)' },
    { id: 'theme-studio-ocean', label: 'Deep Sea', preview: 'linear-gradient(135deg, #1B3D4F 0%, #3E6D84 50%, #6BA4BE 100%)' },
    { id: 'theme-studio-grad-chrome', label: 'Titanium', preview: 'linear-gradient(135deg, #64748B 0%, #94A3B8 50%, #475569 100%)' },
    { id: 'theme-studio-grad-enterprise', label: 'Enterprise', preview: 'linear-gradient(135deg, #8B1A1E 0%, #D92B2F 50%, #FF6B6B 100%)' },
    { id: 'theme-studio-grad-homelab', label: 'Homelab', preview: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #60A5FA 100%)' },
    { id: 'theme-studio-grad-professional', label: 'Professional', preview: 'linear-gradient(135deg, #2D6A1E 0%, #65A443 50%, #A8E063 100%)' },
    { id: 'theme-studio', label: 'Studio', preview: 'linear-gradient(135deg, #3D2D78 0%, #6557A5 50%, #9B8ADB 100%)' },
];

const selectedFont = computed(() => BRANDING_FONTS.find((f) => f.id === form.fontFamily) || BRANDING_FONTS[0]);

function colorWarning(hex: string) {
    const onWhite = contrastRatio(hex, '#ffffff');
    const onDark = contrastRatio(hex, '#1a1a1a');
    if (onWhite < 3 && onDark < 3) return 'This color may be hard to read on both light and dark backgrounds.';
    if (onWhite < 3) return 'This color may be hard to read on light backgrounds.';
    if (onDark < 3) return 'This color may be hard to read on dark backgrounds.';
    return null;
}
const primaryWarning = computed(() => colorWarning(form.customPrimary));
const secondaryWarning = computed(() => colorWarning(form.customSecondary));

const pageColorsNeedMode = computed(() => !form.colorMode && !!(form.backgroundColor || form.textColor || form.panelColor));
const textContrastWarning = computed(() => {
    const bg = form.panelColor || form.backgroundColor;
    if (!form.textColor || !bg) return null;
    const ratio = contrastRatio(form.textColor, bg);
    return ratio < 4.5 ? `Low contrast against your ${form.panelColor ? 'panel' : 'background'} color (${ratio.toFixed(1)}:1; aim for 4.5:1).` : null;
});

const previewLogo = computed(() => {
    const dark = form.colorMode === 'dark';
    const a = props.branding.assets;
    return (dark && form.splitLogos && a.logo_dark.previewUrl) || a.logo_light.previewUrl;
});

const preview = computed(() => {
    const dark = form.colorMode === 'dark';
    const theme = THEMES.find((t) => t.id === form.enforcedTheme);
    const gradient = form.enforcedTheme === 'custom'
        ? `linear-gradient(135deg, ${form.customPrimary} 0%, ${form.customSecondary} 100%)`
        : theme?.preview || THEMES[2].preview;
    const firstColor = form.enforcedTheme === 'custom' ? form.customPrimary : (gradient.match(/#[0-9a-fA-F]{6}/)?.[0] || '#4E6B93');
    const fg = form.textColor || (dark ? '#e7edf7' : '#0f1220');
    const radius = ({ sharp: '2px', subtle: '6px', pill: '14px' } as Record<string, string>)[form.cornerStyle] || '10px';
    const bgImage = props.branding.assets.background.previewUrl;
    const bgColor = form.backgroundColor || (dark ? '#11161f' : '#f3f5f8');
    const panelBase = form.panelColor || (dark ? '#151b25' : '#ffffff');
    return {
        fill: form.buttonStyle === 'solid' ? firstColor : gradient,
        accent: firstColor,
        muted: `color-mix(in srgb, ${fg} 68%, transparent)`,
        border: dark ? 'rgba(173, 189, 214, 0.28)' : 'rgba(15, 18, 32, 0.12)',
        buttonRadius: form.cornerStyle === 'pill' ? '9999px' : radius,
        logoHeight: ({ small: '0.9rem', large: '1.6rem', xlarge: '2rem' } as Record<string, string>)[form.logoSize] || '1.25rem',
        page: {
            color: fg,
            fontFamily: selectedFont.value.stack,
            background: bgImage ? `url("${bgImage}") center / cover no-repeat, ${bgColor}` : bgColor,
        },
        panel: {
            background: `color-mix(in srgb, ${panelBase} 86%, transparent)`,
            border: `1px solid ${dark ? 'rgba(173, 189, 214, 0.28)' : 'rgba(15, 18, 32, 0.12)'}`,
            borderRadius: radius,
        },
    };
});

const cssTooLong = computed(() => form.customCss.length > MAX_CUSTOM_CSS_CHARS);
const cssHelp = computed(() => `${form.customCss.length.toLocaleString()} / ${MAX_CUSTOM_CSS_CHARS.toLocaleString()} characters`);

const CSS_STARTER = `/* Every link page */
:root {
  --accent: #0b6bcb;
}

/* Only the upload page */
:root[data-flow-view="upload"] .panel {
  border-width: 2px;
}

/* The footer under every page */
.brand-footer {
  letter-spacing: 0.02em;
}
`;

const CSS_VARIABLES: [string, string][] = [
    ['--accent', 'main brand color'],
    ['--btn-primary-bg', 'solid button color'],
    ['--btn-primary-fill', 'button background (gradient)'],
    ['--btn-primary-hover-fill', 'button hover background'],
    ['--fg', 'text color'],
    ['--muted', 'secondary text'],
    ['--panel', 'panel background'],
    ['--panelSolid', 'menus and solid panels'],
    ['--border', 'borders and dividers'],
    ['--brand-page-bg', 'page background'],
    ['--brand-font', 'page font'],
    ['--radius-lg … --radius-3xl', 'corner sizes'],
    ['--brand-btn-radius', 'button corners'],
];

const CSS_HOOKS: [string, string][] = [
    [':root[data-flow-view="…"]', 'share, upload, portal, password, unavailable or checking'],
    [':root.dark', 'dark mode is on'],
    ['header.bar', 'page header'],
    ['.app-header-brand-logo', 'your logo in the header'],
    ['.app-header-company', 'company name in the header'],
    ['.access-brand-logo', 'your logo on the password page'],
    ['.panel', 'cards and panels'],
    ['.btn.btn-primary', 'main buttons'],
    ['.brand-welcome', 'welcome message'],
    ['.brand-footer', 'footer (text, legal links, credit)'],
];

async function clear() {
    if (!window.confirm('Clear all custom branding? This resets everything to 45Flow defaults and removes uploaded images.')) return;
    await props.branding.clearAll();
}
</script>
