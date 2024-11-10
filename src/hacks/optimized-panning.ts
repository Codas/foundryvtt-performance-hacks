function optimizedAlign(this: HeadsUpDisplay, ...args: any[]) {
	const hud = this.element[0]
	const { x, y } = canvas.primary.getGlobalPosition()
	const scale = canvas.stage.scale.x
	hud.style.transform = `scale(${scale}) translate(${x / scale}px, ${y / scale}px)`
}

let enableOptimizedPanning = () => {
	libWrapper.register('fvtt-perf-optim', 'HeadsUpDisplay.prototype.align', optimizedAlign, 'OVERRIDE')
}
export default enableOptimizedPanning

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableOptimizedPanning = newModule?.foo
	})
}
