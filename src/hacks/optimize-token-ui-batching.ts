import { SETTINGS, getSetting } from 'src/settings.ts'
import { wrapFunction, wrapFunctionManual } from 'src/utils.ts'

interface InterfaceQuadtreeBounds {
	r: PIXI.Rectangle
	t: Token<any>
	n: Set<any>
}

class TokenRenderBatch {
	container: PIXI.Container[] = []
	border: PIXI.DisplayObject[] = []
	voidMesh: PIXI.DisplayObject[] = []
	detectionFilterMesh: PIXI.DisplayObject[] = []
	bars: PIXI.DisplayObject[] = []
	tooltip: PIXI.DisplayObject[] = []
	effects: PIXI.DisplayObject[] = []
	target: PIXI.DisplayObject[] = []
	nameplate: PIXI.DisplayObject[] = []
	other: PIXI.DisplayObject[] = []

	constructor(other: PIXI.DisplayObject[] = [], container?: PIXI.Container) {
		this.other.push(...other)
		if (container) {
			this.container.push(container)
		}
	}
}

type TokenLayerOverride = TokenLayer<any> & {
	__interfaceQuadTree?: CanvasQuadtree<Token<any>>
	__interfaceRenderBatches: TokenRenderBatch[]
	__updateInterfaceRenderBatches: () => void
}

type TokenOverride = Token<any> & {
	layer: TokenLayerOverride
	__cachedInterfaceBounds?: InterfaceQuadtreeBounds
	__updateInterfaceQuadtree: () => void
	__getInterfaceBounds: () => PIXI.Rectangle
	__barsCache?: PIXI.Container & { bar1: PIXI.Sprite; bar2: PIXI.Sprite }
	__nameplateCache?: PIXI.Sprite
	__tooltipCache: PIXI.Sprite
}

const tempMatrix = new PIXI.Matrix()

