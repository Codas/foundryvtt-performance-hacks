import { NAMESPACE } from 'src/constants.ts';
import { FOUNDRY_API } from './foundryShim.ts';

export function registerWrapperForVersion(
	fn: (...args: any) => unknown,
	type: 'OVERRIDE' | 'WRAPPER' | 'MIXED',
	{ v12, v13 }: { v12?: string; v13?: string },
) {
	const generation = FOUNDRY_API.game.release.generation;
	if (v12 && generation < 13) {
		libWrapper.register(NAMESPACE, v12, fn, type);
	} else if (v13 && generation >= 13) {
		libWrapper.register(NAMESPACE, v13, fn, type);
	}
}

export function unregisterWrapperForVersion({ v12, v13 }: { v12?: string; v13?: string }) {
	const generation = FOUNDRY_API.game.release.generation;
	if (v12 && generation < 13) {
		libWrapper.unregister(NAMESPACE, v12);
	} else if (v13 && generation >= 13) {
		libWrapper.unregister(NAMESPACE, v13);
	}
}
