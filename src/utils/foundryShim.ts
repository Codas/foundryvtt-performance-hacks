import type { SpriteMesh } from '@7h3laughingman/foundry-types/client/canvas/containers/_module.mjs'

export type ShaderName =
	| 'AbstractBaseShader'
	| 'AbstractDarknessLevelRegionShader'
	| 'AbstractWeatherShader'
	| 'AdaptiveBackgroundShader'
	| 'AdaptiveColorationShader'
	| 'AdaptiveDarknessShader'
	| 'AdaptiveIlluminationShader'
	| 'AdaptiveLightingShader'
	| 'AdaptiveVisionShader'
	| 'AdjustDarknessLevelRegionShader'
	| 'AmplificationBackgroundVisionShader'
	| 'AmplificationSamplerShader'
	| 'BackgroundVisionShader'
	| 'BaseSamplerShader'
	| 'BaselineIlluminationSamplerShader'
	| 'BewitchingWaveColorationShader'
	| 'BewitchingWaveIlluminationShader'
	| 'BlackHoleDarknessShader'
	| 'ChromaColorationShader'
	| 'ColorAdjustmentsSamplerShader'
	| 'ColorationVisionShader'
	| 'ColorizeBrightnessShader'
	| 'DashLineShader'
	| 'DenseSmokeDarknessShader'
	| 'DepthSamplerShader'
	| 'EmanationColorationShader'
	| 'EnergyFieldColorationShader'
	| 'FairyLightColorationShader'
	| 'FairyLightIlluminationShader'
	| 'FlameColorationShader'
	| 'FlameIlluminationShader'
	| 'FogColorationShader'
	| 'FogSamplerShader'
	| 'FogShader'
	| 'ForceGridColorationShader'
	| 'GhostLightColorationShader'
	| 'GhostLightIlluminationShader'
	| 'GridShader'
	| 'HexaDomeColorationShader'
	| 'HighlightRegionShader'
	| 'IlluminationDarknessLevelRegionShader'
	| 'IlluminationVisionShader'
	| 'LightDomeColorationShader'
	| 'MagicalGloomDarknessShader'
	| 'OccludableSamplerShader'
	| 'PrimaryBaseSamplerShader'
	| 'PulseColorationShader'
	| 'PulseIlluminationShader'
	| 'RadialRainbowColorationShader'
	| 'RainShader'
	| 'RegionShader'
	| 'RevolvingColorationShader'
	| 'RoilingDarknessShader'
	| 'SirenColorationShader'
	| 'SirenIlluminationShader'
	| 'SmokePatchColorationShader'
	| 'SmokePatchIlluminationShader'
	| 'SnowShader'
	| 'StarLightColorationShader'
	| 'SunburstColorationShader'
	| 'SunburstIlluminationShader'
	| 'SwirlingRainbowColorationShader'
	| 'TokenRingSamplerShader'
	| 'TorchColorationShader'
	| 'TorchIlluminationShader'
	| 'VortexColorationShader'
	| 'VortexIlluminationShader'
	| 'WaveBackgroundVisionShader'
	| 'WaveColorationShader'
	| 'WaveColorationVisionShader'
	| 'WaveIlluminationShader'
	| 'WeatherShaderEffect'
	| 'types'

export const FOUNDRY_API = {
	loadTexture: (src: string) => foundry.canvas.loadTexture(src),
	getTexture: (src: string) => foundry.canvas.getTexture(src),
	createSpriteMesh: (texture: PIXI.Texture): SpriteMesh => new foundry.canvas.containers.SpriteMesh(texture),
	get game() {
		return foundry.game ?? game
	},
	get generation(): number {
		return game.release.generation
	},
	get hasCanvas(): boolean {
		return !game.settings.get('core', 'noCanvas')
	},

	getShaderByName: <T extends typeof AbstractBaseShader = typeof AbstractBaseShader>(name: string): T => {
		return foundry.canvas.rendering.shaders[name] as T
	},
}
