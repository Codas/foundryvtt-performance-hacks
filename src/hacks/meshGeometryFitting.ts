import type Tile from '@7h3laughingman/foundry-types/client/canvas/placeables/tile.mjs'
import type Token from '@7h3laughingman/foundry-types/client/canvas/placeables/token.mjs'
import type PrimarySpriteMesh from '@7h3laughingman/foundry-types/client/canvas/primary/primary-sprite-mesh.mjs'
import { NAMESPACE } from 'src/constants.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import {
	computeUnionHull,
	getAtlasFrameRawHullPoints,
	getBlobOutlinePoints,
	getImageRawHullPoints,
} from 'src/utils/convexHull.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'

/**
 * Foundry renders tiles and tokens as simple rectangle meshes regardless of how much of the quad is
 * actually covered by visible (non-transparent) pixels. This leads to significant overdraw,
 * especially for tokens with large transparent areas (e.g. circular token frames, irregular
 * artwork).
 *
 * This hack fits the mesh geometry tightly around the opaque region of each sprite by computing a
 * convex hull of the non-transparent pixels and replacing the default quad with a polygon mesh that
 * closely approximates that hull.
 *
 * Challenges for dynamic token rings: Token rings compose textures from ring, background, optional
 * mask, and subject art layers. Ring art varies by token size and is stored in a spritesheet atlas,
 * requiring extraction of the correct frame based on the token's ring/background settings.
 *
 * Tighter geometry also improves the accuracy of out-of-order (OOO) rendering decisions. Our OOO
 * rendering pass uses mesh bounding regions if available to determine the draw order between
 * overlapping ui elements and the token's void meshes. When using a tight hull, fewer false
 * overlaps are detected, reducing the amount of unnecessary void mesh passes.
 */

// ============================================================================
// #region Type definitions

/**
 * Stores the normalised polygon vertices for unique texture source URLs. A null entry means the
 * texture was skipped (animated, invalid, etc.).
 */
const polygonCache = new Map<string, Float32Array | null>()

/**
 * Minimal interface for the ring data attached to a Token (with token ring enabled).
 * UV arrays are stored in clockwise order from top left: TL, TR, BR, BL.
 * (indices: [0,1]=TL, [2,3]=TR, [4,5]=BR, [6,7]=BL)
 */
type TokenRing = {
	ringName: string
	bkgName: string
	ringUVs?: ArrayLike<number>
	bkgUVs?: ArrayLike<number>
	maskUVs?: ArrayLike<number>
	textureScaleAdjustment: number
	scaleCorrection: number
}

/**
 * Per-vertex expanded ring/bkg/mask UV arrays for a fitted ring-token mesh.
 * Also stores the original 4-corner arrays so they can be restored on removeFitting.
 * null value for maskUVs/origMaskUVs means no mask frame was present.
 */
type FittedRingUVs = {
	ringUVs: Float32Array
	bkgUVs: Float32Array
	maskUVs: Float32Array | null
	origRingUVs: ArrayLike<number>
	origBkgUVs: ArrayLike<number>
	origMaskUVs: ArrayLike<number> | undefined
}

/**
 * Atlas frame info for a ring or background sprite, used to compute the ring polygon hull.
 */
type AtlasFrameInfo = {
	source: HTMLImageElement | ImageBitmap
	/** [0,1] UV bounds of this frame within its base texture. */
	u0: number
	v0: number
	u1: number
	v1: number
	spritesheetWidth: number
	spritesheetHeight: number
}

/**
 * Computed polygon points for a texture with its cache key.
 */
type PolygonResult = {
	pts: Float32Array
	key: string
}

/**
 * Interpolate a UV pair from a flat 8-element UV corner array.
 */
function bilinearUV(corners: ArrayLike<number>, nx: number, ny: number): [number, number] {
	const invNx = 1 - nx
	const invNy = 1 - ny

	const u = invNy * (invNx * corners[0] + nx * corners[2]) + ny * (nx * corners[4] + invNx * corners[6])
	const v = invNy * (invNx * corners[1] + nx * corners[3]) + ny * (nx * corners[5] + invNx * corners[7])
	return [u, v]
}

