#version 300 es
#define SHADER_NAME generate-voronoi-atlas
precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

// Atlas layout — must match voronoiTimeAtlas.frag (the runtime sampler).
const float TWOPI = 6.283185307179586f;
const float VOR_INNER = 512.0f;
const float VOR_TILE = VOR_INNER + 2.0f;    // 514 — inner + 1px border each side
const float VOR_SLICES_X = 8.0f;
const float VOR_SLICES_Y = 8.0f;
const float VOR_CELLS = 64.0f;
const float VOR_ATLAS_W = VOR_TILE * VOR_SLICES_X; // 4112
const float VOR_ATLAS_H = VOR_TILE * VOR_SLICES_Y; // 4112

// Hash that tiles at VOR_CELLS, matching the runtime sampler.
float tilingRandom(vec2 uv) {
	uv = mod(uv, VOR_CELLS);
	float f = fract((2.41f * uv.x + 2.27f * uv.y) * 251.19f);
	return fract((5.23f * uv.x + 2.89f * uv.y) * f * 551.83f);
}

vec3 voronoiTiling(vec2 uv, float t) {
	vec2 uvi = floor(uv);
	vec2 uvf = fract(uv);
	float bestDist2 = 100.0f;
	vec2 bestUVR = vec2(0.0f);
	float bestDist = 10.0f;

	for (int oy = -1; oy <= 1; oy++) {
		for (int ox = -1; ox <= 1; ox++) {
			vec2 uvn = vec2(float(ox), float(oy));
			float rnd = tilingRandom(uvi + uvn);
			float r1 = 0.5f * sin(TWOPI * rnd + t) + 0.5f;
			float r2 = 0.5f * sin(TWOPI * r1 + t) + 0.5f;
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

	return vec3(bestUVR, clamp(bestDist, 0.0f, 1.0f));
}

// atlasUV: vTextureCoord in [0,1]^2 over the full atlas.
vec3 tilingVoronoiAtlas(vec2 atlasUV) {
	float period = 64.0f;
	vec2 atlasPx = atlasUV * vec2(VOR_ATLAS_W, VOR_ATLAS_H);
	vec2 sliceXY = floor(atlasPx / VOR_TILE);
	float sliceIdx = sliceXY.y * VOR_SLICES_X + sliceXY.x;

	vec2 pixelInTile = mod(atlasPx, VOR_TILE);
	vec2 uvCell = mod((pixelInTile - 0.5f) / VOR_INNER * VOR_CELLS, VOR_CELLS);

	float t = (sliceIdx / period) * TWOPI;
	return voronoiTiling(uvCell, t);
}

void main() {
	vec3 color = tilingVoronoiAtlas(vTextureCoord);
	fragColor = vec4(color, 1.0f);
}
