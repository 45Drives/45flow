// Branding (white-label) settings for recipient link pages: form state, dirty
// tracking and the /api/branding calls. SettingsModal owns one instance and
// saves it with the rest of Settings; BrandingSettingsPanel renders it.
import { computed, reactive, ref, type Ref } from 'vue';
import { pushNotification, Notification } from '@45drives/houston-common-ui';

export type BrandingSlot = 'logo_light' | 'logo_dark' | 'favicon' | 'background';

export interface BrandingForm {
    enabled: boolean;
    companyName: string;
    enforcedTheme: string;
    splitLogos: boolean;
    customPrimary: string;
    customSecondary: string;
    supportEmail: string;
    supportUrl: string;
    linkPreviewTitle: string;
    linkPreviewDescription: string;
    colorMode: '' | 'light' | 'dark';
    fontFamily: string;
    cornerStyle: string;
    buttonStyle: string;
    logoSize: string;
    attribution: 'header' | 'footer';
    backgroundColor: string;
    backgroundTexture: boolean;
    textColor: string;
    linkColor: string;
    panelColor: string;
    welcomeTitle: string;
    welcomeMessage: string;
    footerText: string;
    privacyUrl: string;
    termsUrl: string;
    customCss: string;
}

export interface BrandingAsset {
    filename: string | null;
    previewUrl: string | null;
    info: { name?: string; size?: number; width?: number; height?: number } | null;
}

export const DEFAULT_BRANDING: Readonly<BrandingForm> = Object.freeze({
    enabled: false,
    companyName: '',
    enforcedTheme: '',
    splitLogos: false,
    customPrimary: '#D92B2F',
    customSecondary: '#b02428',
    supportEmail: '',
    supportUrl: '',
    linkPreviewTitle: '',
    linkPreviewDescription: '',
    colorMode: '',
    fontFamily: '',
    cornerStyle: '',
    buttonStyle: '',
    logoSize: '',
    attribution: 'header',
    backgroundColor: '',
    backgroundTexture: true,
    textColor: '',
    linkColor: '',
    panelColor: '',
    welcomeTitle: '',
    welcomeMessage: '',
    footerText: '',
    privacyUrl: '',
    termsUrl: '',
    customCss: '',
});

export const BRANDING_SLOTS: Record<BrandingSlot, { label: string; accept: string; maxBytes: number }> = {
    logo_light: { label: 'Logo', accept: 'image/png,image/jpeg,image/svg+xml,image/webp', maxBytes: 2 * 1024 * 1024 },
    logo_dark: { label: 'Dark logo', accept: 'image/png,image/jpeg,image/svg+xml,image/webp', maxBytes: 2 * 1024 * 1024 },
    favicon: { label: 'Favicon', accept: 'image/png,image/svg+xml,image/x-icon,.ico', maxBytes: 512 * 1024 },
    background: { label: 'Background image', accept: 'image/png,image/jpeg,image/webp', maxBytes: 5 * 1024 * 1024 },
};

