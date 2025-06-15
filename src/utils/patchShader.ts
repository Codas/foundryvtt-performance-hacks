import { FOUNDRY_API, type ShaderName } from './foundryShim.ts';

export type ShaderReplacement = [string | RegExp, string];

export interface ShaderModificationData {
	vertex?: ShaderReplacement[];
	fragment?: ShaderReplacement[];
}

class ShaderReplacementStep {
	#replacements: ShaderReplacement[];
	getShaderString: () => string;
	setShaderString: (value: string) => void;
	#testResult: boolean | null = null;

	constructor(
		getShaderString: () => string,
		setShaderString: (value: string) => void,
		replacements: ShaderReplacement[],
	) {
		this.getShaderString = getShaderString;
		this.setShaderString = setShaderString;
		this.#replacements = replacements;
	}

	test(): boolean {
		if (this.#testResult !== null) {
			return this.#testResult;
		}
		const shaderString = this.getShaderString();
		this.#testResult = this.#replacements.every(([search]) => {
			let match = false;
			if (typeof search === 'string') {
				match = shaderString.includes(search);
			} else if (search instanceof RegExp) {
				match = search.test(shaderString);
			}
			if (!match) {
				console.warn(`Shader replacement test failed for search: ${search}`);
			}
			return match;
		});
		return this.#testResult;
	}

	execute(): boolean {
		if (this.#testResult === null) {
			this.test();
		}
		if (!this.#testResult) {
			return false;
		}

		let shaderString = this.getShaderString();
		for (const [search, replacement] of this.#replacements) {
			shaderString = shaderString.replaceAll(search, replacement);
		}

		this.setShaderString(shaderString);
		return true;
	}
}

export function patchShader(shaderName: ShaderName, modifications: ShaderModificationData) {
	const ShaderClass = FOUNDRY_API.getShaderByName(shaderName);
	const vertexStep = new ShaderReplacementStep(
		() => ShaderClass.vertexShader,
		(value) => (ShaderClass.vertexShader = value),
		modifications.vertex ?? [],
	);
	const fragmentStep = new ShaderReplacementStep(
		() => ShaderClass.fragmentShader,
		(value) => (ShaderClass.fragmentShader = value),
		modifications.fragment ?? [],
	);

	if (!vertexStep.test()) {
		console.warn(`Shader ${shaderName} does not match the expected vertex shader, skipping patch.`);
		return;
	} else if (!fragmentStep.test()) {
		console.warn(`Shader ${shaderName} does not match the expected fragment shader, skipping patch.`);
		return;
	}

	vertexStep.execute();
	fragmentStep.execute();
	return true;
}
