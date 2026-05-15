import { NAMESPACE } from 'src/constants.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import {
	applyPatcherToShaderClass,
	emberNoiseTextureGenerator,
	generateEmberTextures,
	makeEmberPatcher,
} from './emberNoiseTextures.ts'
import { applyPixi3DPatch } from './pixi3DPatch.ts'

// ============================================================================
// #region Patched shaders

const patchedShaders = new WeakSet<object>()

// #endregion

const NOISE_REGEX = /float noise\(in vec2 uv\)[\s\S]*?\}/

// ============================================================================
// #region Patch KaleidoscopeSamplerShader

function patchKaleidoscopeSamplerShader() {
	const ShaderClass = (globalThis as any).ember?.api?.canvas?.shaders?.KaleidoscopeSamplerShader
	if (!ShaderClass) {
		return
	}
	const source: string = ShaderClass._fragmentShader
	const patcher = makeEmberPatcher(ShaderClass, source)
	let patched = patcher.apply()
	patcher.setSource(patched)
	patched = patcher.apply('fbm3')
	if (patcher.applied.length > 0) {
		ShaderClass._fragmentShader = patched
		applyPatcherToShaderClass(ShaderClass, patcher, source)
	}
}

// #endregion

// ============================================================================
// #region Patch SimpleFragmentShaders

function patchSimpleFragmentShader(ShaderClass: any) {
	if (!ShaderClass) {
		return
	}
	const prop = '_fragmentShader' in ShaderClass ? '_fragmentShader' : 'fragmentShader'
	const source: string = ShaderClass[prop]
	const patcher = makeEmberPatcher(ShaderClass, source)
	const patched = applyPatcherToShaderClass(ShaderClass, patcher, source)
	ShaderClass[prop] = patched
}

function patchSimpleFragmentShaders() {
	const shaderNames = [
		'AquaticFilter',
		'BubblingWaterSamplerShader',
		'ColorBloomShader',
		'DistortionSamplerShader',
		'FogGeometryShader',
		'ForceFieldShader',
		'OceanSamplerShader',
		'TreeCanopySamplerShader',
	]

	const emberShaders = ((globalThis as any).ember?.api?.canvas?.shaders ?? {}) as Record<string, any>
	for (const name of shaderNames) {
		patchSimpleFragmentShader(emberShaders[name])
	}
}

// #endregion

// ============================================================================
// #region Patch MagicalPlatformShader

function patchMagicalPlatformShader() {
	const ShaderClass = (globalThis as any).ember?.api?.canvas?.shaders?.MagicalPlatformShader
	if (!ShaderClass) {
		return
	}
	const source: string = ShaderClass._fragmentShader
	const patcher = makeEmberPatcher(ShaderClass, source)
	const patched = patcher.apply('magicalPlatform')
	if (patcher.applied.length > 0) {
		ShaderClass._fragmentShader = patched
		applyPatcherToShaderClass(ShaderClass, patcher, source)
	}
}

// #endregion

// ============================================================================
// #region Patch StarfieldShader

function patchStarfieldShader() {
	const ShaderClass = (globalThis as any).ember?.scenes?.cosmos?.sprites?.VoidRepeating?.shader
	if (!ShaderClass) {
		return
	}
	const source: string = ShaderClass._fragmentShader
	const patcher = makeEmberPatcher(ShaderClass, source)
	const patched = patcher.apply('starfield')
	if (patcher.applied.length > 0) {
		ShaderClass._fragmentShader = patched
		applyPatcherToShaderClass(ShaderClass, patcher, source)
	}
}

// #endregion

// ============================================================================
// #region Patch QuadSourceColorationShader

function patchQuadSourceColorationShader() {
	const shaderClass = (globalThis as any).ember?.api?.canvas?.QuadLightSource?._layers?.coloration?.defaultShader
	if (!shaderClass || patchedShaders.has(shaderClass)) {
		return
	}
	patchedShaders.add(shaderClass)

	shaderClass.reservedTextureUnits = 4

	const fragmentShader = shaderClass._batchFragmentShader as string
	if (NOISE_REGEX.test(fragmentShader)) {
		const period = (1 / 12).toFixed(4)
		shaderClass._batchFragmentShader = fragmentShader.replace(
			NOISE_REGEX,
			`uniform sampler2D noiseTexture;\nfloat noise(in vec2 uv) {\n\tvec4 color = texture2D(noiseTexture, uv * ${period});\n\treturn color.r;\n}`,
		)
	}

	const originalDefaults = shaderClass.batchDefaultUniforms
	shaderClass.batchDefaultUniforms = function (this: any, maxTex: number) {
		const defaults = originalDefaults.call(this, maxTex)
		defaults.noiseTexture = maxTex + 3
		return defaults
	}

	const originalPreRenderBatch = shaderClass._preRenderBatch
	shaderClass._preRenderBatch = function (this: any, batchRenderer: any) {
		if (originalPreRenderBatch) {
			originalPreRenderBatch.call(this, batchRenderer)
		}
		const noiseTex = emberNoiseTextureGenerator.getTexture('noise')
		const uniforms = batchRenderer._shader?.uniforms
		if (noiseTex && uniforms) {
			batchRenderer.renderer.texture.bind(noiseTex, uniforms.noiseTexture)
		}
	}
}

// #endregion

// ============================================================================
// #region Patch RegionWeatherShader

