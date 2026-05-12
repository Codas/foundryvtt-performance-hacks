// Type declarations for the libWrapper Foundry VTT module (https://github.com/ruipin/fvtt-lib-wrapper).
// Based on the libWrapper public API as documented in its JSDoc.

type LibWrapperType = 'LISTENER' | 'WRAPPER' | 'MIXED' | 'OVERRIDE'
type LibWrapperPerfMode = 'AUTO' | 'NORMAL' | 'FAST'

interface LibWrapperRegisterOptions {
	// If true, the first parameter to fn is a callable that continues the chain.
	// Defaults to false for OVERRIDE, true for all other types.
	chain?: boolean
	// Preferred performance mode for this wrapper.
	perf_mode?: LibWrapperPerfMode
	// Extra arguments prepended to fn after the 'wrapped' chain function.
	bind?: unknown[]
}

interface LibWrapperIgnoreConflictsOptions {
	// If true, confirmed conflicts (errors) are also ignored, not just warnings.
	ignore_errors?: boolean
}

// The fn parameter uses `this: any` so callers can annotate a specific this type
// without a type error -- libWrapper always calls the function as a method of the
// wrapped object, so the actual this at runtime matches whatever the caller expects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LibWrapperFn = (this: any, ...args: any[]) => unknown

declare namespace LibWrapper {
	// Type string constants.
	const LISTENER: 'LISTENER'
	const WRAPPER: 'WRAPPER'
	const MIXED: 'MIXED'
	const OVERRIDE: 'OVERRIDE'

	// Performance mode string constants.
	const PERF_NORMAL: 'NORMAL'
	const PERF_FAST: 'FAST'
	const PERF_AUTO: 'AUTO'

	/**
	 * Register a new wrapper.
	 * Must be called after the 'init' hook.
	 *
	 * @param package_id  The module/system/world id from the manifest.
	 * @param target      A dot-path string to the method, or a numeric unique identifier
	 *                    previously returned by register().
	 * @param fn          Wrapper function. For non-OVERRIDE types the first argument is the
	 *                    next function in the chain.
	 * @param type        Wrapper type. Defaults to 'MIXED'.
	 * @param options     Additional options.
	 * @returns           A unique numeric identifier for this registration, usable as
	 *                    the `target` argument in future register() / unregister() calls.
	 */
	function register(
		package_id: string,
		target: string | number,
		fn: LibWrapperFn,
		type?: LibWrapperType,
		options?: LibWrapperRegisterOptions,
	): number

	/**
	 * Unregister a previously registered wrapper.
	 *
	 * @param package_id  The module/system/world id from the manifest.
	 * @param target      The dot-path string or unique numeric identifier returned by register().
	 * @param fail        If true (default), throws if no registration is found.
	 */
	function unregister(package_id: string, target: string | number, fail?: boolean): void

	/**
	 * Ignore conflict warnings involving this package and the listed packages on the given targets.
	 * Useful when two wrappers from the same package intentionally register the same path.
	 *
	 * @param package_id  The package that owns this ignore entry.
	 * @param ignore_ids  Other package ID(s) to ignore conflicts with.
	 * @param targets     Target path(s) for which conflicts should be suppressed.
	 * @param options     Additional options.
	 */
	function ignore_conflicts(
		package_id: string,
		ignore_ids: string | string[],
		targets: string | string[],
		options?: LibWrapperIgnoreConflictsOptions,
	): void
}

declare const libWrapper: typeof LibWrapper
