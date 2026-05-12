#include ./_atlasGenHeader.frag

// Atlas layout -- must match voronoi3d.frag (the runtime sampler).
const float TWOPI = 6.283185307179586;
const float VOR_INNER = 512.0;
const float VOR_TILE = VOR_INNER + 2.0;    // 514 — inner + 1px border each side
const float VOR_CELLS = 64.0;
const float VOR_TOTAL = 64.0;

// Hash that tiles at VOR_CELLS, matching the runtime sampler.
float tilingRandom(vec2 uv) {
	uv = mod(uv, VOR_CELLS);
	float f = fract((2.41 * uv.x + 2.27 * uv.y) * 251.19);
	return fract((5.23 * uv.x + 2.89 * uv.y) * f * 551.83);
}

vec3 voronoiTiling(vec2 uv, float t) {
	vec2 uvi = floor(uv);
	vec2 uvf = fract(uv);
	float bestDist2 = 100.0;
	vec2 bestUVR = vec2(0.0);
	float bestDist = 10.0;

	for (int oy = -1; oy <= 1; oy++) {
		for (int ox = -1; ox <= 1; ox++) {
			vec2 uvn = vec2(float(ox), float(oy));
			float rnd = tilingRandom(uvi + uvn);
			float r1 = 0.5 * sin(TWOPI * rnd + t) + 0.5;
			float r2 = 0.5 * sin(TWOPI * r1 + t) + 0.5;
			vec2 uvr = vec2(r2);
			vec2 diff = uvn + uvr - uvf;
			float dist2 = dot(diff, diff);
			if (dist2 < bestDist2) {
				bestDist2 = dist2;
				bestUVR = uvr;
				bestDist = sqrt(dist2);
			}
		}
	}

	return vec3(bestUVR, clamp(bestDist, 0.0, 1.0));
}

void main() {
	// gl_FragCoord.xy ranges (0.5..513.5) over the 514×514 slice.
	// Map to cell-space matching the 2D atlas gen:
	//   pixelInTile = gl_FragCoord.xy  (texel center)
	//   uvCell = mod((pixelInTile - 0.5) / VOR_INNER * VOR_CELLS, VOR_CELLS)
	vec2 uvCell = mod((gl_FragCoord.xy - 0.5) / VOR_INNER * VOR_CELLS, VOR_CELLS);

	float t = (uSlice / VOR_TOTAL) * TWOPI;
	vec3 result = voronoiTiling(uvCell, t);
	fragColor = vec4(result, 1.0);
}
