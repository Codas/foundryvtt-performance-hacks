// Adaptive sample size tiers based on the larger image dimension:
// <= 1024px -> 128x128
// <= 4096px -> 256x256
// >  4096px -> 512x512
const TIER_SMALL = 128
const TIER_MEDIUM = 256
const TIER_LARGE = 512

// Padding added to the convex hull to account for interpolation artifacts.
// Expressed as a fraction of the sample size, in our case 1% padding should be enough
const HULL_PADDING = 0.01

function sampleSizeForDimension(maxDimension: number): number {
	if (maxDimension <= 1024) {
		return TIER_SMALL
	}
	if (maxDimension <= 4096) {
		return TIER_MEDIUM
	}
	return TIER_LARGE
}

/** Cached canvas context per sample tier */
const ctxCache = new Map<number, OffscreenCanvasRenderingContext2D>()

/**
 * Get cached canvas context for a given sample size, creating a new one if necessary
 */
function getCtx(sampleSize: number): OffscreenCanvasRenderingContext2D {
	let ctx = ctxCache.get(sampleSize)
	if (!ctx) {
		ctx = new OffscreenCanvas(sampleSize, sampleSize).getContext('2d', {
			willReadFrequently: true,
		}) as OffscreenCanvasRenderingContext2D
		ctxCache.set(sampleSize, ctx)
	}
	return ctx
}

/** Alpha buffer sized for the largest tier so it is allocated only once */
const alphaBuffer = new Uint8Array(TIER_LARGE * TIER_LARGE)

type Point = [number, number]

function cross(a: Point, b: Point, o: Point): number {
	return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/**
 * Implementation of the monotone chain convex hull algorithm.
 * https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain
 * @param points Array of [x, y] coordinates
 * @returns Convex hull vertices in counter-clockwise order.
 */
function convexHull(points: Point[]): Float32Array {
	points.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))

	const n = points.length
	const lower: Point[] = new Array(n)
	let lowerLen = 0
	for (let i = 0; i < n; i++) {
		while (lowerLen >= 2 && cross(lower[lowerLen - 2], lower[lowerLen - 1], points[i]) <= 0) {
			lowerLen--
		}
		lower[lowerLen++] = points[i]
	}

	const upper: Point[] = new Array(n)
	let upperLen = 0
	for (let i = n - 1; i >= 0; i--) {
		while (upperLen >= 2 && cross(upper[upperLen - 2], upper[upperLen - 1], points[i]) <= 0) {
			upperLen--
		}
		upper[upperLen++] = points[i]
	}

	// Each half's last element duplicates the first element of the other half.
	lowerLen--
	upperLen--
	const result = new Float32Array((lowerLen + upperLen) * 2)
	for (let i = 0; i < lowerLen; i++) {
		result[i * 2] = lower[i][0]
		result[i * 2 + 1] = lower[i][1]
	}
	for (let i = 0; i < upperLen; i++) {
		result[(lowerLen + i) * 2] = upper[i][0]
		result[(lowerLen + i) * 2 + 1] = upper[i][1]
	}
	return result
}

// ============================================================================
// #region Shared sampling helper

// Returns opaque pixel centres as UV [0,1] coordinates directly
function sampleCanvasToPoints(ctx: OffscreenCanvasRenderingContext2D, sampleSize: number): Point[] {
	const data4 = ctx.getImageData(0, 0, sampleSize, sampleSize).data
	const len = sampleSize * sampleSize
	for (let i = 0; i < len; i++) {
		alphaBuffer[i] = data4[(i << 2) | 3]
	}

	const points: Point[] = []
	for (let y = 0; y < sampleSize; y++) {
		const rowStart = y * sampleSize
		for (let x = 0; x < sampleSize; x++) {
			if (alphaBuffer[rowStart + x] > 0) {
				points.push([(x + 0.5) / sampleSize, (y + 0.5) / sampleSize])
			}
		}
	}
	return points
}

// #endregion

// ============================================================================
// #region Convex hull simplification
// See https://arxiv.org/abs/2604.14468 for the algorithm

