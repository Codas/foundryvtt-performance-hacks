import { SETTINGS, getSetting } from 'src/settings.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'

async function cacheEffects(this: Token, wrapper: Function, ...args: any[]) {
	const wrappedResult = wrapper(...args)
	if (wrappedResult instanceof Promise) {
		await wrappedResult
	}
	this.effects.cacheAsBitmap = false
	this.effects.cacheAsBitmapResolution = getBitmapCacheResolution()
	this.effects.cacheAsBitmap = true
}

let enableTokenBarsCaching = () => {
	const enabled = getSetting(SETTINGS.TokenBarsCaching)

	// Caching is not needed for dorako UX since radial hud already uses prerendered textures
	// for the status effect icons for performance
	const hasDorakoRadialHud =
		game.settings.settings.has('pf2e-dorako-ux.moving.adjust-token-effects-hud') &&
		game.settings.get('pf2e-dorako-ux', 'moving.adjust-token-effects-hud')

	if (!enabled || hasDorakoRadialHud) {
		return
	}

	libWrapper.register('fvtt-perf-optim', 'CONFIG.Token.objectClass.prototype._drawEffects', cacheEffects, 'WRAPPER')
}
export default enableTokenBarsCaching

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.foo
	})
}
