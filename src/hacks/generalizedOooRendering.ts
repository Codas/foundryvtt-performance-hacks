import type { QuadtreeObject } from '@7h3laughingman/foundry-types/client/canvas/geometry/_types.mjs'
import type Token from '@7h3laughingman/foundry-types/client/canvas/placeables/token.mjs'
import { getTokenMeshWorldPolygon } from 'src/hacks/meshGeometryFitting.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { addWrapperHook, removeWrapperHook } from 'src/utils/multiWrapper.ts'

/**
 * More generalized Out-of-Order Token UI Rendering
 *
 * Foundry renders the token interface layer (HP bars, nameplates, status effects, void meshes,
 * etc.) onto a separate render texture that is later composited over the primary canvas background.
 * Each token's UI children are rendered in z-order: first a void mesh (ERASE blend mode) that
 * punches a hole through previously-drawn UI elements so that tokens with higher z-order appear to
 * block lower tokens' UI elements, even though all the tokens are drawn in a previous batch, then
 * the regular UI children (bars, text, effects).
 *
 * The void mesh's swap from NORMAL to ERASE blend mode breaks the GPU batch, creating a costly
 * flush per token. Erase mode further incurs tile cache invalidation in TBDR GPUs (mobile, apple
 * silicon), causing significant additional overhead compared to simple shader switches.
 *
 * Batching can be improved by rendering all tokens' UI children not in order of tokens, but in
 * order of render state and shader, effectively drawing all token's void meshes together, then
 * token bars, nameplate etc. This is non-trivial because it is only safe to batch together UI
 * elements from different tokens if they do not overlap with a tokens void mesh or other elements
 * from a token with lower z-order. Overlapping elements must be flushed before continuing to ensure
 * correct compositing.
 *
 * The algorithm:
 *
 * 1. Flatten all token UI children into a z-ordered sequence of RenderUnits, each tagged with
 *    render state (blend mode, shader key) and world-space bounds.
 *
 * 2. Process units one-by-one in z-order. Maintain a set of open batches keyed by render state,
 *    as well as a quadtree indexing all active (not-yet-flushed) units for fast spatial queries.
 *
 * 3. For each new unit, query the quadtree for spatially overlapping active units in a DIFFERENT
 *    render state batch. If conflicts exist, flush those batches (emit them in creation order)
 *    before adding the new unit.
 *
 * 4. For void meshes (ERASE blend mode), use the fitted convex hull polygon (if available) for a
 *    tight narrow-phase intersection test, reducing false-positive batch flushes from UI elements
 *    within the rectangular bounds but outside the actual token shape.
 *
 * 5. After all units are processed, flush remaining open batches.
 *
 * 6. Cache the RenderUnit sequence and batch schedule keyed on token UI state (token position,
 *    size, elevation, sort, visibility, mask/filters presence, and children count). Invalidate the
 *    cache on token or canvas changes.
 *
 * Result: Long runs of same-state UI elements batch together across tokens, interrupted only when a
 * different-state element actually overlaps.
 */

// ============================================================================
// #region Render unit

/**
 * - `child`: a UI child of a regular token. Batchable with matching-state children from other
 *   tokens.
 * - `atomic-token`: a token with a filter or mask -- rendered as a whole unit (not sliced). Unique
 *   stateKey so it never shares a batch, but can still be reordered past non-overlapping units.
 * - `barrier`: a non-token object in the container (grid overlay, foreign module child). Forces all
 *   open batches to flush in creation order before it renders
 */
type RenderUnitKind = 'child' | 'atomic-token' | 'barrier'

interface RenderUnit {
	kind: RenderUnitKind
	object: PIXI.DisplayObject
	stateKey: string
	zOrder: number
	parentToken: Token | null
	bounds: PIXI.Rectangle
	/** World-space convex hull polygon for void meshes. */
	polygon: Float32Array | null
	flushed: boolean
}

const SHADER_KEY = {
	BatchRenderer: 0,
	CustomShaderFallback: 1,
	ConstructorFallback: 2,
} as const

function getShaderKey(child: PIXI.DisplayObject): string | number {
	// Custom shader on a mesh (e.g., dynamic token ring)
	if ('shader' in child && (child as any).shader) {
		const shader = (child as any).shader
		// Use the program's GL id if available, otherwise constructor name
		return shader.program?.id ?? shader.constructor?.name ?? SHADER_KEY.CustomShaderFallback
	}
	// Standard batchable sprite: All share the BatchRenderer shader
	if (child instanceof PIXI.Sprite) {
		return SHADER_KEY.BatchRenderer
	}
	return child.constructor?.name ?? SHADER_KEY.ConstructorFallback
}

