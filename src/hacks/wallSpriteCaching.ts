import type Wall from '@7h3laughingman/foundry-types/client/canvas/placeables/wall.mjs'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { registerWrapperForVersion, unregisterWrapperForVersion } from 'src/utils/registerWrapper.ts'

/**
 * Wall Sprite Caching
 *
 * Walls by default are rendred as PIXI.Graphics objects (one for the line body, one for the two
 * endpoint circles). Graphics cannot be effectively batched by PIXI however, so each wall segment
 * needs two draw calls. Graphics are also comparatively expensive to render due to their vector
 * nature and anti-aliasing. This hack replaces the wall Graphics with PIXI.Sprites using pre-baked
 * textures.
 *
 * This hack wraps Wall._refreshLine and Wall._refreshEndpoints to:
 *   1. Call the original for its side effects (hit area, door control reposition).
 *   2. Clear the Graphics geometry so they cost zero at render time.
 *   3. Replace rendering with PIXI.Sprites using two pre-baked RenderTextures:
 *     - lineTex: encodes the two-stroke line in a 4 x (lw * 3) texture, tinted to wall color at runtime.
 *     - endpointTex: circle: white fill + black outline (normal radius lw * 3)
 *     - endpointHoverTex: same but hover radius lw * 4
 *
 * All walls share the same base textures. PIXI's batch renderer tints sprites
 * per-vertex, so walls of different colors all batch into a single draw call.
 * The entire WallsLayer renders in one draw call (almost) regardless of wall count.
 */

// ============================================================================
// #region Texture state

interface WallTextures {
	lineTex: PIXI.RenderTexture
	endpointTex: PIXI.RenderTexture
	endpointHoverTex: PIXI.RenderTexture
	/** Raw lw value (= 2 * uiScale) used to size sprites at render time. */
	lw: number
	/** Displayed width/height for a normal endpoint sprite. */
	epNormalSize: number
	/** Displayed width/height for a hovered endpoint sprite. */
	epHoverSize: number
}

let wallTextures: WallTextures | null = null

function nextPow2(n: number): number {
	return 2 ** Math.ceil(Math.log2(Math.max(1, n)))
}

/**
 * Render a display object into a RenderTexture and generate mipmaps.
 * The caller is responsible for creating the texture and destroying the source object.
 */
function renderToTexture(renderer: PIXI.Renderer, tex: PIXI.RenderTexture, source: PIXI.DisplayObject) {
	tex.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON
	renderer.render(source, { renderTexture: tex, clear: true })
	renderer.framebuffer.blit()
	renderer.texture.bind(tex.baseTexture)
	renderer.gl.generateMipmap(renderer.gl.TEXTURE_2D)
}

function getOrBakeWallTextures(): WallTextures | null {
	if (wallTextures) {
		return wallTextures
	}

	const renderer = canvas?.app?.renderer as PIXI.Renderer | undefined
	if (!renderer) {
		return null
	}

	const lw = 2 * canvas.dimensions.uiScale

	// Encode the two-stroke line in a 4 * (lw * 3) texture.
	// Both dimensions are power-of-2 for maximum number of mip levels for flicker-free rendering
	// when the wall is scaled down at low zoom levels.
	const lineTexW = 32
	const lineTexH = 32
	const blackTexH = Math.round(lineTexH / 3)
	const whiteTexH = lineTexH - 2 * blackTexH

	const lineTex = PIXI.RenderTexture.create({ width: lineTexW, height: lineTexH })
	const lineG = new PIXI.Graphics()
	lineG.beginFill(0x000000).drawRect(0, 0, lineTexW, lineTexH).endFill()
	lineG.beginFill(0xffffff).drawRect(0, blackTexH, lineTexW, whiteTexH).endFill()
	renderToTexture(renderer, lineTex, lineG)
	lineG.destroy()

	// Endpoint texture: White filled circle + black outline ring
	const makeEndpointTex = (cr: number): { tex: PIXI.RenderTexture; displaySize: number } => {
		const outerR = cr + lw / 2
		const texSize = nextPow2(Math.ceil(outerR * 2) + 2) * 2
		const center = texSize / 2
		const tex = PIXI.RenderTexture.create({ width: texSize, height: texSize, resolution: renderer.resolution })
		const g = new PIXI.Graphics()
		g.lineStyle(lw, 0x000000, 1.0)
		g.beginFill(0xffffff, 1.0)
		g.drawCircle(center, center, cr)
		g.endFill()
		renderToTexture(renderer, tex, g)
		g.destroy()
		return { tex, displaySize: texSize }
	}

	const normalEp = makeEndpointTex(lw * 3)
	const hoverEp = makeEndpointTex(lw * 4)

	wallTextures = {
		lineTex,
		endpointTex: normalEp.tex,
		endpointHoverTex: hoverEp.tex,
		lw,
		epNormalSize: normalEp.displaySize,
		epHoverSize: hoverEp.displaySize,
	}
	return wallTextures
}

function destroyWallTextures() {
	if (!wallTextures) {
		return
	}
	wallTextures.lineTex.destroy(true)
	wallTextures.endpointTex.destroy(true)
	wallTextures.endpointHoverTex.destroy(true)
	wallTextures = null
}

