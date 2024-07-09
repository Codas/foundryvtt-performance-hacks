import enableEffectsCaching from './effects-caching.ts'
import optimizeTokenUiBatching from './optimize-token-ui-batching.ts'
import enableTokenBarsCaching from './token-bars-caching.ts'

Hooks.once('setup', () => {
	optimizeTokenUiBatching()
	enableEffectsCaching()
	enableTokenBarsCaching()
})