// #endregion

// ============================================================================
// #region SAT convex polygon intersection

function hasSeparatingAxis(axisPolygon: Float32Array, testPolygon: Float32Array): boolean {
	const countA = axisPolygon.length >> 1
	const countB = testPolygon.length >> 1

	for (let i = 0; i < countA; i++) {
		const j = (i + 1) % countA

		// Get normal vector for the current edge
		const ex = axisPolygon[j * 2] - axisPolygon[i * 2]
		const ey = axisPolygon[j * 2 + 1] - axisPolygon[i * 2 + 1]
		const nx = -ey
		const ny = ex

		// Project all vertices of both polygons onto the normal vector, keeping
		// track of the min and max projection values for each polygon
		let minA = Infinity,
			maxA = -Infinity
		for (let k = 0; k < countA; k++) {
			const p = axisPolygon[k * 2] * nx + axisPolygon[k * 2 + 1] * ny
			if (p < minA) {
				minA = p
			}
			if (p > maxA) {
				maxA = p
			}
		}

		let minB = Infinity,
			maxB = -Infinity
		for (let k = 0; k < countB; k++) {
			const p = testPolygon[k * 2] * nx + testPolygon[k * 2 + 1] * ny
			if (p < minB) {
				minB = p
			}
			if (p > maxB) {
				maxB = p
			}
		}

		// If the projections don't overlap, we found a separating axis and can stop
		if (maxA < minB || maxB < minA) {
			return true
		}
	}
	return false
}

function convexPolygonsIntersect(a: Float32Array, b: Float32Array): boolean {
	return !hasSeparatingAxis(a, b) && !hasSeparatingAxis(b, a)
}

// #endregion

// ============================================================================
// #region Bounds helpers

/**
 * Compute the world-space bounds for a single display object (token UI child).
 */
function getChildWorldBounds(child: PIXI.DisplayObject): PIXI.Rectangle {
	return child.getBounds(false)
}

/**
 * Compute the mesh bounds from vertexData. Returns null if the token
 * doesn't have a standard PrimarySpriteMesh.
 */
function getMeshBounds(token: Token): PIXI.Rectangle | null {
	const PrimarySpriteMeshClass = foundry.canvas.primary.PrimarySpriteMesh
	const TokenClass = foundry.canvas.placeables.Token
	if (!(token instanceof TokenClass) || !(token.mesh instanceof PrimarySpriteMeshClass)) {
		return null
	}
	const mesh = token.mesh as any
	if (typeof mesh.calculateVertices === 'function') {
		mesh.calculateVertices()
	}

	const verts = mesh.vertexData as Float32Array | undefined
	if (!verts || verts.length < 8) {
		return null
	}

	let minX = verts[0],
		maxX = verts[0],
		minY = verts[1],
		maxY = verts[1]
	for (let i = 2; i < verts.length; i += 2) {
		if (verts[i] < minX) {
			minX = verts[i]
		}
		if (verts[i] > maxX) {
			maxX = verts[i]
		}
		if (verts[i + 1] < minY) {
			minY = verts[i + 1]
		}
		if (verts[i + 1] > maxY) {
			maxY = verts[i + 1]
		}
	}

	return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY)
}

// #endregion

// ============================================================================
// #region Open batch

interface OpenBatch {
	stateKey: string
	units: RenderUnit[]
	/** Order in which this batch was first created (for stable flush ordering). */
	creationOrder: number
}

// #endregion

// ============================================================================
// #region Flatten container children

