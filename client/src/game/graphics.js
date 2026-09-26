// Render pipeline with two quality levels:
//   high — multisampled post-processing with ambient occlusion (GTAO) and a gentle bloom
//   low  — plain forward rendering, smaller shadow map, lower resolution
// The game starts on high and drops to low automatically if the frame rate suffers.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const STORE_KEY = 'bw-graphics';

export class Graphics {
  constructor(renderer, scene, camera, sun) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sun = sun;
    this.composer = null;
    this.userChose = false;
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch { /* ignore */ }
    if (saved === 'high' || saved === 'low') this.userChose = true;
    this.fpsSamples = [];
    this.autoChecked = false;
    this.setQuality(saved || 'high');
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'high' ? 1.5 : 1.25));
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (q === 'high') this.buildComposer();
    this.resize(window.innerWidth, window.innerHeight);
  }

  toggle() {
    this.userChose = true;
    const next = this.quality === 'high' ? 'low' : 'high';
    try { localStorage.setItem(STORE_KEY, next); } catch { /* ignore */ }
    this.setQuality(next);
    return next;
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    ao.output = GTAOPass.OUTPUT.Default;
    // Only solid geometry should occlude: skip sprites (clouds, nameplates),
    // transparent surfaces, the sky dome and back-face ink outlines.
    ao._overrideVisibility = function overrideVisibility() {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        if (!o.visible) return;
        const m = o.material;
        const skip = o.isPoints || o.isLine || o.isSprite || o.userData.noAO
          || (m && !Array.isArray(m) && (m.transparent || m.side === THREE.BackSide));
        if (skip) {
          o.visible = false;
          cache.push(o);
        }
      });
    };
    ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12, distanceFallOff: 1 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(ao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.55, 1.4);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // Returns a message if quality was changed automatically.
  render(dt) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    if (this.autoChecked || this.userChose || dt <= 0) return null;
    this.fpsSamples.push(dt);
    const total = this.fpsSamples.reduce((a, b) => a + b, 0);
    if (total < 5) return null;
    this.autoChecked = true;
    const fps = this.fpsSamples.length / total;
    if (this.quality === 'high' && fps < 38) {
      this.setQuality('low');
      return 'Graphics set to Low for smoother play (press G to change)';
    }
    return null;
  }

  dispose() {
    this.composer?.dispose();
  }
}
