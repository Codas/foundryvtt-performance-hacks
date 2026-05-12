#version 300 es
#define SHADER_NAME generate-voronoi
precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

#include ./_hash.frag

// Voronoi precomputation matching the runtime voronoi.frag sampler.
// Tiling period: 64 cells. Output: R=val.x, G=val.y, B=minDist (squared dot product, clamped [0,1]).
// Runtime does pow(1.0 - B, 5.0), matching the original voronoi function.
const float PERIOD = 64.0f;

vec3 voronoiPrecompute(in vec2 uv) {
	vec2 p = floor(uv);
	vec2 f = fract(uv);

	float minDist = 8.0f;
	vec2 val = vec2(0.0f);

	for (int j = -2; j <= 2; j++) {
		for (int i = -2; i <= 2; i++) {
			vec2 id = vec2(float(i), float(j));
			// Wrap cell index for tiling.
			vec2 point = hashVec2To2D(mod(p + id, PERIOD));
			vec2 realPoint = id + point - f;

			float d = dot(realPoint, realPoint);
			if (d < minDist) {
				minDist = d;
				val = point;
			}
		}
	}

	// Store squared distance directly, clamped to [0,1].
	// Runtime does pow(1.0 - B, 5.0) matching the original voronoi function.
	return vec3(val, clamp(minDist, 0.0f, 1.0f));
}

void main() {
	// Scale UV to PERIOD-cell space.
	vec3 result = voronoiPrecompute(vTextureCoord * PERIOD);
	fragColor = vec4(result, 1.0f);
}
