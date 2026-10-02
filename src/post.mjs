// The "render" look: screen-space ambient occlusion (soft darkening in creases and under things, which is what makes
// flat shapes read as solid), bloom on the glowing parts, a gentle tilt-shift blur towards the top and bottom of the
// picture like a photographed miniature, and a final grade with a soft vignette.
//
// These cost real GPU time, so the pipeline keeps itself smooth: the occlusion and bloom run at half resolution, and in
// automatic mode it steps down through cheaper levels (lower resolution, then no occlusion, then no effects) whenever
// the frame rate falls under about 33 fps. The fx button in the header forces the full look on or turns it all off.
// Browser only.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
      c.rgb *= vec3(1.02, 1.0, 0.97);
      gl_FragColor = c;
    }`,
};

// Quality levels, best first: pixel ratio (as a share of the screen's, capped) and whether occlusion runs.
const dpr = () => window.devicePixelRatio || 1;
const LEVELS = [
  { ratio: () => Math.min(dpr(), 1.25), ao: true },
  { ratio: () => Math.min(dpr(), 1), ao: true },
  { ratio: () => Math.min(dpr(), 1) * 0.85, ao: false },
  { ratio: () => Math.min(dpr(), 1), ao: false, off: true },   // no effects at all
];
const PLAIN_RATIO = () => Math.min(dpr(), 1.5);

export function createPost(renderer, scene, camera, w, h, { on = true, auto = true, onAuto = () => {} } = {}) {
  // multisampled, so edges stay smooth even though the picture goes through several passes
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, w, h);
  ao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.4, thickness: 1.4, scale: 1.35, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
  ao.blendIntensity = 1.0;
  // flat floating things (zzz, alert and work icons, contact-shadow discs, rings) would cast a square shadow of their
  // own into the occlusion, so they sit out of that pass
  const hide = ao.overrideVisibility.bind(ao);
  ao.overrideVisibility = () => { hide(); scene.traverse(o => { if (o.isSprite || (o.material && o.material.transparent)) o.visible = false; }); };
  composer.addPass(ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.95);
  composer.addPass(bloom);
  const tilt = new ShaderPass(TILT); composer.addPass(tilt);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE));

  const st = { on, level: 0, w, h, last: 0, ema: 0, frames: 0 };
  const layout = () => {
    const px = renderer.getPixelRatio();
    composer.setPixelRatio(px); composer.setSize(st.w, st.h);
    // occlusion and bloom do not need every pixel: half resolution looks the same once blurred and is about 4x cheaper
    ao.setSize(Math.round((st.w * px) / 2), Math.round((st.h * px) / 2));
    bloom.setSize(Math.round((st.w * px) / 2), Math.round((st.h * px) / 2));
    tilt.uniforms.resolution.value.set(st.w * px, st.h * px);
  };
  const apply = () => {
    const lv = LEVELS[st.level];
    renderer.setPixelRatio(st.on && !lv.off ? lv.ratio() : PLAIN_RATIO());
    ao.enabled = lv.ao;
    layout();
  };
  apply();

  return {
    get enabled() { return st.on && !LEVELS[st.level].off; },
    setEnabled(v) { st.on = !!v; st.level = 0; st.frames = 0; st.ema = 0; apply(); },
    setSize(nw, nh) { st.w = nw; st.h = nh; layout(); },
    render() { if (st.on && !LEVELS[st.level].off) composer.render(); else renderer.render(scene, camera); },
    // Called once per frame. In automatic mode, a couple of seconds under about 33 fps drops to the next cheaper
    // level (never back up, so it cannot flicker between looks). Long gaps from a hidden tab are ignored.
    tick(now) {
      const dt = now - st.last; st.last = now;
      if (!st.on || !auto || dt > 400 || dt <= 0 || st.level >= LEVELS.length - 1) return;
      st.ema = st.ema ? st.ema * 0.94 + dt * 0.06 : dt; st.frames++;
      if (st.frames > 90 && st.ema > 30) { st.level++; st.frames = 0; st.ema = 0; apply(); onAuto(st.level); }
    },
  };
}
