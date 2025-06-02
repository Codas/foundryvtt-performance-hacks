import { enableEffectsCaching } from './effectsCaching.ts';
import { enablePrecomputedNoiseTextures } from './precomputedNoiseTextures.ts';
import { enableSpritesheetSubstitution } from './spritesheetSubstitution.ts';
import { enableTokenBarsCaching } from './tokenBarsCaching.ts';
import { enableTokenRingSpritesheetSupport } from './tokenRingSpritesheetSupport.ts';
import { useOooTokenRendering } from './useOooTokenRendering.ts';

Hooks.once('setup', () => {
	useOooTokenRendering();
	enableEffectsCaching();
	enableTokenBarsCaching();
	enableTokenRingSpritesheetSupport();
	enableSpritesheetSubstitution();
	enablePrecomputedNoiseTextures();
});
