// Replaces voronoiCircles in PollenGlitterGeometryShader._fragment.
//
// The original ran two 3x3 loops: the first found the nearest cell, the
// second iterated the 8 neighbors of that winner to grab a second distance.
// Each neighbor's center was computed twice. This fused version tracks the
// two smallest squared distances (md = nearest, mr = second-nearest) in a
// single 3x3 pass, halving voronoiCenter/sin calls.
//
// Visual note: mr semantics shift slightly. Original mr is the distance from
// fpoint to the closest neighbor *of the winner cell* (which can sit in the
// outer ring). New mr is the second-nearest cell distance inside the same
// 3x3. After the alpha falloff in motes() and the smoothstep mask, the
// resulting glitter is visually near-identical, but a faint difference is
// possible on close inspection.
vec2 voronoiCircles(in vec2 coord, in float freq, in float time, in float radiusScale) {
	const int radius = 1;
	vec2 point = coord * freq;
	vec2 ipoint = floor(point);
	vec2 fpoint = fract(point);
	vec2 icenter = vec2(0.0f);
	float md = 1e10f;
	float mr = 1e10f;

	for (int y = -radius; y <= radius; ++y) {
		for (int x = -radius; x <= radius; ++x) {
			vec2 offset = vec2(x, y);
			vec2 c = voronoiCenter(offset, ipoint, time);
			vec2 dv = c - fpoint;
			float d = dot(dv, dv);
			if (d < md) {
				mr = md;
				md = d;
				icenter = offset;
			} else if (d < mr) {
				mr = d;
			}
		}
	}

	md = sqrt(md);
	mr = sqrt(mr) * 0.5f * radiusScale * 0.28f;
	if (md < mr)
		return vec2(md / mr, voronoiValue(icenter + ipoint));
	return vec2(0.0f, -2.0f);
}
