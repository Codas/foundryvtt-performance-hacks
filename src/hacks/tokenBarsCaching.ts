import type Token from '@7h3laughingman/foundry-types/client/canvas/placeables/token.mjs'
import { NAMESPACE } from 'src/constants.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'

// Tracks pending PIXI.Ticker callback references per token so we can cancel them if
// drawBars fires again in the same frame (e.g. during an animated HP bar fill).
const pendingCaches = new WeakMap<Token, () => void>()

function disableBarsCache(bars: PIXI.Graphics | PIXI.Container | unknown) {
	if (bars instanceof PIXI.Graphics) {
		bars.cacheAsBitmap = false
	} else if (bars instanceof PIXI.Container) {
		for (const child of bars.children) {
			disableBarsCache(child)
		}
	}
}

function enableBarsCache(bars: PIXI.Graphics | PIXI.Container | unknown, resolution: number) {
	if (bars instanceof PIXI.Graphics) {
		bars.cacheAsBitmapResolution = resolution
		bars.cacheAsBitmap = true
	} else if (bars instanceof PIXI.Container) {
		for (const child of bars.children) {
			enableBarsCache(child, resolution)
		}
	}
}

async function cacheResourceBars(this: Token, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
	// Cancel any PIXI.Ticker callback that was scheduled to cache this token's bars
	const pendingTickerCb = pendingCaches.get(this)
	if (pendingTickerCb !== undefined) {
		PIXI.Ticker.shared.remove(pendingTickerCb)
		pendingCaches.delete(this)
	}

	if (this.bars) {
		disableBarsCache(this.bars)
	}

	const wrappedResult = wrapped(...args)
	if (wrappedResult instanceof Promise) {
		await wrappedResult
	}

	const cacheAsBitmapResolution = getBitmapCacheResolution()

	if (game.modules.get('barbrawl')?.active) {
		// barbrawl refreshes the bars asynchronously...
		// this is just a dirty hack to wait for the bars to be refreshed and actually available
		setTimeout(() => enableBarsCache(this.bars, cacheAsBitmapResolution), 50)
	} else {
		// Schedule caching for the next PIXI.Ticker tick (after all updates/animations).
		// If drawBars fires again before this runs, the callback will be removed above.
		const tickerCb = () => {
			pendingCaches.delete(this)
			enableBarsCache(this.bars, cacheAsBitmapResolution)
			PIXI.Ticker.shared.remove(tickerCb)
		}
		PIXI.Ticker.shared.addOnce(tickerCb, this, PIXI.UPDATE_PRIORITY.LOW)
		pendingCaches.set(this, tickerCb)
	}
}

function isTokenBarCachingAvailable() {
	// disable for newer bar brawl versions as that modules comes with its own caching
	// and is broken by our caching attempts
	const barBrawl = game.modules.get('barbrawl')
	if (barBrawl?.active && foundry.utils.isNewerVersion(barBrawl.version, '1.8.8')) {
		return false
	}

	return true
}

const DRAW_BARS_PATH = 'CONFIG.Token.objectClass.prototype.drawBars'

let isEnabled = false

let enableTokenBarsCaching = () => {
	if (!getSetting(SETTINGS.TokenBarsCaching)) {
		return
	}
	registerTokenBarsCaching()
}

function registerTokenBarsCaching() {
	if (isEnabled || !isTokenBarCachingAvailable() || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = true
	libWrapper.register(NAMESPACE, DRAW_BARS_PATH, cacheResourceBars, 'WRAPPER')
}

function unregisterTokenBarsCaching() {
	if (!isEnabled) {
		return
	}
	isEnabled = false
	libWrapper.unregister(NAMESPACE, DRAW_BARS_PATH)
	if (!FOUNDRY_API.hasCanvas) {
		return
	}
	for (const token of canvas?.tokens?.placeables ?? []) {
		const pendingTickerCb = pendingCaches.get(token as Token)
		if (pendingTickerCb !== undefined) {
			PIXI.Ticker.shared.remove(pendingTickerCb)
			pendingCaches.delete(token as Token)
		}
		if ((token as Token).bars) {
			disableBarsCache((token as Token).bars)
		}
	}
}

export { enableTokenBarsCaching, registerTokenBarsCaching, unregisterTokenBarsCaching }

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.enableTokenBarsCaching
	})
}
