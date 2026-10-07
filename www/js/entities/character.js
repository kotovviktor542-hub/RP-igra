/* character.js — реалистичная скелетная модель персонажа (glTF, скелет Mixamo).
   www/models/male.glb и female.glb — гражданские модели с PBR-текстурами,
   www/models/anims.glb — общая библиотека анимаций (idle / walk / run / jump).
   Если что-то не загрузилось, вызывающий код остаётся на процедурном Humanoid. */

import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../../vendor/SkeletonUtils.js';

export const MODELS = {
  m: { url: 'models/male.glb',   height: 1.80 },
  f: { url: 'models/female.glb', height: 1.70 }
};
export const ANIM_URL = 'models/anims.glb';

const cache = new Map();   // url -> Promise<{scene, animations}>

export function loadModel(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      new GLTFLoader().load(url,
        g => resolve({ scene: g.scene, animations: g.animations }),
        undefined,
        err => reject(err));
    }));
  }
  return cache.get(url);
}

/** Предзагрузка моделей и анимаций на этапе загрузки игры. */
export async function preloadCharacters() {
  const res = await Promise.allSettled([
    loadModel(MODELS.m.url), loadModel(MODELS.f.url), loadModel(ANIM_URL)
  ]);
  return res.filter(r => r.status === 'fulfilled').length;
}

/**
 * Скелетный персонаж с плавными переходами idle → walk → run.
 * API совместим с процедурным Humanoid: .root, .update(dt, state, speed).
 */
export class Character {
  constructor(gltf, animGltf, spec, look = {}) {
    this.root = new THREE.Group();

    const model = skeletonClone(gltf.scene);
    model.updateMatrixWorld(true);

    // приводим рост к выбранному в редакторе
    const box = new THREE.Box3().setFromObject(model);
    const h = Math.max(0.1, box.max.y - box.min.y);
    const target = (look.height || spec.height || 1.78);
    const k = target / h;
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;

    model.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.FrontSide;
        if (m.map) m.map.anisotropy = 4;
      }
    });

    this.model = model;
    this.root.add(model);

    const clips = (animGltf && animGltf.animations) || gltf.animations || [];
    this.mixer = new THREE.AnimationMixer(model);
    const find = n => clips.find(c => c.name === n) || null;
    this.actions = {
      idle: this._action(find('idle')),
      walk: this._action(find('walk')),
      run: this._action(find('run')),
      jump: this._action(find('jump'))
    };
    if (this.actions.idle) this.actions.idle.setEffectiveWeight(1);
    this.current = 'idle';
  }

  _action(clip) {
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    return a;
  }

  /** Перекраска под редактор персонажа тут не нужна — у моделей свои текстуры. */
  setTint() { /* no-op */ }

  /** @param {string} state idle|walk|run|sit|drive */
  update(dt, state = 'idle', speed = 0) {
    let want = state;
    if (want === 'sit' || want === 'drive') want = 'idle';
    if (!this.actions[want]) want = 'idle';

    if (want !== this.current) {
      const from = this.actions[this.current];
      const to = this.actions[want];
      if (to) {
        to.enabled = true;
        to.setEffectiveTimeScale(1);
        to.crossFadeFrom(from || to, 0.2, false);
        to.setEffectiveWeight(1);
        to.play();
      }
      if (from && from !== to) from.setEffectiveWeight(0);
      this.current = want;
    }

    const a = this.actions[this.current];
    if (a) {
      const base = this.current === 'run' ? 6.2 : this.current === 'walk' ? 2.6 : 1;
      a.setEffectiveTimeScale(this.current === 'idle' ? 1 : Math.max(0.6, Math.min(1.7, speed / base)));
      a.setEffectiveWeight(1);
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
  }
}

/** Создаёт персонажа по полу; null — если модель недоступна. */
export async function makeCharacter(sex = 'm', look = {}) {
  const spec = MODELS[sex] || MODELS.m;
  try {
    const [gltf, anims] = await Promise.all([loadModel(spec.url), loadModel(ANIM_URL)]);
    return new Character(gltf, anims, spec, look);
  } catch {
    return null;
  }
}
