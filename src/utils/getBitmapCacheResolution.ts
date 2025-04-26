export function getBitmapCacheResolution() {
	const scaleFactor = canvas.performance.mode === CONST.CANVAS_PERFORMANCE_MODES.MAX ? 2 : 1.5;
	return canvas.app.renderer.resolution * scaleFactor;
}
