import { NAMESPACE } from 'src/constants.ts'
import { RENDER_SCALE_DEFAULTS, SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'

function getCurrentRendererResolution() {
	const renderer = canvas.app.renderer
	const renderTextureSystem = (renderer as PIXI.Renderer & { renderTexture?: { current?: { resolution?: number } } })
		.renderTexture
	return renderTextureSystem.current?.resolution ?? renderer.resolution
}

function getCustomRenderScale() {
	let customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale)

	if (Array.isArray(customRenderScale)) {
		game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, RENDER_SCALE_DEFAULTS)
		customRenderScale = RENDER_SCALE_DEFAULTS
	}

	return customRenderScale
}

function configureLayerFilterResolution(filter: PIXI.Filter | undefined, scaleKey: keyof typeof RENDER_SCALE_DEFAULTS) {
	if (!filter) {
		return
	}

	if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
		filter.resolution = null
		return
	}

	Object.defineProperty(filter, 'resolution', {
		get() {
			const scale = getCustomRenderScale()?.[scaleKey]
			if (scale === undefined) {
				return null
			}
			return getCurrentRendererResolution() * (scale / 100)
		},
		set(_value) {},
		configurable: true,
	})
}

function makeDrawWrapper(
	scaleKey: keyof typeof RENDER_SCALE_DEFAULTS,
	getFilter: (layer: object) => PIXI.Filter | undefined,
) {
	return async function (this: object, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
		const result = await wrapped(...args)
		configureLayerFilterResolution(getFilter(this), scaleKey)
		return result
	}
}

const LAYER_WRAPPERS = [
	{
		path: 'foundry.canvas.layers.CanvasIlluminationEffects.prototype._draw',
		fn: makeDrawWrapper('illumination', (l) => l.filter),
	},
	{
		path: 'foundry.canvas.layers.CanvasColorationEffects.prototype._draw',
		fn: makeDrawWrapper('coloration', (l) => l.filter),
	},
	{
		path: 'foundry.canvas.layers.CanvasDarknessEffects.prototype._draw',
		fn: makeDrawWrapper('darkness', (l) => l.filter),
	},
	{
		path: 'foundry.canvas.layers.CanvasBackgroundAlterationEffects.prototype._draw',
		fn: makeDrawWrapper('background', (l) => l.lighting?.filter),
	},
] as const

let wrappersRegistered = false

function registerLightingWrappers() {
	if (!FOUNDRY_API.hasCanvas) {
		return
	}
	if (wrappersRegistered) {
		return
	}
	for (const { path, fn } of LAYER_WRAPPERS) {
		libWrapper.register(NAMESPACE, path, fn, 'WRAPPER')
	}
	wrappersRegistered = true
}

function unregisterLightingWrappers() {
	if (!wrappersRegistered) {
		return
	}
	for (const { path } of LAYER_WRAPPERS) {
		libWrapper.unregister(NAMESPACE, path)
	}
	wrappersRegistered = false
}

async function enableReducedLightingResolution() {
	if (!getSetting(SETTINGS.ReduceLightingResolution)) {
		return
	}

	registerLightingWrappers()
}

function redrawLightingEffects() {
	if (!FOUNDRY_API.hasCanvas) {
		return
	}

	void canvas?.effects?.background?.draw()
	void canvas?.effects?.illumination?.draw()
	void canvas?.effects?.coloration?.draw()
	void canvas?.effects?.darkness?.draw()
}

export { enableReducedLightingResolution, redrawLightingEffects, registerLightingWrappers, unregisterLightingWrappers }
