import enableEffectsCaching from './effects-caching.ts';
import { enableFasterEdgeTesting } from './faster-edge-testing.ts';
import enableTokenBarsCaching from './token-bars-caching.ts';
import useOooTokenRendering from './useOooTokenRendering.ts';

Hooks.once('setup', () => {
	useOooTokenRendering();
	enableEffectsCaching();
	enableTokenBarsCaching();
	enableFasterEdgeTesting();
});
