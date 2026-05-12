// === Optimized voronoi over time atlas shader
// Deprecated by the 3d atlas version. Keep this just in case the 3d atlas
// approach turn's out more hassle than it's worth it
// ================================================================

uniform sampler2D voronoiAtlas;

const float VOR_INNER = 512.0;
const float VOR_TILE = VOR_INNER + 2.0;
const float VOR_SLICES_X = 8.0;
const float VOR_SLICES_Y = 8.0;
const float VOR_CELLS = 64.0;
const float VOR_ATLAS_W = VOR_TILE * VOR_SLICES_X;
const float VOR_ATLAS_H = VOR_TILE * VOR_SLICES_Y;

const float VOR_TOTAL = VOR_SLICES_X * VOR_SLICES_Y;
const float VOR_PERIOD = TWOPI;

vec3 voronoiSampleSlice(float sliceIdx, vec2 uvCell) {
	float sx = mod(sliceIdx, VOR_SLICES_X);
	float sy = floor(sliceIdx / VOR_SLICES_X);
	vec2 originPx = vec2(sx, sy) * VOR_TILE;
	vec2 px = originPx + uvCell / VOR_CELLS * VOR_INNER + 1.0;
	return texture(voronoiAtlas, px / vec2(VOR_ATLAS_W, VOR_ATLAS_H)).rgb;
}

vec3 voronoi(in vec2 uv, in float t, in float zd) {
	float tIdx = fract(t / VOR_PERIOD) * VOR_TOTAL;
	float t0 = floor(tIdx);
	float tf = tIdx - t0;
	float t1 = mod(t0 + 1.0, VOR_TOTAL);

	vec2 macroCell = floor(uv / VOR_CELLS);
	vec2 h = fract(sin(vec2(dot(macroCell, vec2(127.1, 311.7)), dot(macroCell, vec2(269.5, 183.3)))) * 43758.5453);
	vec2 uvCell = mod(uv + floor(h * VOR_CELLS), VOR_CELLS);

	vec3 v0 = voronoiSampleSlice(t0, uvCell);
	vec3 v1 = voronoiSampleSlice(t1, uvCell);
	return mix(v0, v1, tf);
}

// --- Optimized Voronoi over time atlas shader
