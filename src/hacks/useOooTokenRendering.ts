import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';
import { wrapFunction } from 'src/utils/wrapFunction.ts';

/**
 * Principles behind out of order token rendering
 *
 * tokens consist of many different ui element types and void meshes
 * (erase blend mode) that break batch rendering of multiple tokens.
 * Batching can be greatly improved by not rendering one token at a time
 * but rendering the token container children out of order, so that
 * first every token border is drawn in one batch, then every void mesh,
 * all nameplates, ... etc. This greatly improves batching potential but
 * is challenging! This is only save to do for tokens that do not have
 * masks or filters (in this case rendering in order is probably faster)
 * and that do not overlap each other either in their void meshes or UI
 * elements.
 *
 * Fortunately, testing for overlap with quadtrees is quite fast!
 *
 * To actually build a list of tokens that can be batched out of order, we
 * first divide the token layer children in segments divided only by elements
 * that are not tokens at all. This should not happen, but modules are known
 * to mess with the layer objects in certain instances...
 *
 * This means a token layer looking like this:
 * [Token, Token, Other, Token, Token, Other] will be sectioned like this:
 * => [[Token, Token], [Other], [Token, Token], [Other]]
 *
 * withing each section we now split the tokens into layers of tokens
 * that do not interact with eachother.
 * This is done by testing each token for overlap and moving those
 * that do not overlap anything or only tokens from a previous batch into
 * a new render batch. This is done until there are on tokens left.
 *
 * Now that we have our batches of non-interfering tokens we are free to
 * reorder rendering them as we whish!
 * The first thing to do is moving all those tokens that have masks or
 * filter defined into a separate group and rendering them in the end.
 * All other tokens (should be the vast majority) are now also rendered,
 * but not in order, token by token, but sliced by their child elements,
 * meaning for Token1, Token2, Token3 we render
 * Child1(T1), Child1(T2), Child1(T3)
 * Child2(T1), Child2(T2), Child2(T3) and so on, which means
 * that instead of switching between painting graphics, erasing with a
 * different blend mode, drawing text etc we erase everything in one go
 * (no new draw call because drawing mode does not change), drawing
 * nameplates in batches etc.
 *
 * This can effectively reduce draw calls from 40+ for 10 tokens
 * that each show hp bars, nameplate etc to as little as 2-3 if all
 * individual child painting operations are batchable!
 *
 */

interface InterfaceQuadtreeBounds {
	r: PIXI.Rectangle;
	t: Token;
	n: Set<any>;
}

class TokenRenderBatch {
	#tokens: Token[];

	#maxChildCount = 0;
	#sliceable: Token[] = [];
	#unslicable: Token[] = [];
	constructor(tokens: Token[]) {
		this.#tokens = tokens;
		tokens.forEach((token) => {
			if (token.mask || (token.filters && token.filters.length)) {
				this.#unslicable.push(token);
			} else {
				this.#sliceable.push(token);
				this.#maxChildCount = Math.max(this.#maxChildCount, token.children.length);
			}
		});
		// sort sliceables so that those with dynamic token ring are rendered together.
		// This minimizes breaking the void mesh drawing batch because dynamic token rings
		// currently break batching because of their custom shader
		this.#sliceable.sort((a, b) => +a.hasDynamicRing - +b.hasDynamicRing);
	}

	get tokens(): Token[] {
		return this.#tokens;
	}

	render(renderer: PIXI.Renderer) {
		// render slicables in slices

		for (let i = 0; i < this.#maxChildCount; i++) {
			this.#sliceable.forEach((token) => {
				// lets render the container without any children first so that custom
				// render implementations get called... This is not the way
				if (i === 0) {
					const renderFns: ((renderer: PIXI.Renderer) => void)[] = [];
					token.children.forEach((child, i) => {
						renderFns[i] = child.render;
						child.render = () => {};
					});
					token.render(renderer);
					token.children.forEach((child, i) => {
						child.render = renderFns[i];
					});
				}

				const child = token.children[i];
				if (child) {
					const cullable = child.cullable;
					child.cullable = cullable ?? token.cullable;
					child.render(renderer);
					child.cullable = cullable;
				}
			});
		}
		// render everything else just as normal
		this.#unslicable.forEach((token) => {
			token.render(renderer);
		});
	}
}

