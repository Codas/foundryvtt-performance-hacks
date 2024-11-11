import { NAMESPACE } from './constants.ts';

export enum SETTINGS {
	OptimizeTokenUiBatching = 'optimize-interface-layer-clipping',
	EffectsCaching = 'token-effects-caching',
	TokenBarsCaching = 'token-bars-caching',
	FasterEdgeTesting = 'faster-edge-testing',
}

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
	// game.settings.register(NAMESPACE, SETTINGS.FasterEdgeTesting, {
	// 	name: `${NAMESPACE}.settings.${SETTINGS.FasterEdgeTesting}.name`,
	// 	hint: `${NAMESPACE}.settings.${SETTINGS.FasterEdgeTesting}.hint`,
	// 	scope: 'client',
	// 	config: true,
	// 	requiresReload: true,
	// 	type: Boolean,
	// 	default: true,
	// })
});
