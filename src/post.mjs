// The "render" look: screen-space ambient occlusion (soft darkening in creases and under things, which is what makes
// flat shapes read as solid), bloom on the glowing parts, a gentle tilt-shift blur towards the top and bottom of the
// picture like a photographed miniature, and a final grade with a soft vignette.
//
// These cost real GPU time, so the pipeline works to stay smooth:
//  - ambient occlusion only runs when the camera is close enough for it to be visible, and fades in as you zoom;
//  - occlusion and bloom run at half resolution, and edges are smoothed with a cheap FXAA pass, not multisampling;
//  - in automatic mode it first lowers the render resolution a step at a time whenever the frame rate drops under
//    about 40 fps, and only when that is not enough does it drop occlusion, then every effect.
// The fx button in the header forces the full look on or turns it all off. Browser only.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// blur that grows with distance from a horizontal band of focus; pixels inside the band cost a single read
const TILT = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, focus: { value: 0.52 }, band: { value: 0.26 }, amount: { value: 2.8 } },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float focus; uniform float band; uniform float amount; varying vec2 vUv;
    void main(){
      float d = max(0.0, abs(vUv.y - focus) - band), r = clamp(d * 4.0, 0.0, 1.0) * amount;
      vec4 sum = texture2D(tDiffuse, vUv);
      if (r < 0.4) { gl_FragColor = sum; return; }
      for (int i = 1; i <= 8; i++) {
        float a = float(i) * 2.399963, rr = sqrt(float(i) / 8.0) * r;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rr / resolution);
      }
      gl_FragColor = sum / 9.0;
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
      c.rgb *= vec3(1.0, 1.0, 1.03);
      gl_FragColor = c;
    }`,
};

const dpr = () => window.devicePixelRatio || 1;
const TOP_RATIO = () => Math.min(dpr(), 1.75);   // the sharpest the effects render
const PLAIN_RATIO = () => Math.min(dpr(), 1.75); // with effects off
const MIN_SCALE = 0.6, SCALE_STEP = 0.1;         // the resolution can drop to 60% of that, in tenths
const AO_NEAR = 22, AO_FAR = 46;                 // camera distances: full occlusion inside, none beyond
const SLOW_MS = 25;                              // slower than this for a couple of seconds (under 40 fps) steps quality down
// Levels, best first, after the resolution has been used up: occlusion on, occlusion off, no effects.
const LEVELS = [{ ao: true }, { ao: false }, { ao: false, off: true }];

export function createPost(renderer, scene, camera, w, h, { on = true, auto = true, onAuto = () => {} } = {}) {
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, w, h);
  ao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.4, thickness: 1.4, scale: 1.35, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
  // Flat floating things (zzz, icons, contact-shadow discs, rings) and the many small instanced figures and props
  // would cost draw calls in the occlusion pass without changing it visibly, so they sit it out.
  const hide = ao.overrideVisibility.bind(ao);
  ao.overrideVisibility = () => { hide(); scene.traverse(o => { if (o.isSprite || o.isInstancedMesh || (o.material && o.material.transparent)) o.visible = false; }); };
  composer.addPass(ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.95);
  composer.addPass(bloom);
  const tilt = new ShaderPass(TILT); composer.addPass(tilt);
  composer.addPass(new OutputPass());
  const fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
  composer.addPass(new ShaderPass(GRADE));

  const st = { on, level: 0, scale: 1, w, h, last: 0, ema: 0, frames: 0 };
  const off = () => !st.on || !!LEVELS[st.level].off;
  const layout = () => {
    const px = renderer.getPixelRatio();
    composer.setPixelRatio(px); composer.setSize(st.w, st.h);
    // occlusion and bloom do not need every pixel: half resolution looks the same once blurred and is about 4x cheaper
    ao.setSize(Math.round((st.w * px) / 2), Math.round((st.h * px) / 2));
    bloom.setSize(Math.round((st.w * px) / 2), Math.round((st.h * px) / 2));
    tilt.uniforms.resolution.value.set(st.w * px, st.h * px);
    fxaa.material.uniforms.resolution.value.set(1 / (st.w * px), 1 / (st.h * px));
  };
  const apply = () => {
    renderer.setPixelRatio(off() ? PLAIN_RATIO() : TOP_RATIO() * st.scale);
    layout();
  };
  apply();

  return {
    get enabled() { return !off(); },
    setEnabled(v) { st.on = !!v; st.level = 0; st.scale = 1; st.frames = 0; st.ema = 0; apply(); },
    setSize(nw, nh) { st.w = nw; st.h = nh; layout(); },
    // `distance` is how far the camera is from what it looks at; occlusion fades out as it grows.
    render(distance = 0) {
      if (off()) { renderer.render(scene, camera); return; }
      const near = THREE.MathUtils.clamp((AO_FAR - distance) / (AO_FAR - AO_NEAR), 0, 1);
      ao.enabled = LEVELS[st.level].ao && near > 0.04; ao.blendIntensity = near;
      composer.render();
    },
    // Called once per frame. In automatic mode, a couple of seconds under SLOW_MS steps the quality down one notch:
    // first the render resolution, then occlusion, then every effect. It never steps back up, so it cannot flicker
    // between looks. Long gaps from a hidden tab are ignored.
    tick(now) {
      const dt = now - st.last; st.last = now;
      if (!st.on || !auto || dt > 400 || dt <= 0 || st.level >= LEVELS.length - 1) return;
      st.ema = st.ema ? st.ema * 0.94 + dt * 0.06 : dt; st.frames++;
      if (st.frames <= 90 || st.ema <= SLOW_MS) return;
      st.frames = 0; st.ema = 0;
      if (st.scale > MIN_SCALE + 1e-6) st.scale = Math.max(MIN_SCALE, +(st.scale - SCALE_STEP).toFixed(2));
      else { st.level++; st.scale = 1; onAuto(st.level); }
      apply();
    },
  };
}
