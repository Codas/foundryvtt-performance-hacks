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

const FBM_TEXTURE_DATA: Record<string, NoiseTextureData> = {
	'fbm(2)_5_10': {
		path: `modules/${NAMESPACE}/dist/noise/fbm2-1_2.basis`,
		format: PIXI.FORMATS.RG,
	},
	'fbm(3)_1_3_5': {
		path: `modules/${NAMESPACE}/dist/noise/fbm3-1_3_5.avif`,
		format: PIXI.FORMATS.RGB,
	},
	'fbm(4)_1_6_8': {
		path: `modules/${NAMESPACE}/dist/noise/fbm4-1_6_8.avif`,
		format: PIXI.FORMATS.RGB,
	},
	'fbmHQ(3)_1_10': {
		path: `modules/${NAMESPACE}/dist/noise/fbmHQ3-1_10.basis`,
		format: PIXI.FORMATS.RED,
	},
};

// TODO remove me, this is just for debugging!
// for (const [key, value] of Object.entries(FBM_TEXTURE_DATA)) {
// 	FBM_TEXTURE_DATA[key].path = `${value.path}?v=${Math.random()}`;
// }

const NOISE_TEXTURE_MAP: Record<string, NoiseTextureData> = {
	ghost: FBM_TEXTURE_DATA['fbm(3)_1_3_5'],
	fairy: FBM_TEXTURE_DATA['fbm(3)_1_3_5'],
	witchwave: FBM_TEXTURE_DATA['fbm(4)_1_6_8'],
	fog: FBM_TEXTURE_DATA['fbm(4)_1_6_8'],
	vortex: FBM_TEXTURE_DATA['fbm(4)_1_6_8'],
	smokepatch: FBM_TEXTURE_DATA['fbmHQ(3)_1_10'],
	hole: FBM_TEXTURE_DATA['fbmHQ(3)_1_10'],
	dome: FBM_TEXTURE_DATA['fbm(2)_5_10'],
	roiling: FBM_TEXTURE_DATA['fbm(3)_1_3_5'],
};

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

function optimizedFBM() {
	return `

uniform sampler2D fbmTexture;
float fbmLQ(in float factor, in float channel, in vec2 uv) {
  vec4 fbmColor = texture2D(fbmTexture, uv * 0.1 / factor );
  if (channel < 1.5)  {
    return fbmColor.r;
  } else if (channel < 2.5) {
   return fbmColor.g;
  } else {
   return fbmColor.b;
  }
}
float fbmLQ(in float factor, in float channel, in vec2 uv, in float ignored_smoothness) {
  return fbmLQ(factor, channel, uv) * 1.5;
}
`;
}