function patchRegionWeatherShader() {
	const Manager = (globalThis as any).ember?.api?.canvas?.weather?.EmberRegionWeatherManager
	if (!Manager) {
		return
	}

	const proto = Manager.prototype
	const originalCreateMesh = proto._createFullscreenQuadMesh
	proto._createFullscreenQuadMesh = function (this: any, options: any) {
		const { shaderClass } = options
		if (shaderClass.name !== 'EmberRegionWeatherShader' || patchedShaders.has(shaderClass)) {
			return originalCreateMesh.call(this, options)
		}
		patchedShaders.add(shaderClass)

		const source: string = shaderClass._fragmentShader
		const patcher = makeEmberPatcher(shaderClass, source)
		const patched = patcher.apply('regionWeather')
		if (patcher.applied.length > 0) {
			shaderClass._fragmentShader = patched
			applyPatcherToShaderClass(shaderClass, patcher, source)
		}

		const mesh = originalCreateMesh.call(this, options)

		const ticker = canvas.app?.ticker
		if (mesh?.shader && ticker) {
			const u = mesh.shader.uniforms
			const updateWindTrig = () => {
				const angle: number = u.uWindAngle ?? 0
				u.uWindCos = Math.cos(angle)
				u.uWindSin = Math.sin(angle)
			}
			updateWindTrig()
			ticker.add(updateWindTrig)
			mesh.once?.('destroyed', () => ticker.remove(updateWindTrig))
		}

		return mesh
	}
}

// #endregion

// ============================================================================
// #region Patch WorldWeatherShader

function patchWorldWeatherShader() {
	const Manager = (globalThis as any).ember?.api?.canvas?.weather?.EmberWorldWeatherManager
	if (!Manager) {
		return
	}

	const proto = Manager.prototype
	const originalCreateMesh = proto._createFullscreenQuadMesh
	proto._createFullscreenQuadMesh = function (this: any, options: any) {
		const { shaderClass } = options
		if (shaderClass.name !== 'EmberWorldWeatherShader' || patchedShaders.has(shaderClass)) {
			return originalCreateMesh.call(this, options)
		}
		patchedShaders.add(shaderClass)

		const originalCreateFragment = shaderClass._createFragmentShader
		shaderClass._createFragmentShader = function (this: any) {
			const source: string = originalCreateFragment.call(this)
			const patcher = makeEmberPatcher(shaderClass, source)
			return applyPatcherToShaderClass(shaderClass, patcher, source)
		}

		return originalCreateMesh.call(this, options)
	}
}

// #endregion

// ============================================================================
// #region Patch VisibilityFilter

function patchVisibilityFilter() {
	const EmberVisibilityFilter = CONFIG.Canvas.visibilityFilter as any
	if (!EmberVisibilityFilter) {
		return
	}

	const originalFragmentShader = EmberVisibilityFilter.fragmentShader as (options: any) => string
	if (typeof originalFragmentShader !== 'function') {
		return
	}

	EmberVisibilityFilter.fragmentShader = function (options: any) {
		const source: string = originalFragmentShader.call(this, options)
		const patcher = makeEmberPatcher(EmberVisibilityFilter, source)
		return patcher.apply('fbm2VF', 'fnoise')
	}
}

// #endregion

// ============================================================================
// #region Patch PollenGlitterShader

function patchPollenGlitterShader() {
	const ShaderClass = (globalThis as any).ember?.api?.canvas?.shaders?.PollenGlitterGeometryShader
	if (!ShaderClass) {
		return
	}
	const source: string = ShaderClass._fragmentShader
	const patcher = makeEmberPatcher(ShaderClass, source)
	const patched = applyPatcherToShaderClass(ShaderClass, patcher, source)
	ShaderClass._fragmentShader = patched
}

// #endregion

// ============================================================================
// #region Register EmberNoiseHack

function registerEmberNoiseHack() {
	const emberModule = game.modules.get('ember')
	const isEmber = !!emberModule?.active

	if (!isEmber) {
		return
	}

	const emberEnabled = getSetting(SETTINGS.EmberShaderOptimizations)

	if (!emberEnabled || !FOUNDRY_API.hasCanvas) {
		return
	}

	// Warn if Ember version > 0.5.1 (only tested against that version)
	if (emberModule.version && foundry.utils.isNewerVersion(emberModule.version, '0.5.0')) {
		Hooks.once('ready', () => {
			ui.notifications?.warn(`${NAMESPACE}.settings.${SETTINGS.EmberShaderOptimizations}.emberVersionWarning`, {
				permanent: true,
				localize: true,
			})
		})
	}

	// apply pixi 3d textures hack
	applyPixi3DPatch()

	Hooks.once('canvasInit', () => {
		const renderer = canvas.app?.renderer as PIXI.Renderer | undefined
		if (!renderer) {
			console.error('[PrimePerformance] emberNoiseHacks: no renderer on canvasInit')
			return
		}
		// sync call to bake noise textures
		generateEmberTextures(renderer)

		patchKaleidoscopeSamplerShader()
		patchSimpleFragmentShaders()
		patchMagicalPlatformShader()
		patchStarfieldShader()
		patchQuadSourceColorationShader()
		patchRegionWeatherShader()
		patchWorldWeatherShader()
		patchPollenGlitterShader()
		patchVisibilityFilter()
	})
}

// #endregion

export { registerEmberNoiseHack }
