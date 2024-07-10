import enableEffectsCaching from './effects-caching.ts'
import enableTokenBarsCaching from './token-bars-caching.ts'
import useOooTokenRendering from './useOooTokenRendering.ts'

Hooks.once('setup', () => {
	useOooTokenRendering()
	enableEffectsCaching()
	enableTokenBarsCaching()
})
