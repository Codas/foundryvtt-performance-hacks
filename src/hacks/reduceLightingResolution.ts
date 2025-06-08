import type { RENDER_SCALE_DEFAULTS } from 'src/settings/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
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
		const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
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
