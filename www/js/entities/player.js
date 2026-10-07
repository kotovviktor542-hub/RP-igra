/* player.js — контроллер игрока: ходьба, бег, прыжок, камера от третьего лица,
   посадка/высадка из транспорта. */

import * as THREE from '../../vendor/three.module.js';
import { Humanoid } from './humanoid.js';
import { makeCharacter } from './character.js';
import { clamp, damp, resolveCircleBoxes, dist2D } from '../core/utils.js';

const WALK = 2.6;
const RUN = 6.2;
const RADIUS = 0.42;
const PUNCH_TIME = 0.42;
const RECOIL_TIME = 0.26;

/* переиспользуемые временные объекты, чтобы не мусорить в куче каждый кадр */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

/** Небольшой пистолет из нескольких деталей: рамка, затвор, ствол, рукоять, скоба. */
function makePistol() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.85, roughness: 0.35 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.15, roughness: 0.8 });

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.038, 0.032), steel);
  slide.position.set(0.02, 0.052, 0);
  g.add(slide);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.028), steel);
  frame.position.set(0.012, 0.028, 0);
  g.add(frame);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10), steel);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.112, 0.052, 0);
  g.add(barrel);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.1, 0.028), grip);
  handle.position.set(-0.042, -0.025, 0);
  handle.rotation.z = 0.22;
  g.add(handle);

  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 12, Math.PI * 1.2), steel);
  guard.rotation.set(Math.PI / 2, 0, -0.4);
  guard.position.set(-0.004, -0.004, 0);
  g.add(guard);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, 0.008), steel);
  sight.position.set(0.09, 0.075, 0);
  g.add(sight);

  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.08, 7),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }));
  flash.name = 'flash';
  flash.rotation.z = -Math.PI / 2;
  flash.position.set(0.17, 0.052, 0);
  flash.visible = false;
  g.add(flash);

  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}

export class Player {
  constructor(scene, camera, look) {
    this.scene = scene;
    this.camera = camera;
    this.body = new Humanoid(look);
    this.root = this.body.root;
    scene.add(this.root);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.yOffset = 0;
    this.vy = 0;
    this.grounded = true;

    this.camYaw = 0;
    this.camPitch = 0.22;
    this.camDist = 5.2;
    this.camTargetDist = 5.2;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();

    this.vehicle = null;      // активный транспорт
    this.mode = 'foot';       // foot | drive
    this.moveState = 'idle';
    this.speed = 0;
    this.distWalked = 0;
    this.distDriven = 0;
    this.firstPerson = false;
    this.usingModel = false;

    // бой и прицеливание
    this.punchT = 0;          // прогресс текущего удара (сек, вниз от PUNCH_TIME)
    this.punchCd = 0;         // перезарядка
    this.punchHand = 1;       // 1 — правая, -1 — левая (чередуем)
    this.aiming = false;
    this._bones = null;
    this._restSaved = null;
    this._swing = 0;
    // настраиваемая «расслабленная» поза рук (локальные углы костей Mixamo)
    this.restPose = { out: 0.22, bend: 0.22 };

    // оружие
    this.weapon = null;       // 3D-модель в руке
    this.weaponKind = null;   // 'pistol' | null
    this.recoilT = 0;         // таймер отдачи
    this.fireCd = 0;
    this.camKick = 0;         // подброс камеры от выстрела
    this._flash = null;
  }

  /**
   * Заменяет процедурного человечка качественной скелетной моделью (glTF).
   * Тихо ничего не делает, если модель не загрузилась.
   */
  async upgradeModel(look = {}) {
    const ch = await makeCharacter(look.gender === 'f' ? 'f' : 'm', look);
    if (!ch) return false;
    const pos = this.root.position.clone();
    const rot = this.root.rotation.y;
    const vis = this.root.visible;
    this.scene.remove(this.root);
    this.body.dispose && this.body.dispose();
    this.body = ch;
    this.root = ch.root;
    this.root.position.copy(pos);
    this.root.rotation.y = rot;
    this.root.visible = vis;
    this.scene.add(this.root);
    this.usingModel = true;
    this._bones = null;
    if (this.weaponKind) this.equipWeapon(this.weaponKind);
    return true;
  }

