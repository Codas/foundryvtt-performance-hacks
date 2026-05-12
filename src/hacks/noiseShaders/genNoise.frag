#version 300 es
#define SHADER_NAME generate-noise
precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

#include ./_common.frag

// Tiling smooth noise (Hermite-interpolated random lattice), period 16.
const float PERIOD = 16.0f;

float tilingNoise(vec2 uv) {
	uv *= PERIOD;

	vec2 i = floor(uv);
	vec2 f = fract(uv);

	float a = random(mod(i + vec2(0.0f, 0.0f), PERIOD));
	float b = random(mod(i + vec2(1.0f, 0.0f), PERIOD));
	float c = random(mod(i + vec2(0.0f, 1.0f), PERIOD));
	float d = random(mod(i + vec2(1.0f, 1.0f), PERIOD));
	vec2 cb = f * f * (3.0f - 2.0f * f);

	return mix(a, b, cb.x) + (c - a) * cb.y * (1.0f - cb.x) + (d - b) * cb.x * cb.y;
}

void main() {
	float v = tilingNoise(vTextureCoord);
	fragColor = vec4(v, 0.0f, 0.0f, 1.0f);
}
