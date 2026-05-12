import { setupWindowApi } from '../windowApi.ts'
import { enableControlIconCaching } from './controlIconCaching.ts'
import { enableDisableAppBackgroundBlur } from './disableAppBackgroundBlur.ts'
import { enableDnD5eOptimizations } from './dnd5eOptimizations.ts'
import { enableEffectsCaching } from './effectsCaching.ts'
import { enableEmberMeshViewportCulling } from './emberMeshViewportCulling.ts'
import { registerEmberNoiseHack } from './emberNoiseHacks.ts'
import { enableGeneralizedOooRendering } from './generalizedOooRendering.ts'
import { enablePerformanceOverlay } from './gpuTimingDebug.ts'
import { enableMeshGeometryFitting } from './meshGeometryFitting.ts'
import { enablePrecomputedNoiseTextures } from './precomputedNoiseTextures.ts'
import { enableReducedLightingResolution } from './reduceLightingResolution.ts'
import { enableTokenBarsCaching } from './tokenBarsCaching.ts'
import { enableTokenLayerCache } from './tokenLayerCache.ts'
import { enableWallSpriteCaching } from './wallSpriteCaching.ts'

Hooks.once('setup', () => {
	setupWindowApi()
	enableControlIconCaching()
	enableDnD5eOptimizations()
	enableGeneralizedOooRendering()
	enableTokenLayerCache()
	enableEffectsCaching()
	enableTokenBarsCaching()
	enableMeshGeometryFitting()
	enablePrecomputedNoiseTextures()
	registerEmberNoiseHack()
	enableEmberMeshViewportCulling()
	enableReducedLightingResolution()
	enableDisableAppBackgroundBlur()
	enablePerformanceOverlay()
	enableWallSpriteCaching()
})