abstract class RenderSegment {
	abstract render(renderer: PIXI.Renderer): void;
}

function isTokenBelow(a: Token, b: Token) {
	return (a.document.elevation - b.document.elevation || a.document.sort - b.document.sort || a.zIndex - b.zIndex) < 0;
}

class TokenRenderSegment extends RenderSegment {
	#primaryQuadTree = canvas.primary.quadtree;
	#interfaceQuadTree: CanvasQuadtree<PlaceableObject>;
	#tokens: InterfaceQuadtreeBounds[] = [];
	#renderBatches: TokenRenderBatch[] = [];

	constructor(interfaceQuadTree: CanvasQuadtree<PlaceableObject>) {
		super();
		this.#interfaceQuadTree = interfaceQuadTree;
	}

	add(token: InterfaceQuadtreeBounds) {
		this.#tokens.push(token);
	}

	render(renderer: PIXI.Renderer) {
		// build batches of non-overlapping token UIs
		let openSet = this.#tokens.slice();
		const processed = new Set<PlaceableObject>();
		const segmentTokens = new Set(this.#tokens.map((t) => t.t));
		while (openSet.length) {
			const batchTokens: Token[] = [];
			const overlapTokens: InterfaceQuadtreeBounds[] = [];
			for (const token of openSet) {
				if (this.#checkTokenOverlap(token, processed, segmentTokens)) {
					overlapTokens.push(token);
				} else {
					batchTokens.push(token.t);
				}
			}
			batchTokens.forEach((t) => processed.add(t));
			if (overlapTokens.length === openSet.length) {
				console.error('Overlap testing endless loop! Aborting!');
				break;
			}
			openSet = overlapTokens;
			this.#renderBatches.push(new TokenRenderBatch(batchTokens));
		}
		this.#renderBatches.forEach((batch) => batch.render(renderer));
	}

	#checkTokenOverlap(
		bounds: InterfaceQuadtreeBounds,
		previousBatch: Set<PlaceableObject>,
		segmentTokens: Set<PlaceableObject>,
	): boolean {
		const interfaceQuadTree = this.#interfaceQuadTree;
		const primaryToken = bounds.t;

		const filterOverlap = (collidingToken: PlaceableObject) =>
			// tokens always collide with each other, remove those
			collidingToken !== primaryToken &&
			// don't include tokens that collide with previous batches
			!previousBatch.has(collidingToken) &&
			// only include those in our current segment
			segmentTokens.has(collidingToken) &&
			// only include colliding tokens that are below the primary token
			isTokenBelow(collidingToken as any, primaryToken);

		const interfaceOverlap = interfaceQuadTree.getObjects(bounds.r, {
			collisionTest: ({ t: collidingToken }) => filterOverlap(collidingToken),
		});
		if (interfaceOverlap.size > 0) {
			return true;
		}

		const primaryQuadTree = this.#primaryQuadTree;
		const primaryMeshOverlap = primaryQuadTree.getObjects(bounds.r, {
			collisionTest: ({ t }) => {
				const collidingToken = (t as any).object;
				if (!(collidingToken instanceof CONFIG.Token.objectClass)) {
					return false;
				}
				return filterOverlap(collidingToken);
			},
		});
		return primaryMeshOverlap.size > 0;
	}
}
class OtherRenderSegment extends RenderSegment {
	#other: PIXI.DisplayObject;
	constructor(other: PIXI.DisplayObject) {
		super();
		this.#other = other;
	}

	render(renderer: PIXI.Renderer) {
		this.#other.render(renderer);
	}
}
const tempMatrix = new PIXI.Matrix();

