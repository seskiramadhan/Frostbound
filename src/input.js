// Keyboard/mouse (pointer lock) and touch (left joystick, right-side gestures, buttons).
// Produces one command object per fixed tick: { move, run, attack, block, jump, interact }.
// The menu key/button calls onMenu() directly (it works while paused).
import { CONFIG, IS_TOUCH } from './config.js';

const C = CONFIG.input;

export class Input {
  constructor(canvas, joyBase, joyKnob, buttons) {
    this.canvas = canvas;
    this.joyBase = joyBase;
    this.joyKnob = joyKnob;

    // move: x = strafe right, y = forward, length 0..1
    this.cmd = { move: { x: 0, y: 0 }, run: false, attack: false, block: false, jump: false, interact: false };
    this.lookDX = 0;              // accumulated look deltas (radians), consumed by camera
    this.lookDY = 0;

    this.keys = Object.create(null);
    this.locked = false;
    this.mouseBlock = false;
    this.joyTouch = null;         // { id, ox, oy, x, y }
    this.rightTouch = null;       // { id, sx, sy, x, y, t0, mode: pending|drag|block, bx, by }

    // Edge-triggered presses, held until the next tick reads them
    this.attackPressed = false;
    this.jumpPressed = false;
    this.interactPressed = false;

    this.#bindKeyboardMouse();
    if (IS_TOUCH) this.#bindTouch(buttons);
  }

  get active() { return IS_TOUCH || this.locked; }

  requestLock() {
    if (!IS_TOUCH) this.canvas.requestPointerLock?.();
  }

  // Called once per fixed tick; returns the command for this tick.
  update() {
    const cmd = this.cmd;
    this.#updateMove(cmd);
    this.#updateRightTouch();

    cmd.attack = this.attackPressed;
    cmd.jump = this.jumpPressed;
    cmd.interact = this.interactPressed;
    cmd.block = this.mouseBlock || this.rightTouch?.mode === 'block';

    this.attackPressed = false;
    this.jumpPressed = false;
    this.interactPressed = false;
    return cmd;
  }

  #updateMove(cmd) {
    const m = cmd.move;
    if (this.joyTouch) {
      const t = this.joyTouch, R = C.joystickRadius;
      let dx = (t.x - t.ox) / R, dy = (t.y - t.oy) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      const mag = Math.min(len, 1);
      if (mag < C.joystickDeadzone) { m.x = 0; m.y = 0; cmd.run = false; }
      else { m.x = dx; m.y = -dy; cmd.run = mag > C.runThreshold; }
      return;
    }
    const k = this.keys;
    let x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }
    m.x = x; m.y = y;
    cmd.run = !!(k.ShiftLeft || k.ShiftRight);
  }

  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }

  #bindKeyboardMouse() {
    addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyI' || e.code === 'Tab') { this.onMenu?.(); return; }
      if (e.code === 'Escape') { this.onEscape?.(); return; }
      if (!this.locked) return;
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'KeyE') this.interactPressed = true;
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = Object.create(null); this.mouseBlock = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys = Object.create(null); this.mouseBlock = false; }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.lookDX += e.movementX * C.mouseSensitivity;
      this.lookDY += e.movementY * C.mouseSensitivity;
    });
    document.addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) this.attackPressed = true;
      if (e.button === 2) this.mouseBlock = true;
    });
    document.addEventListener('mouseup', e => { if (e.button === 2) this.mouseBlock = false; });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  #bindTouch(buttons) {
    const opts = { passive: false };
    const el = this.canvas;
    const press = (btn, fn) => btn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, opts);
    press(buttons.jump, () => { this.jumpPressed = true; });
    press(buttons.interact, () => { this.interactPressed = true; });
    press(buttons.menu, () => this.onMenu?.());

    el.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && !this.joyTouch) {
          this.joyTouch = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          this.#showJoystick();
        } else if (t.clientX >= innerWidth / 2 && !this.rightTouch) {
          this.rightTouch = {
            id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY,
            t0: performance.now(), mode: 'pending', bx: 0, by: 0,
          };
        }
      }
    }, opts);

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.joyTouch && t.identifier === this.joyTouch.id) {
          this.joyTouch.x = t.clientX; this.joyTouch.y = t.clientY;
          this.#showJoystick();
        } else if (this.rightTouch && t.identifier === this.rightTouch.id) {
          this.#rightMove(t.clientX, t.clientY);
        }
      }
    }, opts);

    const end = e => {
      for (const t of e.changedTouches) {
        if (this.joyTouch && t.identifier === this.joyTouch.id) { this.joyTouch = null; this.#hideJoystick(); }
        if (this.rightTouch && t.identifier === this.rightTouch.id) this.#rightEnd(e.type === 'touchcancel');
      }
    };
    el.addEventListener('touchend', end, opts);
    el.addEventListener('touchcancel', end, opts);
  }

  // Right-side touch: the first few px are held back so a tap doesn't nudge the camera.
  #rightMove(x, y) {
    const r = this.rightTouch;
    const dx = (x - r.x) * C.touchLookSensitivity, dy = (y - r.y) * C.touchLookSensitivity;
    r.x = x; r.y = y;
    if (r.mode === 'drag' || r.mode === 'block') { this.lookDX += dx; this.lookDY += dy; return; }
    r.bx += dx; r.by += dy;
    if (Math.hypot(x - r.sx, y - r.sy) > C.tapSlop) {
      r.mode = 'drag';
      this.lookDX += r.bx; this.lookDY += r.by;
    }
  }

  #updateRightTouch() {
    const r = this.rightTouch;
    if (r?.mode === 'pending' && (performance.now() - r.t0) / 1000 >= C.holdTime) r.mode = 'block';
  }

  #rightEnd(cancelled) {
    const r = this.rightTouch;
    this.rightTouch = null;
    if (r.mode === 'pending' && !cancelled) this.attackPressed = true;
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
