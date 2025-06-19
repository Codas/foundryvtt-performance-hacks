import type BaseLightSource from 'foundry-pf2e-types/foundry/client-esm/canvas/sources/base-light-source.js';
import { NAMESPACE } from 'src/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API, type ShaderName } from 'src/utils/foundryShim.ts';
import { type ShaderModificationData, patchShader } from 'src/utils/patchShader.ts';
import { registerWrapperForVersion } from 'src/utils/registerWrapper.ts';

interface NoiseTextureData {
	path: string;
	format: PIXI.FORMATS;
}

const FBM_TEXTURE_DATA = {
	noise: {
		path: `modules/${NAMESPACE}/dist/noise/tiling-noise.png`,
		format: PIXI.FORMATS.RED,
	},
};

export const NOISE_TEXTURE_MAP = {
	ghost: FBM_TEXTURE_DATA.noise,
	fairy: FBM_TEXTURE_DATA.noise,
	witchwave: FBM_TEXTURE_DATA.noise,
	fog: FBM_TEXTURE_DATA.noise,
	vortex: FBM_TEXTURE_DATA.noise,
	smokepatch: FBM_TEXTURE_DATA.noise,
	hole: FBM_TEXTURE_DATA.noise,
	dome: FBM_TEXTURE_DATA.noise,
	roiling: FBM_TEXTURE_DATA.noise,
	starlight: FBM_TEXTURE_DATA.noise,
	flame: FBM_TEXTURE_DATA.noise,
	magicalGloom: FBM_TEXTURE_DATA.noise,
} satisfies Record<string, NoiseTextureData>;

const NOISE_TEXTURE_URLS = Array.from(new Set(Object.values(NOISE_TEXTURE_MAP)));

interface ShaderPatches {
	shader: ShaderName;
	replacements: ShaderModificationData;
}

function AdaptiveLightingShader__updateCommonUniforms(
	this: BaseLightSource<any>,
	wrapped: (...args: any) => void,
	shader: any,
) {
	wrapped(shader);
	const u = shader.uniforms;
	const animationType: string | undefined = this.animation?.type;
	if (!animationType) {
		return;
	}
	const noiseTextureData = NOISE_TEXTURE_MAP[animationType];
	if (!noiseTextureData) {
		return;
	}
	u.fbmTexture = FOUNDRY_API.getTexture(noiseTextureData.path);
}

function AdaptiveLightingShader__updateDarknessUniforms(this: BaseLightSource<any>, wrapped: (...args: any) => void) {
	wrapped();
	const u = this.layers.darkness?.shader?.uniforms;
	const animationType: string | undefined = this.animation?.type;
	if (!animationType) {
		return;
	}
	const noiseTextureData = NOISE_TEXTURE_MAP[animationType];
	if (!noiseTextureData) {
		return;
	}
	u.fbmTexture = FOUNDRY_API.getTexture(noiseTextureData.path);
}

function getOptimizedNoise(period: number) {
	const periodFloat = (1 / period).toFixed(2);
	return `
	uniform sampler2D fbmTexture;
	float noise(in vec2 uv) {
		vec4 color = texture2D(fbmTexture, uv * ${periodFloat});
		return color.r;
	}
	`;
}

function patchShaderFBM() {
	const noise = FOUNDRY_API.getShaderByName('GhostLightIlluminationShader').NOISE;
	const optimizedNoise = getOptimizedNoise(12);

	const shaders = [
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
	] as const;
	const shaderPatchData = shaders.map((shaderName) => ({
		shader: shaderName,
		replacements: {
			fragment: [[noise, optimizedNoise]],
		},
	})) satisfies ShaderPatches[];
	for (const { shader, replacements } of shaderPatchData) {
		patchShader(shader, replacements);
	}
}

async function enablePrecomputedNoiseTextures() {
	const enabled = getSetting(SETTINGS.PrecomputedNoiseTextures);

	if (!enabled || !FOUNDRY_API.hasCanvas) {
		return;
	}

	// make sure basis transcoder is enabled (it is by default in v13+)
	if (FOUNDRY_API.generation < 13) {
		CONFIG.Canvas.transcoders.basis = true;
	}

	registerWrapperForVersion(AdaptiveLightingShader__updateCommonUniforms, 'WRAPPER', {
		v12: 'foundry.canvas.sources.BaseLightSource.prototype._updateCommonUniforms',
		v13: 'foundry.canvas.sources.BaseLightSource.prototype._updateCommonUniforms',
	});
	registerWrapperForVersion(AdaptiveLightingShader__updateDarknessUniforms, 'WRAPPER', {
		v12: 'foundry.canvas.sources.PointDarknessSource.prototype._updateDarknessUniforms',
		v13: 'foundry.canvas.sources.PointDarknessSource.prototype._updateDarknessUniforms',
	});

	patchShaderFBM();

	Hooks.on('canvasInit', () => {
		for (const noiseTextureData of NOISE_TEXTURE_URLS) {
			canvas.sceneTextures[noiseTextureData.path] = noiseTextureData;
		}
	});

	await Promise.all(
		NOISE_TEXTURE_URLS.map(async ({ path, format }) => {
			const texture = await PIXI.Assets.load(path);
			if (!(texture instanceof PIXI.Texture)) {
				return;
			}
			texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
			texture.baseTexture.format = format;
			texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
			texture.baseTexture.alphaMode = PIXI.ALPHA_MODES.NPM;
			texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
		}),
	);
}

export { enablePrecomputedNoiseTextures };
