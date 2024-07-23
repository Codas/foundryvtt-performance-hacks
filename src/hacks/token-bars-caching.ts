import { SETTINGS, getSetting } from 'src/settings.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'

function cacheResourceBars(this: Token, wrapped: Function, ...args: any[]) {
	wrapped(...args)
	const cacheAsBitmapResolution = getBitmapCacheResolution()
	const cacheGraphics = (bars: PIXI.Graphics | PIXI.Container | unknown) => {
		if (bars instanceof PIXI.Graphics) {
			bars.cacheAsBitmap = false
			bars.cacheAsBitmapResolution = cacheAsBitmapResolution
			bars.cacheAsBitmap = true
		} else if (bars instanceof PIXI.Container) {
			bars.children.forEach((child) => cacheGraphics(child))
		}
	}
	if (game.modules.get('barbrawl')?.active) {
		// barbrawl refreshes the bars asynchronously...
		// this is just a dirty hack to wait for the bars to be refreshed and actually available
		setTimeout(() => cacheGraphics(this.bars), 50)
	} else {
		cacheGraphics(this.bars)
	}
}

let enableTokenBarsCaching = () => {
	const enabled = getSetting(SETTINGS.TokenBarsCaching)
	if (!enabled) {
		return
	}

	libWrapper.register('fvtt-perf-optim', 'CONFIG.Token.objectClass.prototype.drawBars', cacheResourceBars, 'WRAPPER')
}
export default enableTokenBarsCaching

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.foo
	})
}