/**
 * Given a token mesh with an attached ring, compute the per-vertex UVs for the ring and mask
 * textures that will fit the ring to the token's art.
 */
function computeExpandedRingUVs(pts: Float32Array, ring: TokenRing, hasMask: boolean): FittedRingUVs {
	// ringUVs and bkgUVs are always defined when this function is called; extract
	// them once so the loop body and return statement need no non-null assertions.
	const ringCornerUVs = ring.ringUVs ?? []
	const bkgCornerUVs = ring.bkgUVs ?? []
	const maskCornerUVs = ring.maskUVs ?? []

	const vertCount = pts.length / 2
	const ringUVs = new Float32Array(vertCount * 2)
	const bkgUVs = new Float32Array(vertCount * 2)
	const maskUVs = hasMask ? new Float32Array(vertCount * 2) : null

	for (let i = 0; i < vertCount; i++) {
		const nx = pts[i * 2]
		const ny = pts[i * 2 + 1]

		const [ringU, ringV] = bilinearUV(ringCornerUVs, nx, ny)
		ringUVs[i * 2] = ringU
		ringUVs[i * 2 + 1] = ringV

		const [bkgU, bkgV] = bilinearUV(bkgCornerUVs, nx, ny)
		bkgUVs[i * 2] = bkgU
		bkgUVs[i * 2 + 1] = bkgV

		if (maskUVs) {
			const [maskU, maskV] = bilinearUV(maskCornerUVs, nx, ny)
			maskUVs[i * 2] = maskU
			maskUVs[i * 2 + 1] = maskV
		}
	}

	return {
		ringUVs,
		bkgUVs,
		maskUVs,
		origRingUVs: ringCornerUVs,
		origBkgUVs: bkgCornerUVs,
		origMaskUVs: ring.maskUVs,
	}
}

/**
 * Look up a named sprite frame in PIXI's texture cache and return its position in the spritesheet.
 */
function getRingSpritesheetFrameInfo(frameName: string): AtlasFrameInfo | null {
	const tex = PIXI.utils.TextureCache[frameName]
	if (!tex?.valid) {
		return null
	}

	const resource = tex.baseTexture.resource as PIXI.ImageResource
	const source = resource?.source

	if (!(source instanceof HTMLImageElement || source instanceof ImageBitmap)) {
		return null
	}

	const w = tex.baseTexture.realWidth ?? tex.baseTexture.width
	const h = tex.baseTexture.realHeight ?? tex.baseTexture.height
	const f = tex.frame

	return {
		source,
		u0: f.x / w,
		v0: f.y / h,
		u1: (f.x + f.width) / w,
		v1: (f.y + f.height) / h,
		spritesheetWidth: w,
		spritesheetHeight: h,
	}
}

/** Get the source image and a unique key for a texture */
function getSourceAndKey(texture: PIXI.Texture): { source: HTMLImageElement | ImageBitmap; key: string } | null {
	const bt = texture.baseTexture
	const resource = bt.resource as PIXI.ImageResource
	const source = resource?.source

	if (!(source instanceof HTMLImageElement || source instanceof ImageBitmap)) {
		return null
	}

	// use src as the unique key with a fallback to the texture's cacheId if src is not available (e.g. for generated textures).
	const key: string =
		(source instanceof HTMLImageElement ? source.src : null) ??
		resource.url ??
		bt.cacheId ??
		bt.textureCacheIds?.[0] ??
		''

	return key ? { source, key } : null
}

