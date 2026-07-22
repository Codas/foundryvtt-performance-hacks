import { CustomRenderScaleConfig } from 'src/apps/CustomRenderScaleMenu.ts'
import { NAMESPACE } from 'src/constants.ts'
import { registerControlIconCaching, unregisterControlIconCaching } from 'src/hacks/controlIconCaching.ts'
import { toggleDisableAppBackgroundBlur } from 'src/hacks/disableAppBackgroundBlur.ts'
import { registerEffectsCaching, unregisterEffectsCaching } from 'src/hacks/effectsCaching.ts'
import {
	registerGeneralizedOooRendering,
	unregisterGeneralizedOooRendering,
} from 'src/hacks/generalizedOooRendering.ts'
import {
	redrawLightingEffects,
	registerLightingWrappers,
	unregisterLightingWrappers,
} from 'src/hacks/reduceLightingResolution.ts'
import { registerTokenBarsCaching, unregisterTokenBarsCaching } from 'src/hacks/tokenBarsCaching.ts'
// import { registerTokenLayerCache, unregisterTokenLayerCache } from 'src/hacks/tokenLayerCache.ts'
import { registerWallSpriteCaching, unregisterWallSpriteCaching } from 'src/hacks/wallSpriteCaching.ts'
import { RENDER_SCALE_DEFAULTS, SETTINGS } from './constants.ts'

export function getSetting<T = unknown>(settings: SETTINGS): T {
	return game.settings.get(NAMESPACE, settings) as T
}

