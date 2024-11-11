import type { DynamicSpriteSheet } from './DynamicSpriteSheet.ts';

interface FvttPerfHacks {
	autoSpritesheetCache: DynamicSpriteSheet;
}

declare global {
	interface Window {
		fvttPerfHacks: FvttPerfHacks;
	}
}
