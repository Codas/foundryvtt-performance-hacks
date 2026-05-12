import type { SpriteMesh } from '@7h3laughingman/foundry-types/client/canvas/containers/_module.mjs'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'

/**
 * Void Mesh Caching
 *
 * Tokens with dynamic rings run the full TokenRingSamplerShader for their void mesh pass, which is
 * considerably more expensive than a simple sprite draw.
 *
 * This hack caches each ring token's mesh output to a Texture, then replaces the token's voidMesh
 * with a plain PIXI.Container whose render function temporarily overrides the token mesh's texture,
 * plugin name, and filters to use the cached texture with PrimaryBaseSamplerShader, reducing the
 * drawing complexity and improving performance on GPU constrained systems.
 *
 * NOTE: currently deprecated in favor of the full token layer cache. Void mesh caching has the same
 * issues as that one but is considerably more narrow. While it helps a little bit in scenes with
 * mixed "special" tokens that would break token layer cache completely, in practice void mesh caching
 * in that case would probably give negligable benefits anyway. Added complexity is probably not worth it
 */

// ============================================================================
// #region Cache state

interface VoidCache {
	rt: PIXI.RenderTexture
	customVoidMesh: PIXI.Container
	originalVoidMesh: any // PIXI.Container (native Foundry voidMesh)
	valid: boolean
}

const tokenCaches = new WeakMap<any, VoidCache>()

// #endregion

// ============================================================================
// #region Bake

/**
 * Render the token's real mesh into the cache RenderTexture
 */
function bakeVoidTexture(cache: VoidCache, realMesh: SpriteMesh, renderer: PIXI.Renderer) {
	if (!realMesh?._texture) {
		return
	}

	// Use the texture's original (unscaled) pixel dimensions, which is also what
	// calculateVertices() uses for local vertex positions
	const tw = (realMesh._texture.orig?.width || realMesh._texture.width || 1) as number
	const th = (realMesh._texture.orig?.height || realMesh._texture.height || 1) as number
	const ax = (realMesh.anchor?.x ?? 0.5) as number
	const ay = (realMesh.anchor?.y ?? 0.5) as number

	if (cache.rt.width !== tw || cache.rt.height !== th) {
		cache.rt.resize(tw, th)
	}

	// Flush any pending batch draw calls before switching render targets so previously batched
	// scene elements don't bleed into the RT.
	renderer.batch.flush()

	// Use the RT API directly rather than renderer.render() to avoid rendering children (only the
	// mesh itself)
	const rtSystem = renderer.renderTexture
	const prevRenderTexture = rtSystem.current
	const prevSourceFrame = rtSystem.sourceFrame?.clone()

	// Bind the RT and clear it before rendering the mesh.
	rtSystem.bind(cache.rt)
	rtSystem.clear()

	// Instead of fighting with projection.transform timing, we temporarily replace
	// realMesh.worldTransform with a pure translation T(tw * ax, th * ay)
	const wt = realMesh.transform.worldTransform
	const origA = wt.a,
		origB = wt.b,
		origC = wt.c,
		origD = wt.d,
		origTx = wt.tx,
		origTy = wt.ty
	const origTransformID = realMesh._transformID as number

	wt.a = 1
	wt.b = 0
	wt.c = 0
	wt.d = 1
	wt.tx = tw * ax
	wt.ty = th * ay
	// force calculateVertices() to recompute
	realMesh._transformID = -1

	realMesh._render(renderer)
	renderer.batch.flush()

	// Restore worldTransform state. We mutated the matrix directly without going through the
	// Transform API, so transform._worldID is unchanged.
	wt.a = origA
	wt.b = origB
	wt.c = origC
	wt.d = origD
	wt.tx = origTx
	wt.ty = origTy
	realMesh._transformID = origTransformID

	rtSystem.bind(prevRenderTexture ?? undefined, prevSourceFrame)

	cache.valid = true
}

// #endregion

// ============================================================================
// #region Per-token override

