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

// #endregion

// ============================================================================
// #region MapLocationControlIcon draw / refresh
//
// Stock dnd5e's MapLocationControlIcon.renderMarker is called every refresh and actually adds
// children every time. We fix this by splitting everything up into draw and refresh as it should
// be.

function MapLocationControlIcon_draw(this: any, wrapped: (...args: any[]) => Promise<any>, ...args: any[]) {
	return Promise.resolve(wrapped(...args)).then(() => {
		if (this.shadow && !(this.shadow instanceof foundry.canvas.containers.QuadMesh)) {
			const idx = this.getChildIndex(this.shadow)
			this.removeChild(this.shadow)
			// Placeholder geometry; _refresh sets the real position/scale/uniforms.
			this.shadow = this.addChildAt(buildShadowMesh(0, 0, 1, 2, this.style.shadowColor, 0.25), idx)
		}
	})
}

function MapLocationControlIcon_refresh(this: any) {
	this.radius = this.size / 2
	this.circle = [this.radius, this.radius, this.radius + 8]
	this.backgroundColor = this.style.backgroundColor
	this._borderColor = this.style.borderHoverColor

	this.eventMode = 'static'
	this.interactiveChildren = false
	this.hitArea = new PIXI.Circle(...this.circle)
	this.cursor = 'pointer'

	// Shadow mesh
	const innerR = this.radius + 8
	const outerR = innerR + 40
	const cx = this.radius + 8
	const cy = this.radius + 8
	this.shadow.shader.uniforms.innerRadius = innerR
	this.shadow.shader.uniforms.outerRadius = outerR
	this.shadow.position.set(cx - outerR, cy - outerR)
	this.shadow.scale.set(outerR * 2, outerR * 2)

	// 3D extrude effect
	this.extrude
		.clear()
		.beginFill(this.style.borderColor, 1.0)
		.drawCircle(this.radius + 2, this.radius + 2, this.radius + 9)
		.endFill()

	// Background
	this.bg
		.clear()
		.beginFill(this.backgroundColor, 1.0)
		.lineStyle(2, this.style.borderColor, 1.0)
		.drawCircle(...this.circle)
		.endFill()

	// Text
	this.text.text = this.code
	this.text.style = this._getTextStyle(this.code.length, this.size)
	this.text.position.set(this.radius, this.radius)

	// Note5e._drawControlIcon offsets the icon by (-iconSize/2, -iconSize/2) once at
	// creation so the bg drawn at (radius, radius) lands on the note's world position.
	// That offset is never updated on resize, so we keep it in sync here.
	this.x = -this.radius
	this.y = -this.radius

	foundry.canvas.interaction.MouseInteractionManager.emulateMoveEvent()

	// Re-apply bitmap caching if enabled.
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
		'game.system.canvas.MapLocationControlIcon.prototype._draw',
		MapLocationControlIcon_draw,
		'WRAPPER',
	)
	libWrapper.register(
		NAMESPACE,
		'game.system.canvas.MapLocationControlIcon.prototype._refresh',
		MapLocationControlIcon_refresh,
		'OVERRIDE',
	)
}

function unregisterDnD5eOptimizations() {
	if (!isEnabled) {
		return
	}
	isEnabled = false
	libWrapper.unregister(NAMESPACE, 'game.system.canvas.MapLocationControlIcon.prototype._draw')
	libWrapper.unregister(NAMESPACE, 'game.system.canvas.MapLocationControlIcon.prototype._refresh')
}

function enableDnD5eOptimizations() {
	if (!getSetting(SETTINGS.DnD5eOptimizations) || !FOUNDRY_API.hasCanvas) {
		return
	}

	registerDnD5eOptimizations()
}

export { enableDnD5eOptimizations, registerDnD5eOptimizations, unregisterDnD5eOptimizations }
