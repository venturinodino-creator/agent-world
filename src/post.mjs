// The "render" look: screen-space ambient occlusion (soft darkening in creases and under things, which is what makes
// flat shapes read as solid), bloom on the glowing parts, a gentle tilt-shift blur towards the top and bottom of the
// picture like a photographed miniature, and a final grade with a soft vignette. Costs real GPU time, so it can be
// switched off (header button) and switches itself off on a machine that cannot keep up. Browser only.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// blur that grows with distance from a horizontal band of focus (a 12-tap spiral, cheap enough for every frame)
const TILT = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, focus: { value: 0.52 }, band: { value: 0.26 }, amount: { value: 2.8 } },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float focus; uniform float band; uniform float amount; varying vec2 vUv;
    void main(){
      float d = max(0.0, abs(vUv.y - focus) - band), r = clamp(d * 4.0, 0.0, 1.0) * amount;
      vec4 sum = texture2D(tDiffuse, vUv);
      for (int i = 1; i <= 12; i++) {
        float a = float(i) * 2.399963, rr = sqrt(float(i) / 12.0) * r;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rr / resolution);
      }
      gl_FragColor = sum / 13.0;
    }`,
};

// final grade in display colour: vignette, a touch of saturation and contrast, a warm lift
const GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float vig = smoothstep(1.0, 0.3, length((vUv - 0.5) * vec2(1.0, 0.92)));
      c.rgb *= mix(0.72, 1.0, vig);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.14);
      c.rgb = (c.rgb - 0.5) * 1.07 + 0.5;
      c.rgb *= vec3(1.02, 1.0, 0.97);
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera, w, h, { on = true, auto = true, onAuto = () => {} } = {}) {
  // multisampled, so edges stay smooth even though the picture goes through several passes
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, w, h);
  ao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.4, thickness: 1.4, scale: 1.35, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  ao.blendIntensity = 1.0;
  composer.addPass(ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.95);
  composer.addPass(bloom);
  const tilt = new ShaderPass(TILT); composer.addPass(tilt);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE));

  const state = { on, last: 0, ema: 0, frames: 0 };
  const setSize = (nw, nh) => { composer.setSize(nw, nh); const px = renderer.getPixelRatio(); tilt.uniforms.resolution.value.set(nw * px, nh * px); };
  setSize(w, h);

  return {
    get enabled() { return state.on; },
    setEnabled(v) { state.on = !!v; state.frames = 0; state.ema = 0; },
    setSize,
    render() { if (state.on) composer.render(); else renderer.render(scene, camera); },
    // Called once per frame; if the effects make the picture slower than about 16 frames a second for a couple of
    // seconds, they switch off (only in automatic mode, and long gaps from a hidden tab are ignored).
    tick(now) {
      const dt = now - state.last; state.last = now;
      if (!state.on || !auto || dt > 400 || dt <= 0) return;
      state.ema = state.ema ? state.ema * 0.94 + dt * 0.06 : dt; state.frames++;
      if (state.frames > 150 && state.ema > 62) { state.on = false; onAuto(); }
    },
  };
}
