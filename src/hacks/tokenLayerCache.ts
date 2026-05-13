import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { addWrapperHook, removeWrapperHook } from 'src/utils/multiWrapper.ts'

/**
 * Token UI Layer Texture Cache
 *
 * Rather than re-running the full token UI render every frame, this hack redirects the token
 * objects container's render function to write into two viewport-sized RenderTextures:
 * - voidMaskRT: contains only the void mesh shapes
 * - tokenUIRT: contains all token UI (bars, nameplates, effects, ...) rendered as normal
 *
 * On cache hit (nothing changed since last bake):
 * 1. copy voidMaskRT onto the active interface RT with ERASE blend
 * 2. copy tokenUIRT onto the active interface RT with normal blend mode
 *
 * On a cache miss or invalidation, re-create both RTs, then composite as above.
 */

// ============================================================================
// #region Token layer cache

class TokenLayerCache {
	#voidMaskRT: PIXI.RenderTexture | null = null
	#tokenUiRT: PIXI.RenderTexture | null = null

	// Sprite used for each blit. Re-created if the texture changes.
	#voidBlitSprite: PIXI.Sprite | null = null
	#uiBlitSprite: PIXI.Sprite | null = null

	#valid = false
	// The render target that was active when we last baked
	#bakedForRT: PIXI.RenderTexture | null = null

	invalidate() {
		this.#valid = false
	}

	destroy() {
		this.#voidMaskRT?.destroy(true)
		this.#tokenUiRT?.destroy(true)
		this.#voidBlitSprite?.destroy()
		this.#uiBlitSprite?.destroy()
		this.#voidMaskRT = null
		this.#tokenUiRT = null
		this.#voidBlitSprite = null
		this.#uiBlitSprite = null
		this.#valid = false
		this.#bakedForRT = null
	}

