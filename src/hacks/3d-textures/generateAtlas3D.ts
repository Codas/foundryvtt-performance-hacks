import quadVert from './shaders/quad.vert'

export interface Atlas3DSpec {
	width: number
	height: number
	depth: number
	fragSrc: string
	wrapR?: GLenum
	label?: string
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
	const shader = gl.createShader(type)!
	gl.shaderSource(shader, src)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader)
		gl.deleteShader(shader)
		throw new Error(`Shader compile error: ${info}\n${src}`)
	}
	return shader
}

/**
 * Some fun manual webgl2 code to bind and generate 3d textures on the GPU
 */
export function generateAtlas3D(gl: WebGL2RenderingContext, spec: Atlas3DSpec): WebGLTexture {
	const { width, height, depth, fragSrc, wrapR = gl.CLAMP_TO_EDGE, label } = spec

	const tex3D = gl.createTexture()!
	gl.bindTexture(gl.TEXTURE_3D, tex3D)
	gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, width, height, depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrapR)

	const vertShader = compileShader(gl, gl.VERTEX_SHADER, quadVert)
	const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
	const program = gl.createProgram()!
	gl.attachShader(program, vertShader)
	gl.attachShader(program, fragShader)
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`)
	}
	gl.useProgram(program)

	const uSliceLoc = gl.getUniformLocation(program, 'uSlice')
	const aPosLoc = gl.getAttribLocation(program, 'aVertexPosition')

	const quadBuf = gl.createBuffer()!
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
	gl.enableVertexAttribArray(aPosLoc)
	gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

	const fbo = gl.createFramebuffer()!
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
	gl.viewport(0, 0, width, height)

	for (let z = 0; z < depth; z++) {
		gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex3D, 0, z)
		gl.uniform1f(uSliceLoc, z)
		gl.drawArrays(gl.TRIANGLES, 0, 6)
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null)
	gl.deleteFramebuffer(fbo)
	gl.deleteBuffer(quadBuf)
	gl.deleteProgram(program)
	gl.deleteShader(vertShader)
	gl.deleteShader(fragShader)

	if (label) {
		console.log(`[${label}] Generated 3D texture ${width}×${height}×${depth} RGBA8 on GPU`)
	}

	return tex3D
}
