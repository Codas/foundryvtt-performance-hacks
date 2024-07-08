export function wrapFunction<THIS>(object: any, path: string, callback: (this: THIS, ...args: any[]) => void) {
	const origFn = object[path]
	object[path] = function (this: THIS, ...args: any[]) {
		const res = origFn.apply(this, args)
		if (res instanceof Promise) {
			return res.then(() =>
				callback.apply(this, args))
		} else {
			return callback.apply(this, args)
		}
	}
}

export function wrapFunctionManual<THIS>(object: any, path: string, callback: (this: THIS, ...args: any[]) => void) {
	const origFn = object[path]
	object[path] = function (this: THIS, ...args: any[]) {
		return callback.apply(this, [origFn, ...args])
	}
}