  setLook(look) {
    if (this.usingModel && this.body.setTint) { this.body.setTint(look); return; }
    const pos = this.root.position.clone();
    const rot = this.root.rotation.y;
    this.scene.remove(this.root);
    this.body.dispose();
    this.body = new Humanoid(look);
    this.root = this.body.root;
    this.root.position.copy(pos);
    this.root.rotation.y = rot;
    this.scene.add(this.root);
    this._bones = null;
    if (this.weaponKind) this.equipWeapon(this.weaponKind);
  }

  teleport(x, z, rot = 0) {
    this.pos.set(x, 0, z);
    this.heading = rot;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = rot;
  }

  /* ---------- управление камерой ---------- */
  orbit(dx, dy) {
    this.camYaw -= dx * 0.0042;
    this.camPitch = clamp(this.camPitch + dy * 0.0035, -0.45, 1.15);
  }

  /** Берёт/убирает оружие в правую руку. */
  equipWeapon(kind) {
    const b = this._armBones();
    if (this.weapon) {
      this.weapon.parent && this.weapon.parent.remove(this.weapon);
      this.weapon.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.weapon = null;
    }
    this.weaponKind = kind || null;
    if (!kind || !b || b.proc || !b.handR) return false;
    // кость кисти может быть в «сантиметровых» единицах — компенсируем масштаб
    b.handR.updateWorldMatrix(true, false);
    b.handR.getWorldScale(_v1);
    const inv = 1 / (_v1.x || 1);
    this.weapon = new THREE.Group();
    this.weapon.scale.setScalar(inv);
    const gun = makePistol();
    gun.position.set(0.02, 0.0, 0.02);
    gun.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    this.weapon.add(gun);
    b.handR.add(this.weapon);
    this._flash = this.weapon.getObjectByName('flash');
    return true;
  }

  /** Выстрел: отдача руки, подброс камеры, вспышка. */
  fire() {
    if (!this.weaponKind || this.fireCd > 0 || this.mode === 'drive') return false;
    this.recoilT = RECOIL_TIME;
    this.fireCd = 0.3;
    this.camKick = 0.075;
    if (this._flash) { this._flash.visible = true; this._flashT = 0.055; }
    return true;
  }

  /** Начинает удар. Возвращает false, если ещё перезарядка или игрок за рулём. */
  punch() {
    if (this.mode === 'drive' || this.punchCd > 0) return false;
    this.punchT = PUNCH_TIME;
    this.punchCd = PUNCH_TIME + 0.2;
    this.punchHand = -this.punchHand;
    return true;
  }

  /** Момент попадания — середина анимации. */
  get punchHitMoment() { return PUNCH_TIME * 0.55; }

  setAim(on) {
    if (this.mode === 'drive') on = false;
    this.aiming = !!on;
    this.camTargetDist = this.aiming ? 2.4 : 5.2;
    return this.aiming;
  }

  zoom(delta) {
    this.camTargetDist = clamp(this.camTargetDist + delta, 2.2, 11);
  }

  /* ---------- посадка в транспорт ---------- */
  enterVehicle(v) {
    if (!v) return false;
    this.vehicle = v;
    this.mode = 'drive';
    this.aiming = false;
    this.punchT = 0;
    v.driver = this;
    v.engineOn = true;
    this.root.visible = false;
    this.camTargetDist = 7.5;
    return true;
  }

  exitVehicle() {
    if (!this.vehicle) return false;
    const v = this.vehicle;
    const d = v.doorPoint();
    v.driver = null;
    v.engineOn = false;
    this.vehicle = null;
    this.mode = 'foot';
    this.root.visible = true;
    this.pos.set(d.x, 0, d.z);
    this.heading = v.heading + Math.PI / 2;
    this.camTargetDist = 5.2;
    return true;
  }

  /**
   * @param {object} input {mx,my (-1..1 оси движения), run, jump, throttle, steer, brake, handbrake}
   */
  update(dt, input, city) {
    if (this.mode === 'drive' && this.vehicle) {
      this._updateDriving(dt, input, city);
    } else {
      this._updateOnFoot(dt, input, city);
    }
    this._updateCamera(dt, city);
  }

