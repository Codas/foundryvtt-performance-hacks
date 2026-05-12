import { NAMESPACE } from 'src/constants.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'

/**
 * EmberGeometryMesh viewport culling.
 *
 * Some Ember effect meshes (e.g. PollenGlitterGeometryShader) cover large
 * scene regions and submit expensive draw calls every frame even when fully
 * outside the viewport. Somehow PIXIs own culling mechanism fails to cull these.
 */

function getVisibleWorldRect(): { x: number; y: number; width: number; height: number } | null {
	const stage = canvas?.stage
	const screen = canvas?.app?.renderer?.screen
	if (!stage || !screen) {
		return null
	}
	const t = stage.worldTransform
	const sx = stage.scale.x || 1
	const sy = stage.scale.y || 1
	return {
		x: -t.tx / sx,
		y: -t.ty / sy,
		width: screen.width / sx,
		height: screen.height / sy,
	}
}

function rectsIntersect(
	a: { x: number; y: number; width: number; height: number },
	b: { x: number; y: number; width: number; height: number },
): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function EmberGeometryMesh__render(this: any, wrapped: (renderer: PIXI.Renderer) => void, renderer: PIXI.Renderer) {
	const meshBounds = this._canvasBounds
	if (meshBounds && meshBounds.width > 0 && meshBounds.height > 0) {
		const view = getVisibleWorldRect()
		if (view && !rectsIntersect(meshBounds, view)) {
			return
		}
	}
	wrapped(renderer)
}

export function enableEmberMeshViewportCulling() {
	if (game.modules.get('ember')?.active) {
		return
	}
	if (!getSetting(SETTINGS.EmberShaderOptimizations)) {
		return
	}
	const MeshCls = (globalThis as any).ember?.api?.canvas?.EmberGeometryMesh
	if (!MeshCls?.prototype?._render) {
		return
	}

	libWrapper.register(
		NAMESPACE,
		'ember.api.canvas.EmberGeometryMesh.prototype._render',
		EmberGeometryMesh__render,
		'MIXED',
	)
}
