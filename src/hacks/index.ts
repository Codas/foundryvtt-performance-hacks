import overrideInterfaceClipping from './optimized-interface-clipping.ts';
import enableNameplateCaching from './nameplate-caching.ts';
import enableTokenBarsCaching from './token-bars-caching.ts';

Hooks.once('ready', () => {
	overrideInterfaceClipping();
	enableNameplateCaching();
	enableTokenBarsCaching();
});