	// Resize both RTs if the sourceFrame has changed.
	ensureRenderTextureSize(renderer: PIXI.Renderer): boolean {
		const sf = renderer.renderTexture.sourceFrame
		if (!(sf.width > 0 && sf.height > 0)) {
			return false
		}

		const w = Math.ceil(sf.width)
		const h = Math.ceil(sf.height)
		const res = renderer.resolution

		const needsResize =
			!this.#voidMaskRT ||
			Math.ceil(this.#voidMaskRT.width) !== w ||
			Math.ceil(this.#voidMaskRT.height) !== h ||
			Math.round(this.#voidMaskRT.resolution * 100) !== Math.round(res * 100)

		if (!needsResize) {
			return true
		}

		this.#voidMaskRT?.destroy(true)
		this.#tokenUiRT?.destroy(true)
		this.#voidMaskRT = PIXI.RenderTexture.create({ width: w, height: h, resolution: res })
		this.#tokenUiRT = PIXI.RenderTexture.create({ width: w, height: h, resolution: res })

		this.#voidBlitSprite?.destroy()
		this.#uiBlitSprite?.destroy()

		this.#voidBlitSprite = new PIXI.Sprite(this.#voidMaskRT)
		this.#voidBlitSprite.blendMode = PIXI.BLEND_MODES.ERASE
		this.#voidBlitSprite.position.set(0, 0)
		this.#voidBlitSprite.width = w
		this.#voidBlitSprite.height = h

		this.#uiBlitSprite = new PIXI.Sprite(this.#tokenUiRT)
		this.#uiBlitSprite.blendMode = PIXI.BLEND_MODES.NORMAL
		this.#uiBlitSprite.position.set(0, 0)
		this.#uiBlitSprite.width = w
		this.#uiBlitSprite.height = h

		this.#valid = false

		return true
	}

	/**
	 * Render all token mesh shapes into voidMaskRT. Since void meshes are just regular meshes
	 * rendered in ERASE mode, this void mask can be used to erase everything below ALL tokens (grid, etc)
	 */
	#bakeVoidMask(container: PIXI.Container, renderer: PIXI.Renderer) {
		const rtSystem = renderer.renderTexture
		const prevRT = rtSystem.current ?? undefined
		const prevSourceFrame = rtSystem.sourceFrame?.clone()

		renderer.batch.flush()
		rtSystem.bind(this.#voidMaskRT ?? undefined)
		rtSystem.clear()

		const TokenClass = foundry.canvas.placeables.Token
		for (const child of container.children) {
			if (!(child instanceof TokenClass)) {
				continue
			}
			const token = child
			const mesh = token.mesh
			if (!mesh?.visible || mesh.worldAlpha <= 0 || !mesh.renderable) {
				continue
			}

			// Force NORMAL blend mode temporarily in case it has been changed by another render step
			const origBlend = mesh.blendMode
			mesh.blendMode = PIXI.BLEND_MODES.NORMAL
			try {
				if (mesh.cullable) {
					// @ts-expect-error we need to access protected methods here
					mesh._renderWithCulling(renderer)
				} else {
					// @ts-expect-error we need to access protected methods here
					mesh._render(renderer)
				}
			} finally {
				mesh.blendMode = origBlend
			}
		}

		renderer.batch.flush()
		rtSystem.bind(prevRT, prevSourceFrame)
	}

	// Render the full token UI into tokenUIRT.
	#bakeTokenUi(container: PIXI.Container, renderer: PIXI.Renderer) {
		const rtSystem = renderer.renderTexture
		const prevRT = rtSystem.current
		const prevSourceFrame = rtSystem.sourceFrame?.clone()

		renderer.batch.flush()

		// Bind our private RT
		const sf = renderer.renderTexture.sourceFrame
		rtSystem.bind(this.#tokenUiRT ?? undefined, sf)
		rtSystem.clear()

		originalRenders.get(container)?.call(container, renderer)
		renderer.batch.flush()

		rtSystem.bind(prevRT ?? undefined, prevSourceFrame)
	}

	// Copy voidMaskRT and tokenUIRT onto the currently-bound interface RT using screen-space sprite
	// rendering
	#blit(renderer: PIXI.Renderer) {
		if (!this.#voidBlitSprite || !this.#uiBlitSprite) {
			return
		}

		renderer.batch.flush()

		// Push null projection transform so the sprites are drawn in screen space.
		const prevProjectionTransform = renderer.projection.transform
		renderer.projection.transform = PIXI.Matrix.IDENTITY

		this.#voidBlitSprite.render(renderer)
		this.#uiBlitSprite.render(renderer)

		renderer.batch.flush()
		renderer.projection.transform = prevProjectionTransform
	}

	// Returns true if the cache should be skipped this frame and the token UI rendered directly.
	// Covers cases where cached content would be stale without an explicit invalidate() call:
	// - any token has an animated (video) texture whose frames change each tick
	// - any token is mid-animation (animationContexts non-empty)
	// - any token has a PIXI filter applied
	#shouldBypassCache(container: PIXI.Container): boolean {
		const TokenClass = foundry.canvas.placeables.Token
		for (const child of container.children as PIXI.DisplayObject[]) {
			if (!(child instanceof TokenClass)) {
				continue
			}
			const token = child

			// Video texture: content changes every render tick without firing a hook.
			const resource = token.mesh?.texture?.baseTexture?.resource
			if ((resource as { source?: unknown })?.source instanceof HTMLVideoElement) {
				return true
			}

			// Active animation (movement, etc.): animationContexts map is non-empty.
			if (token.animationContexts?.size) {
				return true
			}

			// PIXI filter on the token container or its mesh.
			if (child.filters?.length || token.mesh?.filters?.length) {
				return true
			}

			// Invisibility ring effect: the void mesh shader output opacity changes per-frame during the
			// fade, so the cached void mask would always be stale
			const invisFlag = foundry.canvas.placeables.tokens.TokenRing.effects.INVISIBILITY
			if (((token.ring?.effects ?? 0) & invisFlag) > 0) {
				return true
			}

			// Ember dynamic animation: the token's appearance changes each frame
			if ((token as any).emberDynamicToken?.animated === true) {
				return true
			}

			// Turn marker: animates on the UI layer each frame
			if ((token as any).turnMarker?.visible === true) {
				return true
			}

			if ((token as any).controlled && (token as any).hasSight) {
				return true
			}
		}
		return false
	}

	renderFrame(container: PIXI.Container, renderer: PIXI.Renderer) {
		if (!this.ensureRenderTextureSize(renderer)) {
			originalRenders.get(container)?.call(container, renderer)
			return
		}

		// Bypass the RT bake+blit path for scenes with per-frame-changing content.
		// Invalidate so the cache is re-built on the first frame after conditions clear.
		if (this.#shouldBypassCache(container)) {
			this.#valid = false
			originalRenders.get(container)?.call(container, renderer)
			return
		}

		const currentRT = renderer.renderTexture.current ?? null

		if (this.#valid && currentRT !== this.#bakedForRT) {
			this.#valid = false
		}

		if (!this.#valid) {
			this.#bakeVoidMask(container, renderer)
			this.#bakeTokenUi(container, renderer)
			this.#valid = true
			this.#bakedForRT = currentRT
		}

		this.#blit(renderer)
	}
}

// #endregion

// ============================================================================
// #region Module-level state

const tokenLayerCache = new TokenLayerCache()

// Tracks the original render per swapped container so we can restore it.
const originalRenders = new WeakMap<PIXI.Container, (renderer: PIXI.Renderer) => void>()

function ourRender(this: PIXI.Container, renderer: PIXI.Renderer) {
	tokenLayerCache.renderFrame(this, renderer)
}

function applyTokenLayerCacheRenderFunction(objects: PIXI.Container) {
	if (originalRenders.has(objects)) {
		return
	}
	originalRenders.set(objects, objects.render)
	objects.render = ourRender
}

function restoreOriginalRenderFunction(objects: PIXI.Container) {
	const original = originalRenders.get(objects)
	if (original === undefined) {
		return
	}
	objects.render = original
	originalRenders.delete(objects)
}

function applyOnDraw(this: { objects?: PIXI.Container }) {
	if (this.objects) {
		applyTokenLayerCacheRenderFunction(this.objects)
	}
}

const invalidateCache = () => tokenLayerCache.invalidate()

// #endregion

// ============================================================================
// #region Enable / disable

const TOKEN_LAYER_DRAW_PATH = 'CONFIG.Canvas.layers.tokens.layerClass.prototype._draw'

let isEnabled = false

function enableTokenLayerCache() {
	if (!getSetting(SETTINGS.TokenLayerCache)) {
		return
	}

	registerTokenLayerCache()
}

function registerTokenLayerCache() {
	if (isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}

	isEnabled = true

	addWrapperHook<{ objects?: PIXI.Container }>(TOKEN_LAYER_DRAW_PATH, applyOnDraw)

	// Same invalidation events as generalizedOooRendering, plus canvasPan
	Hooks.on('updateToken', invalidateCache)
	Hooks.on('createToken', invalidateCache)
	Hooks.on('deleteToken', invalidateCache)
	Hooks.on('refreshToken', invalidateCache)
	Hooks.on('canvasReady', invalidateCache)
	Hooks.on('canvasPan', invalidateCache)

	const objects = canvas?.tokens?.objects as PIXI.Container | undefined
	if (objects) {
		applyTokenLayerCacheRenderFunction(objects)
	}
}

function unregisterTokenLayerCache() {
	if (!isEnabled) {
		return
	}
	isEnabled = false

	removeWrapperHook(TOKEN_LAYER_DRAW_PATH, applyOnDraw)

	Hooks.off('updateToken', invalidateCache)
	Hooks.off('createToken', invalidateCache)
	Hooks.off('deleteToken', invalidateCache)
	Hooks.off('refreshToken', invalidateCache)
	Hooks.off('canvasReady', invalidateCache)
	Hooks.off('canvasPan', invalidateCache)

	const objects = canvas?.tokens?.objects as PIXI.Container | undefined
	if (objects) {
		restoreOriginalRenderFunction(objects)
	}

	tokenLayerCache.destroy()
}

export { enableTokenLayerCache, registerTokenLayerCache, unregisterTokenLayerCache }

// #endregion
