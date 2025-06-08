export enum SETTINGS {
	OptimizeTokenUiBatching = 'optimize-interface-layer-clipping',
	EffectsCaching = 'token-effects-caching',
	TokenBarsCaching = 'token-bars-caching',
	SpritesheetSubstitution = 'spritesheet-substitution',
	PrecomputedNoiseTextures = 'precomputed-noise-textures',
	ReduceLightingResolution = 'reduce-lighting-resolution',
	DisableAppV2BackgroundBlur = 'disable-app-v2-background-blur',
	TokenRingSpritesheetSupport = 'token-ring-spritesheet-support',
	CustomSpritesheets = 'spritesheet-substitution-custom',
	CustomRenderScale = 'custom-render-scale',
}

export const RENDER_SCALE_DEFAULTS = {
	background: 100,
	illumination: 40,
	coloration: 100,
	darkness: 50,
};
