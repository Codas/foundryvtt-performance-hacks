import {
	applyPatcherToShaderClass,
	NOISE_SHADER_REPLACEMENTS,
	NOISE_TEXTURES,
} from 'src/hacks/precomputedNoiseTextures.ts'
import {
	type NoiseTextureSpec,
	type NoiseTextureSpec3D,
	ShaderPatcher,
	type ShaderReplacementMap,
	ShaderTextureGenerator,
	ShaderTextureGenerator3D,
} from 'src/utils/shaderTextureGenerator.ts'
import { generateAtlas3D } from './3d-textures/generateAtlas3D.ts'

import snoise3dAtlasGenFrag from './3d-textures/shaders/snoise3dAtlasGen.frag'
import voronoi3dAtlasGenFrag from './3d-textures/shaders/voronoi3dAtlasGen.frag'
import genVoronoiFrag from './noiseShaders/genVoronoi.frag'
import genVoronoiPower16Frag from './noiseShaders/genVoronoiPower16.frag'
import fbm3Frag from './shaders/fbm3.frag'
import fnoiseSamplerFrag from './shaders/fnoiseSampler.frag'
import magicalPlatformOptimizedFrag from './shaders/magicalPlattformOptimized.frag'
import motesGlitterFusedVoronoiFrag from './shaders/motesGlitterFusedVoronoi.frag'
import motesGlitterMaskEarlyOutFrag from './shaders/motesGlitterMaskEarlyOut.frag'
import regionWeatherOptimizedFrag from './shaders/regionWeatherOptimized.frag'
import snoise3DFrag from './shaders/snoise3d.frag'
import starfieldOptimizedFrag from './shaders/starfieldOptimized.frag'
import visibilityFilterFbm2Frag from './shaders/visibilityFilterFbm2.frag'
import voronoiFrag from './shaders/voronoi.frag'
import voronoi3DFrag from './shaders/voronoi3d.frag'
import voronoiPower16Frag from './shaders/voronoiPower16Optimized.frag'

// ============================================================================
// #region Ember noise textures

const EMBER_NOISE_TEXTURES = {
	// R=val.x, G=val.y, B=minDist (clamped [0,1]).
	voronoi: {
		fragment: genVoronoiFrag,
		width: 1024,
		height: 1024,
		format: PIXI.FORMATS.RGB,
		wrapMode: PIXI.WRAP_MODES.REPEAT,
		scaleMode: PIXI.SCALE_MODES.LINEAR,
	},
	voronoiPower16: {
		fragment: genVoronoiPower16Frag,
		width: 512,
		height: 512,
		format: PIXI.FORMATS.RED,
		wrapMode: PIXI.WRAP_MODES.REPEAT,
		scaleMode: PIXI.SCALE_MODES.LINEAR,
	},
} satisfies Record<string, NoiseTextureSpec>

const ALL_NOISE_TEXTURES = { ...NOISE_TEXTURES, ...EMBER_NOISE_TEXTURES }

// ============================================================================
// #region Ember 3D noise textures

const EMBER_NOISE_TEXTURES_3D = {
	snoiseAtlas3D: {
		fragment: snoise3dAtlasGenFrag,
		width: 160,
		height: 160,
		depth: 10,
		format: PIXI.FORMATS.RGBA,
		wrapMode: PIXI.WRAP_MODES.CLAMP,
		wrapModeR: PIXI.WRAP_MODES.CLAMP,
		scaleMode: PIXI.SCALE_MODES.LINEAR,
		generator: (gl: WebGL2RenderingContext, spec: NoiseTextureSpec3D) =>
			generateAtlas3D(gl, {
				width: spec.width,
				height: spec.height,
				depth: spec.depth,
				fragSrc: spec.fragment,
				label: 'snoise-3d',
			}),
	} satisfies NoiseTextureSpec3D,
	voronoiAtlas3D: {
		fragment: voronoi3dAtlasGenFrag,
		width: 514,
		height: 514,
		depth: 64,
		format: PIXI.FORMATS.RGBA,
		wrapMode: PIXI.WRAP_MODES.CLAMP,
		wrapModeR: PIXI.WRAP_MODES.REPEAT,
		scaleMode: PIXI.SCALE_MODES.LINEAR,
		generator: (gl: WebGL2RenderingContext, spec: NoiseTextureSpec3D) =>
			generateAtlas3D(gl, {
				width: spec.width,
				height: spec.height,
				depth: spec.depth,
				fragSrc: spec.fragment,
				wrapR: gl.REPEAT,
				label: 'voronoi-3d',
			}),
	} satisfies NoiseTextureSpec3D,
} satisfies Record<string, NoiseTextureSpec3D>

type AllTextureKey = keyof typeof ALL_NOISE_TEXTURES | keyof typeof EMBER_NOISE_TEXTURES_3D

export const emberNoiseTextureGenerator = new ShaderTextureGenerator(
	ALL_NOISE_TEXTURES,
) as ShaderTextureGenerator<AllTextureKey>
export const emberNoiseTextureGenerator3D = new ShaderTextureGenerator3D(
	EMBER_NOISE_TEXTURES_3D,
) as ShaderTextureGenerator3D<AllTextureKey>

// #endregion

// ============================================================================
// #region Shader replacements