/** Compute or retrieve a cached polygon for a given texture */
function getOrComputePolygon(texture: PIXI.Texture): PolygonResult | null {
	const sk = getSourceAndKey(texture)
	if (!sk) {
		return null
	}

	const { source, key } = sk

	if (polygonCache.has(key)) {
		const cached = polygonCache.get(key) ?? null
		return cached ? { pts: cached, key } : null
	}

	const pts = getBlobOutlinePoints(source)
	const result = pts.length >= 6 ? pts : null // need at least 3 vertices to form a polygon
	polygonCache.set(key, result)

	return result ? { pts: result, key } : null
}

function getOrComputeRingPolygon(texture: PIXI.Texture, ring: TokenRing): PolygonResult | null {
	const sk = getSourceAndKey(texture)
	if (!sk) {
		return null
	}

	// Cache key incorporates both the subject texture and the ring/bkg frame names
	// so different ring sizes on the same art get separate hulls.
	const key = `${sk.key}|ring:${ring.ringName}|bkg:${ring.bkgName}`

	if (polygonCache.has(key)) {
		const cached = polygonCache.get(key) ?? null
		return cached ? { pts: cached, key } : null
	}

	// Generate subject hull from the token's main texture
	// textureScaleAdjustment > 1 means the subject is zoomed out,
	// mesh = (tex - 0.5) / scale + 0.5
	const subjectRaw = getImageRawHullPoints(sk.source)
	const textureScale = ring.textureScaleAdjustment || 1
	const subjectMesh = new Float32Array(subjectRaw.length)
	for (let i = 0; i < subjectRaw.length; i += 2) {
		subjectMesh[i] = (subjectRaw[i] - 0.5) / textureScale + 0.5
		subjectMesh[i + 1] = (subjectRaw[i + 1] - 0.5) / textureScale + 0.5
	}

	// Get ring and background frame info
	const ringInfo = getRingSpritesheetFrameInfo(ring.ringName)
	const bkgInfo = getRingSpritesheetFrameInfo(ring.bkgName)

	// Atlas might not be loaded yet, retry on next _refreshMesh
	if (!ringInfo || !bkgInfo) {
		return null
	}

	// Generate raw ring and background hull points
	const ringRaw = getAtlasFrameRawHullPoints(
		ringInfo.source,
		ringInfo.u0,
		ringInfo.v0,
		ringInfo.u1,
		ringInfo.v1,
		ringInfo.spritesheetWidth,
		ringInfo.spritesheetHeight,
	)
	const bkgRaw = getAtlasFrameRawHullPoints(
		bkgInfo.source,
		bkgInfo.u0,
		bkgInfo.v0,
		bkgInfo.u1,
		bkgInfo.v1,
		bkgInfo.spritesheetWidth,
		bkgInfo.spritesheetHeight,
	)

	const ringScale = ring.scaleCorrection || 1

	// Convert frame-space [0,1] hull points to mesh-space [0,1]. scaleCorrection shrinks the
	// ring/bkg artwork relative to the subject, centered at (0.5, 0.5). Token subjects with large
	// artwork have scaleCorrection > 1 so the ring renders smaller inside the mesh.
	// meshCoord = (frameCoord - 0.5) / scaleCorrection + 0.5
	function ringFrameToMesh(framePts: Float32Array): Float32Array {
		const out = new Float32Array(framePts.length)
		for (let i = 0; i < framePts.length; i += 2) {
			out[i] = (framePts[i] - 0.5) / ringScale + 0.5
			out[i + 1] = (framePts[i + 1] - 0.5) / ringScale + 0.5
		}
		return out
	}

	// Compute the union hull of the subject, ring, and background hulls for a final fitted ring mesh
	const pts = computeUnionHull([subjectMesh, ringFrameToMesh(ringRaw), ringFrameToMesh(bkgRaw)])
	const result = pts.length >= 6 ? pts : null
	polygonCache.set(key, result)

	return result ? { pts, key } : null
}

const indicesCache = new WeakMap<Float32Array, Uint16Array>()

/**
 * Generate a triangle fan index array for a given polygon vertex array.
 * Output is cached per polygon array
 */
