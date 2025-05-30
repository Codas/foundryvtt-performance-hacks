import { SETTINGS, getSetting } from 'src/settings.ts';
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts';

async function cacheResourceBars(this: Token, wrapped: Function, ...args: any[]) {
	const wrappedResult = wrapped(...args);
	if (wrappedResult instanceof Promise) {
		await wrappedResult;
	}
	const cacheAsBitmapResolution = getBitmapCacheResolution();
	const cacheGraphics = (bars: PIXI.Graphics | PIXI.Container | unknown) => {
		if (bars instanceof PIXI.Graphics) {
			bars.cacheAsBitmap = false;
			bars.cacheAsBitmapResolution = cacheAsBitmapResolution;
			bars.cacheAsBitmap = true;
		} else if (bars instanceof PIXI.Container) {
			bars.children.forEach((child) => cacheGraphics(child));
		}
	};
	if (game.modules.get('barbrawl')?.active) {
		// barbrawl refreshes the bars asynchronously...
		// this is just a dirty hack to wait for the bars to be refreshed and actually available
		setTimeout(() => cacheGraphics(this.bars), 50);
	} else {
		cacheGraphics(this.bars);
	}
}

function isTokenBarCachingAvailable() {
	// disable for newer bar brawl versions as that modules comes with its own caching
	// and is broken by our caching attempts
	const barBrawl = game.modules.get('barbrawl');
	if (barBrawl && barBrawl.active && foundry.utils.isNewerVersion(barBrawl.version, '1.8.8')) {
		return false;
	}

	return true;
}

let enableTokenBarsCaching = () => {
	if (!isTokenBarCachingAvailable()) {
		return;
	}

	const enabled = getSetting(SETTINGS.TokenBarsCaching);
	if (!enabled) {
		return;
	}

	libWrapper.register('fvtt-perf-optim', 'CONFIG.Token.objectClass.prototype.drawBars', cacheResourceBars, 'WRAPPER');
};
export default enableTokenBarsCaching;

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.foo;
	});
}
