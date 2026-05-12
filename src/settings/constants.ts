export enum SETTINGS {
	OptimizeTokenUiBatching = 'optimize-interface-layer-clipping',
	EffectsCaching = 'token-effects-caching',
	TokenBarsCaching = 'token-bars-caching',
	ControlIconCaching = 'control-icon-caching',
	PrecomputedNoiseTextures = 'precomputed-noise-textures',
	ReduceLightingResolution = 'reduce-lighting-resolution',
	DisableAppV2BackgroundBlur = 'disable-app-v2-background-blur',
	CustomRenderScale = 'custom-render-scale',
	MeshGeometryFitting = 'mesh-geometry-fitting',
	WallSpriteCaching = 'wall-sprite-caching',
	TokenLayerCache = 'token-layer-cache',
	EmberShaderOptimizations = 'ember-shader-optimizations',
	DnD5eOptimizations = 'dnd5e-optimizations',
}

export const RENDER_SCALE_DEFAULTS = {
	background: 100,
	illumination: 40,
	coloration: 100,
	darkness: 50,
}
