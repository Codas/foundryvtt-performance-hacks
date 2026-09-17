import { NAMESPACE } from 'src/constants.ts'
import { managedIcons } from 'src/hacks/controlIconCaching.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'

import radialGradientShadowFrag from './shaders/radialGradientShadow.frag'

// ============================================================================
// #region Radial gradient shadow mesh

/**
 * Custom shader subclass for custom gradient-based drop shadow.
 */
class RadialGradientShadowShaderClass extends foundry.canvas.rendering.shaders.AbstractBaseShader {
	static override vertexShader = `
		precision mediump float;
		attribute vec2 aVertexPosition;
		varying vec2 vTextureCoord;
		uniform mat3 projectionMatrix;
		uniform mat3 translationMatrix;
		void main(void) {
			vTextureCoord = aVertexPosition;
			gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
		}
	`

	// TODO v15: move to _createFragmentShader
	static override fragmentShader = radialGradientShadowFrag

	static override defaultUniforms: Record<string, unknown> = {
		innerRadius: 0,
		outerRadius: 1,
		shadowColor: [0, 0, 0],
		peakAlpha: 0.2,
	}
}

function buildShadowMesh(
	cx: number,
	cy: number,
	innerRadius: number,
	outerRadius: number,
	shadowColor: number,
	peakAlpha: number,
): any {
	const r = ((shadowColor >> 16) & 0xff) / 255
	const g = ((shadowColor >> 8) & 0xff) / 255
	const b = (shadowColor & 0xff) / 255

	const mesh = new foundry.canvas.containers.QuadMesh(RadialGradientShadowShaderClass)
	mesh.shader.uniforms.innerRadius = innerRadius
	mesh.shader.uniforms.outerRadius = outerRadius
	mesh.shader.uniforms.shadowColor = [r, g, b]
	mesh.shader.uniforms.peakAlpha = peakAlpha
	mesh.blendMode = PIXI.BLEND_MODES.NORMAL

	mesh.position.set(cx - outerRadius, cy - outerRadius)
	mesh.scale.set(outerRadius * 2, outerRadius * 2)

	// shadow.clear is called in control icon reset code
	mesh.clear = () => {}

	return mesh
}

function updateShadowMesh(mesh: any, cx: number, cy: number, innerRadius: number, outerRadius: number) {
	mesh.shader.uniforms.innerRadius = innerRadius
	mesh.shader.uniforms.outerRadius = outerRadius
	mesh.position.set(cx - outerRadius, cy - outerRadius)
	mesh.scale.set(outerRadius * 2, outerRadius * 2)
}

function withControlIconCaching(container: PIXI.Container, callback: () => void) {
	if (!getSetting(SETTINGS.ControlIconCaching)) {
		callback()
		return
	}

	container.cacheAsBitmap = false
	callback()
	container.cacheAsBitmapResolution = getBitmapCacheResolution()
	container.cacheAsBitmap = true
	managedIcons.add(container)
}

// #endregion

// ============================================================================
// #region MapLocationControlIcon renderMarker (DnD5e < 6.0 on FVTT v13)

function MapLocationControlIcon_renderMarker(this: any, wrapped: (...args: any[]) => void, ...args: any[]) {
	withControlIconCaching(this, () => {
		this.removeChildren()
		wrapped(...args)
		this.removeChild(this.shadow)

		const _cx = this.radius + 8
		const _cy = this.radius + 8
		const _innerR = this.radius + 8
		const _outerR = _innerR + 40
		this.shadow = this.addChildAt(buildShadowMesh(_cx, _cy, _innerR, _outerR, this.style.shadowColor, 0.25), 0)

		if (game.release.generation >= 14) {
			this.x = -this.radius
			this.y = -this.radius
		}
	})
}

// #endregion

// ============================================================================
// #region MapLocationControlIcon _refresh (DnD5e 6.0+ on FVTT v14)
//
// In dnd5e 6.0+, MapLocationControlIcon extends ControlIcon and implements
// _refresh() instead of renderMarker(). The stock _refresh uses a plain
// PIXI.Graphics with BlurFilter(16) as the drop shadow, which prevents bitmap
// caching because pixi v7 cannot cache containers that have filters in their
// subtree. We replace the stock shadow with our gradient QuadMesh shader which
// has no filters, and then apply bitmap caching.