function flattenContainerChildren(
	children: readonly PIXI.DisplayObject[],
	TokenClass: typeof foundry.canvas.placeables.Token,
): RenderUnit[] {
	const units: RenderUnit[] = []
	let zOrderCounter = 0
	let atomicCounter = 0
	let barrierCounter = 0

	for (const containerChild of children) {
		if (!containerChild.visible || containerChild.worldAlpha <= 0 || !containerChild.renderable) {
			continue
		}

		if (!(containerChild instanceof TokenClass)) {
			// Non-token: emit as a barrier unit. This is a potential for further optimization as
			// other children in the primary canvas group should also be re-orderable, but there
			// might be edge-cases that break it and it's too risky for now without extensive
			// testing
			units.push({
				kind: 'barrier',
				object: containerChild,
				stateKey: `barrier|${barrierCounter++}`,
				zOrder: zOrderCounter++,
				parentToken: null,
				bounds: containerChild.getBounds(false),
				polygon: null,
				flushed: false,
			})
			continue
		}

		const token = containerChild as unknown as Token

		if (token.mask || token.filters?.length) {
			// Atomic: rendered as a whole. Unique stateKey so it never shares a batch, but can can
			// be reordered past non-overlapping units.
			units.push({
				kind: 'atomic-token',
				object: containerChild,
				stateKey: `atomic|${atomicCounter++}`,
				zOrder: zOrderCounter++,
				parentToken: token,
				bounds: containerChild.getBounds(true),
				polygon: null,
				flushed: false,
			})
			continue
		}

		// Compute mesh polygon once per token for void mesh narrow-phase testing
		const meshBounds = getMeshBounds(token)
		const meshPolygon = getTokenMeshWorldPolygon(token)

		// The voidMesh temporarily sets ERASE blend mode during rendering. We include it as a
		// scheduled ERASE unit so the scheduler batches all ERASE operations across tokens
		// together.
		const voidMeshChild = token.voidMesh as PIXI.DisplayObject | undefined

		for (let i = 0; i < token.children.length; i++) {
			const child = token.children[i] as PIXI.DisplayObject
			const isVoidMesh = child === voidMeshChild

			// Skip the visibility filter for invisible voidMesh container as the render function
			// also checks this and aborts
			if (!isVoidMesh && (!child.visible || child.worldAlpha <= 0 || !child.renderable)) {
				continue
			}

			const blendMode = isVoidMesh ? PIXI.BLEND_MODES.ERASE : ((child as any).blendMode ?? PIXI.BLEND_MODES.NORMAL)
			const shaderKey = getShaderKey(child)
			const stateKey = `${blendMode}|${shaderKey}`

			// For void meshes, use the tight mesh bounds as bounds if available. This polygon is
			// used for narrow-phase in the scheduler.
			const childBounds = isVoidMesh && meshBounds ? meshBounds.clone() : getChildWorldBounds(child)

			units.push({
				kind: 'child',
				object: child,
				stateKey,
				zOrder: zOrderCounter++,
				parentToken: token,
				bounds: childBounds,
				polygon: isVoidMesh ? meshPolygon : null,
				flushed: false,
			})
		}
	}

	return units
}

// #endregion

// ============================================================================
// #region Greedy open-batch scheduler

/**
 * Narrow-phase overlap: if either unit has a fitted polygon (void mesh), test the polygon against
 * the other unit's bounds via SAT. Otherwise the quadtree bounds check is enough.
 */
function unitsOverlap(a: RenderUnit, b: RenderUnit): boolean {
	if (!a.bounds.intersects(b.bounds)) {
		return false
	}

	const poly = a.polygon ?? b.polygon
	if (!poly) {
		return true
	}

	const otherBounds = a.polygon ? b.bounds : a.bounds
	const rectPoly = new Float32Array(8)
	rectPoly[0] = otherBounds.left
	rectPoly[1] = otherBounds.top
	rectPoly[2] = otherBounds.right
	rectPoly[3] = otherBounds.top
	rectPoly[4] = otherBounds.right
	rectPoly[5] = otherBounds.bottom
	rectPoly[6] = otherBounds.left
	rectPoly[7] = otherBounds.bottom

	return convexPolygonsIntersect(poly, rectPoly)
}

function scheduleRenderUnits(allUnits: RenderUnit[]): RenderUnit[][] {
	if (allUnits.length === 0) {
		return []
	}

	const Quadtree = foundry.canvas.geometry.CanvasQuadtree
	const quadtree = new Quadtree()

	const openBatches = new Map<string, OpenBatch>()
	const emitQueue: RenderUnit[][] = []
	let batchCounter = 0

	const flushBatchesInOrder = (batches: OpenBatch[]) => {
		batches.sort((a, b) => a.creationOrder - b.creationOrder)
		for (const batch of batches) {
			emitQueue.push(batch.units)
			for (const u of batch.units) {
				u.flushed = true
			}
			openBatches.delete(batch.stateKey)
		}
	}

	for (const unit of allUnits) {
		if (unit.kind === 'barrier') {
			// Barrier acts as a force flush. Flush everything open, then emit the barrier as its
			// own one-unit batch. No quadtree insert as nothing later needs to test against it.
			flushBatchesInOrder(Array.from(openBatches.values()))
			emitQueue.push([unit])
			unit.flushed = true
			continue
		}

		// Find conflicting open batches: active units in the quadtree whose bounds overlap this
		// unit AND belong to a different render state.
		const conflictingStateKeys = new Set<string>()

		quadtree.getObjects(unit.bounds, {
			collisionTest: ({ t: existingUnit }: { t: RenderUnit }) => {
				if (existingUnit.flushed || existingUnit.stateKey === unit.stateKey) {
					return false
				}
				if (unitsOverlap(unit, existingUnit)) {
					conflictingStateKeys.add(existingUnit.stateKey)
				}
				return false // just collecting state keys, no need for results
			},
		})

		// Flush conflicting batches in creation order
		if (conflictingStateKeys.size > 0) {
			const toFlush: OpenBatch[] = []
			for (const key of conflictingStateKeys) {
				const batch = openBatches.get(key)
				if (batch) {
					toFlush.push(batch)
				}
			}
			flushBatchesInOrder(toFlush)
		}

		let batch = openBatches.get(unit.stateKey)
		if (!batch) {
			batch = {
				stateKey: unit.stateKey,
				units: [],
				creationOrder: batchCounter++,
			}
			openBatches.set(unit.stateKey, batch)
		}
		batch.units.push(unit)

		const entry = {
			r: unit.bounds,
			t: unit,
			n: new Set(),
		} satisfies QuadtreeObject

		quadtree.insert(entry)
	}

	const remaining = Array.from(openBatches.values())
	remaining.sort((a, b) => a.creationOrder - b.creationOrder)
	for (const batch of remaining) {
		emitQueue.push(batch.units)
	}

	return emitQueue
}

