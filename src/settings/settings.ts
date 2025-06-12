import { CustomRenderScaleConfig } from 'src/apps/CustomRenderScaleMenu.ts';
import { NAMESPACE } from 'src/constants.ts';
import { toggleDisableAppBackgroundBlur } from 'src/hacks/disableAppBackgroundBlur.ts';
import { configureEffectsResolution } from 'src/hacks/reduceLightingResolution.ts';
import { CustomSpritesheetConfig } from '../apps/CustomSpritesheetConfig.ts';
import { RENDER_SCALE_DEFAULTS, SETTINGS } from './constants.ts';

export function getSetting<T = unknown>(settings: SETTINGS): T {
	return game.settings.get<T>(NAMESPACE, settings);
}

Hooks.on('init', () => {
	game.settings.register(NAMESPACE, SETTINGS.OptimizeTokenUiBatching, {
		name: `${NAMESPACE}.settings.${SETTINGS.OptimizeTokenUiBatching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.OptimizeTokenUiBatching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	});
	game.settings.register(NAMESPACE, SETTINGS.EffectsCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.EffectsCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.EffectsCaching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	});
	game.settings.register(NAMESPACE, SETTINGS.TokenBarsCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.TokenBarsCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.TokenBarsCaching}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	});
	game.settings.register(NAMESPACE, SETTINGS.SpritesheetSubstitution, {
		name: `${NAMESPACE}.settings.${SETTINGS.SpritesheetSubstitution}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.SpritesheetSubstitution}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(NAMESPACE, SETTINGS.CustomSpritesheets, {
		name: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.hint`,
		config: false,
		type: Array,
		default: [],
	});

	game.settings.registerMenu(NAMESPACE, SETTINGS.CustomSpritesheets, {
		name: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.hint`,
		label: `${NAMESPACE}.settings.${SETTINGS.CustomSpritesheets}.label`,
		icon: 'fa-solid fa-images',
		type: CustomSpritesheetConfig,
		restricted: true,
	});

	game.settings.register(NAMESPACE, SETTINGS.TokenRingSpritesheetSupport, {
		name: `${NAMESPACE}.settings.${SETTINGS.TokenRingSpritesheetSupport}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.TokenRingSpritesheetSupport}.hint`,
		scope: 'world',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: false,
	});

	game.settings.register(NAMESPACE, SETTINGS.PrecomputedNoiseTextures, {
		name: `${NAMESPACE}.settings.${SETTINGS.PrecomputedNoiseTextures}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.PrecomputedNoiseTextures}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(NAMESPACE, SETTINGS.ReduceLightingResolution, {
		name: `${NAMESPACE}.settings.${SETTINGS.ReduceLightingResolution}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.ReduceLightingResolution}.hint`,
		scope: 'client',
		requiresReload: false,
		config: true,
		onChange: (enabled) => {
			const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
			configureEffectsResolution(enabled ? customRenderScale : null);
		},
		type: Boolean,
		default: true,
	});

	game.settings.register(NAMESPACE, SETTINGS.CustomRenderScale, {
		name: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.hint`,
		config: false,
		scope: 'client',
		type: Object,
		default: RENDER_SCALE_DEFAULTS,
	});
	game.settings.registerMenu(NAMESPACE, SETTINGS.CustomRenderScale, {
		name: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.hint`,
		label: `${NAMESPACE}.settings.${SETTINGS.CustomRenderScale}.label`,
		icon: 'fa-solid fa-percent',
		type: CustomRenderScaleConfig,
		restricted: false,
	});

	game.settings.register(NAMESPACE, SETTINGS.DisableAppV2BackgroundBlur, {
		name: `${NAMESPACE}.settings.${SETTINGS.DisableAppV2BackgroundBlur}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.DisableAppV2BackgroundBlur}.hint`,
		scope: 'client',
		requiresReload: false,
		config: true,
		onChange: (value) => {
			toggleDisableAppBackgroundBlur(!!value);
		},
		type: Boolean,
		default: false,
	});
});