function setupTokenOverride(token: any) {
	if (!token?.hasDynamicRing || !token.voidMesh || !token.mesh) {
		return
	}

	const existing = tokenCaches.get(token)
	if (existing) {
		if (token.voidMesh === existing.customVoidMesh) {
			existing.valid = false
			return
		}
		existing.customVoidMesh.destroy()
		existing.rt.destroy(true)
		tokenCaches.delete(token)
	}

	const renderer = canvas?.app?.renderer
	if (!renderer) {
		return
	}

	const realMesh = token.mesh
	const texW = (realMesh._texture?.orig?.width ?? realMesh._texture?.width ?? 1) as number
	const texH = (realMesh._texture?.orig?.height ?? realMesh._texture?.height ?? 1) as number

	const rt = PIXI.RenderTexture.create({
		width: texW,
		height: texH,
		resolution: renderer.resolution,
	})

	const customVoidMesh = new PIXI.Container()
	customVoidMesh.updateTransform = () => {}

	const originalVoidMesh = token.voidMesh
	const childIndex = token.getChildIndex(originalVoidMesh)
	token.removeChild(originalVoidMesh)
	token.addChildAt(customVoidMesh, childIndex)
	token.voidMesh = customVoidMesh

	const cache: VoidCache = {
		rt,
		customVoidMesh,
		originalVoidMesh,
		valid: false,
	}
	tokenCaches.set(token, cache)

	customVoidMesh.render = (r: PIXI.Renderer) => {
		if (!isEnabled) {
			return
		}
		const currentRealMesh = token.mesh as any
		if (!currentRealMesh) {
			return
		}

		// Invisibility ring effect: the ring shader output opacity changes per-frame during the fade.
		const invisFlag = foundry.canvas.placeables.tokens.TokenRing.effects.INVISIBILITY
		if (((token.ring?.effects ?? 0) & invisFlag) > 0) {
			cache.valid = false
			currentRealMesh._renderVoid(r)
			return
		}

		if (!cache.valid) {
			bakeVoidTexture(cache, currentRealMesh, r)
		}

		const origTexture = currentRealMesh._texture
		const origPluginName = currentRealMesh.pluginName
		const origFilters = currentRealMesh.filters

		currentRealMesh._texture = cache.rt
		currentRealMesh.pluginName = 'batchOcclusion'
		currentRealMesh.filters = null

		currentRealMesh._renderVoid(r)

		currentRealMesh._texture = origTexture
		currentRealMesh.pluginName = origPluginName
		currentRealMesh.filters = origFilters
	}
}

/**
 * Tear down the override and restore the original voidMesh
 */
function tearDownTokenOverride(token: any) {
	const cache = tokenCaches.get(token)
	if (!cache) {
		return
	}

	if (token?.voidMesh === cache.customVoidMesh) {
		const childIndex = token.getChildIndex(cache.customVoidMesh)
		token.removeChild(cache.customVoidMesh)
		if (cache.originalVoidMesh && !cache.originalVoidMesh.destroyed) {
			if (childIndex >= 0) {
				token.addChildAt(cache.originalVoidMesh, childIndex)
			} else {
				token.addChild(cache.originalVoidMesh)
			}
			token.voidMesh = cache.originalVoidMesh
		} else {
			token.voidMesh = null
		}
	}

	cache.customVoidMesh.destroy()
	cache.rt.destroy(true)
	tokenCaches.delete(token)
}

function invalidateToken(token: any) {
	const cache = tokenCaches.get(token)
	if (cache) {
		cache.valid = false
	}
}

// #endregion

// ============================================================================
// #region Hooks

function onDrawToken(token: any) {
	if (!isEnabled) {
		return
	}
	setupTokenOverride(token)
}

function onUpdateToken(doc: any) {
	if (!isEnabled) {
		return
	}
	const token = doc?.object
	if (!token) {
		return
	}
	if (!tokenCaches.has(token) && token.hasDynamicRing) {
		setupTokenOverride(token)
	} else {
		invalidateToken(token)
	}
}

// #endregion

// ============================================================================
// #region Enable / disable

let isEnabled = false

function registerVoidMeshCaching() {
	if (isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = true

	Hooks.on('drawToken', onDrawToken)
	Hooks.on('updateToken', onUpdateToken)

	for (const token of canvas?.tokens?.placeables ?? []) {
		setupTokenOverride(token)
	}
}

function unregisterVoidMeshCaching() {
	if (!isEnabled) {
		return
	}
	isEnabled = false

	Hooks.off('drawToken', onDrawToken)
	Hooks.off('updateToken', onUpdateToken)

	for (const token of canvas?.tokens?.placeables ?? []) {
		tearDownTokenOverride(token)
	}
}

function enableVoidMeshCaching() {
	if (!getSetting(SETTINGS.VoidMeshCaching)) {
		return
	}

	registerVoidMeshCaching()
}

export { enableVoidMeshCaching, registerVoidMeshCaching, unregisterVoidMeshCaching }

// #endregion
