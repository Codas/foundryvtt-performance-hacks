export class VoidSprite extends PIXI.Sprite {
	// override blendMode = PIXI.BLEND_MODES.ERASE

	/**
	 * Render the sprite with ERASE blending.
	 * Note: The sprite must not have visible/renderable children.
	 * @param {PIXI.Renderer} renderer    The renderer
	 * @internal
	 */
	_renderVoid(renderer: PIXI.Renderer) {
		if (!this.visible || this.worldAlpha <= 0 || !this.renderable) {
			return
		}

		// Render the sprite but not its children
		if (this.cullable) {
			this._renderWithCulling(renderer)
		} else {
			this._render(renderer)
		}
	}
}