// #endregion

// ============================================================================
// #region Render schedule cache

class RenderScheduleCache {
	#cacheKey = ''
	#cachedSchedule: { batches: RenderUnit[][]; tokenCount: number; voidMeshBatchCount: number } | null = null

	#computeCacheKey(children: PIXI.DisplayObject[], TokenClass: typeof foundry.canvas.placeables.Token): string {
		let key = `n=${children.length};`
		for (const child of children) {
			if (child instanceof TokenClass) {
				const token = child
				const mesh = token.mesh
				const meshX = mesh?.x ?? token.x
				const meshY = mesh?.y ?? token.y
				const meshSX = mesh?.scale?.x ?? 1
				const meshSY = mesh?.scale?.y ?? 1
				key += `${meshX},${meshY},${meshSX},${meshSY},`
				key += `${token.document?.width ?? 1},${token.document?.height ?? 1},`
				key += `${token.document?.elevation ?? 0},${token.document?.sort ?? 0},${token.zIndex},`
				key += `${token.visible ? 1 : 0},${token.filters?.length ?? 0},${token.mask ? 1 : 0},`
				key += `${token.children.length};`
			} else {
				key += `o${child.visible ? 1 : 0};`
			}
		}

		return key
	}

	getSchedule(container: PIXI.Container): { batches: RenderUnit[][]; tokenCount: number; voidMeshBatchCount: number } {
		const TokenClass = foundry.canvas.placeables.Token
		const cacheKey = this.#computeCacheKey(container.children as PIXI.DisplayObject[], TokenClass)

		if (cacheKey === this.#cacheKey && this.#cachedSchedule) {
			return this.#cachedSchedule
		}

		this.#cacheKey = cacheKey
		this.#cachedSchedule = this.#buildSchedule(container, TokenClass)

		return this.#cachedSchedule
	}

	invalidate() {
		this.#cacheKey = ''
		this.#cachedSchedule = null
	}

	#buildSchedule(
		container: PIXI.Container,
		TokenClass: typeof foundry.canvas.placeables.Token,
	): { batches: RenderUnit[][]; tokenCount: number; voidMeshBatchCount: number } {
		const units = flattenContainerChildren(container.children as PIXI.DisplayObject[], TokenClass)
		const batches = scheduleRenderUnits(units)

		const tokenSet = new Set<Token>()
		const erasePrefix = `${PIXI.BLEND_MODES.ERASE}|`
		// Count ERASE runs or how many times we switch from non-ERASE into ERASE in the rendering
		// order. Consecutive ERASE batches are merged together by the batch rendderer, so only
		// count the first one in a run.
		let voidMeshBatchCount = 0
		let prevBatchWasErase = false
		for (const batch of batches) {
			const isErase = batch.length > 0 && batch[0].stateKey.startsWith(erasePrefix)
			if (isErase && !prevBatchWasErase) {
				voidMeshBatchCount++
			}
			prevBatchWasErase = isErase
			for (const unit of batch) {
				if (unit.parentToken !== null) {
					tokenSet.add(unit.parentToken)
				}
			}
		}

		return { batches, tokenCount: tokenSet.size, voidMeshBatchCount }
	}
}

// #endregion

// ============================================================================
// #region Main render function

