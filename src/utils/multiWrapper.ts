import { NAMESPACE } from 'src/constants.ts'

export type WrapperHook<T = unknown> = (this: T, ...args: unknown[]) => void | Promise<void>

const registry = new Map<string, WrapperHook[]>()

/**
 * Register a hook for a method path under our module namespace. Only supports the WRAPPER call type
 * (for hooks called AFTER the original).
 *
 * - On first call for a given path: registers a single WRAPPER with libWrapper that calls the
 *   original method, then dispatches to all hooks.
 * - On subsequent calls: appends the hook to the existing dispatch list. No additional libWrapper
 *   registration is made.
 */
export function addWrapperHook<T = unknown>(path: string, hook: WrapperHook<T>): void {
	const existing = registry.get(path)

	if (existing) {
		existing.push(hook as WrapperHook)
		return
	}

	const hooks: WrapperHook[] = [hook as WrapperHook]
	registry.set(path, hooks)

	libWrapper.register(
		NAMESPACE,
		path,
		async function (this: unknown, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
			const result = wrapped(...args)
			if (result instanceof Promise) {
				await result
			}
			for (const h of hooks) {
				const r = h.apply(this, args)
				if (r instanceof Promise) {
					await r
				}
			}
		},
		'WRAPPER',
	)
}

/**
 * Remove a previously registered hook. When the last hook for a path is removed, the libWrapper
 * registration is also unregistered.
 */
export function removeWrapperHook<T = unknown>(path: string, hook: WrapperHook<T>): void {
	const existing = registry.get(path)
	if (!existing) {
		return
	}
	const idx = existing.indexOf(hook as WrapperHook)
	if (idx === -1) {
		return
	}
	existing.splice(idx, 1)
	if (existing.length === 0) {
		registry.delete(path)
		libWrapper.unregister(NAMESPACE, path)
	}
}