function getTriangleFanIndices(pts: Float32Array): Uint16Array {
	const cached = indicesCache.get(pts)
	if (cached) {
		return cached
	}
	const vertCount = pts.length / 2
	const triCount = vertCount - 2
	const indices = new Uint16Array(triCount * 3)
	for (let i = 0; i < triCount; i++) {
		indices[i * 3] = 0
		indices[i * 3 + 1] = i + 1
		indices[i * 3 + 2] = i + 2
	}
	indicesCache.set(pts, indices)
	return indices
}

// #endregion

// ============================================================================
// #region Fitted mesh data management

type FittedMeshData = {
	polygon: Float32Array | null
	src: string
	originalUpdateBatchData: () => void
	originalIndices: Uint16Array | undefined
	debugOverlay: PIXI.Container | undefined
	ringUVs: FittedRingUVs | null
}

const meshFitData = new WeakMap<PrimarySpriteMesh, FittedMeshData>()

const getFittedMeshes = () => canvas.primary.tokens.values().filter((m) => meshFitData.has(m))

// #endregion

// ============================================================================
// #region Debug overlay
let debugEnabled = false

const DEBUG_COLOR = 0x00ffff
const DEBUG_ALPHA = 0.85
const DEBUG_LINE_WIDTH = 1.5
const DEBUG_QUAD_FILL_COLOR = 0xffffff
const DEBUG_QUAD_FILL_ALPHA = 0.15
const DEBUG_QUAD_BORDER_ALPHA = 0.5

function polygonArea(pts: Float32Array): number {
	const n = pts.length >> 1
	let area = 0
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n
		area += pts[i * 2] * pts[j * 2 + 1]
		area -= pts[j * 2] * pts[i * 2 + 1]
	}
	return Math.abs(area) * 0.5
}

function buildDebugOverlay(pts: Float32Array, mesh: PrimarySpriteMesh): PIXI.Container {
	const w = mesh.texture.orig.width
	const h = mesh.texture.orig.height
	const ax = mesh.anchor.x
	const ay = mesh.anchor.y
	const invScale = 1 / Math.max(mesh.scale.x, 0.001)

	const container = new PIXI.Container()
	const g = new PIXI.Graphics()
	container.addChild(g)

	// Original quad: light fill + border to show the pre-fitting rect extent.
	g.lineStyle(invScale, DEBUG_QUAD_FILL_COLOR, DEBUG_QUAD_BORDER_ALPHA)
	g.beginFill(DEBUG_QUAD_FILL_COLOR, DEBUG_QUAD_FILL_ALPHA)
	g.drawRect(-ax * w, -ay * h, w, h)
	g.endFill()

	// Fitted polygon outline
	g.lineStyle(DEBUG_LINE_WIDTH * invScale, DEBUG_COLOR, DEBUG_ALPHA)

	const vertCount = pts.length / 2
	const x0 = (pts[0] - ax) * w
	const y0 = (pts[1] - ay) * h
	g.moveTo(x0, y0)
	for (let i = 1; i < vertCount; i++) {
		g.lineTo((pts[i * 2] - ax) * w, (pts[i * 2 + 1] - ay) * h)
	}
	g.lineTo(x0, y0) // close line loop

	// Dot at each vertex
	const dotR = 3 * invScale
	g.lineStyle(0)
	g.beginFill(DEBUG_COLOR, DEBUG_ALPHA)
	for (let i = 0; i < vertCount; i++) {
		g.drawCircle((pts[i * 2] - ax) * w, (pts[i * 2 + 1] - ay) * h, dotR)
	}
	g.endFill()

	// Coverage percentage: area of fitted polygon relative to original quad
	const pct = Math.min(100, Math.round(polygonArea(pts) * 100))
	const label = new PIXI.Text(`${pct}%`, {
		fontSize: 14,
		fill: DEBUG_COLOR,
		align: 'center',
		dropShadow: true,
		dropShadowDistance: 1,
		dropShadowAlpha: 0.8,
	} as PIXI.TextStyle)
	label.anchor.set(0.5)
	label.scale.set(invScale)
	label.position.set((0.5 - ax) * w, (0.5 - ay) * h)
	container.addChild(label)

	return container
}

