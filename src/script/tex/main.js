import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
	warm,
	natural,
	natural2,
	circus,
	seaside,
	warm2,
	warm3,
	circus2,
} from "./palettes.js";

import noise3d from "./noise3d.glsl?raw";
import hsl from "./hsl.glsl?raw";
import noiseVert from "./noise.vert.glsl?raw";
import noiseFrag from "./noise.frag.glsl?raw";
import mainVert from "./main.vert.glsl?raw";
import mainFrag from "./main.frag?raw";
import watercolorUrl from "./Watercolor_ColdPress.jpg?url";

function clamp(v, minVal, maxVal) {
	return Math.min(maxVal, Math.max(minVal, v));
}

function mix(x, y, a) {
	if (a <= 0) return x;
	if (a >= 1) return y;
	return x + a * (y - x);
}

class GradientLinear {
	constructor(colors) {
		this.colors = colors.map((c) => new THREE.Color(c));
	}
	getAt(t) {
		t = clamp(t, 0, 1);
		const from = Math.floor(t * this.colors.length * 0.9999);
		const to = clamp(from + 1, 0, this.colors.length - 1);
		const fc = this.colors[from];
		const ft = this.colors[to];
		const p = (t - from / this.colors.length) / (1 / this.colors.length);
		const res = new THREE.Color();
		res.r = mix(fc.r, ft.r, p);
		res.g = mix(fc.g, ft.g, p);
		res.b = mix(fc.b, ft.b, p);
		return res;
	}
}

class ShaderTexture {
	constructor(
		renderer,
		shader,
		width,
		height,
		format,
		type,
		minFilter,
		magFilter,
		wrapS,
		wrapT,
	) {
		this.renderer = renderer;
		this.shader = shader;
		this.orthoScene = new THREE.Scene();
		this.fbo = new THREE.WebGLRenderTarget(width, height, {
			wrapS: wrapS || THREE.RepeatWrapping,
			wrapT: wrapT || THREE.RepeatWrapping,
			minFilter: minFilter,
			magFilter: magFilter,
			format: format || THREE.RGBAFormat,
			type: type || THREE.UnsignedByteType,
		});
		this.orthoCamera = new THREE.OrthographicCamera(
			width / -2,
			width / 2,
			height / 2,
			height / -2,
			0.00001,
			1000,
		);
		let geometry = new THREE.BufferGeometry();
		let vertices = new Float32Array([
			-1.0, -1.0, 0.0, 3.0, -1.0, 0.0, -1.0, 3.0, 0.0,
		]);
		let uvs = new Float32Array([0.0, 0.0, 2.0, 0.0, 0.0, 2.0]);
		geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
		geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

		this.orthoQuad = new THREE.Mesh(geometry, this.shader);
		this.orthoQuad.scale.set(width, height, 1);
		this.orthoScene.add(this.orthoQuad);
	}

	get texture() {
		return this.fbo.texture;
	}

	render(final) {
		this.renderer.setRenderTarget(final ? null : this.fbo);
		this.renderer.render(this.orthoScene, this.orthoCamera);
		this.renderer.setRenderTarget(null);
	}

	setSize(width, height) {
		this.orthoQuad.scale.set(width, height, 1);

		this.fbo.setSize(width, height);

		this.orthoCamera.left = -width / 2;
		this.orthoCamera.right = width / 2;
		this.orthoCamera.top = height / 2;
		this.orthoCamera.bottom = -height / 2;
		this.orthoCamera.updateProjectionMatrix();
	}
}

export default class Main {
	constructor() {
		this.updates = [];
		this.resizes = [];
		this.meshes = [];
		this.running = true;
		this.seed = Math.random();
		this.mouse = new THREE.Vector2(100, 100);

		this._initRenderer();
		this._initScene();
		this._initNoise();
		this._initMeshes();
		this._initInteraction();
		this._initEventListeners();

		this.addUpdate(() => this.update());
		this.addResize((w, h, dPR) => this.resizeSketch(w, h, dPR));

		this.resize();
		this.randomize();

		this.renderer.setAnimationLoop(() => this.render());
	}

