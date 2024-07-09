import { SETTINGS, getSetting } from 'src/settings.ts'
import { wrapFunction } from 'src/utils.ts'

let enableTokenBarsCaching = () => {
	const enabled = getSetting(SETTINGS.TokenBarsCaching)
	if (!enabled) {
		return
	}

	wrapFunction(CONFIG.Token.objectClass.prototype, 'drawBars', function (this: Token, ...args: any[]) {
		;(['bar1', 'bar2'] as const).forEach((b) => {
			this.bars[b].cacheAsBitmap = false
			this.bars[b].cacheAsBitmap = true
		})
	})
}
export default enableTokenBarsCaching

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableTokenBarsCaching = newModule?.foo
	})
}