function refreshDebugOverlay(mesh: PrimarySpriteMesh) {
	const data = meshFitData.get(mesh)
	const existing = data?.debugOverlay
	if (existing) {
		mesh.removeChild(existing)
		existing.destroy()
		if (data) {
			data.debugOverlay = undefined
		}
	}

	if (!debugEnabled) {
		return
	}

	const pts = data?.polygon
	if (!pts) {
		return
	}

	const g = buildDebugOverlay(pts, mesh)
	mesh.addChild(g)
	if (data) {
		data.debugOverlay = g
	}
}

/**
 * Toggle the mesh geometry fitting debug overlay for all fitted tokens and tiles.
 */
function setDebugEnabled(enabled: boolean) {
	debugEnabled = enabled

	for (const mesh of getFittedMeshes()) {
		refreshDebugOverlay(mesh)
	}
	console.log(`[PrimePerformance] Mesh geometry fitting debug overlay ${enabled ? 'enabled' : 'disabled'}`)
}

// #endregion

// ============================================================================
// #region Patched _updateBatchData

/**
 * The original _updateBatchData copies the 4-vertex quad into _batchData. Our version calls the
 * original first, then rewrites _batchData with the fitted polygon geometry
 *
 * For a normalised point (nx, ny) where (0,0)=TL and (1,1)=BR, the world position is:
 *   top    = lerp(TL, TR, nx)
 *   bottom = lerp(BL, BR, nx)
 *   world  = lerp(top, bottom, ny)
 *
 * UVs map to the texture frame. The quad's UV layout is:
 *   [TL.u/v, TR.u/v, BL.u/v, BR.u/v]
 * We apply the same bilinear interpolation to get correct UVs.
 */
function patchedUpdateBatchData(this: PrimarySpriteMesh) {
	const data = meshFitData.get(this)
	data?.originalUpdateBatchData.call(this)

	const pts = data?.polygon
	if (!pts) {
		return
	}

	const bd = this._batchData

	// IMPORTANT: Read quad corners from `this.vertexData` and `this.uvs`, NOT from bd.vertexData /
	// bd.uvs. On frames after the first, bd.vertexData holds our previously-written polygon vertex
	// array. Reading back from it would treat the polygon vertices as quad corners, accumulating a
	// shrinking distortion each frame until nothing is visible... Not that this drove me crazy for
	// a while or anything...
	const quadVerts = this.vertexData
	const quadUvs = this.uvs

	const tlx = quadVerts[0],
		tly = quadVerts[1]
	const trx = quadVerts[2],
		try_ = quadVerts[3]
	const brx = quadVerts[4],
		bry = quadVerts[5]
	const blx = quadVerts[6],
		bly = quadVerts[7]

	const tlu = quadUvs[0],
		tlv = quadUvs[1]
	const tru = quadUvs[2],
		trv = quadUvs[3]
	const bru = quadUvs[4],
		brv = quadUvs[5]
	const blu = quadUvs[6],
		blv = quadUvs[7]

	const vertCount = pts.length / 2
	const newVerts = new Float32Array(vertCount * 2)
	const newUvs = new Float32Array(vertCount * 2)

	for (let i = 0; i < vertCount; i++) {
		const nx = pts[i * 2]
		const ny = pts[i * 2 + 1]
		const invNx = 1 - nx
		const invNy = 1 - ny

		const topX = invNx * tlx + nx * trx
		const topY = invNx * tly + nx * try_
		const botX = invNx * blx + nx * brx
		const botY = invNx * bly + nx * bry
		newVerts[i * 2] = invNy * topX + ny * botX
		newVerts[i * 2 + 1] = invNy * topY + ny * botY

		const topU = invNx * tlu + nx * tru
		const topV = invNx * tlv + nx * trv
		const botU = invNx * blu + nx * bru
		const botV = invNx * blv + nx * brv
		newUvs[i * 2] = invNy * topU + ny * botU
		newUvs[i * 2 + 1] = invNy * topV + ny * botV
	}

	bd.vertexData = newVerts
	bd.uvs = newUvs

	const triangleFanIndices = getTriangleFanIndices(pts)
	// @ts-expect-error indices is marked as number[] but overriding it with UInt16Array should be safe...
	bd.indices = triangleFanIndices

	// the batch renderer reads this.indices directly rather than bd.indices when packing the
	// index buffer.
	this.indices = triangleFanIndices

	// For ring-shader tokens: swap the ring/bkg/mask UV arrays on the token's ring
	// object to the pre-expanded per-vertex versions.
	const fittedRingUVs = data?.ringUVs
	if (fittedRingUVs) {
		const tokenRing = (this as any).object?.ring as TokenRing | undefined
		if (tokenRing) {
			tokenRing.ringUVs = fittedRingUVs.ringUVs
			tokenRing.bkgUVs = fittedRingUVs.bkgUVs
			if (fittedRingUVs.maskUVs !== null) {
				tokenRing.maskUVs = fittedRingUVs.maskUVs
			}
		}
	}
}

