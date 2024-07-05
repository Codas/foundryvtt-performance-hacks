export function wrapFunction<THIS>(object: any, path: string, callback: (this: THIS, ...args: any[]) => void) {
	const origFn = object[path];
	object[path] = function (this: THIS, ...args: any[]) {
		origFn.apply(this, args);
		callback.apply(this, args);
	};
}

export function wrapFunctionManual<THIS>(object: any, path: string, callback: (this: THIS, ...args: any[]) => void) {
	const origFn = object[path];
	object[path] = function (this: THIS, ...args: any[]) {
		callback.apply(this, [origFn, ...args]);
	};
}
