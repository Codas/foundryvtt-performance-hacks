import { NAMESPACE } from 'src/constants.ts';
import { CustomSpritesheetConfig } from '../apps/CustomSpritesheetConfig.ts';
import { SETTINGS } from './constants.ts';

export function getSetting(settings: SETTINGS): unknown {
	return game.settings.get(NAMESPACE, settings);
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
});
