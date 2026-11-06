module.exports = {
	content: [
		"./src/renderer/index.html",
		"./src/renderer/**/*.{vue,js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			fontFamily: {
				redhat: ['Red Hat Text', 'open-sans', 'sans-serif'],
				"source-sans-pro": ["Source Sans Pro", 'open-sans', 'sans-serif'],
			},
			colors: {
				neutral: {
					850: "#222222",
				}
			},
			// Named stacking layers; values live in src/renderer/styles/tokens.css.
			zIndex: {
				raised: "var(--flow-z-raised)",
				header: "var(--flow-z-header)",
				dropdown: "var(--flow-z-dropdown)",
				dock: "var(--flow-z-dock)",
				banner: "var(--flow-z-banner)",
				overlay: "var(--flow-z-overlay)",
				modal: "var(--flow-z-modal)",
				popover: "var(--flow-z-popover)",
				tour: "var(--flow-z-tour)",
				critical: "var(--flow-z-critical)",
			},
			// Semantic status colours (src/renderer/styles/tokens.css). Defined here, not as plain
			// CSS, so variants such as hover:text-flow-danger work.
			textColor: {
				"flow-info": "var(--flow-info-fg)",
				"flow-success": "var(--flow-success-fg)",
				"flow-warning": "var(--flow-warning-fg)",
				"flow-danger": "var(--flow-danger-fg)",
				"flow-muted": "var(--ui-subtle-text)",
			},
			backgroundColor: {
				"flow-info": "var(--flow-info-solid)",
				"flow-success": "var(--flow-success-solid)",
				"flow-warning": "var(--flow-warning-solid)",
				"flow-danger": "var(--flow-danger-solid)",
				"flow-neutral": "var(--flow-neutral-solid)",
			},
			borderColor: {
				"flow-info": "var(--flow-info-border)",
				"flow-success": "var(--flow-success-border)",
				"flow-warning": "var(--flow-warning-border)",
				"flow-danger": "var(--flow-danger-border)",
				"flow-neutral": "var(--flow-neutral-border)",
			},
		},
	},
	plugins: [
		require('@tailwindcss/forms'),
	],
	darkMode: "class",
}