// #endregion

// ============================================================================
// #region Apply / Remove fitting
function removeFitting(mesh: PrimarySpriteMesh) {
	const data = meshFitData.get(mesh)
	if (!data) {
		return
	}
	;(mesh as any)._updateBatchData = data.originalUpdateBatchData
	if (data.originalIndices) {
		mesh.indices = data.originalIndices
	}
	// Restore original ring quad UV arrays on the token's ring object.
	const fittedRingUVs = data.ringUVs
	if (fittedRingUVs) {
		const tokenRing = (mesh as any).object?.ring as TokenRing | undefined
		if (tokenRing) {
			tokenRing.ringUVs = fittedRingUVs.origRingUVs
			tokenRing.bkgUVs = fittedRingUVs.origBkgUVs
			if (fittedRingUVs.origMaskUVs !== undefined) {
				tokenRing.maskUVs = fittedRingUVs.origMaskUVs
			}
		}
	}
	meshFitData.delete(mesh)
	refreshDebugOverlay(mesh)
}

function tryApplyGeometryFitting(mesh: PrimarySpriteMesh, isAnimated: boolean, ring: TokenRing | null = null) {
	const texture = mesh.texture

	// checkf for animated meshes and ember-specific bailout for shadow casting meshes
	if (!texture?.valid || isAnimated || (mesh as any).castShadow) {
		removeFitting(mesh)
		return
	}

	const poly = ring ? getOrComputeRingPolygon(texture, ring) : getOrComputePolygon(texture)

	if (!poly) {
		removeFitting(mesh)
		return
	}

	const existingData = meshFitData.get(mesh)
	if (existingData?.src === poly.key) {
		return
	}

	if (!existingData) {
		// First time fitting this mesh: save the original function and patch it.
		const newData: FittedMeshData = {
			polygon: poly.pts,
			src: poly.key,
			originalUpdateBatchData: (mesh as any)._updateBatchData.bind(mesh),
			originalIndices: mesh.indices as Uint16Array | undefined,
			debugOverlay: undefined,
			ringUVs: null,
		}
		meshFitData.set(mesh, newData)
		;(mesh as any)._updateBatchData = patchedUpdateBatchData.bind(mesh)
	} else {
		existingData.polygon = poly.pts
		existingData.src = poly.key
	}

	const data = existingData ?? meshFitData.get(mesh)
	if (!data) {
		return
	}

	// Pre-compute per-vertex ring UV expansions for the new polygon.
	if (ring) {
		const nullUvs = (CONFIG as any).Token?.ring?.shaderClass?.nullUvs as ArrayLike<number> | undefined
		// maskUVs may be absent on the token ring object. A mask is present only when maskUVs is
		// defined AND differs from the nullUvs.
		const maskUVs = ring.maskUVs
		const hasMask = maskUVs != null && (nullUvs ? maskUVs !== nullUvs : Array.from(maskUVs).some((v) => v !== 0))
		data.ringUVs = computeExpandedRingUVs(poly.pts, ring, hasMask)
	} else {
		data.ringUVs = null
	}

	refreshDebugOverlay(mesh)
}

