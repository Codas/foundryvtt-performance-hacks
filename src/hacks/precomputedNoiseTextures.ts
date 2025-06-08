import type BaseLightSource from 'foundry-pf2e-types/foundry/client-esm/canvas/sources/base-light-source.js';
import { NAMESPACE } from 'src/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';
import { registerWrapperForVersion } from 'src/utils/registerWrapper.ts';

interface NoiseTextureData {
	path: string;
	format: PIXI.FORMATS;
}

const FBM_TEXTURE_DATA = {
	'fbm2+3': {
		path: `modules/${NAMESPACE}/dist/noise/fbm2_3.avif`,
		format: PIXI.FORMATS.RGB,
	},
	fbm4: {
		path: `modules/${NAMESPACE}/dist/noise/fbm4.avif`,
		format: PIXI.FORMATS.RG,
	},
	fbmHQ3: {
		path: `modules/${NAMESPACE}/dist/noise/fbmHQ3.basis`,
		format: PIXI.FORMATS.RG,
	},
};

// TODO remove me, this is just for debugging!
// for (const [key, value] of Object.entries(FBM_TEXTURE_DATA)) {
// 	FBM_TEXTURE_DATA[key].path = `${value.path}?v=${Math.random()}`;
// }

export const NOISE_TEXTURE_MAP = {
	ghost: FBM_TEXTURE_DATA['fbm2+3'],
	fairy: FBM_TEXTURE_DATA['fbm2+3'],
	witchwave: FBM_TEXTURE_DATA.fbm4,
	fog: FBM_TEXTURE_DATA.fbm4,
	vortex: FBM_TEXTURE_DATA.fbm4,
	smokepatch: FBM_TEXTURE_DATA.fbmHQ3,
	hole: FBM_TEXTURE_DATA.fbmHQ3,
	dome: FBM_TEXTURE_DATA['fbm2+3'],
	roiling: FBM_TEXTURE_DATA['fbm2+3'],
} satisfies Record<string, NoiseTextureData>;

const NOISE_TEXTURE_URLS = Array.from(new Set(Object.values(NOISE_TEXTURE_MAP)));

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

interface FBMData {
	scale: number;
	channel: 'r' | 'g' | 'b' | 'a';
	boost?: number;
	name?: string;
}
function optimizedFBM(...fbmData: FBMData[]) {
	const functions = fbmData
		.map(({ channel, scale, name, boost = 1 }) => {
			const boostCalculation = boost === 1 ? '' : ` * ${boost}`;
			const scaleRec = 1 / 5 / scale;
			return `
float fbm${name}(in vec2 uv) {
  vec4 color = texture2D(fbmTexture, uv * ${scaleRec.toPrecision(4)});
  return color.${channel}${boostCalculation};
}
float fbm${name}(in vec2 uv, in float ignoredSmoothness) {
  return fbm${name}(uv);
}
		`;
		})
		.join('\n');
	return `uniform sampler2D fbmTexture;\n${functions}`;
}

