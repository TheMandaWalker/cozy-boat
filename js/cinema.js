import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Final colour pass: light rays from the sun, a soft warm grade, a touch of
// chromatic aberration at the edges, vignette and film grain.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
    uRays: { value: 0 },
    uRayColor: { value: new THREE.Color('#ffe2b0') },
    uAberration: { value: 0.0016 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.025 },
    uWarm: { value: 0.5 },
    uSaturation: { value: 1.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uSunUV;
    uniform float uRays;
    uniform vec3 uRayColor;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uWarm;
    uniform float uSaturation;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // Chromatic aberration grows towards the corners, like a real lens.
      vec2 shift = c * uAberration * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + shift).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - shift).b;

      // Volumetric-looking rays: march from the pixel towards the sun and
      // accumulate only the bright parts of the image (sky glow, glitter, lanterns).
      if (uRays > 0.001) {
        vec2 delta = (uSunUV - uv) / 28.0;
        vec2 p = uv;
        float decay = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 28; i++) {
          p += delta;
          vec3 s = texture2D(tDiffuse, clamp(p, 0.0, 1.0)).rgb;
          float bright = max(luma(s) - 0.7, 0.0);
          acc += bright * decay;
          decay *= 0.94;
        }
        col += acc * uRays * uRayColor / 28.0;
      }

      // Warm grade: lift the shadows a little towards amber, keep highlights clean.
      float l = luma(col);
      vec3 warmTint = vec3(1.04, 1.0, 0.92);
      vec3 coolShadow = vec3(0.96, 0.99, 1.06);
      col *= mix(coolShadow, warmTint, smoothstep(0.0, 0.8, l) * uWarm + 0.5 * uWarm * (1.0 - l));

      // Saturation.
      float lum = luma(col);
      col = mix(vec3(lum), col, uSaturation);

      // Vignette.
      col *= 1.0 - uVignette * smoothstep(0.25, 1.1, length(c) * 1.45);

      // Film grain, static per frame so it reads as texture, not noise.
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function createPipeline(renderer, scene, camera, { width, height, pixelRatio }) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));

  const bokeh = new BokehPass(scene, camera, {
    focus: 18,
    aperture: 0.003,
    maxblur: 0.01,
  });
  composer.addPass(bokeh);

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.42, 0.6, 0.92);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  const sunWorld = new THREE.Vector3();
  const sunProjected = new THREE.Vector3();

  // Called every frame with the current light direction and palette.
  function updateGrade({ time, lightDir, sunVis, night, focusDistance, cinematic }) {
    const u = grade.uniforms;
    u.uTime.value = time;

    // Project a point far along the light direction onto the screen.
    sunWorld.copy(lightDir).multiplyScalar(500).add(camera.position);
    sunProjected.copy(sunWorld).project(camera);
    const inFront = sunProjected.z < 1;
    u.uSunUV.value.set(sunProjected.x * 0.5 + 0.5, sunProjected.y * 0.5 + 0.5);
    u.uRays.value = inFront ? 0.22 * sunVis * (1 - night * 0.6) : 0;

    // Cinematic mode tightens the lens and deepens the vignette.
    u.uVignette.value = cinematic ? 0.55 : 0.32;
    u.uGrain.value = cinematic ? 0.018 : 0.01;
    u.uAberration.value = cinematic ? 0.0028 : 0.0016;

    bokeh.uniforms.focus.value = focusDistance;
    bokeh.uniforms.aperture.value = cinematic ? 0.0065 : 0.003;
    bokeh.uniforms.maxblur.value = cinematic ? 0.016 : 0.01;
  }

  function setSize(w, h, pr) {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
  }

  function render() {
    composer.render();
  }

  return { composer, bloom, bokeh, grade, updateGrade, setSize, render };
}
