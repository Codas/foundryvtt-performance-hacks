import { DynamicSpriteSheet } from "./DynamicSpriteSheet.ts";
import { getSetting, SETTINGS } from "./settings.ts";

window.fvttPerfHacks = {
	autoSpritesheetCache: new DynamicSpriteSheet(),
};

Hooks.on("canvasTearDown", () => {
	window.fvttPerfHacks.autoSpritesheetCache.clear();
});

Hooks.on("canvasReady", () => {
	const enableDebugSpriteSheet = getSetting(SETTINGS.DebugSpriteSheet);
	if (!enableDebugSpriteSheet) {
		return;
	}
	const container = new PIXI.Container();
	var bg = new PIXI.Sprite(PIXI.Texture.WHITE);
	bg.width = 4096;
	bg.height = 4096;
	bg.tint = 0xcccccc;
	bg.alpha = 0.1;
	container.addChild(bg);
	container.addChild(window.fvttPerfHacks.autoSpritesheetCache.debugSprite);
	container.eventMode = "none";
	game.canvas.tokens.addChild(container);
});