// #endregion

// ============================================================================
// #region Token wrapper
function _refreshMesh_token(this: Token) {
	const mesh = this.mesh
	if (mesh) {
		tryApplyGeometryFitting(mesh as PrimarySpriteMesh, this.isVideo, (this as any).ring ?? null)
	}
}

// #endregion

// ============================================================================
// #region Tile wrapper
function _refreshMesh_tile(this: Tile) {
	const mesh = this.mesh
	if (mesh) {
		tryApplyGeometryFitting(mesh as PrimarySpriteMesh, this.isVideo)
	}
}

// #endregion

// ============================================================================
// #region World-space polygon export

/**
 * Returns the fitted convex hull polygon for a token's primary mesh transformed into world (canvas)
 * space, or null if mesh geometry fitting has no polygon for this token or the feature is disabled.
 */
export function getTokenMeshWorldPolygon(token: unknown): Float32Array | null {
	const mesh = (token as any).mesh
	if (!mesh) {
		return null
	}
	const fittedPts = meshFitData.get(mesh)?.polygon
	if (!fittedPts || fittedPts.length < 6) {
		return null
	}
	// Ensure quad vertex positions are up to date (idempotent due to PIXI's internal _transformID
	// caching).
	if (typeof mesh.calculateVertices === 'function') {
		mesh.calculateVertices()
	}
	const quadVerts = (mesh as any).vertexData as Float32Array | undefined
	if (!quadVerts || quadVerts.length < 8) {
		return null
	}

	// Vertex order from calculateVertices(): TL, TR, BR, BL
	const tlx = quadVerts[0],
		tly = quadVerts[1]
	const trx = quadVerts[2],
		try_ = quadVerts[3]
	const brx = quadVerts[4],
		bry = quadVerts[5]
	const blx = quadVerts[6],
		bly = quadVerts[7]

	const vertCount = fittedPts.length >> 1
	const worldPts = new Float32Array(fittedPts.length)
	for (let i = 0; i < vertCount; i++) {
		const nx = fittedPts[i * 2]
		const ny = fittedPts[i * 2 + 1]
		const invNx = 1 - nx
		const invNy = 1 - ny
		const topX = invNx * tlx + nx * trx
		const topY = invNx * tly + nx * try_
		const botX = invNx * blx + nx * brx
		const botY = invNx * bly + nx * bry
		worldPts[i * 2] = invNy * topX + ny * botX
		worldPts[i * 2 + 1] = invNy * topY + ny * botY
	}

	return worldPts
}

// #endregion

// ============================================================================
// #region Registration

const TOKEN_REFRESH_MESH_PATH = 'CONFIG.Token.objectClass.prototype._refreshMesh'
const TILE_REFRESH_MESH_PATH = 'CONFIG.Tile.objectClass.prototype._refreshMesh'
const TOKEN_RING_PACKER_PATH = 'foundry.canvas.rendering.shaders.TokenRingSamplerShader._packInterleavedGeometry'

let tokenWrapperRegistrationId: number | undefined
let tileWrapperRegistrationId: number | undefined
let tokenRingPackerRegistrationId: number | undefined

let isEnabled = false

let enableMeshGeometryFitting = () => {
	if (!getSetting(SETTINGS.MeshGeometryFitting)) {
		return
	}

	registerMeshGeometryFitting()
}

