// ---------------------------------------------
// Ring shader patching for spritesheet support

import { SETTINGS } from 'src/settings/constants.ts';
import { getSetting } from 'src/settings/settings.ts';
import { FOUNDRY_API } from 'src/utils/foundryShim.ts';
import { registerWrapperForVersion } from 'src/utils/registerWrapper.ts';

function patchTokenRingShader() {
	const ShaderClass =
		FOUNDRY_API.generation < 13 ? TokenRingSamplerShader : foundry.canvas.rendering.shaders.TokenRingSamplerShader;
	ShaderClass.batchGeometry.push({
		id: 'aTextureScaleOffset',
		size: 4,
		normalized: false,
		type: PIXI.TYPES.FLOAT,
	});
	ShaderClass.spritesheetSupportVertexSize = 4;
	ShaderClass.batchVertexSize += ShaderClass.spritesheetSupportVertexSize;

	// add the new inputs to the batch vertex shader
	ShaderClass._batchVertexShader = ShaderClass._batchVertexShader.replace(
		'in vec2 aRingTextureCoord;',
		`in vec2 aRingTextureCoord;\n in vec4 aTextureScaleOffset;`,
	);

	// add new vertex outputs
	ShaderClass._batchVertexShader = ShaderClass._batchVertexShader.replace(
		'out vec2 vOrigTextureCoord;',
		`out vec2 vOrigTextureCoord;\n  out vec2 vTextureCoordClipped;`,
	);

	// // set vertex outputs
	ShaderClass._batchVertexShader = ShaderClass._batchVertexShader.replace(
		'vOrigTextureCoord = aTextureCoord;',
		`vOrigTextureCoord = aTextureCoord * aTextureScaleOffset.xy - aTextureScaleOffset.zw;
  vTextureCoordClipped = (vOrigTextureCoord - 0.5) * aTextureScaleCorrection + 0.5;
		`,
	);

	// add fragment shader input
	if (FOUNDRY_API.generation < 13) {
		ShaderClass._batchFragmentShader = ShaderClass._batchFragmentShader.replace(
			'mix(ccol, vBackgroundColor * tokenRing.r, smoothstep(0.0, 1.0, dot(rotation(vTextureCoord, time), vec2(0.5))))',
			'mix(ccol, vBackgroundColor * tokenRing.r, smoothstep(0.0, 1.0, dot(rotation(vTextureCoordClipped, time), vec2(0.5))))',
		);
	} else {
		ShaderClass._batchFragmentShader = ShaderClass._batchFragmentShader.replace(
			'float gradientMix = smoothstep(0.0, 1.0, dot(rotation(vTextureCoord, time), vec2(0.5)));',
			'float gradientMix = smoothstep(0.0, 1.0, dot(rotation(vTextureCoordClipped, time), vec2(0.5)));',
		);
	}

	// // fix the gradient mix calculation to use the clipped texture coordinates
	ShaderClass._batchFragmentShader = ShaderClass._batchFragmentShader.replace(
		'in vec2 vOrigTextureCoord;',
		`in vec2 vOrigTextureCoord;\n  in vec2 vTextureCoordClipped;`,
	);
}

function TokenRingSamplerShader__packInterleavedGeometry(
	this: BaseSamplerShader,
	wrapped: (...args: any[]) => void,
	element: any,
	attributeBuffer: any,
	indexBuffer: any,
	aIndex: number,
	iIndex: number,
) {
	wrapped(element, attributeBuffer, indexBuffer, aIndex, iIndex);

	const TokenRingSamplerShaderClass =
		FOUNDRY_API.generation < 13 ? TokenRingSamplerShader : foundry.canvas.rendering.shaders.TokenRingSamplerShader;

	// Destructure the properties from the element for faster access
	const { vertexData } = element;
	const object = element.object.object || {};

	// Retrieve ring properties with default values
	const {
		baseTexture: { width: baseTextureWidth, height: baseTextureHeight },
		width: textureWidth,
		height: textureHeight,
		frame: textureFrame,
	} = object.mesh.texture || {};

	// Calculate colors using the PIXI.Color class

	// Access Float32 and Uint32 views of the attribute buffer
	const { float32View } = attributeBuffer;

	const vertexSize = this.vertexSize;
	const offset = aIndex + vertexSize - TokenRingSamplerShaderClass.spritesheetSupportVertexSize;

	// Loop through the vertex data to fill attribute buffers
	for (let i = 0, j = 0; i < vertexData.length; i += 2, j += vertexSize) {
		let k = offset + j;

		float32View[k++] = baseTextureWidth / textureWidth;
		float32View[k++] = baseTextureHeight / textureHeight;
		float32View[k++] = textureFrame.x / textureWidth;
		float32View[k++] = textureFrame.y / textureHeight;
	}
}

async function enableTokenRingSpritesheetSupport() {
	const enabled = getSetting(SETTINGS.TokenRingSpritesheetSupport);

	if (!enabled || !FOUNDRY_API.hasCanvas) {
		return;
	}

	// Token Ring shader patching
	patchTokenRingShader();
	registerWrapperForVersion(TokenRingSamplerShader__packInterleavedGeometry, 'WRAPPER', {
		v12: 'TokenRingSamplerShader._packInterleavedGeometry',
		v13: 'foundry.canvas.rendering.shaders.TokenRingSamplerShader._packInterleavedGeometry',
	});
}

export { enableTokenRingSpritesheetSupport };
