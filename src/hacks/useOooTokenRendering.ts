import { SETTINGS, getSetting } from 'src/settings.ts'
import { wrapFunction } from 'src/utils.ts'

/**
 * Better batching:
 *
 * Divide UI level children in groups divided only by elements
 * that are one of:
 *  - not tokens
 *  - tokens with masks or filter on the container
 * Everything else should be save to batch in one way or another
 * [Token, Token, Other, Token, MaskedToken, Token, Token, Other]
 * => [[Token, Token], [Other], [Token], [MaskedToken] [Token, Token], [Other]]
 *
 * withing each group:
 *
 * if other or masked token, just use default render.
 * In principle, we should only epect one batch group as those cases are rare, but happen...
 *
 * Within each batch group, we can do some fancy stuff!
 *
 * Further sub-divide to check for overlaps.
 *
 * [Token1, Token2, Token3, Token4, Token5, Token6, Token 7]
 *
 * Tokens are sorted by elevation etc anyway, so no token n-epison can overlap token n
 * Token 1, 4, 6 have no overlap.
 * 2 overlaps 1
 * 3 overlaps 1
 * 5 overlaps 4 an 2
 * 7 overlaps 5.
 *
 * It turns out, we can render everything as a one batch that only overlap tokens
 * of the previous batch.
 * Getting these levels might work like this:
 *
 * create an array of refined batches
 * create set of all processed nodes
 * While there are still entries in the open tokens list, build array of tokens as fallow
 *  - Test for overlap with other tokens. Ignore overlap with tokens in the processed nodes list
 *  - Add tokens to processed tokens list and push array to refined batches array
 *  - continue while there are still nodes in the open tokens list.
 *
 * This gets us a still sorted list of token batches:
 * [[Token1, Token4, Token6], [Token2, Token3], [Token5], [Token7]]
 *
 * Within each token list in the refined batches array, we are now free to reorder rendering as we want!
 * This means we can render Tokens not as encapsulated containers
 * Token1(child1, child2), Token2(child1, child2) but isntead as slices of their children:
 * child1(Token1, Token2), child2(Token1, Token2), which allows for better batching as more elements
 * of the same kind are drawn in sequence.
 * For (more or less) optimal batching, sort items to the front that have the known children
 * in the expected order.
 * After the unproblematic tokens have been sorted to the front, we just `zip` the children lists.
 * for Token: Token3(child1, child2, child3), Token4(otherChild1, child2) we are left with:
 * [[child1(T1), otherChild1(T2)], [child2(T1), child2(T2)], [child3(T2)]] and just render them in order.
 *
 *
 */

interface InterfaceQuadtreeBounds {
	r: PIXI.Rectangle
	t: Token
	n: Set<any>
}

class TokenRenderBatch {
	#tokens: Token[]

	#maxChildCount = 0
	#sliceable: Token[] = []
	#unslicable: Token[] = []
	constructor(tokens: Token[]) {
		this.#tokens = tokens
		tokens.forEach((token) => {
			if (token.mask || (token.filters && token.filters.length)) {
				this.#unslicable.push(token)
			} else {
				this.#sliceable.push(token)
				this.#maxChildCount = Math.max(this.#maxChildCount, token.children.length)
			}
		})
		// lets reorder the slicables first so that tokens
	}

	get tokens(): Token[] {
		return this.#tokens
	}

	render(renderer: PIXI.Renderer) {
		// render slicables in slices

		for (let i = 0; i < this.#maxChildCount; i++) {
			this.#sliceable.forEach((token) => {
				// lets render the container without any children first so that custom
				// render implementations get called... This is not the way
				if (i === 0) {
					const renderFns: ((renderer: PIXI.Renderer) => void)[] = []
					token.children.forEach((child, i) => {
						renderFns[i] = child.render
						child.render = () => {}
					})
					token.render(renderer)
					token.children.forEach((child, i) => {
						child.render = renderFns[i]
					})
				}

				const child = token.children[i]
				if (child) {
					const cullable = child.cullable
					child.cullable = true
					child.render(renderer)
					child.cullable = cullable
				}
			})
		}
		// render everything else just as normal
		this.#unslicable.forEach((token) => {
			token.render(renderer)
		})
	}
}

abstract class RenderSegment {
	abstract render(renderer: PIXI.Renderer): void
}

function isTokenBelow(a: Token, b: Token) {
	return (a.document.elevation - b.document.elevation || a.document.sort - b.document.sort || a.zIndex - b.zIndex) < 0
}

class TokenRenderSegment extends RenderSegment {
	#primaryQuadTree = canvas.primary.quadtree
	#interfaceQuadTree: CanvasQuadtree<PlaceableObject>
	#tokens: InterfaceQuadtreeBounds[] = []
	#renderBatches: TokenRenderBatch[] = []

	constructor(interfaceQuadTree: CanvasQuadtree<PlaceableObject>) {
		super()
		this.#interfaceQuadTree = interfaceQuadTree
	}

