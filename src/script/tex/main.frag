precision highp float;

in vec2 vUv;
in vec3 vPosition;

uniform float layer;
uniform vec3 color;
uniform float scale;
uniform float time;
uniform sampler2D paper;
uniform float seed;
uniform sampler2D noise;
uniform vec2 resolution;
uniform vec2 lightPosition;

out vec4 fragColor;

// hsl (including aastep) is injected here

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

float sampleNoise(vec2 uv, float layer) {
	float n = texture(noise, rotate((uv - .5), layer * 1.) + .5).r;
	n -= layer;
	n = aastep(n, .5);
	return n;
}

void main() {

	float n = sampleNoise(scale * vUv, layer);

	if(vUv.x < .01)
		n = 1.;
	if(vUv.x > 1. - .01)
		n = 1.;
	if(vUv.y < .01)
		n = 1.;
	if(vUv.y > 1. - .01)
		n = 1.;

  // if(n>.5) {
  //   discard;
  // }

  // vec3 lightPos = vec3(10.*cos(10.*time), 10.*sin(10.*time), 10.);
	vec3 lightPos = vec3(lightPosition.xy, 10.);
	vec3 dir = -lightPos;

	vec2 uvc = scale * (vUv) - .02 * normalize(dir.xy);
	float d = .5 + .5 * sampleNoise(uvc, layer - 1. / 40.);

	if(layer == 0.)
		d = 1.;

	float b = 0.;
	float s = dFdx(gl_FragCoord.x) / resolution.x;
	for(int y = -1; y <= 1; y++) {
		for(int x = -1; x <= 1; x++) {
			vec2 uvlookup = scale * (vUv) + vec2(s * float(x), s * float(y));
			float d = sampleNoise(uvlookup, layer);
			b += d;
		}
	}

	vec2 size = vec2(textureSize(paper, 0));
	float aspect = (size.y > 0.0) ? size.x / size.y : 1.0;
	vec4 bkg = texture(paper, vUv * vec2(aspect, 1.0));

	float hue = texture(noise, vUv / 2.).r;

	vec3 c = bkg.rgb * (.5 + .5 * color);
	vec3 hc = rgb2hsv(c);
  // hc.y += hue/4.;
	hc.z += b / 10.;
	hc.y += (1. - d);
	hc.z -= (1. - d);
	hc.x = clamp(hc.x, 0., 1.);
	hc.y = clamp(hc.y, 0., 1.);
	hc.z = clamp(hc.z, 0., 1.);
	c = hsv2rgb(hc);

  // c= vec3(hue);

	fragColor = vec4(c, 1. - n);
}
