import { NAMESPACE } from './constants.ts';

export const enum SETTINGS {
	OptimizeInterfaceClipping = 'optimize-interface-layer-clipping',
	NameplateCaching = 'nameplate-caching',
	TokenBarsCaching = 'token-bars-caching',
	DebugSpriteSheet = 'debug-sprite-sheet',
}

export const getSetting = (settings: SETTINGS): unknown => {
	return game.settings.get(NAMESPACE, settings);
};

Hooks.on('init', () => {
	game.settings.register(NAMESPACE, SETTINGS.OptimizeInterfaceClipping, {
		name: `${NAMESPACE}.settings.${SETTINGS.OptimizeInterfaceClipping}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.OptimizeInterfaceClipping}.hint`,
		scope: 'client',
		config: true,
		requiresReload: true,
		type: Boolean,
		default: true,
	});
	game.settings.register(NAMESPACE, SETTINGS.NameplateCaching, {
		name: `${NAMESPACE}.settings.${SETTINGS.NameplateCaching}.name`,
		hint: `${NAMESPACE}.settings.${SETTINGS.NameplateCaching}.hint`,
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
	// game.settings.register(NAMESPACE, SETTINGS.DebugSpriteSheet, {
	// 	name: `${NAMESPACE}.settings.${SETTINGS.DebugSpriteSheet}.name`,
	// 	hint: `${NAMESPACE}.settings.${SETTINGS.DebugSpriteSheet}.hint`,
	// 	scope: 'client',
	// 	config: true,
	// 	requiresReload: true,
	// 	type: Boolean,
	// 	default: false,
	// });
});
