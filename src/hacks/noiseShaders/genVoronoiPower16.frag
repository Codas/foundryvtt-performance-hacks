#version 300 es
#define SHADER_NAME generate-voronoi-power16
precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

#include ./_hash.frag

// Voronoi power-16 distance function.
// Tiles seamlessly at period 16 via modular cell addressing.
float voronoiPower16(in vec2 point) {
	vec2 cell = floor(point);
	vec2 frac = fract(point);
	float res = 0.0f;

	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			vec2 neighbor = vec2(i, j);
			vec2 r = neighbor - frac + hashVec2To2D(mod(cell + neighbor, 16.0f));
			float dr = dot(r, r);
			dr = dr * dr * dr * dr * dr * dr * dr * dr;
			res += 1.0f / dr;
		}
	}
	return pow(1.0f / res, 1.0f / 16.0f);
}

void main() {
	const float PERIOD = 16.0f;
	vec2 point = vTextureCoord * PERIOD;
	float v = clamp(voronoiPower16(point), 0.0f, 1.0f);
	fragColor = vec4(v, 0.0f, 0.0f, 1.0f);
}