function registerMeshGeometryFitting() {
	if (isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}

	// Skip for Ember Vista scenes -- its custom tile/token rendering is not
	// compatible with mesh geometry fitting.
	const mgrClass = canvas?.manager?.config?.managerClass as string | undefined
	if (mgrClass === 'EmberVista') {
		return
	}

	isEnabled = true
	tokenRingPackerRegistrationId = libWrapper.register(
		NAMESPACE,
		TOKEN_RING_PACKER_PATH,
		function (
			this: { vertexSize: number },
			wrapped: (element: any, attributeBuffer: any, indexBuffer: Uint16Array, aIndex: number, iIndex: number) => void,
			element: any,
			attributeBuffer: any,
			indexBuffer: Uint16Array,
			aIndex: number,
			iIndex: number,
		) {
			wrapped.call(this, element, attributeBuffer, indexBuffer, aIndex, iIndex)

			const mesh = element.object as PrimarySpriteMesh | undefined
			const fittedRingUVs = mesh ? meshFitData.get(mesh)?.ringUVs : undefined
			if (!fittedRingUVs) {
				return
			}

			const vertexData = element.vertexData as Float32Array | undefined
			const tokenRing = (mesh as any).object?.ring as TokenRing | undefined
			if (!vertexData || (tokenRing?.maskUVs?.length ?? 0) >= vertexData.length) {
				return
			}

			// No-mask dynamic rings use Foundry's shared 4-vertex nullUvs array. Fitted meshes have
			// more vertices. Need to clear the extra mask attribute slots instead of letting
			// undefined become NaN...
			const { float32View } = attributeBuffer
			const maskOffset = this.vertexSize - 14 + 4
			for (let i = 0, j = maskOffset; i < vertexData.length; i += 2, j += this.vertexSize) {
				const k = aIndex + j
				float32View[k] = 0
				float32View[k + 1] = 0
			}
		},
		'WRAPPER',
	)
	tokenWrapperRegistrationId = libWrapper.register(
		NAMESPACE,
		TOKEN_REFRESH_MESH_PATH,
		async function (this: Token, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
			const result = wrapped(...args)
			if (result instanceof Promise) {
				await result
			}
			_refreshMesh_token.call(this)
		},
		'WRAPPER',
	)
	tileWrapperRegistrationId = libWrapper.register(
		NAMESPACE,
		TILE_REFRESH_MESH_PATH,
		async function (this: Tile, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
			const result = wrapped(...args)
			if (result instanceof Promise) {
				await result
			}
			_refreshMesh_tile.call(this)
		},
		'WRAPPER',
	)

	if (!FOUNDRY_API.hasCanvas) {
		return
	}
	for (const token of canvas.tokens?.placeables ?? []) {
		_refreshMesh_token.call(token as Token)
	}
	for (const tile of canvas.tiles?.placeables ?? []) {
		_refreshMesh_tile.call(tile as Tile)
	}
}

function unregisterMeshGeometryFitting() {
	if (!isEnabled) {
		return
	}
	isEnabled = false
	if (tokenWrapperRegistrationId !== undefined) {
		libWrapper.unregister(NAMESPACE, tokenWrapperRegistrationId)
		tokenWrapperRegistrationId = undefined
	}
	if (tileWrapperRegistrationId !== undefined) {
		libWrapper.unregister(NAMESPACE, tileWrapperRegistrationId)
		tileWrapperRegistrationId = undefined
	}
	if (tokenRingPackerRegistrationId !== undefined) {
		libWrapper.unregister(NAMESPACE, tokenRingPackerRegistrationId)
		tokenRingPackerRegistrationId = undefined
	}

	for (const mesh of getFittedMeshes()) {
		removeFitting(mesh)
	}
}

export {
	enableMeshGeometryFitting,
	registerMeshGeometryFitting,
	setDebugEnabled as toggleMeshDebug,
	unregisterMeshGeometryFitting,
}

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableMeshGeometryFitting = newModule?.enableMeshGeometryFitting
	})
}

// #endregion
