import { registerControlIconCaching, unregisterControlIconCaching } from './hacks/controlIconCaching.ts'
import { registerEffectsCaching, unregisterEffectsCaching } from './hacks/effectsCaching.ts'
import { registerGeneralizedOooRendering, unregisterGeneralizedOooRendering } from './hacks/generalizedOooRendering.ts'
import {
	closePerformanceOverlay,
	copyPerformanceData,
	openPrimaryChildrenOverlay,
	stopPerformanceOverlay,
} from './hacks/gpuTimingDebug.ts'
import { toggleMeshDebug } from './hacks/meshGeometryFitting.ts'
import { registerTokenBarsCaching, unregisterTokenBarsCaching } from './hacks/tokenBarsCaching.ts'
import { registerTokenLayerCache, unregisterTokenLayerCache } from './hacks/tokenLayerCache.ts'
import { registerWallSpriteCaching, unregisterWallSpriteCaching } from './hacks/wallSpriteCaching.ts'

const PrimePerformanceApi = {
	controlIconCaching: {
		enable: registerControlIconCaching,
		disable: unregisterControlIconCaching,
	},
	overlay: {
		open: closePerformanceOverlay,
		close: stopPerformanceOverlay,
		snapshot: copyPerformanceData,
		primaryChildren: openPrimaryChildrenOverlay,
	},
	effectsCaching: {
		enable: registerEffectsCaching,
		disable: unregisterEffectsCaching,
	},
	tokenBarsCaching: {
		enable: registerTokenBarsCaching,
		disable: unregisterTokenBarsCaching,
	},
	generalizedOooRendering: {
		enable: registerGeneralizedOooRendering,
		disable: unregisterGeneralizedOooRendering,
	},
	meshGeometryFitting: {
		toggleDebug: toggleMeshDebug,
	},
	wallSpriteCaching: {
		enable: registerWallSpriteCaching,
		disable: unregisterWallSpriteCaching,
	},
	tokenLayerCache: {
		enable: registerTokenLayerCache,
		disable: unregisterTokenLayerCache,
	},
} as const

declare global {
	interface Window {
		PrimePerformance: typeof PrimePerformanceApi
	}
}

function setupWindowApi() {
	window.PrimePerformance = PrimePerformanceApi
}

export { setupWindowApi }
