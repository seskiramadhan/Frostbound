// Keyboard/mouse (pointer lock) and touch (left joystick + right-side look drag).
import { CONFIG, IS_TOUCH } from './config.js';

const C = CONFIG.input;

export class Input {
  constructor(canvas, joyBase, joyKnob) {
    this.canvas = canvas;
    this.joyBase = joyBase;
    this.joyKnob = joyKnob;

    this.move = { x: 0, y: 0 };   // x = strafe right, y = forward, length 0..1
    this.run = false;
    this.lookDX = 0;              // accumulated look deltas (radians), consumed by camera
    this.lookDY = 0;

    this.keys = Object.create(null);
    this.locked = false;
    this.joyTouch = null;         // { id, ox, oy, x, y }
    this.lookTouch = null;        // { id, x, y }

    this.#bindKeyboardMouse();
    if (IS_TOUCH) this.#bindTouch();
  }

  get active() { return IS_TOUCH || this.locked; }

  requestLock() {
    if (!IS_TOUCH) this.canvas.requestPointerLock?.();
  }

  // Called once per fixed tick to resolve the movement vector.
  update() {
    if (this.joyTouch) {
      const t = this.joyTouch, R = C.joystickRadius;
      let dx = (t.x - t.ox) / R, dy = (t.y - t.oy) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      const m = Math.min(len, 1);
      if (m < C.joystickDeadzone) { this.move.x = 0; this.move.y = 0; this.run = false; }
      else { this.move.x = dx; this.move.y = -dy; this.run = m > C.runThreshold; }
      return;
    }
    const k = this.keys;
    let x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this.run = !!(k.ShiftLeft || k.ShiftRight);
  }

  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }

  #bindKeyboardMouse() {
    addEventListener('keydown', e => { this.keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = Object.create(null); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys = Object.create(null);
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.lookDX += e.movementX * C.mouseSensitivity;
      this.lookDY += e.movementY * C.mouseSensitivity;
    });
  }

  #bindTouch() {
    const opts = { passive: false };
    const el = this.canvas;

    el.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && !this.joyTouch) {
          this.joyTouch = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          this.#showJoystick();
        } else if (t.clientX >= innerWidth / 2 && !this.lookTouch) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
    }, opts);

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.joyTouch && t.identifier === this.joyTouch.id) {
          this.joyTouch.x = t.clientX; this.joyTouch.y = t.clientY;
          this.#showJoystick();
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.lookDX += (t.clientX - this.lookTouch.x) * C.touchLookSensitivity;
          this.lookDY += (t.clientY - this.lookTouch.y) * C.touchLookSensitivity;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
    }, opts);

    const end = e => {
      for (const t of e.changedTouches) {
        if (this.joyTouch && t.identifier === this.joyTouch.id) { this.joyTouch = null; this.#hideJoystick(); }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    el.addEventListener('touchend', end, opts);
    el.addEventListener('touchcancel', end, opts);
  }

  #showJoystick() {
    const t = this.joyTouch, R = C.joystickRadius;
    let dx = t.x - t.ox, dy = t.y - t.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    this.joyBase.style.display = 'block';
    this.joyBase.style.transform = `translate(${t.ox - R}px, ${t.oy - R}px)`;
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  #hideJoystick() {
    this.joyBase.style.display = 'none';
  }
}
