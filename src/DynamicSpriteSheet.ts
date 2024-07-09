/**
 * Looks like this class is not needed anymore.
 */

interface Size {
	width: number
	height: number
}

interface Pos {
	x: number
	y: number
}

interface Rect extends Size, Pos {}

function fitsIn(inner: Size, outer: Size) {
	return outer.width >= inner.width && outer.height >= inner.height
}
function isSameSize(self: Size, other: Size) {
	return self.width == other.width && self.height == other.height
}

class AvailableSpace {
	#left?: AvailableSpace
	#right?: AvailableSpace
	#rect: Rect
	#filled = false
	#lastFailedWidth?: number
	#lastFailedHeight?: number
	#parent?: AvailableSpace

	constructor(rect: Rect, parent?: AvailableSpace) {
		this.#rect = rect
		this.#parent = parent
	}

	get rect(): Rect {
		return this.#rect
	}

	#markInsertFailed(size: Size) {
		this.#lastFailedWidth = size.width
		this.#lastFailedHeight = size.height
	}

	#isKnownFailedInsert(rect: Size) {
		return (
			this.#lastFailedWidth != null &&
			this.#lastFailedHeight != null &&
			this.#lastFailedWidth >= rect.width &&
			this.#lastFailedHeight >= rect.height
		)
	}

	resetFailed() {
		this.#lastFailedWidth = undefined
		this.#lastFailedHeight = undefined
		this.#parent?.resetFailed()
	}

	clear(): void {
		this.#filled = false
		this.resetFailed()
	}

	insertRect(rect: Size): AvailableSpace | null {
		if (this.#isKnownFailedInsert(rect)) {
			return null
		}

		if (this.#left != null && this.#right != null) {
			const res = this.#left.insertRect(rect) || this.#right.insertRect(rect)
			if (!res) {
				this.#markInsertFailed(rect)
			}
			return res
		}

		if (this.#filled) return null

		if (isSameSize(rect, this.#rect)) {
			this.#filled = true
			return this
		}
		if (!fitsIn(rect, this.#rect)) return null

		const widthDiff = this.#rect.width - rect.width
		const heightDiff = this.#rect.height - rect.height

		const me = this.#rect

		if (widthDiff > heightDiff) {
			// split literally into left and right, putting the rect on the left.
			this.#left = new AvailableSpace({ ...me, width: rect.width, height: me.height }, this)
			this.#right = new AvailableSpace({ ...me, x: me.x + rect.width, width: me.width - rect.width }, this)
		} else {
			// split into top and bottom, putting rect on top.
			this.#left = new AvailableSpace({ ...me, height: rect.height }, this)
			this.#right = new AvailableSpace({ ...me, y: me.y + rect.height, height: me.height - rect.height }, this)
		}

		return this.#left.insertRect(rect)
	}
}

export class DynamicSpriteSheet {
	static #baseTextureSize = 4096
	static get baseTextureSize() {
		return this.#baseTextureSize
	}

	// only cache textures that fill up less than 50% of one  cache entry
	static #maxCachableArea = this.#baseTextureSize ** 2 * 0.5
	static get maxCachableArea(): number {
		return this.#maxCachableArea
	}

	#baseTextures: [PIXI.BaseRenderTexture, AvailableSpace][] = []
	#textureCache = new Map<string, [PIXI.RenderTexture, AvailableSpace] | undefined>()
	#debugSprite = new PIXI.Sprite()

	get debugSprite() {
		return this.#debugSprite
	}

	#getCacheKey(ns: string, key: string): string {
		return `${ns}-${key}`
	}

	#createBaseRenderTexture() {
		const baseTextureSize = DynamicSpriteSheet.baseTextureSize
		return new PIXI.BaseRenderTexture({
			width: baseTextureSize,
			height: baseTextureSize,
		})
	}

	#createRenderTexture(
		baseRenderTexture: PIXI.BaseRenderTexture,
		space: AvailableSpace,
		size: Size,
		padding: number,
	): [PIXI.RenderTexture, AvailableSpace] | undefined {
		const result = space.insertRect({ width: size.width + padding, height: size.height + padding })
		if (!result) {
			return undefined
		}
		const rect = result.rect
		const frame = new PIXI.Rectangle(
			rect.x + padding,
			rect.y + padding,
			rect.width - padding * 2,
			rect.height - padding * 2,
		)
		const renderTexture = new PIXI.RenderTexture(baseRenderTexture, frame)
		return [renderTexture, result]
	}

	#getNextRenderTexture(renderable: PIXI.Container, padding: number): [PIXI.RenderTexture, AvailableSpace] | undefined {
		const size = { width: renderable.width, height: renderable.height }
		for (const [baseTexture, space] of this.#baseTextures) {
			const result = this.#createRenderTexture(baseTexture, space, size, padding)
			if (result) {
				return result
			}
		}
		// no existing base texture can accomodate this renderable, create new one!
		const baseRenderTexture = this.#createBaseRenderTexture()
		const space = new AvailableSpace({
			x: 0,
			y: 0,
			width: DynamicSpriteSheet.baseTextureSize,
			height: DynamicSpriteSheet.baseTextureSize,
		})
		this.#debugSprite.texture = new PIXI.RenderTexture(baseRenderTexture)
		this.#baseTextures.push([baseRenderTexture, space])
		return this.#createRenderTexture(baseRenderTexture, space, size, padding)
	}

	clear(): void {
		this.#baseTextures.forEach(([texture]) => texture.destroy())
		this.#baseTextures = []
		this.#debugSprite.texture = PIXI.Texture.EMPTY
		this.#textureCache.clear()
	}

	addToCache(ns: string, key: string, renderable: PIXI.Container, padding = 1): PIXI.RenderTexture | undefined {
		const cacheKey = this.#getCacheKey(ns, key)
		const existingTexture = this.#textureCache.get(cacheKey)

		// separate check if it exists, because it could also just be that the result was undefined
		// b/c the object is not cacheable.
		if (this.#textureCache.has(cacheKey)) {
			return existingTexture?.[0]
		}
		if (
			renderable.width * renderable.height > DynamicSpriteSheet.maxCachableArea ||
			renderable.width > DynamicSpriteSheet.baseTextureSize ||
			renderable.height > DynamicSpriteSheet.baseTextureSize ||
			renderable.width === 0 ||
			renderable.height === 0
		) {
			return undefined
		}
		// load base render texture or create new if it does not exist
		const result = this.#getNextRenderTexture(renderable, padding)
		canvas.app.renderer.render(renderable, { renderTexture: result?.[0] })
		this.#textureCache.set(cacheKey, result)
		return result?.[0]
	}

	addOrUpdateCache(ns: string, key: string, renderable: PIXI.Container, padding = 1): PIXI.RenderTexture | undefined {
		const cacheKey = this.#getCacheKey(ns, key)
		const entry = this.#textureCache.get(cacheKey)
		if (!entry || !fitsIn(renderable, entry[1].rect)) {
			this.remove(ns, key)
			return this.addToCache(ns, key, renderable, padding)
		}
		canvas.app.renderer.render(renderable, { renderTexture: entry[0] })
		return entry[0]
	}

	loadTexture(ns: string, key: string): PIXI.RenderTexture | undefined {
		return this.#textureCache.get(this.#getCacheKey(ns, key))?.[0]
	}

	remove(ns: string, key: string): void {
		const cacheKey = this.#getCacheKey(ns, key)
		const entry = this.#textureCache.get(cacheKey)
		if (!entry) {
			return
		}
		canvas.app.renderer.render(new PIXI.Container(), { renderTexture: entry[0], clear: true })
		entry[1].clear()
		entry[0].destroy(false)
		this.#textureCache.delete(cacheKey)
	}
}