// Target vertex count for convex hull simplification (outer approximation)
const HULL_SIMPLIFY_TARGET = 8

// Small value for floating point comparisons. Any difference below this threshold is considered equal to 0
const EPSILON = 1e-12

// Greedy outer-approximation simplification of a convex polygon. Repeatedly removes the edge whose
// removal adds the least cap area, using the H-representation approach from the listed paper:
// removing an edge extends its two neighbors until they meet, forming a new vertex outside the
// original polygon. The result always contains all input vertices in it's shell.
// Input/output: Float32Array of (x, y) pairs in CCW order.
function simplifyConvexHull(pts: Float32Array, targetCount: number): Float32Array {
	const n = pts.length >> 1
	const target = Math.max(targetCount, 3)
	if (n <= target) {
		return pts
	}

	const vx = new Float64Array(n)
	const vy = new Float64Array(n)
	const prv = new Int32Array(n)
	const nxt = new Int32Array(n)
	for (let i = 0; i < n; i++) {
		vx[i] = pts[i * 2]
		vy[i] = pts[i * 2 + 1]
		prv[i] = (i - 1 + n) % n
		nxt[i] = (i + 1) % n
	}

	/**
	 * Cost of removing edge (a, nxt[a]): area of the cap triangle formed by the two removed
	 * vertices and the new intersection vertex V'.
	 */
	function edgeCost(a: number): number {
		const b = nxt[a]
		const pa = prv[a]
		const nb = nxt[b]
		// Direction of the edge extending from pa through a (line L1).
		const d1x = vx[a] - vx[pa]
		const d1y = vy[a] - vy[pa]
		// Direction of the edge extending from b through nb (line L2).
		const d2x = vx[nb] - vx[b]
		const d2y = vy[nb] - vy[b]
		const denom = d1x * d2y - d1y * d2x
		if (Math.abs(denom) < EPSILON) {
			return Infinity // parallel neighbors, MUST NOT remove this edge
		}
		// Intersection of L1 and L2 gives new vertex V'.
		const t = ((vx[b] - vx[pa]) * d2y - (vy[b] - vy[pa]) * d2x) / denom
		const ix = vx[pa] + t * d1x
		const iy = vy[pa] + t * d1y
		// Area of triangle (V_a, V_b, V').
		return Math.abs((vx[b] - vx[a]) * (iy - vy[a]) - (ix - vx[a]) * (vy[b] - vy[a])) * 0.5
	}

	const costs = new Float64Array(n)
	for (let i = 0; i < n; i++) {
		costs[i] = edgeCost(i)
	}

	let count = n
	let anchor = 0

	while (count > target) {
		// Find the min-cost edge
		let minCost = Infinity
		let minA = anchor
		let cur = anchor
		for (let step = 0; step < count; step++) {
			if (costs[cur] < minCost) {
				minCost = costs[cur]
				minA = cur
			}
			cur = nxt[cur]
		}
		if (minCost === Infinity) {
			break // all remaining edges have parallel neighbors
		}

		const a = minA
		const b = nxt[a]
		const pa = prv[a]
		const nb = nxt[b]

		// Compute V' = intersection of extended edge (pa -> a) and edge (b -> nb).
		const d1x = vx[a] - vx[pa]
		const d1y = vy[a] - vy[pa]
		const d2x = vx[nb] - vx[b]
		const d2y = vy[nb] - vy[b]
		const denom = d1x * d2y - d1y * d2x
		if (Math.abs(denom) < EPSILON) {
			costs[a] = Infinity
			continue
		}
		const t = ((vx[b] - vx[pa]) * d2y - (vy[b] - vy[pa]) * d2x) / denom
		vx[a] = vx[pa] + t * d1x
		vy[a] = vy[pa] + t * d1y

		// Remove b from the ring. Slot a now holds V'.
		nxt[a] = nb
		prv[nb] = a
		count--

		// Slot a is always alive after removal so its a new safe anchor for next iteration
		anchor = a

		// Recompute costs for the two edges now adjacent to the new vertex V'.
		costs[prv[a]] = edgeCost(prv[a])
		costs[a] = edgeCost(a)
	}

	// Collect surviving vertices by walking the ring from the anchor.
	const out = new Float32Array(count * 2)
	let cur = anchor
	for (let i = 0; i < count; i++) {
		out[i * 2] = vx[cur]
		out[i * 2 + 1] = vy[cur]
		cur = nxt[cur]
	}
	return out
}

