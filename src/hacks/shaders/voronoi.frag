// === Optimized voronoi shader
// ================================================================

uniform sampler2D voronoiTexture;
vec3 voronoi(in vec2 uv, out float intensity) {
        // Sample precomputed Voronoi: R=val.x, G=val.y, B=minDist
	float periodFrac = 0.015625; // 1/64
	vec4 voronoiData = texture2D(voronoiTexture, uv * periodFrac);

	vec2 val = vec2(voronoiData.r, voronoiData.g);
	float minDist = voronoiData.b;

	float vs = cos(fbm(val * 50.0 + time * 0.5, 1.0));
	val += (vs * 0.1);

	vec3 col1 = vec3(pow(1.0 - minDist, 5.0) * val.x, 0.0, 0.0);
	vec3 col2 = vec3(0.0, 0.0, pow(1.0 - minDist, 5.0) * val.y);
	vec3 result = mix(col1, col2, -0.3 + (vs + 1.0 * 0.5));
	intensity = mix(result.r, result.b, clamp(-0.3 + (vs + 1.0 * 0.5), 0.0, 1.0));
	return result;
}

// --- Optimized Voronoi
