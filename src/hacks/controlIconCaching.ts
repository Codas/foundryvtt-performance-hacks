import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'
import { registerWrapperForVersion, unregisterWrapperForVersion } from 'src/utils/registerWrapper.ts'

/**
 * ControlIcon Caching
 *
 * ControlIcon is a specialized PIXI.Container used by notes, lights, sounds, drawings...
 * to render an interactive icon on the canvas. A control icon typically contains
 * a PIXI graphics object for the border and background and a PIXI sprite for the icon
 * art. Rendering multiple control icons as they are implemented in core foundry is expensive
 * because PIXI cannot batch them.
 *
 * This hack wraps ControlIcon._refresh to toggle cacheAsBitmap around the
 * redraw, so that the static control icon is cached as a single texture for fast rendering
 * that is batchable with other sprites.
 *
 * The hover handlers are also wrapped to disable caching while hovered, so that the hover
 * state can correctly be computed.
 */

// ============================================================================
// #region Render wrapper

// Icons that currently have caching active, populated in _refresh.
export let managedIcons = new WeakSet<PIXI.Container>()

// Returns true if node or any transitive child has active filters.
// Entities with filters cannot be cached as bitmap in pixi v7
function hasFiltersInSubtree(node: PIXI.DisplayObject): boolean {
	if ((node as any).filters?.length) {
		return true
	}

	if (!(node instanceof PIXI.Container)) {
		return false
	}

	for (const child of node.children) {
		if (hasFiltersInSubtree(child)) {
			return true
		}
	}
	return false
}

function ControlIcon__refresh(this: PIXI.Container, wrapped: (...args: any[]) => void, ...args: any[]) {
	if (hasFiltersInSubtree(this)) {
		return wrapped(...args)
	}
	this.cacheAsBitmap = false
	wrapped(...args)
	this.cacheAsBitmapResolution = getBitmapCacheResolution()
	this.cacheAsBitmap = true
	managedIcons.add(this)
}

// #endregion

// ============================================================================
// #region Hover wrappers

function PlaceableObject__onHoverIn(this: any, wrapped: (...args: any[]) => void, ...args: any[]) {
	wrapped(...args)
	const icon = this.controlIcon
	if (icon instanceof PIXI.Container && managedIcons.has(icon)) {
		icon.cacheAsBitmap = false
	}
}

function PlaceableObject__onHoverOut(this: any, wrapped: (...args: any[]) => void, ...args: any[]) {
	wrapped(...args)
	const icon = this.controlIcon
	if (icon instanceof PIXI.Container && managedIcons.has(icon)) {
		icon.cacheAsBitmapResolution = getBitmapCacheResolution()
		icon.cacheAsBitmap = true
	}
}

// #endregion

// ============================================================================
// #region Enable / disable

const CONTROL_ICON_PATH = {
	v13: 'foundry.canvas.containers.ControlIcon.prototype._refresh',
}

const HOVER_IN_PATH = {
	v13: 'foundry.canvas.placeables.PlaceableObject.prototype._onHoverIn',
}

const HOVER_OUT_PATH = {
	v13: 'foundry.canvas.placeables.PlaceableObject.prototype._onHoverOut',
}

let isEnabled = false

function registerControlIconCaching() {
	if (isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = true
	registerWrapperForVersion(ControlIcon__refresh, 'WRAPPER', CONTROL_ICON_PATH)
	registerWrapperForVersion(PlaceableObject__onHoverIn, 'WRAPPER', HOVER_IN_PATH)
	registerWrapperForVersion(PlaceableObject__onHoverOut, 'WRAPPER', HOVER_OUT_PATH)
}

function unregisterControlIconCaching() {
	if (!isEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = false
	managedIcons = new WeakSet()
	unregisterWrapperForVersion(CONTROL_ICON_PATH)
	unregisterWrapperForVersion(HOVER_IN_PATH)
	unregisterWrapperForVersion(HOVER_OUT_PATH)

	if (!FOUNDRY_API.hasCanvas) {
		return
	}
	for (const layer of [canvas.lighting, canvas.sounds, canvas.notes, canvas.drawings]) {
		for (const placeable of layer.placeables) {
			const icon = placeable.controlIcon
			if (icon instanceof PIXI.Container) {
				icon.cacheAsBitmap = false
			}
		}
	}
}

function enableControlIconCaching() {
	if (!getSetting(SETTINGS.ControlIconCaching)) {
		return
	}

	registerControlIconCaching()
}

export { enableControlIconCaching, registerControlIconCaching, unregisterControlIconCaching }

// #endregion
