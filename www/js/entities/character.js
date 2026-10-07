/* character.js — качественная скелетная модель игрока (glTF + анимации).
   Модели: www/models/player.glb (Idle/Walk/Run), www/models/player_f.glb (idle/walk/run).
   Если модель не загрузилась — вызывающий код откатывается на процедурный Humanoid. */

import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../../vendor/SkeletonUtils.js';

export const MODELS = {
  m: { url: 'models/player.glb',   scale: 1.0,  yaw: Math.PI, idle: 'Idle', walk: 'Walk', run: 'Run' },
  f: { url: 'models/player_f.glb', scale: 1.05, yaw: Math.PI, idle: 'idle', walk: 'walk', run: 'run' }
};

const cache = new Map();   // url -> Promise<{scene, animations}>

/** Грузит (и кэширует) glTF-модель. */
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

/** Предзагрузка обеих моделей — вызывается на этапе загрузки игры. */
export async function preloadCharacters() {
  const res = await Promise.allSettled(Object.values(MODELS).map(m => loadModel(m.url)));
  return res.filter(r => r.status === 'fulfilled').length;
}

/**
 * Скелетный персонаж с плавными переходами idle → walk → run.
 * API совместим с процедурным Humanoid: .root, .update(dt, state, speed), .setTint().
 */
export class Character {
  constructor(gltf, spec, look = {}) {
    this.spec = spec;
    this.root = new THREE.Group();

    const model = skeletonClone(gltf.scene);
    model.scale.setScalar(spec.scale * (look.height ? look.height / 1.78 : 1));
    model.rotation.y = spec.yaw || 0;   // модель смотрит в +Z, как процедурный Humanoid
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      // материал клонируем, чтобы можно было подкрасить под выбор игрока
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    });
    this.model = model;
    this.root.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    const byName = {};
    for (const clip of gltf.animations) byName[clip.name] = clip;
    this.actions = {
      idle: byName[spec.idle] && this.mixer.clipAction(byName[spec.idle]),
      walk: byName[spec.walk] && this.mixer.clipAction(byName[spec.walk]),
      run:  byName[spec.run]  && this.mixer.clipAction(byName[spec.run])
    };
    for (const a of Object.values(this.actions)) {
      if (!a) continue;
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
    }
    if (this.actions.idle) this.actions.idle.setEffectiveWeight(1);
    this.current = 'idle';

    this.setTint(look);
  }

  /** Подкрашивает модель под выбор в редакторе персонажа. */
  setTint(look = {}) {
    const top = look.top != null ? new THREE.Color(look.top) : null;
    const skin = look.skin != null ? new THREE.Color(look.skin) : null;
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m.color) continue;
        const isSkin = /joint|skin|body|limb/i.test(m.name || '');
        const c = isSkin ? skin : top;
        if (c) m.color.copy(c).multiplyScalar(0.9).addScalar(0.1);
        m.roughness = isSkin ? 0.78 : 0.62;
        m.metalness = 0.04;
      }
    });
  }

  /** @param {string} state idle|walk|run */
  update(dt, state = 'idle', speed = 0) {
    const want = this.actions[state] ? state : 'idle';
    if (want !== this.current) {
      const from = this.actions[this.current];
      const to = this.actions[want];
      if (to) {
        to.enabled = true;
        to.setEffectiveTimeScale(1);
        to.crossFadeFrom(from || to, 0.22, false);
        to.setEffectiveWeight(1);
        to.play();
      }
      if (from && from !== to) from.setEffectiveWeight(0);
      this.current = want;
    }
    // темп шагов подстраивается под реальную скорость
    const a = this.actions[this.current];
    if (a) {
      const base = this.current === 'run' ? 5.4 : this.current === 'walk' ? 2.1 : 1;
      a.setEffectiveTimeScale(this.current === 'idle' ? 1 : Math.max(0.55, Math.min(1.8, speed / base)));
      a.setEffectiveWeight(1);
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    });
  }
}

/** Создаёт персонажа по полу; null — если модель недоступна. */
export async function makeCharacter(sex = 'm', look = {}) {
  const spec = MODELS[sex] || MODELS.m;
  try {
    const gltf = await loadModel(spec.url);
    return new Character(gltf, spec, look);
  } catch {
    return null;
  }
}