function MapLocationControlIcon__refresh(this: any, wrapped: (...args: any[]) => void, ...args: any[]) {
	// Disable the stock blur-filter shadow before wrapped() runs so that
	// hasFiltersInSubtree (in controlIconCaching.ts) does not detect a filter.
	if (this.shadow && !(this.shadow instanceof foundry.canvas.containers.QuadMesh)) {
		this.shadow.filters = null
		this.shadow.visible = false
	}

	wrapped(...args)

	// After stock _refresh: install or update our gradient shadow mesh.
	const innerR = this.radius + 8
	const outerR = innerR + 40
	const cx = this.radius + 8
	const cy = this.radius + 8

	if (this._ppShadow instanceof foundry.canvas.containers.QuadMesh) {
		updateShadowMesh(this._ppShadow, cx, cy, innerR, outerR)
	} else {
		// Insert gradient shadow behind everything else (index 0).
		this._ppShadow = this.addChildAt(buildShadowMesh(cx, cy, innerR, outerR, this.style.shadowColor, 0.25), 0)
	}

	// Re-apply correct position offset (stock _refresh on v14 doesn't do this).
	this.x = -this.radius
	this.y = -this.radius

	// Apply bitmap caching (withControlIconCaching runs callback inline here).
	if (getSetting(SETTINGS.ControlIconCaching)) {
		this.cacheAsBitmap = false
		this.cacheAsBitmapResolution = getBitmapCacheResolution()
		this.cacheAsBitmap = true
		managedIcons.add(this)
	}
}

// #endregion

// ============================================================================
// #region Enable / disable

let isEnabled = false

// Track which wrapper path we actually registered, so we can unregister it cleanly.
let registeredPath: string | null = null

function registerDnD5eOptimizations() {
	if (isEnabled) {
		return
	}
	const IconClass = game.system?.canvas?.MapLocationControlIcon
	if (typeof IconClass !== 'function') {
		return
	}

	try {
		if (typeof IconClass.prototype.renderMarker === 'function') {
			// dnd5e < 6.0 (FVTT v13 era): wrap renderMarker
			const path = 'game.system.canvas.MapLocationControlIcon.prototype.renderMarker'
			libWrapper.register(NAMESPACE, path, MapLocationControlIcon_renderMarker, 'WRAPPER')
			registeredPath = path
		} else if (typeof IconClass.prototype._refresh === 'function') {
			// dnd5e 6.0+ (FVTT v14 era): wrap _refresh
			const path = 'game.system.canvas.MapLocationControlIcon.prototype._refresh'
			libWrapper.register(NAMESPACE, path, MapLocationControlIcon__refresh, 'WRAPPER')
			registeredPath = path
		} else {
			// No known method to wrap; do nothing so module stays functional.
			console.warn(
				'[PrimePerformance] dnd5eOptimizations: MapLocationControlIcon has no known wrappable method (renderMarker or _refresh). Skipping.',
			)
			return
		}
		isEnabled = true
	} catch (err) {
		// Log but never let this crash the setup hook.
		console.error('[PrimePerformance] dnd5eOptimizations: failed to register wrapper:', err)
	}
}

function unregisterDnD5eOptimizations() {
	if (!isEnabled || !registeredPath) {
		return
	}
	isEnabled = false
	try {
		libWrapper.unregister(NAMESPACE, registeredPath)
	} catch (err) {
		console.warn('[PrimePerformance] dnd5eOptimizations: failed to unregister wrapper:', err)
	}
	registeredPath = null
}

function enableDnD5eOptimizations() {
	if (!getSetting(SETTINGS.DnD5eOptimizations) || !FOUNDRY_API.hasCanvas) {
		return
	}

	registerDnD5eOptimizations()
}

export { enableDnD5eOptimizations, registerDnD5eOptimizations, unregisterDnD5eOptimizations }
