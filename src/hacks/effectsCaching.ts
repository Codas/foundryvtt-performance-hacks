import { NAMESPACE } from 'src/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';
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

	if (game.modules.has('pf2e-effects-halo') && game.modules.get('pf2e-effects-halo')?.active) {
		return false;
	}

	return true;
}

let enableEffectsCaching = () => {
	if (!isTokenEffectsCachingAvailable()) {
		return;
	}

	const enabled = getSetting(SETTINGS.TokenBarsCaching);

	if (!enabled || !FOUNDRY_API.hasCanvas) {
		return;
	}

	libWrapper.register(NAMESPACE, 'CONFIG.Token.objectClass.prototype._applyRenderFlags', cacheEffects, 'WRAPPER');
};
export { enableEffectsCaching };

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableEffectsCaching = newModule?.foo;
	});
}
