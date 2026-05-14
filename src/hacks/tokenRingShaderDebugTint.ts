import type AbstractBaseShader from '@7h3laughingman/foundry-types/client/canvas/rendering/shaders/base-shader.mjs'
import { FOUNDRY_API } from 'src/utils/foundryShim.ts'

const DEBUG_TINT_MARKER = 'PRIME_PERFORMANCE_TOKEN_RING_DEBUG_TINT'

export function enableTokenRingShaderDebugTint() {
	const ShaderClass = FOUNDRY_API.getShaderByName('TokenRingSamplerShader') as typeof AbstractBaseShader & {
		_batchFragmentShader?: string
	}
	const source = ShaderClass._batchFragmentShader
	if (!source || source.includes(DEBUG_TINT_MARKER)) {
		return
	}

	const target = 'return result;'
	if (!source.includes(target)) {
		console.warn('[PrimePerformance] TokenRingSamplerShader debug tint patch target not found')
		return
	}

	ShaderClass._batchFragmentShader = source.replace(
		target,
		`result = mix(result, vec4(1.0, 0.0, 1.0, result.a), 0.35); // ${DEBUG_TINT_MARKER}
      ${target}`,
	)
}
