// === Optimized Voronoi Power 16 Shader
// ================================================================

uniform sampler2D voronoiP16Texture;
const float VORONOI_POWER_16_PERIOD = 16.0;
const float VORONOI_POWER_16_PERIOD_FRAC = 1.0 / VORONOI_POWER_16_PERIOD;

float voronoiPower16(in vec2 point) {
	vec2 uv = mod(point, VORONOI_POWER_16_PERIOD) * VORONOI_POWER_16_PERIOD_FRAC;
	return texture(voronoiP16Texture, uv).r;
}

// --- Optimized Voronoi Power 16