const FNOISE_REGEX = /float fnoise\(in vec2 coords\)[\s\S]*?\}/
const SNOISE_REGEX = /float snoise\(in vec3 P(, in vec3 rep)?\)[\s\S]*?\}/
const VORONOI_REGEX = /vec3 voronoi\(in vec2 uv, out float intensity\)[\s\S]*?return result;\s*}/
const VORONOI_RW_REGEX = /vec3 voronoi\(in vec2 uv, in float t, in float zd\)[\s\S]*?return vor;\s*\}/
const VORONOI_POWER16_REGEX = /float voronoiPower16\(in vec2 point\)[\s\S]*?return pow\(1.0 \/ res, 1.0 \/ 16.0\);\s*}/
const MOTES_LAYERS_REGEX = /vec4 motesLayers\(vec2 coord, float time\)[\s\S]*?return color \* mask;\s*\}/
const MOTES_VORONOI_CIRCLES_REGEX =
	/vec2 voronoiCircles\(in vec2 coord, in float freq, in float time, in float radiusScale\)[\s\S]*?return vec2\(0\.0, -2\.0\);\s*\}/
const FBM_REGEX = /float fbm\(in vec2 uv, in float smoothness\)[\s\S]*?return \w;\s*\}/
// Visibility filter's fbm — no smoothness param, accumulates into r, 4 octaves with scale*=0.1.
const FBM_2OCT_REGEX = /float fbm\(in vec2 uv\)[\s\S]*?return r;\s*\}/

export const EMBER_SHADER_REPLACEMENTS = {
	...NOISE_SHADER_REPLACEMENTS,
	fnoise: {
		textures: ['noise'],
		regex: FNOISE_REGEX,
		optimizedShader: fnoiseSamplerFrag.trim(),
		samplerNames: { noise: 'noiseTexture' },
	},
	snoise: {
		textures: ['snoiseAtlas3D'],
		textures3D: ['snoiseAtlas3D'],
		regex: SNOISE_REGEX,
		optimizedShader: snoise3DFrag.trim(),
		samplerNames: { snoiseAtlas3D: 'snoiseAtlas3D' },
	},
	voronoi: {
		textures: ['voronoi'],
		regex: VORONOI_REGEX,
		optimizedShader: voronoiFrag.trim(),
		samplerNames: { voronoi: 'voronoiTexture' },
	},
	voronoiRw: {
		textures: ['voronoiAtlas3D'],
		textures3D: ['voronoiAtlas3D'],
		regex: VORONOI_RW_REGEX,
		optimizedShader: voronoi3DFrag.trim(),
		samplerNames: { voronoiAtlas3D: 'voronoiAtlas3D' },
	},
	voronoiPower16: {
		textures: ['voronoiPower16'],
		regex: VORONOI_POWER16_REGEX,
		optimizedShader: voronoiPower16Frag.trim(),
		samplerNames: { voronoiPower16: 'voronoiP16Texture' },
	},
	motesVoronoiCircles: {
		regex: MOTES_VORONOI_CIRCLES_REGEX,
		optimizedShader: motesGlitterFusedVoronoiFrag.trim(),
	},
	motesLayers: {
		regex: MOTES_LAYERS_REGEX,
		optimizedShader: motesGlitterMaskEarlyOutFrag.trim(),
	},
	magicalPlatform: {
		textures: ['noise', 'snoiseAtlas3D', 'voronoiPower16'],
		optimizedShader: magicalPlatformOptimizedFrag,
		samplerNames: {
			noise: 'noiseTexture',
			snoiseAtlas3D: 'snoiseAtlas3D',
			voronoiPower16: 'voronoiP16Texture',
		},
	},
	regionWeather: {
		textures: ['snoiseAtlas3D', 'voronoiAtlas3D'],
		optimizedShader: regionWeatherOptimizedFrag,
		samplerNames: {
			snoiseAtlas3D: 'snoiseAtlas3D',
			voronoiAtlas3D: 'voronoiAtlas3D',
		},
	},
	starfield: {
		optimizedShader: starfieldOptimizedFrag,
	},
	// Replace fbm with 3-octave fbm. Only for fbm shaders with smoothness param
	fbm3: {
		regex: FBM_REGEX,
		optimizedShader: fbm3Frag.trim(),
		autoApply: false,
	},
	// Replace Visibility filter fbm with 2-octave fbm;
	fbm2VF: {
		regex: FBM_2OCT_REGEX,
		optimizedShader: visibilityFilterFbm2Frag.trim(),
		autoApply: false,
	},
} satisfies ShaderReplacementMap<AllTextureKey>

export type EmberReplacementKey = keyof typeof EMBER_SHADER_REPLACEMENTS

// #endregion

// ============================================================================
// #region Make EmberPatcher

export function makeEmberPatcher(ShaderClass: any, source?: string) {
	return new ShaderPatcher<AllTextureKey, EmberReplacementKey>(
		emberNoiseTextureGenerator,
		EMBER_SHADER_REPLACEMENTS,
		ShaderClass,
		source,
		emberNoiseTextureGenerator3D,
	)
}

// #endregion

// ============================================================================
// #region Apply patcherToShaderClass
export { applyPatcherToShaderClass }

// #endregion

// ============================================================================
// #region Generate EmberTextures

export function generateEmberTextures(renderer: PIXI.Renderer): void {
	emberNoiseTextureGenerator.generate(renderer)
	emberNoiseTextureGenerator3D.generate(renderer)
}

// #endregion