const tempMatrix = new PIXI.Matrix()

function generalizedOooRender(this: PIXI.Container, renderer: PIXI.Renderer, scheduleCache: RenderScheduleCache) {
	const sourceFrame = renderer.renderTexture.sourceFrame
	if (!(sourceFrame.width > 0 && sourceFrame.height > 0)) {
		return
	}

	let bounds: PIXI.Rectangle | undefined
	let transform: PIXI.Matrix | undefined

	if (this.cullArea) {
		bounds = this.cullArea
		transform = this.worldTransform
	} else if ((this as any)._render !== (PIXI.Container.prototype as any)._render) {
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

	const { batches, tokenCount, voidMeshBatchCount } = scheduleCache.getSchedule(this)
	lastFrameTokenCount = tokenCount
	lastFrameVoidMeshBatchCount = voidMeshBatchCount

	for (const batch of batches) {
		let destroyedInBatch = false

		for (const unit of batch) {
			const obj = unit.object
			// display object may have been destroyed without us getting informed about it with our
			// hooks (e.g. ascene reset destroys AuraRenderers while the cache is still warm). Abort
			// early if that is the case
			if (obj.destroyed) {
				destroyedInBatch = true
				continue
			}
			if (unit.kind === 'child' && unit.parentToken) {
				const savedCullable = obj.cullable
				obj.cullable = savedCullable ?? unit.parentToken.cullable
				obj.render(renderer)
				obj.cullable = savedCullable
			} else {
				obj.render(renderer)
			}
		}

		// If we encountered a destroyed object, the cache is likely stale. Rebuild on next frame
		if (destroyedInBatch) {
			scheduleCache.invalidate()
		}
	}
}

// #endregion

// ============================================================================
// #region Per-frame render stats

export let lastFrameTokenCount = 0
export let lastFrameVoidMeshBatchCount = 0

// #endregion

// ============================================================================
// #region Enable / hook

const TOKEN_LAYER_DRAW_PATH = 'CONFIG.Canvas.layers.tokens.layerClass.prototype._draw'

const scheduleCache = new RenderScheduleCache()

// Tracks the original render function per swapped container so we can revert to the initial state
const originalRenders = new WeakMap<PIXI.Container, (renderer: PIXI.Renderer) => void>()

function ourRender(this: PIXI.Container, renderer: PIXI.Renderer) {
	generalizedOooRender.call(this, renderer, scheduleCache)
}

function applyOooRenderFunction(objects: PIXI.Container) {
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

function applyRenderFunctionOnDraw(this: { objects?: PIXI.Container }) {
	if (this.objects) {
		applyOooRenderFunction(this.objects)
	}
}

const invalidateCache = () => scheduleCache.invalidate()

let isEnabled = false

function enableGeneralizedOooRendering() {
	if (!getSetting(SETTINGS.OptimizeTokenUiBatching)) {
		return
	}

	registerGeneralizedOooRendering()
}

function registerGeneralizedOooRendering() {
	if (isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = true

	addWrapperHook<{ objects?: PIXI.Container }>(TOKEN_LAYER_DRAW_PATH, applyRenderFunctionOnDraw)

	// Invalidate cache on common token change hooks.
	// canvasPan is intentionally excluded: overlap is computed in world space and is unaffected by
	// viewport changes.
	Hooks.on('updateToken', invalidateCache)
	Hooks.on('createToken', invalidateCache)
	Hooks.on('deleteToken', invalidateCache)
	Hooks.on('refreshToken', invalidateCache)
	Hooks.on('canvasReady', invalidateCache)

	const objects = canvas?.tokens?.objects as PIXI.Container | undefined
	if (objects) {
		applyOooRenderFunction(objects)
	}
}

function unregisterGeneralizedOooRendering() {
	if (!isEnabled) {
		return
	}
	isEnabled = false

	removeWrapperHook(TOKEN_LAYER_DRAW_PATH, applyRenderFunctionOnDraw)

	Hooks.off('updateToken', invalidateCache)
	Hooks.off('createToken', invalidateCache)
	Hooks.off('deleteToken', invalidateCache)
	Hooks.off('refreshToken', invalidateCache)
	Hooks.off('canvasReady', invalidateCache)

	const objects = canvas?.tokens?.objects as PIXI.Container | undefined
	if (objects) {
		restoreOriginalRenderFunction(objects)
	}
	scheduleCache.invalidate()
}

export {
	enableGeneralizedOooRendering,
	generalizedOooRender,
	registerGeneralizedOooRendering,
	scheduleCache,
	unregisterGeneralizedOooRendering,
}

// #endregion
