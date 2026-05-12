// Shared utility functions used across multiple noise generator shaders.
// Import with: #include ./_common.frag

float random(in vec2 uv) {
	uv = mod(uv, 1000.0);
	return fract(dot(uv, vec2(5.23, 2.89) * fract((2.41 * uv.x + 2.27 * uv.y) * 251.19)) * 551.83);
}

vec3 mod289(in vec3 x) {
	return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(in vec4 x) {
	return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(in vec4 x) {
	return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(in vec4 r) {
	return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(in vec3 t) {
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