function patchShaderFBM() {
	const getShaderByName = (name: string) => {
		return FOUNDRY_API.generation < 13 ? eval(name) : foundry.canvas.rendering.shaders[name];
	};
	const fbm21 = getShaderByName('GhostLightColorationShader').FBM(2, 1);
	const fbm31 = getShaderByName('GhostLightColorationShader').FBM(3, 1);
	const fbm41 = getShaderByName('GhostLightColorationShader').FBM(4, 1);
	const fbmHQ3 = getShaderByName('GhostLightColorationShader').FBMHQ(3);

	const shaders = [
		{
			shader: 'GhostLightIlluminationShader',
			replacements: [
				[fbm31, fbm31 + optimizedFBM()],
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 5.0 - time * 0.50),',
					'fbmLQ(5.0, 3.0, vUvs * 5.0 - time * 0.50),',
				],
				[
					// wrap-line

					'fbm((-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));',
				],
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 5.0 - time * 0.50),',
					'fbmLQ(5.0, 3.0, -vUvs * 5.0 - time * 0.50),',
				],
				[
					// wrap-line

					'fbm((-vUvs + vec2(0.01)) * 5.0 + time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs + vec2(0.01)) * 5.0 + time * INVTHREE)));',
				],
			],
		},
		{
			shader: 'GhostLightColorationShader',
			replacements: [
				[fbm31, fbm31 + optimizedFBM()],
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 3.0 + time * 0.50),',
					'fbmLQ(3.0, 2.0, vUvs * 3.0 + time * 0.50),',
				],
				[
					'fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
				],
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 3.0 + time * 0.50),',
					'fbmLQ(3.0, 2.0, -vUvs * 3.0 + time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
					'fbmLQ(5.0, 3.0,(-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
				],
				[
					// wrap-line
					'uv *= fbm(vec2(time + distortion1, time + distortion2));',
					'uv *= fbmLQ(1.0, 1.0, vec2(time + distortion1, time + distortion2));',
				],
			],
		},

		{
			shader: 'FairyLightIlluminationShader',
			replacements: [
				[fbm31, fbm31 + optimizedFBM()],
				// distortion 1
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 3.0 - time * 0.50), ',
					'fbmLQ(3.0, 2.0, vUvs * 3.0 - time * 0.50),',
				],
				[
					'fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
				],
				// distortion 2
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 3.0 - time * 0.50),',
					'fbmLQ(3.0, 2.0, -vUvs * 3.0 - time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
				],
			],
		},
		{
			shader: 'FairyLightColorationShader',
			replacements: [
				[fbm31, fbm31 + optimizedFBM()],
				// distortion 1
				[
					// wrap-line
					'float distortion1 = fbm(vec2(',
					'float distortion1 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(vUvs * 3.0 + time * 0.50),',
					'fbmLQ(3.0, 2.0, vUvs * 3.0 + time * 0.50),',
				],
				[
					'fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));',
				],
				// distortion 2
				[
					// wrap-line
					'float distortion2 = fbm(vec2(',
					'float distortion2 = fbmLQ(1.0, 1.0, vec2(',
				],
				[
					// wrap-line
					'fbm(-vUvs * 3.0 + time * 0.50),',
					'fbmLQ(3.0, 2.0, -vUvs * 3.0 + time * 0.50),',
				],
				[
					// wrap-line
					'fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
					'fbmLQ(5.0, 3.0, (-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));',
				],
				// final FBM
				[
					// wrap-line
					'uv *= fbm(vec2(time + distortion1, time + distortion2));',
					'uv *= fbmLQ(1.0, 1.0, vec2(time + distortion1, time + distortion2));',
				],
			],
		},

		{
			shader: 'BewitchingWaveIlluminationShader',
			replacements: [
				[fbm41, fbm41 + optimizedFBM()],
				[
					// wrap-line
					'float motion = fbm(uv + time * 0.25);',
					'float motion = fbmLQ(1.0, 1.0, uv + time * 0.25);',
				],
			],
		},
		{
			shader: 'BewitchingWaveColorationShader',
			replacements: [
				[fbm41, fbm41 + optimizedFBM()],
				[
					// wrap-line
					'float motion = fbm(uv + time * 0.25);',
					'float motion = fbmLQ(1.0, 1.0, uv + time * 0.25);',
				],
			],
		},

		{
			shader: 'FogColorationShader',
			replacements: [
				[fbm41, fbm41 + optimizedFBM()],
				[
					// wrap-line
					'float q = fbm(p - time * 0.1);',
					'float q = fbmLQ(8.0, 3.0, p - time * 0.1);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q - time * 0.5 - p.x - p.y),',
					'vec2 r = vec2(fbmLQ(1.0, 1.0, p + q - time * 0.5 - p.x - p.y),',
				],
				[
					// wrap-line
					'fbm(p + q - time * 0.3));',
					'fbmLQ(8.0, 3.0, p + q - time * 0.3));',
				],
				[
					// wrap-line
					'fbm(p + r)) + mix(c3, c4, r.x)',
					'fbmLQ(8.0, 3.0, p + r)) + mix(c3, c4, r.x)',
				],
			],
		},

		{
			shader: 'VortexIlluminationShader',
			replacements: [
				[fbm41, fbm41 + optimizedFBM()],
				[
					// wrap-line
					'float q = fbm(p + time);',
					'float q = fbmLQ(6.0, 1.0, p + time);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), fbm(p + q + time * 0.6));',
					'vec2 r = vec2(fbmLQ(1.0, 1.0, p + q + time * 0.9 - p.x - p.y), fbmLQ(6.0, 2.0, p + q + time * 0.6));',
				],
				[
					// wrap-line
					'return mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);',
					'return mix(c1, c2, fbmLQ(6.0, 2.0, p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);',
				],
			],
		},
		{
			shader: 'VortexColorationShader',
			replacements: [
				[fbm41, fbm41 + optimizedFBM()],
				[
					// wrap-line
					'float q = fbm(p + time);',
					'float q = fbmLQ(6.0, 2.0, p + time);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), ',
					'vec2 r = vec2(fbmLQ(1.0, 1.0, p + q + time * 0.9 - p.x - p.y), ',
				],
				[
					// wrap-line
					'fbm(p + q + time * 0.6));',
					'fbmLQ(6.0, 2.0, p + q + time * 0.6));',
				],
				[
					// wrap-line
					'fbm(p + r)) + mix(c3, c4, r.x) ',
					'fbmLQ(6.0, 2.0, p + r)) + mix(c3, c4, r.x) ',
				],
			],
		},

		{
			shader: 'SmokePatchIlluminationShader',
			replacements: [
				[fbmHQ3, fbmHQ3 + optimizedFBM()],
				[
					// wrap-line
					'max(fbm(uv + t, 1.0),',
					'max(fbmLQ(1.0, 1.0, uv + t, 1.0),',
				],
				[
					// wrap-line
					'fbm(uv - t, 1.0)),',
					'fbmLQ(1.0, 1.0, uv - t, 1.0)),',
				],
			],
		},
		{
			shader: 'SmokePatchColorationShader',
			replacements: [
				[fbmHQ3, fbmHQ3 + optimizedFBM()],
				[
					// wrap-line
					'max(fbm(uv + t, 1.0),',
					'max(fbmLQ(10.0, 1.0, uv + t, 1.0),',
				],
				[
					// wrap-line
					'fbm(uv - t, 1.0)),',
					'fbmLQ(10.0, 1.0, uv - t, 1.0)),',
				],
			],
		},

		{
			shader: 'BlackHoleDarknessShader',
			replacements: [
				[fbmHQ3, fbmHQ3 + optimizedFBM()],
				[
					// wrap-line
					'float beams = fract(angle + sin(dist * 30.0 * (intensity * 0.2) - time + fbm(uv * 10.0 + time * 0.25, 1.0) * dad));',
					'float beams = fract(angle + sin(dist * 30.0 * (intensity * 0.2) - time + fbmLQ(10.0, 1.0, uv * 10.0 + time * 0.25, 1.0) * dad));',
				],
			],
		},

		{
			shader: 'LightDomeColorationShader',
			replacements: [
				[fbm21, fbm21 + optimizedFBM()],
				[
					// wrap-line
					'float q = 2.0 * fbm(p + time * 0.2);',
					'float q = 2.0 * fbmLQ(1.0, 1.0, p + time * 0.2);',
				],
				[
					// wrap-line
					'vec2 r = vec2(fbm(p + q + ( time  ) - p.x - p.y), fbm(p * 2.0 + ( time )));',
					'vec2 r = vec2(fbmLQ(1.0, 1.0, p + q + ( time  ) - p.x - p.y), fbmLQ(2.0, 2.0, p * 2.0 + ( time )));',
				],
				[
					// wrap-line
					'return clamp( mix( c1, c2, abs(fbm(p + r)) ) + mix( c3, c4, abs(r.x * r.x * r.x) ) - mix(',
					'return clamp( mix( c1, c2, fbmLQ(1.0, 1.0, p + r) ) + mix( c3, c4, abs(r.x * r.x * r.x) ) - mix(',
				],
			],
		},

		{
			shader: 'RoilingDarknessShader',
			replacements: [
				[fbm31, fbm31 + optimizedFBM()],
				[
					// wrap-line
					`float distortion1 = fbm( vec2(`,
					`float distortion1 = fbmLQ(1.0, 1.0, vec2(`,
				],
				[
					// wrap-line
					`fbm( vUvs * 2.5 + time * 0.5),`,
					`fbmLQ(3.0, 2.0, vUvs * 2.5 + time * 0.5),`,
				],
				[
					// wrap-line
					`fbm( (-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));`,
					`fbmLQ(5.0, 3.0, (-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));`,
				],

				[
					// wrap-line
					`float distortion2 = fbm( vec2(`,
					`float distortion2 = fbmLQ(1.0, 1.0, vec2(`,
				],
				[
					// wrap-line
					`fbm( -vUvs * 5.0 + time * 0.5),`,
					`fbmLQ(5.0, 3.0, -vUvs * 5.0 + time * 0.5),`,
				],
				[
					// wrap-line
					`fbm( (vUvs + vec2(0.01)) * 2.5 + time * INVTHREE)));`,
					`fbmLQ(3.0, 2.0, (vUvs + vec2(0.01)) * 2.5 + time * INVTHREE)));`,
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
		}),
	);
}

export { enablePrecomputedNoiseTextures };
