export function getBitmapCacheResolution() {
	let scaleFactor = 1
	if (canvas.performance.mode === CONST.CANVAS_PERFORMANCE_MODES.MAX) {
		scaleFactor = 2
	} else if (canvas.performance.mode >= CONST.CANVAS_PERFORMANCE_MODES.MED) {
		scaleFactor = 1.5
	}
	return canvas.app.renderer.resolution * scaleFactor
}
