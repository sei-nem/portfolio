precision highp float;

in vec2 vUv;

uniform float seed;
uniform float time;

out vec4 fragColor;

// noise3d is injected here

void main() {
	vec2 uv = vUv * 5.;
	float n = .5 + .5 * snoise(vec3(uv.x, uv.y, seed + time));
	float n2 = .5 + .5 * snoise(vec3(.5 * uv.x, .5 * uv.y, 1. + seed + time));
	n = mix(n, n2, .5) + .05;

	fragColor = vec4(n);
}
