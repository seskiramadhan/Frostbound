// HUD: start overlay, health/stamina bars, enemy bar, hurt flash, death screen, FPS counter.
import { IS_TOUCH } from '../config.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.overlay = $('overlay');
    this.fpsEl = $('fps');
    $(IS_TOUCH ? 'help-desktop' : 'help-touch').remove();
    $('cta').textContent = IS_TOUCH ? 'Tap to begin' : 'Click to begin';
    if (!IS_TOUCH) $('btn-jump').remove();

    this.hpBar = $('hp');
    this.stBar = $('st');
    this.stWrap = $('st-wrap');
    this.targetWrap = $('target');
    this.targetName = $('target-name');
    this.targetBar = $('target-hp');
    this.hurtEl = $('hurt');
    this.deathEl = $('death');
    this.deathCta = $('death-cta');

    this.target = null;
    this.targetTime = 0;
    this.frames = 0;
    this.acc = 0;
  }

  showOverlay(show) {
    this.overlay.style.display = show ? 'flex' : 'none';
  }

  hurt() {
    this.hurtEl.classList.remove('on');
    void this.hurtEl.offsetWidth;   // restart the CSS animation
    this.hurtEl.classList.add('on');
  }

  showTarget(entity) {
    this.target = entity;
    this.targetTime = 4;
    this.targetName.textContent = entity.name;
  }

  showDeath(show) {
    this.deathEl.style.display = show ? 'flex' : 'none';
    this.deathCta.textContent = '';
  }

  frame(dt, player) {
    this.hpBar.style.transform = `scaleX(${player.hp / player.maxHp})`;
    this.stBar.style.transform = `scaleX(${player.stamina / player.maxStamina})`;
    this.stWrap.classList.toggle('full', player.stamina >= player.maxStamina);

    if (this.target) {
      this.targetTime -= dt;
      const t = this.target;
      this.targetBar.style.transform = `scaleX(${t.hp / t.maxHp})`;
      if (!t.alive) this.targetTime = Math.min(this.targetTime, 1.5);
      if (this.targetTime <= 0) this.target = null;
    }
    this.targetWrap.style.opacity = this.target ? 1 : 0;

    if (player.canRespawn && !this.deathCta.textContent) {
      this.deathCta.textContent = IS_TOUCH ? 'Tap the right side to rise again' : 'Click to rise again';
    }

    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.acc)} fps`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
