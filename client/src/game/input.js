// Keyboard + mouse (pointer lock) input.
import { BTN } from '../../../shared/constants.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.yaw = 0;
    this.pitch = -0.15;
    this.sensitivity = 0.0025;
    this.enabled = false;
    this.locked = false;
    this.onLockChange = null;
    this.onKey = null;

    this._onKeyDown = (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, true, e);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (this.onKey && this.enabled) this.onKey(e.code, false, e);
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.1, Math.min(0.9, this.pitch));
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this._onLock = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    this._onBlur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this._onLock);
    window.addEventListener('blur', this._onBlur);
  }

  requestLock() {
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Build the input frame the server understands.
  sample() {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    let buttons = 0;
    if (k.has('Space')) buttons |= BTN.JUMP;
    if (this.mouse.left) buttons |= BTN.PRIMARY;
    if (this.mouse.right || k.has('KeyQ')) buttons |= BTN.ABILITY1;
    if (k.has('KeyE') || k.has('ShiftLeft')) buttons |= BTN.ABILITY2;
    return { mx, mz, yaw: this.yaw, buttons };
  }
}