// Mirrors FONT_PRESETS in houston-broadcaster server/utils/brandingAppearance.js (the server validates the id).
export const BRANDING_FONTS = [
    { id: '', label: 'Default (45Flow)', stack: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Helvetica, Arial, sans-serif' },
    { id: 'system-ui', label: 'System UI', stack: 'system-ui, sans-serif' },
    { id: 'neo-grotesque', label: 'Neo-grotesque (Helvetica-like)', stack: "Inter, Roboto, 'Helvetica Neue', 'Arial Nova', 'Nimbus Sans', Arial, sans-serif" },
    { id: 'humanist', label: 'Humanist', stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif" },
    { id: 'geometric', label: 'Geometric', stack: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif" },
    { id: 'rounded', label: 'Rounded', stack: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif" },
    { id: 'serif-transitional', label: 'Serif (transitional)', stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif" },
    { id: 'serif-old-style', label: 'Serif (old style)', stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif" },
    { id: 'monospace', label: 'Monospace', stack: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
] as const;

export const MAX_CUSTOM_CSS_CHARS = 50000;

function luminance(hex: string): number | null {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
        const c = parseInt(h, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors; 1 when either is not a full hex color. */
export function contrastRatio(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    if (la === null || lb === null) return 1;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const COLOR_FIELDS = ['customPrimary', 'customSecondary', 'backgroundColor', 'textColor', 'linkColor', 'panelColor'] as const;
const URL_FIELDS = ['privacyUrl', 'termsUrl'] as const;

function pick(data: any): BrandingForm {
    const out = { ...DEFAULT_BRANDING } as BrandingForm;
    for (const key of Object.keys(DEFAULT_BRANDING) as (keyof BrandingForm)[]) {
        const v = data?.[key];
        if (v === undefined || v === null) continue;
        if (typeof DEFAULT_BRANDING[key] === 'boolean') (out as any)[key] = !!v;
        else if (typeof v === 'string') (out as any)[key] = v;
    }
    // Empty stored brand colors keep the editable defaults (matches the old behavior).
    if (!out.customPrimary) out.customPrimary = DEFAULT_BRANDING.customPrimary;
    if (!out.customSecondary) out.customSecondary = DEFAULT_BRANDING.customSecondary;
    return out;
}

function emptyAsset(): BrandingAsset {
    return { filename: null, previewUrl: null, info: null };
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height }); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
        img.src = url;
    });
}

export interface BrandingSettingsDeps {
    apiFetch: (url: string, init?: any) => Promise<any>;
    baseUrl: Ref<string | null | undefined>;
    isPremiumActive: Ref<boolean>;
    /** Keeps the desktop palette's "Custom" theme in step with the saved brand colors. */
    onSaved?: (form: BrandingForm) => void;
}

export function useBrandingSettings({ apiFetch, baseUrl, isPremiumActive, onSaved }: BrandingSettingsDeps) {
    const form = reactive<BrandingForm>({ ...DEFAULT_BRANDING });
    const assets = reactive<Record<BrandingSlot, BrandingAsset>>({
        logo_light: emptyAsset(), logo_dark: emptyAsset(), favicon: emptyAsset(), background: emptyAsset(),
    });
    const busy = ref(false);
    const error = ref<string | null>(null);
    const errorCode = ref<string | null>(null);
    const saved = ref<string | null>(null);

    const snapshot = () => JSON.stringify(form);
    const dirty = computed(() => isPremiumActive.value && saved.value !== null && snapshot() !== saved.value);

    /** First problem the admin can fix before saving, or null. */
    const validationError = computed(() => {
        if (!form.enabled) return null;
        for (const key of COLOR_FIELDS) {
            if (form[key] && !HEX_RE.test(form[key])) return `Branding: ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} must be a hex color like #1A2B3C.`;
        }
        for (const key of URL_FIELDS) {
            if (form[key] && !/^https?:\/\/\S+$/i.test(form[key])) return `Branding: ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} must start with https://.`;
        }
        if (form.customCss.length > MAX_CUSTOM_CSS_CHARS) return `Branding: custom CSS is over ${MAX_CUSTOM_CSS_CHARS.toLocaleString()} characters.`;
        return null;
    });

    function assetUrl(filename: string | null) {
        return filename && baseUrl.value ? `${baseUrl.value}/branding/logos/${encodeURIComponent(filename)}` : null;
    }

    function setAsset(slot: BrandingSlot, next: Partial<BrandingAsset>) {
        const cur = assets[slot];
        if (next.previewUrl !== undefined && cur.previewUrl?.startsWith('blob:') && cur.previewUrl !== next.previewUrl) {
            URL.revokeObjectURL(cur.previewUrl);
        }
        Object.assign(cur, next);
    }

    async function load() {
        try {
            const data = await apiFetch('/api/branding');
            Object.assign(form, pick(data));
            const stored: Record<BrandingSlot, string | null> = {
                logo_light: data?.logoLight || null,
                logo_dark: data?.logoDark || null,
                favicon: data?.favicon || null,
                background: data?.backgroundImage || null,
            };
            for (const slot of Object.keys(stored) as BrandingSlot[]) {
                setAsset(slot, { filename: stored[slot], previewUrl: assetUrl(stored[slot]), info: null });
            }
            saved.value = snapshot();
            onSaved?.(form);
        } catch {
            // Non-critical: the section stays at defaults and isn't marked dirty.
        }
    }

    async function save() {
        error.value = null;
        errorCode.value = null;
        busy.value = true;
        try {
            await apiFetch('/api/branding', { method: 'POST', body: JSON.stringify(form) });
            saved.value = snapshot();
            onSaved?.(form);
            pushNotification(new Notification('Branding Saved', 'White-label branding settings updated.', 'success', 5000));
        } catch (e: any) {
            error.value = e?.message || 'Failed to save branding settings.';
            errorCode.value = e?.code || null;
        } finally {
            busy.value = false;
        }
    }

    async function upload(slot: BrandingSlot, file: File) {
        error.value = null;
        const spec = BRANDING_SLOTS[slot];
        if (file.size > spec.maxBytes) {
            error.value = `${spec.label} must be ${Math.round(spec.maxBytes / 1024)} KB or smaller.`;
            return;
        }
        busy.value = true;
        const previous = { ...assets[slot] };
        try {
            let dims = { width: 0, height: 0 };
            try { dims = await imageDimensions(file); } catch { /* ICO and some SVGs have no readable size */ }
            setAsset(slot, {
                filename: '__uploading__',
                previewUrl: URL.createObjectURL(file),
                info: { name: file.name, size: file.size, ...dims },
            });
            const body = new FormData();
            body.append('logo', file);
            const result = await apiFetch(`/api/branding/logo/${slot}`, { method: 'POST', body });
            setAsset(slot, { filename: result?.filename || slot });
            pushNotification(new Notification(`${spec.label} Uploaded`, `${spec.label} has been updated.`, 'success', 4000));
        } catch (e: any) {
            error.value = e?.message || `${spec.label} upload failed.`;
            setAsset(slot, previous);
        } finally {
            busy.value = false;
        }
    }

    async function remove(slot: BrandingSlot) {
        busy.value = true;
        try {
            await apiFetch(`/api/branding/logo/${slot}`, { method: 'DELETE' });
            setAsset(slot, emptyAsset());
        } catch (e: any) {
            error.value = e?.message || `Failed to remove ${BRANDING_SLOTS[slot].label.toLowerCase()}.`;
        } finally {
            busy.value = false;
        }
    }

    async function clearAll() {
        error.value = null;
        busy.value = true;
        try {
            for (const slot of Object.keys(assets) as BrandingSlot[]) {
                if (assets[slot].filename) await remove(slot);
            }
            Object.assign(form, DEFAULT_BRANDING);
            await save();
            if (!error.value) {
                pushNotification(new Notification('Branding Cleared', 'All custom branding has been reset to defaults.', 'success', 5000));
            }
        } finally {
            busy.value = false;
        }
    }

    return { form, assets, busy, error, errorCode, dirty, validationError, load, save, upload, remove, clearAll };
}

export type BrandingSettings = ReturnType<typeof useBrandingSettings>;
