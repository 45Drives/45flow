/**
 * Premium Watermark Customization Types
 * These types support advanced watermark positioning, scaling, opacity, and rotation
 */

export type PositionAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
export type PositionUnit = 'px' | '%'

export interface WatermarkPosition {
  x: number // horizontal offset from anchor
  y: number // vertical offset from anchor
  xUnit: PositionUnit
  yUnit: PositionUnit
  anchor: PositionAnchor
}

export interface WatermarkSettings {
  // Position configuration
  position: WatermarkPosition
  // Scale as percentage of video height (10-100)
  scale: number
  // Opacity (0-100)
  opacity: number
  // Rotation in degrees (0-360)
  rotation: number
}

export interface WatermarkPreset {
  id: string
  name: string
  description?: string
  settings: WatermarkSettings
  isCustom?: boolean // User-created preset vs. default
  createdAt?: string
}

export interface Default45FlowWatermark {
  id: string
  name: string
  path: string // e.g., '/assets/watermarks/45drives.png' or '/assets/logos/45Flow-grad.png'
  description?: string
}

/**
 * Extended watermark configuration passed to transcoder
 */
export interface WatermarkConfig {
  // Image source
  imagePath: string
  // Customization settings (premium only)
  settings?: WatermarkSettings
}

/**
 * Default preset definitions
 */
export const DEFAULT_WATERMARK_PRESETS: WatermarkPreset[] = [
  {
    id: 'bottom-right-small',
    name: 'Bottom Right (Small)',
    description: 'Small watermark in bottom-right corner',
    settings: {
      position: { x: 2, y: 2, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
      scale: 20,
      opacity: 70,
      rotation: 0,
    },
  },
  {
    id: 'bottom-right-large',
    name: 'Bottom Right (Large)',
    description: 'Larger watermark in bottom-right corner',
    settings: {
      position: { x: 3, y: 3, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
      scale: 35,
      opacity: 70,
      rotation: 0,
    },
  },
  {
    id: 'center-translucent',
    name: 'Center (Translucent)',
    description: 'Large semi-transparent center watermark',
    settings: {
      position: { x: 0, y: 0, xUnit: '%', yUnit: '%', anchor: 'center' },
      scale: 50,
      opacity: 30,
      rotation: 0,
    },
  },
  {
    id: 'top-left-corner',
    name: 'Top Left Corner',
    description: 'Watermark in top-left corner',
    settings: {
      position: { x: 2, y: 2, xUnit: '%', yUnit: '%', anchor: 'top-left' },
      scale: 25,
      opacity: 80,
      rotation: 0,
    },
  },
  {
    id: 'diagonal-watermark',
    name: 'Diagonal (Rotated)',
    description: 'Rotated watermark across center',
    settings: {
      position: { x: 0, y: 0, xUnit: '%', yUnit: '%', anchor: 'center' },
      scale: 40,
      opacity: 25,
      rotation: 315,
    },
  },
]

/**
 * Create default watermark settings
 */
export function createDefaultWatermarkSettings(): WatermarkSettings {
  return {
    position: { x: 3, y: 3, xUnit: '%', yUnit: '%', anchor: 'bottom-right' },
    scale: 35,
    opacity: 70,
    rotation: 0,
  }
}

/**
 * Default 45Flow watermark images
 * Includes both dedicated watermarks and logo variations
 * These are served from houston-broadcaster's built-in assets
 */
export const DEFAULT_45FLOW_WATERMARKS: Default45FlowWatermark[] = [
  {
    id: '45drives',
    name: '45Drives',
    path: '/.watermarks-builtin/45drives.png',
    description: '45Drives logo with fan',
  },
  {
    id: '45drives-nofan',
    name: '45Drives (No Fan)',
    path: '/.watermarks-builtin/45drives-nofan.png',
    description: '45Drives logo without fan',
  },
  {
    id: '45fan',
    name: '45 Fan',
    path: '/.watermarks-builtin/45fan.png',
    description: '45Drives fan icon',
  },
  {
    id: '45homelab',
    name: '45HomeLab',
    path: '/.watermarks-builtin/45homelab.png',
    description: '45HomeLab branding',
  },
  {
    id: '45professional',
    name: '45Professional',
    path: '/.watermarks-builtin/45professional.png',
    description: '45Professional branding',
  },
  {
    id: '45studio',
    name: '45Studio',
    path: '/.watermarks-builtin/45studio.png',
    description: '45Studio branding',
  },
  {
    id: '45flow-grad',
    name: '45Flow Gradient',
    path: '/.watermarks-builtin/45Flow-grad.png',
    description: '45Flow logo with gradient',
  },
  {
    id: '45flow-w',
    name: '45Flow White',
    path: '/.watermarks-builtin/45Flow-w.png',
    description: '45Flow logo in white',
  },
]
