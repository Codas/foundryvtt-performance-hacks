import { enableEffectsCaching } from './effectsCaching.ts';
import { enableSpritesheetSubstitution } from './spritesheetSubstitution.ts';
import { enableTokenBarsCaching } from './tokenBarsCaching.ts';
import { useOooTokenRendering } from './useOooTokenRendering.ts';

Hooks.once('setup', () => {
	useOooTokenRendering();
	enableEffectsCaching();
	enableTokenBarsCaching();
	enableSpritesheetSubstitution();
});
