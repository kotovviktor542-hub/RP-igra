/* player.js — контроллер игрока: ходьба, бег, прыжок, камера от третьего лица,
   посадка/высадка из транспорта. */

import * as THREE from '../../vendor/three.module.js';
import { Humanoid } from './humanoid.js';
import { clamp, damp, resolveCircleBoxes, dist2D } from '../core/utils.js';

const WALK = 2.6;
const RUN = 6.2;
const RADIUS = 0.42;

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
  }

  setLook(look) {
    const pos = this.root.position.clone();
    const rot = this.root.rotation.y;
    this.scene.remove(this.root);
    this.body.dispose();
    this.body = new Humanoid(look);
    this.root = this.body.root;
    this.root.position.copy(pos);
    this.root.rotation.y = rot;
    this.scene.add(this.root);
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

  zoom(delta) {
    this.camTargetDist = clamp(this.camTargetDist + delta, 2.2, 11);
  }

  /* ---------- посадка в транспорт ---------- */
  enterVehicle(v) {
    if (!v) return false;
    this.vehicle = v;
    this.mode = 'drive';
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
      const ang = Math.atan2(mx, my) + this.camYaw;
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

    let st = 'idle';
    if (!this.grounded) st = 'run';
    else if (this.speed > 4.0) st = 'run';
    else if (this.speed > 0.35) st = 'walk';
    this.moveState = st;
    this.body.update(dt, st, this.speed);
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

  _updateCamera(dt, city) {
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
      const ly = 1.62 + this.yOffset - Math.tan(this.camPitch) * 10;
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
    const cp = Math.cos(this.camPitch);
    let cx = fx - Math.sin(this.camYaw) * dist * cp;
    let cz = fz - Math.cos(this.camYaw) * dist * cp;
    let cy = fy + Math.sin(this.camPitch) * dist + 0.9;

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
