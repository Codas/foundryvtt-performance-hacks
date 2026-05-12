// === Optimized voronoi over time — sampler3D with hardware trilinear Z
// ================================================================

uniform mediump sampler3D voronoiAtlas3D;

const float VOR_INNER = 512.0;
const float VOR_TILE = VOR_INNER + 2.0;    // 514
const float VOR_CELLS = 64.0;
const float VOR_TOTAL = 64.0;
const float VOR_PERIOD = 6.283185307179586; // TWOPI

// Single-sample voronoi: hardware trilinear filtering does temporal
// blending between adjacent time slices in Z.
vec3 voronoi(in vec2 uv, in float t, in float zd) {
	float tIdx = fract(t / VOR_PERIOD) * VOR_TOTAL;

	vec2 macroCell = floor(uv / VOR_CELLS);
	vec2 h = fract(sin(vec2(dot(macroCell, vec2(127.1, 311.7)), dot(macroCell, vec2(269.5, 183.3)))) * 43758.5453);
	vec2 uvCell = mod(uv + floor(h * VOR_CELLS), VOR_CELLS);

	// Sample UV within the 514x514 tile (1-pixel border at each edge)
	vec2 sampleUV = (uvCell / VOR_CELLS * VOR_INNER + 1.0) / VOR_TILE;
	// Center-of-slice Z coordinate; GL_LINEAR blends adjacent slices
	float sampleW = (tIdx + 0.5) / VOR_TOTAL;

	return texture(voronoiAtlas3D, vec3(sampleUV, sampleW)).rgb;
}

// --- Optimized voronoi over time — 3D atlas
