import { SETTINGS, getSetting } from 'src/settings.ts';
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts';

function refreshEffectCache(object: PIXI.DisplayObject) {
	object.cacheAsBitmap = false;
	object.cacheAsBitmapResolution = getBitmapCacheResolution();
	object.cacheAsBitmap = true;
}

function shouldCacheIndividualEffects() {
	const effectHider = game.modules.get('effect-hider');
	if (effectHider && effectHider.active) {
		return true;
	}
	return false;
}

async function cacheEffects(this: Token, wrapper: Function, ...args: any[]) {
	const wrappedResult = wrapper(...args);
	if (wrappedResult instanceof Promise) {
		await wrappedResult;
	}

	const [flags] = args;
	if (flags?.redrawEffects || flags?.refreshEffects) {
		if (shouldCacheIndividualEffects()) {
			this.effects.children.forEach((effect) => {
				refreshEffectCache(effect);
			});
		} else {
			refreshEffectCache(this.effects);
		}
	}
}

function isTokenEffectsCachingAvailable() {
	// Caching is not needed for dorako UX since radial hud already uses prerendered textures
	// for the status effect icons for performance
	const hasDorakoRadialHud =
		game.settings.settings.has('pf2e-dorako-ux.moving.adjust-token-effects-hud') &&
		game.settings.get('pf2e-dorako-ux', 'moving.adjust-token-effects-hud');
	if (hasDorakoRadialHud) {
		return false;
	}

	return true;
}

let enableTokenBarsCaching = () => {
	if (!isTokenEffectsCachingAvailable()) {
		return;
	}

	const enabled = getSetting(SETTINGS.TokenBarsCaching);

	if (!enabled) {
		return;
	}

	libWrapper.register(
		'fvtt-perf-optim',
		'CONFIG.Token.objectClass.prototype._applyRenderFlags',
		cacheEffects,
		'WRAPPER',
	);
};
export default enableTokenBarsCaching;

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.foo;
	});
}
