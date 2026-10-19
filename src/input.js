// Keyboard/mouse (pointer lock) and touch (left joystick, right-side gestures, buttons).
// Produces one command object per fixed tick: { move, run, attack, block, dodge, jump }.
import { CONFIG, IS_TOUCH } from './config.js';

const C = CONFIG.input;

export class Input {
  constructor(canvas, joyBase, joyKnob, jumpBtn) {
    this.canvas = canvas;
    this.joyBase = joyBase;
    this.joyKnob = joyKnob;

    // move: x = strafe right, y = forward, length 0..1. dodge: null or direction in the same space.
    this.cmd = { move: { x: 0, y: 0 }, run: false, attack: false, block: false, dodge: null, jump: false };
    this.lookDX = 0;              // accumulated look deltas (radians), consumed by camera
    this.lookDY = 0;

    this.keys = Object.create(null);
    this.locked = false;
    this.mouseBlock = false;
    this.joyTouch = null;         // { id, ox, oy, x, y }
    this.rightTouch = null;       // { id, sx, sy, x, y, t0, mode: pending|drag|block|done, bx, by }

    // Edge-triggered presses, held until the next tick reads them
    this.attackPressed = false;
    this.dodgePressed = null;     // 'move' (use move direction) or {x, y}
    this.jumpPressed = false;

    this.#bindKeyboardMouse();
    if (IS_TOUCH) this.#bindTouch(jumpBtn);
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
    cmd.block = this.mouseBlock || this.rightTouch?.mode === 'block';
    const d = this.dodgePressed;
    if (d === 'move') {
      const len = Math.hypot(cmd.move.x, cmd.move.y);
      cmd.dodge = len > 0.2 ? { x: cmd.move.x / len, y: cmd.move.y / len } : { x: 0, y: -1 };
    } else cmd.dodge = d;

    this.attackPressed = false;
    this.dodgePressed = null;
    this.jumpPressed = false;
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
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat || !this.locked) return;
      if (e.code === 'Space') this.dodgePressed = 'move';
      if (e.code === 'KeyF') this.jumpPressed = true;
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

  #bindTouch(jumpBtn) {
    const opts = { passive: false };
    const el = this.canvas;

    jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); this.jumpPressed = true; }, opts);

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

  // Right-side touch: camera look is buffered while we decide between tap / hold / swipe / drag.
  #rightMove(x, y) {
    const r = this.rightTouch;
    const dx = (x - r.x) * C.touchLookSensitivity, dy = (y - r.y) * C.touchLookSensitivity;
    r.x = x; r.y = y;
    if (r.mode === 'drag' || r.mode === 'block') { this.lookDX += dx; this.lookDY += dy; return; }
    if (r.mode !== 'pending') return;
    r.bx += dx; r.by += dy;
    const sdx = x - r.sx, sdy = y - r.sy, dist = Math.hypot(sdx, sdy);
    if (dist >= C.swipeMinDist && (performance.now() - r.t0) / 1000 < C.swipeMaxTime) {
      this.dodgePressed = { x: sdx / dist, y: -sdy / dist };
      r.mode = 'done';
    }
  }

  #updateRightTouch() {
    const r = this.rightTouch;
    if (!r || r.mode !== 'pending') return;
    const elapsed = (performance.now() - r.t0) / 1000;
    const dist = Math.hypot(r.x - r.sx, r.y - r.sy);
    if (dist > C.tapSlop && elapsed >= C.swipeMaxTime) this.#toDrag(r);
    else if (dist <= C.tapSlop && elapsed >= C.holdTime) r.mode = 'block';
  }

  #toDrag(r) {
    r.mode = 'drag';
    this.lookDX += r.bx; this.lookDY += r.by;
  }

  #rightEnd(cancelled) {
    const r = this.rightTouch;
    this.rightTouch = null;
    if (r.mode !== 'pending' || cancelled) return;
    const elapsed = (performance.now() - r.t0) / 1000;
    if (Math.hypot(r.x - r.sx, r.y - r.sy) <= C.tapSlop && elapsed < C.holdTime) this.attackPressed = true;
    else this.#toDrag(r);   // a short, slow drag: apply the buffered look
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
