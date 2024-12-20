import type { Edge } from 'foundry-pf2e/src/types/foundry/client-esm/canvas/edges/edge.js';
import type { CanvasEdges } from 'foundry-pf2e/src/types/foundry/client-esm/canvas/edges/edges.js';
import { SETTINGS, getSetting } from 'src/settings.ts';

type CanvasEdgesWithQuadtree = CanvasEdges & {
	// @ts-expect-error types are wrong for CanvasQuadtree. Edge is perfectly valid
	edgesQuadtree: CanvasQuadtree<Edge>;
	edgesInBounds: (rect: PIXI.Rectangle) => Set<Edge>;
};

const initializeCanvasEdges = function initializeCanvasEdges(this: CanvasEdges, wrapper: Function, ...args: any[]) {
	wrapper(...args);

	// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
	this.edgesQuadtree = new CanvasQuadtree<Edge>();
};

const refreshEdges = function refreshEdges(this: CanvasEdgesWithQuadtree, wrapper: Function, ...args: any[]) {
	wrapper(...args);
	if (!this.edgesQuadtree) {
		// @ts-expect-error types are wrong for CanvasQuadtree. Does not need params
		this.edgesQuadtree = new CanvasQuadtree<Edge>();
	}
	this.edgesQuadtree.clear();
	for (const edge of canvas.edges.values()) {
		let rect = (edge as Edge).bounds;
		// Make sure rects have a positive width and height, as the Rectangle.covers check only works for positive values
		if (rect.width < 0 || rect.height < 0) {
			rect = rect.clone();
			if (rect.width < 0) {
				rect.x = rect.x + rect.width;
				rect.width = -rect.width;
			}
			if (rect.height < 0) {
				rect.y = rect.y + rect.height;
				rect.height = -rect.height;
			}
		}
		this.edgesQuadtree.insert({ r: rect, t: edge, n: new Set() });
	}
};

const edgesInBounds = function edgesInBounds(this: CanvasEdgesWithQuadtree, rect: PIXI.Rectangle): Iterable<Edge> {
	if (!this.edgesQuadtree) {
		this.refresh();
	}
	const edgesInBounds = this.edgesQuadtree.getObjects(rect);
	// always add canvas outer bounds edges. Clockwise sweep needs the
	// bounding vertices to work
	[
		this.get('outerBoundsTop'),
		this.get('outerBoundsRight'),
		this.get('outerBoundsBottom'),
		this.get('outerBoundsLeft'),
	].forEach((canvasEdge) => {
		if (canvasEdge) {
			edgesInBounds.add(canvasEdge);
		}
	});
	return edgesInBounds;
};

const identifyEdges = function identifyEdges(this: ClockwiseSweepPolygon) {
	const bounds = ((this.config as any).boundingBox = this._defineBoundingBox());
	const edgeTypes = (this as any)._determineEdgeTypes();
	for (const edge of (canvas.edges as CanvasEdgesWithQuadtree).edgesInBounds(bounds)) {
		if (this._testEdgeInclusion(edge, edgeTypes, bounds)) {
			this.edges.add(edge.clone());
		}
	}
};

export let enableFasterEdgeTesting = function enableFasterEdgeTesting() {
	const enabled = getSetting(SETTINGS.TokenBarsCaching);

	if (!enabled) {
		return;
	}
	(foundry.canvas.edges.CanvasEdges.prototype as any).edgesInBounds = edgesInBounds;
	libWrapper.register('fvtt-perf-optim', 'foundry.canvas.edges.CanvasEdges.prototype.refresh', refreshEdges, 'WRAPPER');
	libWrapper.register(
		'fvtt-perf-optim',
		'foundry.canvas.edges.CanvasEdges.prototype.initialize',
		initializeCanvasEdges,
		'WRAPPER',
	);
	libWrapper.register('fvtt-perf-optim', 'ClockwiseSweepPolygon.prototype._identifyEdges', identifyEdges, 'OVERRIDE');
};

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		if (!newModule) {
			return;
		}
		enableFasterEdgeTesting = newModule.enableFasterEdgeTesting;
		libWrapper.unregister('fvtt-perf-optim', 'foundry.canvas.edges.CanvasEdges.prototype.refresh', false);
		libWrapper.unregister('fvtt-perf-optim', 'foundry.canvas.edges.CanvasEdges.prototype.initialize', false);
		libWrapper.unregister('fvtt-perf-optim', 'ClockwiseSweepPolygon.prototype._identifyEdges', false);
		enableFasterEdgeTesting();
		canvas.edges.refresh();
	});
}
