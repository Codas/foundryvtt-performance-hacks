import type { Edge } from 'foundry-pf2e/src/types/foundry/client-esm/canvas/edges/edge.js'
import type { CanvasEdges } from 'foundry-pf2e/src/types/foundry/client-esm/canvas/edges/edges.js'
import { getSetting, SETTINGS } from 'src/settings.ts'

type CanvasEdgesWithQuadtree = CanvasEdges & {
	// @ts-expect-error types are wrong for CanvasQuadtree. Edge is perfectly valid
	edgesQuadtree: CanvasQuadtree<Edge>
	edgesInBounds: (rect: PIXI.Rectangle) => Set<Edge>
}

const initializeCanvasEdges = function initializeCanvasEdges(this: CanvasEdges, wrapper: Function, ...args: any[]) {
	wrapper(...args)

	// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
	this.edgesQuadtree = new CanvasQuadtree<Edge>()
}

const refreshEdges = function refreshEdges(this: CanvasEdgesWithQuadtree, wrapper: Function, ...args: any[]) {
	wrapper(...args)
	if (!this.edgesQuadtree) {
		// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
		this.edgesQuadtree = new CanvasQuadtree<Edge>()
	}
	this.edgesQuadtree.clear()
	for (const edge of canvas.edges.values()) {
		this.edgesQuadtree.insert({ r: (edge as Edge).bounds, t: edge, n: new Set() })
	}
}

const edgesInBounds = function edgesInBounds(this: CanvasEdgesWithQuadtree, rect: PIXI.Rectangle): Iterable<Edge> {
	if (!this.edgesQuadtree) {
		this.refresh()
	}
	return this.edgesQuadtree.getObjects(rect)
}

const identifyEdges = function identifyEdges(this: ClockwiseSweepPolygon) {
	const bounds = ((this.config as any).boundingBox = this._defineBoundingBox())
	const edgeTypes = (this as any)._determineEdgeTypes()
	for (const edge of (canvas.edges as CanvasEdgesWithQuadtree).edgesInBounds(bounds)) {
		if (this._testEdgeInclusion(edge, edgeTypes, bounds)) {
			this.edges.add(edge.clone())
		}
	}
}

export let enableFasterEdgeTesting = function enableFasterEdgeTesting() {
	const enabled = getSetting(SETTINGS.TokenBarsCaching)

	if (!enabled) {
		return
	}
	;(foundry.canvas.edges.CanvasEdges.prototype as any).edgesInBounds = edgesInBounds
	libWrapper.register('fvtt-perf-optim', 'foundry.canvas.edges.CanvasEdges.prototype.refresh', refreshEdges, 'WRAPPER')
	libWrapper.register(
		'fvtt-perf-optim',
		'foundry.canvas.edges.CanvasEdges.prototype.initialize',
		initializeCanvasEdges,
		'WRAPPER',
	)
	libWrapper.register('fvtt-perf-optim', 'ClockwiseSweepPolygon.prototype._identifyEdges', identifyEdges, 'OVERRIDE')
}

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		if (!newModule) {
			return
		}
		enableFasterEdgeTesting = newModule.enableFasterEdgeTesting
		libWrapper.unregister('fvtt-perf-optim', 'foundry.canvas.edges.CanvasEdges.prototype.refresh', false)
		libWrapper.unregister('fvtt-perf-optim', 'foundry.canvas.edges.CanvasEdges.prototype.initialize', false)
		libWrapper.unregister('fvtt-perf-optim', 'ClockwiseSweepPolygon.prototype._identifyEdges', false)
		enableFasterEdgeTesting()
		canvas.edges.refresh()
	})
}
