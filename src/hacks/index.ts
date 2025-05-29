import { enableEffectsCaching } from './effects-caching.ts';
import { enableSpritesheetSubstitution } from './spritesheet-substitution.ts';
import { enableTokenBarsCaching } from './token-bars-caching.ts';
import { useOooTokenRendering } from './useOooTokenRendering.ts';

Hooks.once('setup', () => {
	useOooTokenRendering();
	enableEffectsCaching();
	enableTokenBarsCaching();
	enableSpritesheetSubstitution();
});
