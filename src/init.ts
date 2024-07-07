import { DynamicSpriteSheet } from './DynamicSpriteSheet.ts';

window.fvttPerfHacks = {
	autoSpritesheetCache: new DynamicSpriteSheet(),
};

Hooks.on('canvasTearDown', () => {
	window.fvttPerfHacks.autoSpritesheetCache.clear();
});
