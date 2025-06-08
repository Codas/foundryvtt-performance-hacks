import { NAMESPACE } from 'src/constants.ts';
import { RENDER_SCALE_DEFAULTS, SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';

function setReducedResolution(filter: PIXI.Filter, scale: number | undefined) {
	if (!filter) {
		return;
	}

	if (scale === undefined) {
		filter.resolution = null;
		return;
	}
	filter.resolution = (canvas.app.renderer.resolution * scale) / 100;
}

async function enableReducedLightingResolution() {
	if (!FOUNDRY_API.hasCanvas) {
		return;
	}

	Hooks.on('canvasReady', () => {
		if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
			return;
		}
		let customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);

		// TODO: remove in some future version, this is a workaround for settings being initialized as an array
		// because I set the wrong default value in the settings file
		if (Array.isArray(customRenderScale)) {
			game.settings.set(NAMESPACE, SETTINGS.CustomRenderScale, RENDER_SCALE_DEFAULTS);
			customRenderScale = RENDER_SCALE_DEFAULTS;
		}

		configureEffectsResolution(customRenderScale);
	});
}

function configureEffectsResolution(customRenderScale: typeof RENDER_SCALE_DEFAULTS | null | undefined) {
	if (!FOUNDRY_API.hasCanvas) {
		return;
	}

	setReducedResolution(canvas?.effects?.background?.lighting?.filter, customRenderScale?.background);
	setReducedResolution(canvas?.effects?.illumination?.filter, customRenderScale?.illumination);
	setReducedResolution(canvas?.effects?.coloration?.filter, customRenderScale?.coloration);
	setReducedResolution(canvas?.effects?.darkness?.filter, customRenderScale?.darkness);
}

export { configureEffectsResolution, enableReducedLightingResolution };
