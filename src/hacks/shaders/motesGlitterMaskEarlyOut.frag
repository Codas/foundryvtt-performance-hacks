// Replaces motesLayers in PollenGlitterGeometryShader._fragment.
//
// The fbm mask feeds smoothstep(0.8, 1.0, ...), which zeroes the large
// majority of fullscreen pixels. Compute the mask first and bail out before
// any voronoiCircles work when it's effectively zero. Up to three
// voronoiCircles calls (each ~9 hashed cells with a sin) are saved per
// rejected pixel.
vec4 motesLayers(vec2 coord, float time) {
	float mask = smoothstep(0.8f, 1.0f, fbmHash(coord * 5.0f + time * 0.1f, 1.0f));
	if (verticalFade)
		mask *= (vMeshCoord.y * vMeshCoord.y);
	if (mask < (1.0f / 255.0f))
		return vec4(0.0f);

	vec4 color = vec4(0.0f);
	color = max(color, motes(voronoiCircles(coord + vec2(6.518f), 6.050f, time * 0.6f + 8.513f, 1.0f)));
	if (pass > 1.0f)
		color = max(color, motes(voronoiCircles(coord + vec2(3.584f), 8.018f, time * 0.8f + 4.214f, 1.0f)));
	if (pass > 2.0f)
		color = max(color, motes(voronoiCircles(coord + vec2(0.493f), 9.987f, time + 2.321f, 1.0f)));
	return color * mask;
}