Hooks.on('init', () => {
	// #region Custom render scale
	game.settings.register(NAMESPACE, SETTINGS.CustomRenderScale, {
		name: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.hint`,
		config: false,
		scope: 'client',
		type: Object,
		default: RENDER_SCALE_DEFAULTS,
	})
	// #endregion

	// #region Custom render scale menu
	game.settings.registerMenu(NAMESPACE, SETTINGS.CustomRenderScale, {
		name: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.hint`,
		label: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.label`,
		icon: 'fa-solid fa-percent',
		type: CustomRenderScaleConfig,
		restricted: false,
	})

	// #endregion

	// #region Precomputed noise textures
	game.settings.register(NAMESPACE, SETTINGS.PrecomputedNoiseTextures, {
		name: `${NAMESPACE}.settings.${SETTINGS.PrecomputedNoiseTextures}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.PrecomputedNoiseTextures}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	})

	// #endregion

	// #region Reduce lighting resolution
	game.settings.register(NAMESPACE, SETTINGS.ReduceLightingResolution, {
		name: `${NAMESPACE}.settings.${SETTINGS.ReduceLightingResolution}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.ReduceLightingResolution}.hint`,
		scope: 'client',
		requiresReload: true,
		config: true,
		onChange: (enabled) => {
			if (enabled) {
				registerLightingWrappers()
			} else {
				unregisterLightingWrappers()
			}
			redrawLightingEffects()
		},
		type: Boolean,
		default: true,
	})

	// #endregion

	// #region Generalized out-of-order rendering
	game.settings.register(NAMESPACE, SETTINGS.OptimizeTokenUiBatching, {
		name: `${NAMESPACE}.settings.${SETTINGS.OptimizeTokenUiBatching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.OptimizeTokenUiBatching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: false,
		onChange: (enabled) => {
			if (enabled) {
				registerGeneralizedOooRendering()
			} else {
				unregisterGeneralizedOooRendering()
			}
		},
		type: Boolean,
		default: true,
	})
	// #endregion

	// #region Effects caching
	game.settings.register(NAMESPACE, SETTINGS.EffectsCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.EffectsCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.EffectsCaching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: false,
		onChange: (enabled) => {
			if (enabled) {
				registerEffectsCaching()
			} else {
				unregisterEffectsCaching()
			}
		},
		type: Boolean,
		default: true,
	})
	// #endregion

	// #region Token bars caching
	game.settings.register(NAMESPACE, SETTINGS.TokenBarsCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.TokenBarsCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.TokenBarsCaching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: false,
		onChange: (enabled) => {
			if (enabled) {
				registerTokenBarsCaching()
			} else {
				unregisterTokenBarsCaching()
			}
		},
		type: Boolean,
		default: true,
	})
	// #endregion

	// #region Control icon caching
	game.settings.register(NAMESPACE, SETTINGS.ControlIconCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.ControlIconCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.ControlIconCaching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: false,
		onChange: (enabled) => {
			if (enabled) {
				registerControlIconCaching()
			} else {
				unregisterControlIconCaching()
			}
		},
		type: Boolean,
		default: true,
	})

	// #endregion

	// #region Token UI layer cache (disabled)
	// game.settings.register(NAMESPACE, SETTINGS.TokenLayerCache, {
	// 	name: `${NAMESPACE}.settings.${SETTINGS.TokenLayerCache}.name`,
	// 	hint: `${NAMESPACE}.settings.${SETTINGS.TokenLayerCache}.hint`,
	// 	scope: 'client',
	// 	config: true,
	// 	requiresReload: false,
	// 	onChange: (enabled) => {
	// 		if (enabled) {
	// 			registerTokenLayerCache()
	// 		} else {
	// 			unregisterTokenLayerCache()
	// 		}
	// 	},
	// 	type: Boolean,
	// 	default: true,
	// })
	// #endregion

	// #region Wall layer caching
	game.settings.register(NAMESPACE, SETTINGS.WallSpriteCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.WallSpriteCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.WallSpriteCaching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: false,
		onChange: (enabled) => {
			if (enabled) {
				registerWallSpriteCaching()
			} else {
				unregisterWallSpriteCaching()
			}
		},
		type: Boolean,
		default: true,
	})

	// #endregion

	// #region Mesh geometry fitting
	game.settings.register(NAMESPACE, SETTINGS.MeshGeometryFitting, {
		name: `${NAMESPACE}.settings.${SETTINGS.MeshGeometryFitting}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.MeshGeometryFitting}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: false,
	})

	// #endregion

	// #region D&D5e specific optimizations

	game.settings.register(NAMESPACE, SETTINGS.DnD5eOptimizations, {
		name: `${NAMESPACE}.settings.${SETTINGS.DnD5eOptimizations}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.DnD5eOptimizations}.hint`,
		scope: 'client',
		config: game.system?.id === 'dnd5e',
		requiresReload: true,
		type: Boolean,
		default: true,
	})

	// #region Ember shader optimizations

	game.settings.register(NAMESPACE, SETTINGS.EmberShaderOptimizations, {
		name: `${NAMESPACE}.settings.${SETTINGS.EmberShaderOptimizations}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.EmberShaderOptimizations}.hint`,
		scope: 'client',
		config: !!game.modules.get('ember')?.active,
		requiresReload: true,
		type: Boolean,
		default: true,
	})

	game.settings.register(NAMESPACE, SETTINGS.EmberVersionWarningSuppressedThrough, {
		name: `${NAMESPACE}.settings.${SETTINGS.EmberVersionWarningSuppressedThrough}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.EmberVersionWarningSuppressedThrough}.hint`,
		scope: 'world',
		config: !!game.modules.get('ember')?.active,
		type: String,
		default: '',
	})

	// #endregion

	// #region Disable App V2 background blur
	game.settings.register(NAMESPACE, SETTINGS.DisableAppV2BackgroundBlur, {
		name: `${NAMESPACE}.settings.${SETTINGS.DisableAppV2BackgroundBlur}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.DisableAppV2BackgroundBlur}.hint`,
		scope: 'client',
		requiresReload: false,
		config: true,
		onChange: (value) => {
			toggleDisableAppBackgroundBlur(!!value)
		},
		type: Boolean,
		default: false,
	})
	// #endregion
})
