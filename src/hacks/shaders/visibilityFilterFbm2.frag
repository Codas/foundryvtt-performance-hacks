// unrolled 2-octave fbm
float fbm(in vec2 uv) {
	uv += time * 0.03;
	uv *= 2.0;
	float r = fnoise(uv + time * 0.03);
	uv *= 3.0;
	r += fnoise(uv + time * 0.03) * 0.1;
	return r;
}
