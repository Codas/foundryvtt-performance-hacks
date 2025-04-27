export function getBitmapCacheResolution() {
	let scaleFactor = canvas.performance.mode === CONST.CANVAS_PERFORMANCE_MODES.MAX ? 2 : 1.5;
	if (canvas.scene.grid.size < 100 && canvas.scene.grid.size > 50) {
		scaleFactor *= 1.5;
	} else if (canvas.scene.grid.size <= 50) {
		scaleFactor *= 2;
	}
	return canvas.app.renderer.resolution * scaleFactor;
}