  _updateOnFoot(dt, input, city) {
    const mx = input.mx || 0;
    const my = input.my || 0;
    const mag = Math.min(1, Math.hypot(mx, my));

    let wantSpeed = 0;
    if (mag > 0.08) {
      // направление относительно камеры
      // экранное «вправо» в three.js = (-Fz, Fx), поэтому по X знак обратный
      const ang = Math.atan2(-mx, my) + this.camYaw;
      const target = input.run ? RUN : WALK;
      wantSpeed = target * mag;
      this.heading = this._turnTo(this.heading, ang, dt * 11);
      this.vel.x = Math.sin(ang) * wantSpeed;
      this.vel.z = Math.cos(ang) * wantSpeed;
    } else {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }

    // прыжок
    if (input.jump && this.grounded) {
      this.vy = 4.6;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 14.5 * dt;
      this.yOffset += this.vy * dt;
      if (this.yOffset <= 0) { this.yOffset = 0; this.vy = 0; this.grounded = true; }
    }

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;

    if (city) {
      const boxes = city.collidersNear(nx, nz, RADIUS + 1.5);
      const r = resolveCircleBoxes(nx, nz, RADIUS, boxes);
      nx = r.x; nz = r.z;
    }

    const moved = dist2D(nx, nz, this.pos.x, this.pos.z);
    this.distWalked += moved;
    this.pos.x = nx;
    this.pos.z = nz;
    this.speed = moved / Math.max(dt, 1e-4);

    this.root.position.set(this.pos.x, this.yOffset, this.pos.z);
    this.root.rotation.y = this.heading;

    if (this.aiming) this.heading = this._turnTo(this.heading, this.camYaw, dt * 14);

    let st = 'idle';
    if (!this.grounded) st = 'run';
    else if (this.speed > 4.0) st = 'run';
    else if (this.speed > 0.35) st = 'walk';
    this.moveState = st;
    this.body.update(dt, st, this.speed);

    if (this.punchCd > 0) this.punchCd -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.recoilT > 0) this.recoilT -= dt;
    if (this.camKick > 0) this.camKick = Math.max(0, this.camKick - dt * 0.42);
    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0 && this._flash) this._flash.visible = false;
    }
    if (this.punchT > 0) {
      this.punchT -= dt;
      this._poseArms(1 - Math.max(0, this.punchT) / PUNCH_TIME, this.punchHand);
    } else if (this.aiming) {
      this._poseArms(-1, this.punchHand);   // стойка «руки подняты»
    } else {
      this._relaxArms(dt, st);
    }
  }

  /** Опускает руки вдоль тела поверх клипа и добавляет мах в такт шагам. */
  _relaxArms(dt, st) {
    const b = this._armBones();
    if (!b || b.proc) return;             // процедурный человечек машет сам
    const r = this.restPose;
    const f = st === 'run' ? 2.0 : st === 'walk' ? 1.0 : 0;
    this._swing += dt * (st === 'run' ? 9.5 : 6.0);
    const s = f ? Math.sin(this._swing) * r.swing * f : 0;
    const set = (o, x, y, z) => { if (o) o.rotation.set(x, y, z); };
    set(b.armR, r.armX + s, 0, -r.armZ);
    set(b.armL, r.armX - s, 0, r.armZ);
    const bend = 0.25 + Math.abs(s) * 0.35;
    set(b.foreR, 0, 0, -r.foreZ - bend * 0.6);
    set(b.foreL, 0, 0, r.foreZ + bend * 0.6);
  }

  /** Разворачивает кость так, чтобы она смотрела в заданном направлении (в локальных осях игрока). */
  _aimBone(bone, child, dir) {
    if (!bone || !child) return;
    bone.getWorldPosition(_v1);
    child.getWorldPosition(_v2);
    _v2.sub(_v1);
    if (_v2.lengthSq() < 1e-8) return;
    _v2.normalize();
    _v3.copy(dir).normalize().applyQuaternion(this.root.getWorldQuaternion(_q2));
    _q1.setFromUnitVectors(_v2, _v3);
    bone.getWorldQuaternion(_q3);
    _q1.multiply(_q3);                                  // новое мировое вращение
    bone.parent.getWorldQuaternion(_q3).invert();
    bone.quaternion.copy(_q3.multiply(_q1));
    bone.updateMatrixWorld(true);
  }

  /** Поза рук поверх клипа. k: 0..1 — фаза удара, -1 — стойка прицеливания. */
  _poseArms(k, hand) {
    const b = this._armBones();
    if (!b || b.proc) return;
    this.root.updateMatrixWorld(true);
    const aim = k < 0;
    const punch = aim ? 0 : (k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5);
    const s = hand > 0 ? 1 : -1;

    if (aim) {
      // отдача: ствол и руки подбрасывает вверх-назад
      const r = this.recoilT > 0 ? this.recoilT / RECOIL_TIME : 0;
      const up = r * 0.5, back = r * 0.35;
      const gun = this.weaponKind ? 1 : 0;
      // обе руки вперёд, локти чуть согнуты; с пистолетом руки сведены к центру
      this._aimBone(b.armR, b.foreR, { x: 0.30 - gun * 0.12, y: -0.42 + up, z: 0.86 - back });
      this._aimBone(b.armL, b.foreL, { x: -0.30 + gun * 0.14, y: -0.42 + up * 0.8, z: 0.86 - back });
      this._aimBone(b.foreR, b.handR || b.foreR.children[0], { x: 0.10 - gun * 0.08, y: -0.05 + up, z: 1 });
      this._aimBone(b.foreL, b.handL || b.foreL.children[0], { x: -0.10 + gun * 0.10, y: -0.05 + up * 0.8, z: 1 });
      return;
    }

    // бьющая рука: замах назад → выброс вперёд
    const act = s > 0 ? b.armR : b.armL;
    const actF = s > 0 ? b.foreR : b.foreL;
    const actH = (s > 0 ? b.handR : b.handL) || actF.children[0];
    const off = s > 0 ? b.armL : b.armR;
    const offF = s > 0 ? b.foreL : b.foreR;
    const offH = (s > 0 ? b.handL : b.handR) || offF.children[0];

    const fwd = -0.35 + punch * 1.25;                   // от замаха к выпаду
    this._aimBone(act, actF, { x: s * (0.42 - punch * 0.3), y: -0.55 + punch * 0.35, z: fwd });
    this._aimBone(actF, actH, { x: s * (0.25 - punch * 0.22), y: -0.35 + punch * 0.35, z: -0.1 + punch * 1.3 });
    // вторая рука у корпуса, в защите
    this._aimBone(off, offF, { x: -s * 0.30, y: -0.82, z: 0.42 });
    this._aimBone(offF, offH, { x: -s * 0.15, y: -0.2, z: 0.95 });
    this.recoil = 0;
  }

  /** Опускает руки вдоль тела поверх клипа и добавляет мах в такт шагам. */
  _relaxArms(dt, st) {
    const b = this._armBones();
    if (!b || b.proc) return;                 // процедурный человечек машет сам
    this.root.updateMatrixWorld(true);
    const f = st === 'run' ? 1 : st === 'walk' ? 0.55 : 0;
    this._swing += dt * (st === 'run' ? 9.5 : 6.0);
    const sw = f ? Math.sin(this._swing) * 0.5 * f : 0;
    const out = this.restPose.out;
    const bend = this.restPose.bend + Math.abs(sw) * 0.35;
    this._aimBone(b.armR, b.foreR, { x: out, y: -1, z: sw });
    this._aimBone(b.armL, b.foreL, { x: -out, y: -1, z: -sw });
    this._aimBone(b.foreR, b.handR || b.foreR.children[0], { x: out * 0.6, y: -1, z: sw * 0.8 + bend });
    this._aimBone(b.foreL, b.handL || b.foreL.children[0], { x: -out * 0.6, y: -1, z: -sw * 0.8 + bend });
  }

  _armBones() {
    if (this._bones !== null) return this._bones;
    if (this.usingModel) {
      // имена костей Mixamo после загрузки могут быть 'mixamorig:RightArm'
      // или санитизированные 'mixamorig_RightArm' — ищем по окончанию.
      // имена костей Mixamo после загрузки: 'mixamorigRightArm' / 'mixamorig:RightArm'
      const found = {};
      const want = ['RightForeArm', 'LeftForeArm', 'RightHand', 'LeftHand', 'RightArm', 'LeftArm'];
      this.root.traverse(o => {
        const n = o.name || '';
        for (const w of want) if (n.endsWith(w) && !found[w]) { found[w] = o; break; }
      });
      this._bones = (found.RightArm && found.LeftArm) ? {
        proc: false,
        armR: found.RightArm, armL: found.LeftArm,
        foreR: found.RightForeArm, foreL: found.LeftForeArm,
        handR: found.RightHand, handL: found.LeftHand
      } : false;
    } else if (this.body && this.body.armR) {
      this._bones = {
        proc: true,
        shoulderR: this.body.armR.shoulder, shoulderL: this.body.armL.shoulder,
        elbowR: this.body.armR.elbow, elbowL: this.body.armL.elbow
      };
    } else this._bones = false;
    return this._bones;
  }

  _updateDriving(dt, input, city) {
    const v = this.vehicle;
    const before = { x: v.pos.x, z: v.pos.z };
    v.update(dt, {
      throttle: input.throttle || 0,
      steer: input.steer || 0,
      brake: input.brake || 0,
      handbrake: input.handbrake || false
    }, city);
    this.distDriven += dist2D(v.pos.x, v.pos.z, before.x, before.z);
    this.pos.set(v.pos.x, 0, v.pos.z);
    this.heading = v.heading;
    this.speed = Math.abs(v.speed);
  }

  _turnTo(cur, target, t) {
    let d = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return cur + d * Math.min(1, t);
  }

  _updateCamera(dt, city) {   // pitch учитывает отдачу (camKick)
    this.camDist = damp(this.camDist, this.camTargetDist, 7, dt);

    const driving = this.mode === 'drive' && this.vehicle;
    const focusY = driving ? 1.5 : 1.45;
    const fx = this.pos.x;
    const fz = this.pos.z;
    const fy = focusY + (driving ? 0 : this.yOffset);

    if (this.firstPerson && !driving) {
      const hx = fx + Math.sin(this.heading) * 0.12;
      const hz = fz + Math.cos(this.heading) * 0.12;
      this.camera.position.set(hx, 1.62 + this.yOffset, hz);
      const lx = hx + Math.sin(this.camYaw) * 10;
      const lz = hz + Math.cos(this.camYaw) * 10;
      const ly = 1.62 + this.yOffset - Math.tan(this.camPitch - (this.camKick || 0)) * 10;
      this.camera.lookAt(lx, ly, lz);
      return;
    }

    // за машиной камера плавно выравнивается по курсу
    if (driving && Math.abs(this.vehicle.speed) > 2.5) {
      const want = this.vehicle.heading + Math.PI;
      let d = ((want - this.camYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      this.camYaw += d * Math.min(1, dt * 1.6);
    }

    const dist = this.camDist * (driving ? 1.35 : 1);
    const pitch = this.camPitch - (this.camKick || 0);
    const cp = Math.cos(pitch);
    let cx = fx - Math.sin(this.camYaw) * dist * cp;
    let cz = fz - Math.cos(this.camYaw) * dist * cp;
    if (this.aiming && !driving) {         // смещение «через плечо»
      cx += Math.cos(this.camYaw) * 0.55;
      cz -= Math.sin(this.camYaw) * 0.55;
    }
    let cy = fy + Math.sin(pitch) * dist + 0.9;

    // не даём камере влезть в здание
    if (city) {
      const boxes = city.collidersNear(cx, cz, 1.2);
      const r = resolveCircleBoxes(cx, cz, 0.9, boxes);
      if (r.hit) { cx = r.x; cz = r.z; }
    }
    if (cy < 0.7) cy = 0.7;

    this.camPos.set(cx, cy, cz);
    this.camera.position.lerp(this.camPos, Math.min(1, dt * 12));
    this.camLook.lerp(new THREE.Vector3(fx, fy + 0.3, fz), Math.min(1, dt * 14));
    this.camera.lookAt(this.camLook);
  }
}
