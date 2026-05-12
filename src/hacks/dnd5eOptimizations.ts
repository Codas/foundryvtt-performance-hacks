import { NAMESPACE } from 'src/constants.ts'
import { managedIcons } from 'src/hacks/controlIconCaching.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'

import radialGradientShadowFrag from 'src/hacks/shaders/radialGradientShadow.frag'

// ============================================================================
// #region Radial gradient shadow mesh

/**
 * Custom shader subclass for custom gradient-based drop shadow.
 */
class RadialGradientShadowShaderClass extends foundry.canvas.rendering.shaders.BaseSamplerShader {
	static override classPluginName = null

	static _createVertexShader() {
		return `
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
	}

	static _createFragmentShader() {
		return radialGradientShadowFrag
	}

	static override defaultUniforms = {
		...super.defaultUniforms,
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

function withControlIconCaching(container: PIXI.Container, callback: () => void) {
	if (!getSetting(SETTINGS.ControlIconCaching)) {
		callback()
	}

	container.cacheAsBitmap = false
	callback()
	container.cacheAsBitmapResolution = getBitmapCacheResolution()
	container.cacheAsBitmap = true
	managedIcons.add(container)
}

// #endregion

// ============================================================================
// #region MapLocationControlIcon renderMarker (DnD5e only)

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
	})
}

// #endregion

// ============================================================================
// #region Enable / disable

let isEnabled = false

function registerDnD5eOptimizations() {
	if (isEnabled) {
		return
	}
	if (typeof game.system?.canvas?.MapLocationControlIcon !== 'function') {
		return
	}
	isEnabled = true
	libWrapper.register(
		NAMESPACE,
		'game.system.canvas.MapLocationControlIcon.prototype.renderMarker',
		MapLocationControlIcon_renderMarker,
		'WRAPPER',
	)
}

function unregisterDnD5eOptimizations() {
	if (!isEnabled) {
		return
	}
	isEnabled = false
	libWrapper.unregister(NAMESPACE, 'game.system.canvas.MapLocationControlIcon.prototype.renderMarker')
}

function enableDnD5eOptimizations() {
	if (!getSetting(SETTINGS.DnD5eOptimizations) || !FOUNDRY_API.hasCanvas) {
		return
	}

	registerDnD5eOptimizations()
}

export { enableDnD5eOptimizations, registerDnD5eOptimizations, unregisterDnD5eOptimizations }