	_initRenderer() {
		this.canvas = document.getElementById("tex");

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			preserveDrawingBuffer: true,
			powerPreference: "high-performance",
		});

		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setClearColor(0x202020, 0);
	}

	_initScene() {
		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		this.camera.position.set(0, 0, 2);
		this.camera.lookAt(this.scene.position);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enablePan = false;
		this.controls.enableZoom = false;
		this.controls.minAzimuthAngle = -0.5;
		this.controls.maxAzimuthAngle = 0.5;
		this.controls.minPolarAngle = Math.PI / 2 - 0.5;
		this.controls.maxPolarAngle = Math.PI / 2 + 0.5;
	}

	_initNoise() {
		this.noiseShader = new THREE.RawShaderMaterial({
			uniforms: { seed: { value: this.seed }, time: { value: 0 } },
			vertexShader: noiseVert,
			fragmentShader: noiseFrag.replace("// noise3d is injected here", noise3d),
			glslVersion: THREE.GLSL3,
		});

		this.noiseTexture = new ShaderTexture(
			this.renderer,
			this.noiseShader,
			2048,
			2048,
			null,
			THREE.HalfFloatType,
		);
		this.noiseTexture.render();
	}

	_initMeshes() {
		const loader = new THREE.TextureLoader();
		this.paper = loader.load(watercolorUrl);

		this.layers = 10;
		for (let i = 0; i < this.layers; i++) {
			const material = new THREE.RawShaderMaterial({
				uniforms: {
					paper: { value: this.paper },
					noise: { value: this.noiseTexture.texture },
					time: { value: 0 },
					layer: { value: i / (4 * this.layers) },
					scale: { value: 0.95 },
					lightPosition: { value: new THREE.Vector2(0, 0.7) },
					color: { value: new THREE.Color() },
					seed: { value: this.seed },
					resolution: {
						value: new THREE.Vector2(window.innerWidth, window.innerHeight),
					},
				},
				vertexShader: mainVert,
				fragmentShader: mainFrag.replace(
					"// hsl (including aastep) is injected here",
					hsl,
				),
				side: THREE.DoubleSide,
				glslVersion: THREE.GLSL3,
				transparent: true,
				depthTest: false,
				depthWrite: false,
			});
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
			mesh.position.z = this.layers / 40 - i / (2 * this.layers);
			this.scene.add(mesh);
			this.meshes.push(mesh);
		}
	}

	_initInteraction() {
		this.raycaster = new THREE.Raycaster();
		this.plane = new THREE.Mesh(
			new THREE.PlaneGeometry(100, 100),
			new THREE.MeshNormalMaterial(),
		);
		this.plane.visible = false;
		this.scene.add(this.plane);
	}

	_initEventListeners() {
		window.addEventListener("resize", () => this.resize());
		window.addEventListener("pointermove", (e) => this.onMouseMove(e), false);

		const randomizeBtn = document.querySelector("#randomizeBtn");
		if (randomizeBtn) {
			randomizeBtn.addEventListener("click", () => this.randomize());
		}

		const pauseBtn = document.querySelector("#pauseBtn");
		if (pauseBtn) {
			pauseBtn.addEventListener("click", () => {
				this.running = !this.running;
			});
		}

		window.addEventListener("keydown", (e) => {
			if (e.code === "Space") this.running = !this.running;
			if (e.code === "KeyR") this.randomize();
		});
	}

	addUpdate(fn) {
		this.updates.push(fn);
	}

	addResize(fn) {
		this.resizes.push(fn);
	}

	onMouseMove(event) {
		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
	}

	randomizeColors() {
		const palettes = [
			warm,
			natural,
			natural2,
			circus,
			seaside,
			warm2,
			warm3,
			circus2,
		];
		const palette = palettes[Math.floor(Math.random() * palettes.length)];
		const gradient = new GradientLinear(palette);
		for (const mesh of this.meshes) {
			const c = gradient.getAt(Math.random());
			mesh.material.uniforms.color.value.set(c);
		}
	}

	randomize() {
		this.randomizeColors();
		this.noiseShader.uniforms.seed.value = Math.random() * 1000;
		this.noiseTexture.render();
	}

	update() {
		const t = performance.now() / 10000;

		this.raycaster.setFromCamera(this.mouse, this.camera);
		const intersects = this.raycaster.intersectObject(this.plane);

		if (intersects.length) {
			const point = intersects[0].point;
			for (const mesh of this.meshes) {
				mesh.material.uniforms.lightPosition.value.copy(point);
			}
		}

		if (this.running) {
			this.noiseTexture.shader.uniforms.time.value = t;
			this.noiseTexture.render();
		}
	}

	resize() {
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setPixelRatio(window.devicePixelRatio);
		const dPR = this.renderer.getPixelRatio();

		for (const fn of this.resizes) {
			fn(w, h, dPR);
		}
	}

	resizeSketch(w, h, dPR) {
		for (const mesh of this.meshes) {
			mesh.material.uniforms.lightPosition.value.set(w * dPR, h * dPR);
			mesh.material.uniforms.resolution.value.set(w * dPR, h * dPR);
		}
	}

	render() {
		for (const fn of this.updates) {
			fn();
		}
		this.renderer.render(this.scene, this.camera);
	}

	destroy() {
		// アニメーションループを停止
		this.running = false;

		// メモリをクリーンアップ
		this.noiseTexture.fbo.dispose();
		this.noiseShader.dispose();

		for (const mesh of this.meshes) {
			mesh.geometry.dispose();
			mesh.material.dispose();
		}

		if (this.paper) {
			this.paper.dispose();
		}

		this.renderer.dispose();
	}
}