function getInterfaceBounds(object: PlaceableObject) {
	const b = object.bounds;
	const lb = object.getLocalBounds();
	const localRect = new PIXI.Rectangle(b.x + lb.x, b.y + lb.y, lb.width, lb.height);
	const PrimarySpriteMeshClass = foundry?.canvas?.primary?.PrimarySpriteMesh ?? PrimarySpriteMesh;
	const TokenClass = foundry?.canvas?.placeables?.Token ?? Token;

	if (!(object instanceof TokenClass) || !(object.mesh instanceof PrimarySpriteMeshClass)) {
		return localRect;
	}

	const meshBounds = (object.mesh as any)._canvasBounds as any;
	const meshRect = new PIXI.Rectangle(
		meshBounds.minX,
		meshBounds.minY,
		meshBounds.maxX - meshBounds.minX,
		meshBounds.maxY - meshBounds.minY,
	);
	const left = Math.min(localRect.left, meshRect.left);
	const right = Math.max(localRect.right, meshRect.right);
	const top = Math.min(localRect.top, meshRect.top);
	const bottom = Math.max(localRect.bottom, meshRect.bottom);
	return new PIXI.Rectangle(left, top, right - left, bottom - top);
}

function buildAndRenderTokenBatches(renderer: PIXI.Renderer, container: PIXI.Container) {
	// build initial batches
	const Quadtree = foundry?.canvas?.geometry?.CanvasQuadtree ?? CanvasQuadtree;
	// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
	const interfaceQuadtree = new Quadtree<PlaceableObject>();
	const segments: RenderSegment[] = [];
	const TokenClass = foundry?.canvas?.placeables?.Token ?? Token;

	// populate quadtree
	container.children.forEach((child, i) => {
		if (!child.visible || child.worldAlpha <= 0 || !child.renderable) {
			return;
		}
		if (!(child instanceof TokenClass)) {
			segments.push(new OtherRenderSegment(child));
			return;
		}

		const bounds = { r: getInterfaceBounds(child), t: child, n: new Set<CanvasQuadtree<PlaceableObject>>() };
		interfaceQuadtree.insert(bounds);

		const lastBatch = segments.at(-1);
		if (lastBatch && lastBatch instanceof TokenRenderSegment) {
			lastBatch.add(bounds);
		} else {
			const newBatch = new TokenRenderSegment(interfaceQuadtree);
			newBatch.add(bounds);
			segments.push(newBatch);
		}
	});
	segments.forEach((segment) => segment.render(renderer));
}

function renderTokensOoo(this: PIXI.Container, renderer: PIXI.Renderer) {
	// everything to the very end is just copied from the PIXI.Container implementation
	const sourceFrame = renderer.renderTexture.sourceFrame;

	if (!(sourceFrame.width > 0 && sourceFrame.height > 0)) {
		return;
	}
	let bounds: PIXI.Rectangle | undefined;
	let transform: PIXI.Matrix | undefined;
	if (this.cullArea) {
		bounds = this.cullArea;
		transform = this.worldTransform;
	} else if (this._render !== PIXI.Container.prototype._render) {
		bounds = this.getBounds(true);
	}
	const projectionTransform = renderer.projection.transform;
	if (projectionTransform) {
		if (transform) {
			transform = tempMatrix.copyFrom(transform);
			transform.prepend(projectionTransform);
		} else {
			transform = projectionTransform;
		}
	}
	if (bounds && sourceFrame.intersects(bounds, transform)) {
		this._render(renderer);
	} else if (this.cullArea) {
		return;
	}

	// custom code
	buildAndRenderTokenBatches(renderer, this);
}

function enableOooTokenRendering() {
	const enabled = getSetting(SETTINGS.OptimizeTokenUiBatching);
	if (!enabled) {
		return;
	}

	/**
	 * on draw, update the 'objects' container (the one containing all the tokens)
	 * to use a specialized rendering function that renders the children (potentially)
	 * out of order to increase batching
	 */
	const TokenLayerPrototype = FOUNDRY_API.generation >= 13 ? foundry.canvas.layers.TokenLayer : TokenLayer;
	wrapFunction(TokenLayerPrototype, '_draw', function (this: TokenLayer) {
		if (this.objects) {
			this.objects.render = renderTokensOoo;
		}
	});
}
export { enableOooTokenRendering as useOooTokenRendering };