// Expands each hull vertex outward from the centroid by paddingUV (in [0,1] space)
function hullWithPadding(hull: Float32Array, paddingUV: number): Float32Array {
	const n = hull.length >> 1
	let cx = 0,
		cy = 0
	for (let i = 0; i < n; i++) {
		cx += hull[i * 2]
		cy += hull[i * 2 + 1]
	}
	cx /= n
	cy /= n

	const pts = new Float32Array(hull.length)
	for (let i = 0; i < n; i++) {
		const x = hull[i * 2]
		const y = hull[i * 2 + 1]
		const dx = x - cx
		const dy = y - cy
		const d = Math.sqrt(dx * dx + dy * dy)
		pts[i * 2] = d > 0 ? x + (dx / d) * paddingUV : x
		pts[i * 2 + 1] = d > 0 ? y + (dy / d) * paddingUV : y
	}
	return pts
}

// #endregion

// ============================================================================
// #region Public API

/**
 * Returns padded normalised [0..1] convex hull points for the opaque region of
 * an image. Suitable for non-ring tokens and tiles
 */
export function getBlobOutlinePoints(image: HTMLImageElement | ImageBitmap): Float32Array {
	const raw = getImageRawHullPoints(image)
	if (raw.length === 0) {
		return raw
	}
	return simplifyConvexHull(hullWithPadding(raw, HULL_PADDING), HULL_SIMPLIFY_TARGET)
}

/**
 * Returns raw (unpadded) normalised [0..1] hull points for an image's opaque
 * region. Suitable for use as one of the inputs to computeUnionHull.
 */
export function getImageRawHullPoints(
	image: HTMLImageElement | ImageBitmap,
	srcX = 0,
	srcY = 0,
	srcW = image.width,
	srcH = image.height,
): Float32Array {
	const sampleSize = sampleSizeForDimension(Math.max(srcW, srcH))
	const ctx = getCtx(sampleSize)
	ctx.clearRect(0, 0, sampleSize, sampleSize)
	ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, sampleSize, sampleSize)
	const points = sampleCanvasToPoints(ctx, sampleSize)
	if (points.length === 0) {
		return new Float32Array(0)
	}
	return convexHull(points)
}

/**
 * Returns raw (unpadded) normalised [0..1] hull points for a UV-framed region of an atlas texture.
 * The frame covers [u0,v0] -> [u1,v1] in the atlas.
 * Suitable for use as one of the inputs to computeUnionHull.
 */
export function getAtlasFrameRawHullPoints(
	atlasSource: HTMLImageElement | ImageBitmap,
	u0: number,
	v0: number,
	u1: number,
	v1: number,
	atlasWidth: number,
	atlasHeight: number,
): Float32Array {
	const framePxW = (u1 - u0) * atlasWidth
	const framePxH = (v1 - v0) * atlasHeight
	return getImageRawHullPoints(atlasSource, u0 * atlasWidth, v0 * atlasHeight, framePxW, framePxH)
}

/**
 * Computes the convex hull of the union of multiple sets of raw (unpadded) [0..1] hull-vertex point
 * sets, then applies the outward padding.
 */
export function computeUnionHull(rawPointSets: Float32Array[]): Float32Array {
	const allPoints: Point[] = []
	for (const pts of rawPointSets) {
		for (let i = 0; i < pts.length; i += 2) {
			allPoints.push([pts[i], pts[i + 1]])
		}
	}
	if (allPoints.length === 0) {
		return new Float32Array(0)
	}
	return simplifyConvexHull(hullWithPadding(convexHull(allPoints), HULL_PADDING), HULL_SIMPLIFY_TARGET)
}

// #endregion