function optimizeTokenUiBatching() {
	const enabled = getSetting(SETTINGS.OptimizeTokenUiBatching)
	if (!enabled) {
		return
	}

	;(TokenLayer.prototype as any).__updateInterfaceRenderBatches = function (this: TokenLayerOverride) {
		if (!this.objects) {
			return
		}
		const defaultRenderOrder = [
			this.highlightObjects ? 'voidMesh' : 'border',
			this.highlightObjects ? 'border' : 'voidMesh',
			'detectionFilterMesh',
			'bars',
			'tooltip',
			'effects',
			'target',
			'nameplate',
			'other',
		] as const

		this.__interfaceRenderBatches.splice(0, this.__interfaceRenderBatches.length)
		const isolatedTokens = new Set<PlaceableObject>()
		this.objects.sortChildren()
		this.objects.children.forEach((tokenElement) => {
			// if child is not a Token object, just add it to be rendered on its own
			if (!(tokenElement instanceof CONFIG.Token.objectClass)) {
				this.__interfaceRenderBatches.push(new TokenRenderBatch([tokenElement]))
				return
			}

			// if token has filters or a mask, this breaks batching
			if (!!tokenElement.filters?.length || !!tokenElement._mask) {
				this.__interfaceRenderBatches.push(new TokenRenderBatch([tokenElement]))
				return
			}

			// test for collisions and just render on its own in case of one with other UI elements or tokens
			const isBaseLayer = (t: unknown) =>
				(t as any) === canvas.primary.foreground || (t as any) === canvas.primary.background

			if ('__cachedInterfaceBounds' in tokenElement) {
				this.__interfaceQuadTree
					?.getObjects((tokenElement as any).__cachedInterfaceBounds.r as any, {
						collisionTest: ({ t }) => t !== tokenElement,
					})
					.forEach((token) => {
						isolatedTokens.add(token)
					})

				canvas.primary.quadtree
					.getObjects((tokenElement as any).__cachedInterfaceBounds.r as any, {
						collisionTest: ({ t }) => !isBaseLayer(t) && (t as any)?.object !== tokenElement,
					})
					.forEach((mesh) => {
						if ((mesh as any).object) {
							isolatedTokens.add((mesh as any).object)
						}
					})
			}
			if (isolatedTokens.has(tokenElement as any)) {
				this.__interfaceRenderBatches.push(new TokenRenderBatch())
			}

			const currentBatch = this.__interfaceRenderBatches.at(-1)
			// test child elements. If all are in expected render order, we can batch them!
			for (let i = 0; i < defaultRenderOrder.length; i++) {
				const key = defaultRenderOrder[i]

				let lastBatch = this.__interfaceRenderBatches.at(-1)
				if (!lastBatch) {
					lastBatch = new TokenRenderBatch()
					this.__interfaceRenderBatches.push(lastBatch)
				}

				if (key === 'other') {
					const other = tokenElement.children.slice(i)
					if (other.length > 0) {
						this.__interfaceRenderBatches.push(new TokenRenderBatch(other))
					}
					break
				}

				const uiElement = tokenElement.children[i]

				if (uiElement === tokenElement[key]) {
					lastBatch[key].push(uiElement)
				} else {
					this.__interfaceRenderBatches.push(new TokenRenderBatch([uiElement]))
				}
			}
			if (currentBatch && !currentBatch?.other.includes(tokenElement)) {
				currentBatch.container.push(tokenElement)
			}
		})

		// const batchNames = this.__interfaceRenderBatches
		// 	.map(({ container, other }) => {
		// 		const containerNames = container.map(c => c.name || c.__proto__.constructor.name || 'unknown').join(', ')
		// 		const otherNames = other.map(o => o.name || o.__proto__.constructor.name || 'unknown').join(', ')
		// 		return [containerNames, otherNames].filter(s => !!s).join(',')
		// 	})
		// 	.join(' | ')
		// console.log(batchNames)
		// console.log(this.__interfaceRenderBatches.slice())
	}

	wrapFunctionManual(
		TokenLayer.prototype,
		'_draw',
		async function (this: TokenLayerOverride, origFn: (...rest: any[]) => Promise<void>, ...args: any[]) {
			const isInit = !this.__interfaceQuadTree
			// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
			this.__interfaceQuadTree = this.__interfaceQuadTree ?? new CanvasQuadtree()
			this.__interfaceRenderBatches = this.__interfaceRenderBatches ?? []
			const res = await origFn.apply(this, args)
			if (isInit && this.objects) {
				const batchRenderOrder = [
					'other',
					'container',
					this.highlightObjects ? 'voidMesh' : 'border',
					this.highlightObjects ? 'border' : 'voidMesh',
					'detectionFilterMesh',
					'bars',
					'effects',
					'target',
					'tooltip',
					'nameplate',
				] as const

				const renderTokenBatches = (renderer: PIXI.Renderer) => {
					;(this.__interfaceRenderBatches ?? []).forEach((tokenBatch) => {
						batchRenderOrder.forEach((key) => {
							if (key === 'container') {
								tokenBatch.container.forEach((container) => {
									// @ts-expect-error we want to call protected methods here
									container._render(renderer)
								})
								return
							}
							tokenBatch[key].forEach((element) => {
								const elementCullable = element.cullable
								element.cullable = elementCullable || element.parent.cullable
								element.render(renderer)
								element.cullable = elementCullable
							})
						})
					})
				}
				this.objects.render = function (renderer) {
					// everything to the very end is just copied from the PIXI.Container implementation
					const sourceFrame = renderer.renderTexture.sourceFrame

					if (!(sourceFrame.width > 0 && sourceFrame.height > 0)) {
						return
					}
					let bounds: PIXI.Rectangle | undefined
					let transform: PIXI.Matrix | undefined
					if (this.cullArea) {
						bounds = this.cullArea
						transform = this.worldTransform
					}
					// @ts-expect-error we want to access protected methods
					else if (this._render !== PIXI.Container.prototype._render) {
						bounds = this.getBounds(true)
					}
					const projectionTransform = renderer.projection.transform
					if (projectionTransform) {
						if (transform) {
							transform = tempMatrix.copyFrom(transform)
							transform.prepend(projectionTransform)
						} else {
							transform = projectionTransform
						}
					}
					if (bounds && sourceFrame.intersects(bounds, transform)) {
						// @ts-expect-error we want to access protected methods
						this._render(renderer)
					} else if (this.cullArea) {
						return
					}

					// custom code
					renderTokenBatches(renderer)
				}
			}
			return res
		},
	)

	wrapFunction(TokenLayer.prototype, '_tearDown', function (this: TokenLayerOverride) {
		this.__interfaceQuadTree?.clear()
	})

	wrapFunction(CONFIG.Token.objectClass.prototype, '_draw', function (this: TokenOverride) {
		if (this.isPreview) {
			return
		}
		if (!this.__cachedInterfaceBounds) {
			this.__cachedInterfaceBounds = {
				r: this.__getInterfaceBounds(),
				t: this,
				n: new Set(),
			}
			this.layer.__interfaceQuadTree?.update(this.__cachedInterfaceBounds)
			this.layer.__updateInterfaceRenderBatches()
			return
		}
		this.__updateInterfaceQuadtree()
	})

	CONFIG.Token.objectClass.prototype.__getInterfaceBounds = function (this: TokenOverride) {
		const b = this.bounds
		const lb = this.getLocalBounds()
		return new PIXI.Rectangle(b.x + lb.x, b.y + lb.y, lb.width, lb.height)
	}

	CONFIG.Token.objectClass.prototype.__updateInterfaceQuadtree = function (this: TokenOverride) {
		const layer = this.layer
		if (!layer.__interfaceQuadTree || this.isPreview) return
		if (this.destroyed || this.parent !== layer.objects) {
			this.__cachedInterfaceBounds = undefined
			layer.__interfaceQuadTree.remove(this)
			return
		}

		const interfaceBounds = this.__getInterfaceBounds()
		if (!this.__cachedInterfaceBounds) {
			return
		}
		if (
			interfaceBounds.x !== this.__cachedInterfaceBounds.r.x ||
			interfaceBounds.y !== this.__cachedInterfaceBounds.r.y ||
			interfaceBounds.width !== this.__cachedInterfaceBounds.r.width ||
			interfaceBounds.height !== this.__cachedInterfaceBounds.r.height
		) {
			this.__cachedInterfaceBounds?.r.copyFrom(interfaceBounds)
			layer.__interfaceQuadTree.update(this.__cachedInterfaceBounds)
		}
		this.layer.__updateInterfaceRenderBatches()
	}

	wrapFunction(CONFIG.Token.objectClass.prototype, '_updateQuadtree', function (this: TokenOverride) {
		this.__updateInterfaceQuadtree()
	})

	wrapFunction(CONFIG.Token.objectClass.prototype, '_refreshState', function (this: TokenOverride) {
		this.tooltip.visible = !!this.tooltip.text?.trim()
	})

	wrapFunction(CONFIG.Token.objectClass.prototype, '_applyRenderFlags', function (this: TokenOverride) {
		this.__updateInterfaceQuadtree()
	})

	wrapFunction(CONFIG.Token.objectClass.prototype, '_onUpdate', function (this: TokenOverride) {
		this.__updateInterfaceQuadtree()
	})
}
export default optimizeTokenUiBatching