// #endregion

// ============================================================================
// #region Per-wall sprite management

interface WallSpriteEntry {
	line: PIXI.Sprite
	epA: PIXI.Sprite
	epB: PIXI.Sprite
}

const wallSpriteMap = new WeakMap<object, WallSpriteEntry>()

function getOrCreateWallSprites(wall: Wall, textures: WallTextures): WallSpriteEntry {
	const existing = wallSpriteMap.get(wall)
	if (existing && !existing.line.destroyed && existing.line.parent) {
		return existing
	}

	const line = new PIXI.Sprite(textures.lineTex)
	line.anchor.set(0, 0.5)
	wall.line.addChild(line)

	const epA = new PIXI.Sprite(textures.endpointTex)
	epA.anchor.set(0.5, 0.5)
	wall.endpoints.addChild(epA)

	const epB = new PIXI.Sprite(textures.endpointTex)
	epB.anchor.set(0.5, 0.5)
	wall.endpoints.addChild(epB)

	const entry: WallSpriteEntry = { line, epA, epB }
	wallSpriteMap.set(wall, entry)
	return entry
}

function removeWallSprites(wall: Wall) {
	const entry = wallSpriteMap.get(wall)
	if (!entry) {
		return
	}
	for (const sprite of [entry.line, entry.epA, entry.epB]) {
		if (!sprite.destroyed) {
			sprite.parent?.removeChild(sprite)
			sprite.destroy()
		}
	}
	wallSpriteMap.delete(wall)
}

// #endregion

// ============================================================================
// #region Wrappers

function Wall__refreshLine(this: Wall, wrapped: () => void) {
	// Call original for side effects: hit area polygon and door control reposition.
	// Immediately clear the Graphics geometry so they cost zero at render time.
	wrapped()
	this.line.clear()

	const textures = getOrBakeWallTextures()
	if (!textures) {
		return
	}

	const c = this.document.c as number[]
	const dx = c[2] - c[0]
	const dy = c[3] - c[1]
	const length = Math.sqrt(dx * dx + dy * dy)
	const wc = this._getWallColor() as number

	const { line } = getOrCreateWallSprites(this, textures)
	line.texture = textures.lineTex
	line.position.set(c[0], c[1])
	line.width = Math.max(1, length)
	line.height = textures.lw * 3
	line.rotation = Math.atan2(dy, dx)
	line.tint = wc
}

function Wall__refreshEndpoints(this: Wall, wrapped: () => void) {
	wrapped()
	this.endpoints.clear()

	const textures = getOrBakeWallTextures()
	if (!textures) {
		return
	}

	const c = this.document.c as number[]
	const wc = this._getWallColor() as number

	// Use hover texture/size when hovered or when the layer has highlight mode.
	const isHover = !!(this.hover || this.layer?.highlightObjects)
	const epTex = isHover ? textures.endpointHoverTex : textures.endpointTex
	const epSize = isHover ? textures.epHoverSize : textures.epNormalSize

	const { epA, epB } = getOrCreateWallSprites(this, textures)
	epA.texture = epTex
	epA.position.set(c[0], c[1])
	epA.width = epA.height = epSize
	epA.tint = wc

	epB.texture = epTex
	epB.position.set(c[2], c[3])
	epB.width = epB.height = epSize
	epB.tint = wc
}

// #endregion

// ============================================================================
// #region Enable / disable

const REFRESH_LINE_PATH = {
	v13: 'foundry.canvas.placeables.Wall.prototype._refreshLine',
}

const REFRESH_ENDPOINTS_PATH = {
	v13: 'foundry.canvas.placeables.Wall.prototype._refreshEndpoints',
}

let isEnabled = false

function registerWallSpriteCaching() {
	if (isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = true
	registerWrapperForVersion(Wall__refreshLine, 'WRAPPER', REFRESH_LINE_PATH)
	registerWrapperForVersion(Wall__refreshEndpoints, 'WRAPPER', REFRESH_ENDPOINTS_PATH)

	// Trigger a refresh on all existing walls so sprites are created immediately.
	for (const wall of canvas?.walls?.placeables ?? []) {
		wall.renderFlags?.set({ refreshLine: true, refreshEndpoints: true })
	}
}

function unregisterWallSpriteCaching() {
	if (!isEnabled) {
		return
	}
	isEnabled = false
	unregisterWrapperForVersion(REFRESH_LINE_PATH)
	unregisterWrapperForVersion(REFRESH_ENDPOINTS_PATH)

	for (const wall of canvas?.walls?.placeables ?? []) {
		removeWallSprites(wall)
		wall.renderFlags?.set({ refreshLine: true, refreshEndpoints: true })
	}

	destroyWallTextures()
}

function enableWallSpriteCaching() {
	if (!getSetting(SETTINGS.WallSpriteCaching)) {
		return
	}
	registerWallSpriteCaching()
}

export { enableWallSpriteCaching, registerWallSpriteCaching, unregisterWallSpriteCaching }

// #endregion