function patchShaderFBM() {
	const getShaderByName = (name: string) => {
		return FOUNDRY_API.generation < 13 ? eval(name) : foundry.canvas.rendering.shaders[name];
	};
	const fbm2 = getShaderByName('GhostLightColorationShader').FBM(2, 1);
	const fbm3 = getShaderByName('GhostLightColorationShader').FBM(3, 1);
	const fbm4 = getShaderByName('GhostLightColorationShader').FBM(4, 1);
	const fbmHQ3 = getShaderByName('GhostLightColorationShader').FBMHQ(3);

	const optimizedFBM2 = optimizedFBM({ name: '2', channel: 'r', scale: 1.6 });
	const optimizedFBM3 = optimizedFBM({ name: '3_1', channel: 'g', scale: 1 }, { name: '3_5', channel: 'b', scale: 5 });
	const optimizedFBM4 = optimizedFBM({ name: '4_1', channel: 'r', scale: 1 }, { name: '4_8', channel: 'g', scale: 8 });
	const optimizedFBMHQ3 = optimizedFBM(
		{ name: 'HQ3_1', channel: 'r', scale: 1 },
		{ name: 'HQ3_10', channel: 'g', scale: 5 },
	);

	const shaders = [
		{
			shader: 'GhostLightIlluminationShader',
			replacements: [
				[fbm3, fbm3 + optimizedFBM3],
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = 1.2 * fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 5.0 - time * 0.50),',
					'fbm3_5(vUvs * 5.0 - time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));',
					'fbm3_5((-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));',
				],
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = 1.2 * fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 5.0 - time * 0.50),',
					'fbm3_5(-vUvs * 5.0 - time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(0.01)) * 5.0 + time * INVTHREE)));',
					'fbm3_5((-vUvs + vec2(0.01)) * 5.0 + time * INVTHREE)));',
				],
			],
		},
		{
			shader: 'GhostLightColorationShader',
			replacements: [
				[fbm3, fbm3 + optimizedFBM3],
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = 1.2 * fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 3.0 + time * 0.50),',
					'fbm3_5(vUvs * 3.0 + time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
					'fbm3_5((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
				],
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = 1.2 * fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 3.0 + time * 0.50),',
					'fbm3_5(-vUvs * 3.0 + time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
					'fbm3_5((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
				],
				[
					// wrap-line
					'uv *= fbm(vec2(time + distortion1, time + distortion2));',
					'uv *= fbm3_1(vec2(time + distortion1, time + distortion2));',
				],
			],
		},

		{
			shader: 'FairyLightIlluminationShader',
			replacements: [
				[fbm3, fbm3 + optimizedFBM3],
				// distortion 1
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 3.0 - time * 0.50), ',
					'fbm3_5(vUvs * 3.0 - time * 0.50),',
				],
				['fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));', 'fbm3_5((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));'],
				// distortion 2
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 3.0 - time * 0.50),',
					'fbm3_5(-vUvs * 3.0 - time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
					'fbm3_5((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
				],
			],
		},
		{
			shader: 'FairyLightColorationShader',
			replacements: [
				[fbm3, fbm3 + optimizedFBM3],
				// distortion 1
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 3.0 + time * 0.50),',
					'fbm3_5(vUvs * 3.0 + time * 0.50),',
				],
				['fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));', 'fbm3_5((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));'],
				// distortion 2
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = fbm3_1(vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 3.0 + time * 0.50),',
					'fbm3_5(-vUvs * 3.0 + time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
					'fbm3_5((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
				],
				// final FBM
				[
					// wrap-line
					'uv *= fbm(vec2(time + distortion1, time + distortion2));',
					'uv *= fbm3_1(vec2(time + distortion1, time + distortion2));',
				],
			],
		},

		{
			shader: 'BewitchingWaveIlluminationShader',
			replacements: [
				[fbm4, fbm4 + optimizedFBM4],
				[
					// wrap-line
					'float motion = fbm(uv + time * 0.25);',
					'float motion = fbm4_1(uv + time * 0.25);',
				],
			],
		},
		{
			shader: 'BewitchingWaveColorationShader',
			replacements: [
				[fbm4, fbm4 + optimizedFBM4],
				[
					// wrap-line
					'float motion = fbm(uv + time * 0.25);',
					'float motion = fbm4_1(uv + time * 0.25);',
				],
			],
		},

		{
			shader: 'FogColorationShader',
			replacements: [
				[fbm4, fbm4 + optimizedFBM4],
				[
					// wrap-line
					'float q = fbm(p - time * 0.1);',
					'float q = fbm4_8(p - time * 0.1);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q - time * 0.5 - p.x - p.y),',
					'vec2 r = vec2(fbm4_8(p + q - time * 0.5 - p.x - p.y),',
				],
				[
					// wrap-line
					'fbm(p + q - time * 0.3));',
					'fbm4_8(p + q - time * 0.3));',
				],
				[
					// wrap-line
					'fbm(p + r)) + mix(c3, c4, r.x)',
					'fbm4_8(p + r)) + mix(c3, c4, r.x)',
				],
			],
		},

		{
			shader: 'VortexIlluminationShader',
			replacements: [
				[fbm4, fbm4 + optimizedFBM4],
				[
					// wrap-line
					'float q = fbm(p + time);',
					'float q = fbm4_8(p + time);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), fbm(p + q + time * 0.6));',
					'vec2 r = vec2(fbm4_8(p + q + time * 0.9 - p.x - p.y), fbm4_8(p + q + time * 0.6));',
				],
				[
					// wrap-line
					'return mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);',
					'return mix(c1, c2, fbm4_8(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);',
				],
			],
		},
		{
			shader: 'VortexColorationShader',
			replacements: [
				[fbm4, fbm4 + optimizedFBM4],
				[
					// wrap-line
					'float q = fbm(p + time);',
					'float q = fbm4_8(p + time);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), ',
					'vec2 r = vec2(fbm4_1(p + q + time * 0.9 - p.x - p.y), ',
				],
				[
					// wrap-line
					'fbm(p + q + time * 0.6));',
					'fbm4_8(p + q + time * 0.6));',
				],
				[
					// wrap-line
					'fbm(p + r)) + mix(c3, c4, r.x) ',
					'fbm4_8(p + r)) + mix(c3, c4, r.x) ',
				],
			],
		},

		{
			shader: 'SmokePatchIlluminationShader',
			replacements: [
				[fbmHQ3, fbmHQ3 + optimizedFBMHQ3],
				[
					// wrap-line
					'max(fbm(uv + t, 1.0),',
					'max(fbmHQ3_1(uv + t, 1.0),',
				],
				[
					// wrap-line
					'fbm(uv - t, 1.0)),',
					'fbmHQ3_1(uv - t, 1.0)),',
				],
			],
		},
		{
			shader: 'SmokePatchColorationShader',
			replacements: [
				[fbmHQ3, fbmHQ3 + optimizedFBMHQ3],
				[
					// wrap-line
					'max(fbm(uv + t, 1.0),',
					'max(fbmHQ3_1(uv + t, 1.0),',
				],
				[
					// wrap-line
					'fbm(uv - t, 1.0)),',
					'fbmHQ3_1(uv - t, 1.0)),',
				],
			],
		},

		{
			shader: 'BlackHoleDarknessShader',
			replacements: [
				[fbmHQ3, fbmHQ3 + optimizedFBMHQ3],
				[
					// wrap-line
					'float beams = fract(angle + sin(dist * 30.0 * (intensity * 0.2) - time + fbm(uv * 10.0 + time * 0.25, 1.0) * dad));',
					'float beams = fract(angle + sin(dist * 30.0 * (intensity * 0.2) - time + fbmHQ3_10(uv * 10.0 + time * 0.25, 1.0) * dad));',
				],
			],
		},

		{
			shader: 'LightDomeColorationShader',
			replacements: [
				[fbm2, fbm2 + optimizedFBM2],
				[
					// wrap-line
					'float q = 2.0 * fbm(p + time * 0.2);',
					'float q = 2.0 * fbm2(p + time * 0.2);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q + ( time  ) - p.x - p.y), fbm(p * 2.0 + ( time )));',
					'vec2 r = vec2(fbm2(p + q + ( time  ) - p.x - p.y), fbm2(p * 2.0 + ( time )));',
				],
				[
					// wrap-line
					'return clamp( mix( c1, c2, abs(fbm(p + r)) ) + mix( c3, c4, abs(r.x * r.x * r.x) ) - mix(',
					'return clamp( mix( c1, c2, fbm2(p + r) ) + mix( c3, c4, abs(r.x * r.x * r.x) ) - mix(',
				],
			],
		},

		{
			shader: 'RoilingDarknessShader',
			replacements: [
				[fbm3, fbm3 + optimizedFBM3],
				[
					// wrap-line
					`float distortion1 = fbm( vec2(`,
					`float distortion1 = fbm3_1(vec2(`,
				],
				[
					// wrap-line
					`fbm( vUvs * 2.5 + time * 0.5),`,
					`fbm3_5(vUvs * 2.5 + time * 0.5),`,
				],
				[
					// wrap-line
					`fbm( (-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));`,
					`fbm3_5((-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));`,
				],

				[
					// wrap-line
					`float distortion2 = fbm( vec2(`,
					`float distortion2 = fbm3_1(vec2(`,
				],
				[
					// wrap-line
					`fbm( -vUvs * 5.0 + time * 0.5),`,
					`fbm3_5(-vUvs * 5.0 + time * 0.5),`,
				],
				[
					// wrap-line
					`fbm( (vUvs + vec2(0.01)) * 2.5 + time * INVTHREE)));`,
					`fbm3_5((vUvs + vec2(0.01)) * 2.5 + time * INVTHREE)));`,
				],
			],
		},
	];
	for (const { shader, replacements } of shaders) {
		const ShaderClass = getShaderByName(shader);
		for (const [search, replace] of replacements) {
			ShaderClass.fragmentShader = ShaderClass.fragmentShader.replace(search, replace);
		}
	}
}

async function enablePrecomputedNoiseTextures() {
	const enabled = getSetting(SETTINGS.PrecomputedNoiseTextures);

	if (!enabled) {
		return;
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
