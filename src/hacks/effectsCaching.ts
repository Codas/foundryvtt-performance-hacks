import type Token from '@7h3laughingman/foundry-types/client/canvas/placeables/token.mjs'
import { NAMESPACE } from 'src/constants.ts'
import { SETTINGS } from 'src/settings/constants.ts'
import { getSetting } from 'src/settings/settings.ts'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'
import { getBitmapCacheResolution } from 'src/utils/getBitmapCacheResolution.ts'

function refreshEffectCache(object: PIXI.DisplayObject) {
	object.cacheAsBitmap = false
	object.cacheAsBitmapResolution = getBitmapCacheResolution()
	object.cacheAsBitmap = true
}

function shouldCacheIndividualEffects() {
	const effectHider = game.modules.get('effect-hider')
	if (effectHider?.active) {
		return true
	}
	return false
}

async function cacheEffects(this: Token, ...args: unknown[]) {
	const [flags] = args as [Record<string, boolean> | undefined]
	if (flags?.redrawEffects || flags?.refreshEffects) {
		if (shouldCacheIndividualEffects()) {
			this.effects.children.forEach((effect: PIXI.DisplayObject) => {
				refreshEffectCache(effect)
			})
		} else {
			refreshEffectCache(this.effects)
		}
	}
}

function isTokenEffectsCachingAvailable() {
	// Caching is not needed for dorako UX since radial hud already uses prerendered textures
	// for the status effect icons for performance
	const hasDorakoRadialHud =
		game.settings.settings.has('pf2e-dorako-ux.moving.adjust-token-effects-hud') &&
		game.settings.get('pf2e-dorako-ux', 'moving.adjust-token-effects-hud')
	if (hasDorakoRadialHud) {
		return false
	}

	if (game.modules.has('pf2e-effects-halo') && game.modules.get('pf2e-effects-halo')?.active) {
		return false
	}

	return true
}

const APPLY_RENDER_FLAGS_PATH = 'CONFIG.Token.objectClass.prototype._applyRenderFlags'

// Unique ID returned by libWrapper.register, used for targeted unregistration.
let wrapperRegistrationId: number | undefined

let isEnabled = false

let enableEffectsCaching = () => {
	if (!getSetting(SETTINGS.EffectsCaching)) {
		return
	}

	registerEffectsCaching()
}

function registerEffectsCaching() {
	if (isEnabled || !isTokenEffectsCachingAvailable() || !FOUNDRY_API.hasCanvas) {
		return
	}
	isEnabled = true
	wrapperRegistrationId = libWrapper.register(
		NAMESPACE,
		APPLY_RENDER_FLAGS_PATH,
		async function (this: Token, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
			const result = wrapped(...args)
			if (result instanceof Promise) {
				await result
			}
			await cacheEffects.call(this, ...args)
		},
		'WRAPPER',
	)
}

function unregisterEffectsCaching() {
	if (!isEnabled) {
		return
	}
	isEnabled = false
	if (wrapperRegistrationId !== undefined) {
		libWrapper.unregister(NAMESPACE, wrapperRegistrationId)
		wrapperRegistrationId = undefined
	}
	if (!FOUNDRY_API.hasCanvas) {
		return
	}
	for (const token of canvas?.tokens?.placeables ?? []) {
		const effects = (token as Token).effects as PIXI.Container | undefined
		if (!effects) {
			continue
		}
		effects.cacheAsBitmap = false
		for (const child of effects.children) {
			if ('cacheAsBitmap' in child) {
				;(child as PIXI.DisplayObject).cacheAsBitmap = false
			}
		}
	}
}

export { enableEffectsCaching, registerEffectsCaching, unregisterEffectsCaching }

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		enableEffectsCaching = newModule?.enableEffectsCaching
	})
}
