import { NAMESPACE } from 'src/constants.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import {
	type NoiseTextureSpec,
	ShaderPatcher,
	type ShaderReplacementMap,
	ShaderTextureGenerator,
} from 'src/utils/shaderTextureGenerator.ts'

import genNoiseFrag from 'src/hacks/noiseShaders/genNoise.frag'
import noiseSamplerFrag from 'src/hacks/shaders/noiseSampler.frag'

// ============================================================================
// #region Noise textures

export const NOISE_TEXTURES = {
	noise: {
		fragment: genNoiseFrag,
		width: 128,
		height: 128,
		format: PIXI.FORMATS.RED,
		wrapMode: PIXI.WRAP_MODES.REPEAT,
		scaleMode: PIXI.SCALE_MODES.LINEAR,
	},
} satisfies Record<string, NoiseTextureSpec>

export type NoiseTextureKey = keyof typeof NOISE_TEXTURES

export const noiseTextureGenerator = new ShaderTextureGenerator(NOISE_TEXTURES)

// #endregion

// ============================================================================
// #region Noise shader replacements

const NOISE_REGEX = /float noise\(in vec2 uv\)[\s\S]*?\}/

export const NOISE_SHADER_REPLACEMENTS = {
	noise: {
		textures: ['noise'],
		regex: NOISE_REGEX,
		optimizedShader: noiseSamplerFrag.trim(),
		samplerNames: { noise: 'noiseTexture' },
	},
} satisfies ShaderReplacementMap<NoiseTextureKey>

export type NoiseReplacementKey = keyof typeof NOISE_SHADER_REPLACEMENTS

// #endregion

// ============================================================================
// #region Apply patcherToShaderClass

export function applyPatcherToShaderClass(
	ShaderClass: any,
	patcher: ShaderPatcher<any, any>,
	source: string,
	gl?: WebGL2RenderingContext,
): string {
	const patched = patcher.apply()

	if (patcher.applied.length === 0) {
		return source
	}

	if (ShaderClass.defaultUniforms && gl) {
		patcher.patchUniforms(ShaderClass.defaultUniforms, gl)
	}

	const origPreRender = ShaderClass.prototype._preRender
	ShaderClass.prototype._preRender = function (this: any, ...args: any[]) {
		origPreRender?.call(this, ...args)
		const context = (this.renderer?.gl ?? (canvas.app?.renderer as PIXI.Renderer | undefined)?.gl) as
			| WebGL2RenderingContext
			| undefined
		patcher.patchUniforms(this.uniforms, context)
	}

	return patched
}

// #endregion

// ============================================================================
// #region Patched shader names

const PATCHED_SHADER_NAMES = [
	'GhostLightIlluminationShader',
	'GhostLightColorationShader',
	'FairyLightIlluminationShader',
	'FairyLightColorationShader',
	'BewitchingWaveIlluminationShader',
	'BewitchingWaveColorationShader',
	'FogColorationShader',
	'VortexIlluminationShader',
	'VortexColorationShader',
	'SmokePatchIlluminationShader',
	'SmokePatchColorationShader',
	'BlackHoleDarknessShader',
	'LightDomeColorationShader',
	'RoilingDarknessShader',
	'StarLightColorationShader',
	'FlameColorationShader',
	'MagicalGloomDarknessShader',
] as const

function makePatcher(ShaderClass: any, source?: string) {
	return new ShaderPatcher<NoiseTextureKey, NoiseReplacementKey>(
		noiseTextureGenerator,
		NOISE_SHADER_REPLACEMENTS,
		ShaderClass,
		source,
	)
}

function patchShadersV13(): void {
	for (const shaderName of PATCHED_SHADER_NAMES) {
		const ShaderClass = FOUNDRY_API.getShaderByName(shaderName)
		if (!ShaderClass) {
			console.warn(`[PrimePerformance] precomputedNoiseTextures: shader class not found: ${shaderName}`)
			continue
		}
		const source: string = ShaderClass.fragmentShader
		const patcher = makePatcher(ShaderClass, source)
		const patched = patcher.apply()
		patcher.patchUniforms(ShaderClass.defaultUniforms)
		ShaderClass.fragmentShader = patched

		libWrapper.register(
			NAMESPACE,
			`foundry.canvas.rendering.shaders.${shaderName}.prototype.update`,
			function (this: any, wrapped: (...args: any[]) => string, ...args: any[]): any {
				this.uniforms.noiseTexture = noiseTextureGenerator.getTexture('noise')
				return wrapped(...args)
			},
			'WRAPPER',
		)
	}
}

function patchShadersV14(): void {
	for (const shaderName of PATCHED_SHADER_NAMES) {
		const ShaderClass = FOUNDRY_API.getShaderByName(shaderName)
		if (!ShaderClass) {
			console.warn(`[PrimePerformance] precomputedNoiseTextures: shader class not found: ${shaderName}`)
			continue
		}

		const basePath = `foundry.canvas.rendering.shaders.${shaderName}`
		const patcher = makePatcher(ShaderClass)

		libWrapper.register(
			NAMESPACE,
			`${basePath}.prototype.update`,
			function (this: any, wrapped: (...args: any[]) => string, ...args: any[]): any {
				patcher.patchUniforms(this.uniforms)
				return wrapped(...args)
			},
			'WRAPPER',
		)
		libWrapper.register(
			NAMESPACE,
			`${basePath}._createFragmentShader`,
			function (this: any, wrapped: (...args: any[]) => string, ...args: any[]): string {
				const source = wrapped(...args)
				patcher.setSource(source)
				const patchedFragment = patcher.apply('noise')
				return patchedFragment
			},
			'WRAPPER',
		)
	}
}

// #endregion

// ============================================================================
// #region Enable PrecomputedNoiseTextures

export function enablePrecomputedNoiseTextures(): void {
	if (!getSetting(SETTINGS.PrecomputedNoiseTextures) || !FOUNDRY_API.hasCanvas) {
		return
	}

	Hooks.once('canvasInit', () => {
		const renderer = canvas.app?.renderer as PIXI.Renderer | undefined
		if (!renderer) {
			return
		}
		noiseTextureGenerator.generate(renderer)

		if (FOUNDRY_API.generation >= 14) {
			patchShadersV14()
		} else {
			patchShadersV13()
		}
	})
}

// #endregion
