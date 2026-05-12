import { NAMESPACE } from 'src/constants.ts'
import { FOUNDRY_API, type ShaderName } from './foundryShim.ts'

export type ShaderReplacement = [string | RegExp, string]

export interface ShaderModificationData {
	vertex?: ShaderReplacement[]
	fragment?: ShaderReplacement[]
}

class ShaderReplacementStep {
	#replacements: ShaderReplacement[]
	getShaderString: () => string
	setShaderString: (value: string) => void
	#testResult: boolean | null = null

	constructor(
		getShaderString: () => string,
		setShaderString: (value: string) => void,
		replacements: ShaderReplacement[],
	) {
		this.getShaderString = getShaderString
		this.setShaderString = setShaderString
		this.#replacements = replacements
	}

	test(): boolean {
		if (this.#testResult !== null) {
			return this.#testResult
		}
		const shaderString = this.getShaderString()
		this.#testResult = this.#replacements.every(([search]) => {
			let match = false
			if (typeof search === 'string') {
				match = shaderString.includes(search)
			} else if (search instanceof RegExp) {
				match = search.test(shaderString)
			}
			if (!match) {
				console.warn(`Shader replacement test failed for search: ${search}`)
			}
			return match
		})
		return this.#testResult
	}

	execute(): boolean {
		if (this.#testResult === null) {
			this.test()
		}
		if (!this.#testResult) {
			return false
		}

		let shaderString = this.getShaderString()
		for (const [search, replacement] of this.#replacements) {
			shaderString = shaderString.replaceAll(search, replacement)
		}

		this.setShaderString(shaderString)
		return true
	}
}

export function patchShader(shaderName: ShaderName, modifications: ShaderModificationData) {
	const ShaderClass = FOUNDRY_API.getShaderByName(shaderName)
	const vertexStep = new ShaderReplacementStep(
		() => ShaderClass.vertexShader,
		(value) => (ShaderClass.vertexShader = value),
		modifications.vertex ?? [],
	)
	const fragmentStep = new ShaderReplacementStep(
		() => ShaderClass.fragmentShader,
		(value) => (ShaderClass.fragmentShader = value),
		modifications.fragment ?? [],
	)

	if (!vertexStep.test()) {
		console.warn(`Shader ${shaderName} does not match the expected vertex shader, skipping patch.`)
		return
	} else if (!fragmentStep.test()) {
		console.warn(`Shader ${shaderName} does not match the expected fragment shader, skipping patch.`)
		return
	}

	vertexStep.execute()
	fragmentStep.execute()
	return true
}

/**
 * V14 shader patching: wraps the static `_createFragmentShader` /
 * `_createVertexShader` factory methods via libWrapper so that the
 * replacements are applied to the string returned by the original factory
 * at canvas-initialisation time.
 *
 * Must be called from the `setup` hook (or later) so that libWrapper is
 * available and the canvas has not yet been initialised.
 */
export function patchShaderV14(shaderName: ShaderName, modifications: ShaderModificationData) {
	const basePath = `foundry.canvas.rendering.shaders.${shaderName}`

	if (modifications.fragment?.length) {
		const fragmentReplacements = modifications.fragment
		libWrapper.register(
			NAMESPACE,
			`${basePath}._createFragmentShader`,
			function (this: any, wrapped: (...args: any[]) => string, ...args: any[]): string {
				let shader = wrapped(...args)
				for (const [search, replacement] of fragmentReplacements) {
					const found = typeof search === 'string' ? shader.includes(search) : (search as RegExp).test(shader)
					if (!found) {
						console.warn(
							`[PrimePerformance] ${shaderName}._createFragmentShader: replacement target not found: ${search}`,
						)
						continue
					}
					shader =
						typeof search === 'string'
							? shader.replaceAll(search, replacement)
							: shader.replace(search as RegExp, replacement)
				}
				return shader
			},
			'WRAPPER',
		)
	}

	if (modifications.vertex?.length) {
		const vertexReplacements = modifications.vertex
		libWrapper.register(
			NAMESPACE,
			`${basePath}._createVertexShader`,
			function (this: any, wrapped: (...args: any[]) => string, ...args: any[]): string {
				let shader = wrapped(...args)
				for (const [search, replacement] of vertexReplacements) {
					const found = typeof search === 'string' ? shader.includes(search) : (search as RegExp).test(shader)
					if (!found) {
						console.warn(
							`[PrimePerformance] ${shaderName}._createVertexShader: replacement target not found: ${search}`,
						)
						continue
					}
					shader =
						typeof search === 'string'
							? shader.replaceAll(search, replacement)
							: shader.replace(search as RegExp, replacement)
				}
				return shader
			},
			'WRAPPER',
		)
	}
}
