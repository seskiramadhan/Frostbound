// Minimal HUD for phase 1: start overlay + FPS counter (for phone testing).
import { IS_TOUCH } from '../config.js';

export class Hud {
  constructor() {
    this.overlay = document.getElementById('overlay');
    this.fpsEl = document.getElementById('fps');
    document.getElementById(IS_TOUCH ? 'help-desktop' : 'help-touch').remove();
    document.getElementById('cta').textContent = IS_TOUCH ? 'Tap to begin' : 'Click to begin';
    this.frames = 0;
    this.acc = 0;
  }

  showOverlay(show) {
    this.overlay.style.display = show ? 'flex' : 'none';
  }

  frame(dt) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.acc)} fps`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