	add(token: InterfaceQuadtreeBounds) {
		this.#tokens.push(token)
	}

	render(renderer: PIXI.Renderer) {
		// build batches of non-overlapping token UIs
		let openSet = this.#tokens.slice()
		const processed = new Set<PlaceableObject>()
		const segmentTokens = new Set(this.#tokens.map((t) => t.t))
		while (openSet.length) {
			const batchTokens: Token[] = []
			const overlapTokens: InterfaceQuadtreeBounds[] = []
			for (const token of openSet) {
				if (this.#checkTokenOverlap(token, processed, segmentTokens)) {
					overlapTokens.push(token)
				} else {
					batchTokens.push(token.t)
				}
			}
			batchTokens.forEach((t) => processed.add(t))
			if (overlapTokens.length === openSet.length) {
				console.error('Overlap testing endless loop! Aborting!')
				break
			}
			openSet = overlapTokens
			this.#renderBatches.push(new TokenRenderBatch(batchTokens))
		}
		this.#renderBatches.forEach((batch) => batch.render(renderer))
	}

	#checkTokenOverlap(
		bounds: InterfaceQuadtreeBounds,
		previousBatch: Set<PlaceableObject>,
		segmentTokens: Set<PlaceableObject>,
	): boolean {
		const interfaceQuadTree = this.#interfaceQuadTree
		const primaryToken = bounds.t

		const filterOverlap = (collidingToken: PlaceableObject) =>
			// tokens always collide with each other, remove those
			collidingToken !== primaryToken &&
			// don't include tokens that collide with previous batches
			!previousBatch.has(collidingToken) &&
			// only include those in our current segment
			segmentTokens.has(collidingToken) &&
			// only include colliding tokens that are below the primary token
			isTokenBelow(collidingToken as any, primaryToken)

		const interfaceOverlap = interfaceQuadTree.getObjects(bounds.r, {
			collisionTest: ({ t: collidingToken }) => filterOverlap(collidingToken),
		})
		if (interfaceOverlap.size > 0) {
			return true
		}

		const primaryQuadTree = this.#primaryQuadTree
		const primaryMeshOverlap = primaryQuadTree.getObjects(bounds.r, {
			collisionTest: ({ t }) => {
				const collidingToken = (t as any).object
				if (!(collidingToken instanceof CONFIG.Token.objectClass)) {
					return false
				}
				return filterOverlap(collidingToken)
			},
		})
		return primaryMeshOverlap.size > 0
	}
}
class OtherRenderSegment extends RenderSegment {
	#other: PIXI.DisplayObject
	constructor(other: PIXI.DisplayObject) {
		super()
		this.#other = other
	}

	render(renderer: PIXI.Renderer) {
		this.#other.render(renderer)
	}
}
const tempMatrix = new PIXI.Matrix()

function getInterfaceBounds(object: PlaceableObject) {
	const b = object.bounds
	const lb = object.getLocalBounds()
	return new PIXI.Rectangle(b.x + lb.x, b.y + lb.y, lb.width, lb.height)
}

function buildAndRenderTokenBatches(renderer: PIXI.Renderer, container: PIXI.Container) {
	// build initial batches
	// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
	const interfaceQuadtree = new CanvasQuadtree<PlaceableObject>()
	const segments: RenderSegment[] = []
	// populate quadtree
	container.children.forEach((child, i) => {
		if (!child.visible || child.worldAlpha <= 0 || !child.renderable) {
			return
		}
		if (!(child instanceof Token)) {
			segments.push(new OtherRenderSegment(child))
			return
		}

		const bounds = { r: getInterfaceBounds(child), t: child, n: new Set<CanvasQuadtree<PlaceableObject>>() }
		interfaceQuadtree.insert(bounds)

		const lastBatch = segments.at(-1)
		if (lastBatch && lastBatch instanceof TokenRenderSegment) {
			lastBatch.add(bounds)
		} else {
			const newBatch = new TokenRenderSegment(interfaceQuadtree)
			newBatch.add(bounds)
			segments.push(newBatch)
		}
	})
	segments.forEach((segment) => segment.render(renderer))
}

function renderTokensOoo(this: PIXI.Container, renderer: PIXI.Renderer) {
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
	} else if (this._render !== PIXI.Container.prototype._render) {
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
		this._render(renderer)
	} else if (this.cullArea) {
		return
	}

	// custom code
	buildAndRenderTokenBatches(renderer, this)
}

function useOooTokenRendering() {
	const enabled = getSetting(SETTINGS.OptimizeTokenUiBatching)
	if (!enabled) {
		return
	}

	/**
	 * on draw, update the 'objects' container (the one containing all the tokens)
	 * to use a specialized rendering function that renders the children (potentially)
	 * out of order to increase batching
	 */
	wrapFunction(TokenLayer.prototype, '_draw', function (this: TokenLayer) {
		if (this.objects) {
			this.objects.render = renderTokensOoo
		}
	})
}
export default useOooTokenRendering
