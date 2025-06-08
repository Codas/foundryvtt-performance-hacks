import type { RENDER_SCALE_DEFAULTS } from 'src/settings/constants.ts';
import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';

function CanvasBackgroundAlterationEffects__draw(this: any, wrapped: (...args: any) => void, ...args: any[]) {
	wrapped(...args);
	if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
		return;
	}

	const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
	setReducedResolution(this.lighting?.filter, customRenderScale.background);
}

function CanvasColorationEffects__draw(this: any, wrapped: (...args: any) => void, ...args: any[]) {
	wrapped(...args);
	if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
		return;
	}

	const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
	setReducedResolution(this.filter, customRenderScale.coloration);
}

function CanvasIlluminationEffects__draw(this: any, wrapped: (...args: any) => void, ...args: any[]) {
	wrapped(...args);
	if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
		return;
	}

	const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
	setReducedResolution(this.filter, customRenderScale.illumination);
}

function CanvasDarknessEffects__draw(this: any, wrapped: (...args: any) => void, ...args: any[]) {
	wrapped(...args);
	if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
		return;
	}

	const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
	setReducedResolution(this.filter, customRenderScale.darkness);
}

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
	Hooks.on('canvasReady', () => {
		if (!getSetting<boolean>(SETTINGS.ReduceLightingResolution)) {
			return;
		}
		const customRenderScale = getSetting<typeof RENDER_SCALE_DEFAULTS>(SETTINGS.CustomRenderScale);
		configureEffectsResolution(customRenderScale);
	});
}

function configureEffectsResolution(customRenderScale: typeof RENDER_SCALE_DEFAULTS | null | undefined) {
	setReducedResolution(canvas?.effects?.background?.lighting?.filter, customRenderScale?.background);
	setReducedResolution(canvas?.effects?.illumination?.filter, customRenderScale?.illumination);
	setReducedResolution(canvas?.effects?.coloration?.filter, customRenderScale?.coloration);
	setReducedResolution(canvas?.effects?.darkness?.filter, customRenderScale?.darkness);
}

export { configureEffectsResolution, enableReducedLightingResolution, toggleReducedLightingResolution };
