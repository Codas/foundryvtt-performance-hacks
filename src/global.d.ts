import type { DynamicSpriteSheet } from './DynamicSpriteSheet.ts'

export type * from '@7h3laughingman/foundry-types'
export type * from '@7h3laughingman/foundry-types/client/canvas/_module.d.mts'

interface FvttPerfHacks {
	autoSpritesheetCache: DynamicSpriteSheet
}

declare global {
	interface Window {
		fvttPerfHacks: FvttPerfHacks
	}
}

// Add missing graphics container properties on Wall (not declared upstream)
declare module '@7h3laughingman/foundry-types/client/canvas/placeables/wall.mjs' {
	export default interface Wall {
		/** Graphics container for the wall line body. */
		line: PIXI.Graphics
		/** Graphics container for the two endpoint circles. */
		endpoints: PIXI.Graphics
	}
}

// Expose protected _updateBatchData as public so geometry fitting can patch it without casts.
declare module '@7h3laughingman/foundry-types/client/canvas/primary/primary-sprite-mesh.mjs' {
	export default interface PrimarySpriteMesh {
		_updateBatchData(): void
	}
}

// Fix incorrect upstream type: _s is an internal parameter and should be optional
declare module '@7h3laughingman/foundry-types/client/canvas/geometry/quad-tree.mjs' {
	import type { QuadtreeObject } from '@7h3laughingman/foundry-types/client/canvas/geometry/_types.mjs'
	import type Quadtree from '@7h3laughingman/foundry-types/client/canvas/geometry/quad-tree.mjs'

	interface FixedGetObjectsOptions<TObject extends object, TQuadtree extends Quadtree<TObject>> {
		collisionTest?: (obj: QuadtreeObject<TObject, TQuadtree>, rect: PIXI.Rectangle) => boolean
		_s?: Set<TObject>
	}

	// biome-ignore lint/suspicious/noRedeclare: need to redeclare to fix the type of the getObjects options
	export default interface Quadtree<TObject extends object> {
		getObjects(rect: PIXI.Rectangle, options?: FixedGetObjectsOptions<TObject, Quadtree<TObject>>): Set<TObject>
	}
}

// Allow importing .glsl files as strings (vite-plugin-glsl)
declare module '*.glsl' {
	const value: string
	export default value
}
