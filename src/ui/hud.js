// HUD: start overlay, health/stamina/magicka bars, stealth eye, enemy bar, hurt flash, death screen,
// objective + quest marker, interact prompt, messages, fade, FPS counter.
import * as THREE from 'three';
import { CONFIG, IS_TOUCH } from '../config.js';

const $ = id => document.getElementById(id);
const v = new THREE.Vector3();

export class Hud {
  constructor() {
    this.overlay = $('overlay');
    this.fpsEl = $('fps');
    $(IS_TOUCH ? 'help-desktop' : 'help-touch').remove();
    if (!IS_TOUCH) for (const id of ['btn-jump', 'btn-interact', 'btn-bag', 'btn-shout', 'btn-bow', 'btn-crouch']) $(id).remove();
    if (IS_TOUCH) $('shout-ind').remove();

    this.hpBar = $('hp');
    this.stBar = $('st');
    this.stWrap = $('st-wrap');
    this.mkBar = $('mk');
    this.mkWrap = $('mk-wrap');
    this.stealthEl = $('stealth');
    this.stealthEye = $('stealth-eye');
    this.stealthText = $('stealth-text');
    this.crouchBtn = $('btn-crouch');
    this.stealthKey = '';
    this.targetWrap = $('target');
    this.targetName = $('target-name');
    this.targetBar = $('target-hp');
    this.hurtEl = $('hurt');
    this.deathEl = $('death');
    this.deathCta = $('death-cta');
    this.questName = $('q-name');
    this.questText = $('q-text');
    this.objective = $('objective');
    this.toasts = $('toasts');
    this.notice = $('notice');
    this.promptEl = $('prompt');
    this.interactBtn = $('btn-interact');
    this.markerEl = $('marker');
    this.markerDist = $('marker-dist');
    this.fadeEl = $('fade');
    this.shoutBtn = $('btn-shout') ?? $('shout-ind');
    this.bowBtn = $('btn-bow');
    this.slowEl = $('slowmo');
    this.bossEl = $('boss');
    this.bossName = $('boss-name');
    this.bossBar = $('boss-hp');
    this.shoutKey = '';

    this.target = null;
    this.targetTime = 0;
    this.noticeTime = 0;
    this.noticeGap = 0;
    this.noticeQueue = [];
    this.lastPrompt = null;
    this.frames = 0;
    this.acc = 0;
  }

  setStartText(hasSave, note = '') {
    $('cta').textContent = `${IS_TOUCH ? 'Tap' : 'Click'} to ${hasSave ? 'continue' : 'begin'}${note ? ` · ${note}` : ''}`;
    $('newgame').style.display = hasSave ? 'inline-block' : 'none';
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

  // Small message, top left (loot, "quest started").
  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3500);
    setTimeout(() => el.remove(), 4200);
  }

  // Big centred message (skill up, quest done).
  // Big centred messages queue up so one never hides another.
  announce(title, sub = '') {
    this.noticeQueue.push([title, sub]);
    if (this.noticeTime <= 0 && this.noticeGap <= 0) this.#nextNotice();
  }

  #nextNotice() {
    const next = this.noticeQueue.shift();
    if (!next) return;
    this.notice.innerHTML = '';
    const t = document.createElement('div'); t.className = 'n-title'; t.textContent = next[0];
    const s = document.createElement('div'); s.className = 'n-sub'; s.textContent = next[1];
    this.notice.append(t, s);
    this.notice.classList.add('on');
    this.noticeTime = 3;
  }

  setObjective(obj) {
    this.objective.style.display = obj ? 'block' : 'none';
    if (!obj) return;
    if (this.questName.textContent !== obj.name) this.questName.textContent = obj.name;
    if (this.questText.textContent !== obj.text) this.questText.textContent = obj.text;
  }

  setPrompt(label) {
    if (label === this.lastPrompt) return;
    this.lastPrompt = label;
    this.promptEl.style.display = label ? 'block' : 'none';
    this.promptEl.textContent = label ? (IS_TOUCH ? label : `E  ${label}`) : '';
    if (this.interactBtn) this.interactBtn.style.display = label ? 'block' : 'none';
  }

  // Diamond over the objective (clamped to the screen edge when off-screen).
  setMarker(pos, camera, from) {
    if (!pos) { this.markerEl.style.display = 'none'; return; }
    v.set(pos.x, pos.y + 2.2, pos.z).project(camera);
    let x = v.x, y = v.y;
    if (v.z > 1) {                                // behind the camera: pin to the left/right edge
      x = v.x > 0 ? -0.92 : 0.92;
      y = Math.max(-0.5, Math.min(0.5, -v.y));
    } else if (Math.abs(x) > 0.92 || Math.abs(y) > 0.88) {
      const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.88);
      x /= k; y /= k;
    }
    this.markerEl.style.display = 'block';
    this.markerEl.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px, ${(-y * 0.5 + 0.5) * innerHeight}px)`;
    this.markerDist.textContent = `${Math.round(Math.hypot(pos.x - from.x, pos.z - from.z))}m`;
  }

  // Shout button / indicator: the word, with a ring that fills as the cooldown runs out.
  setShout(shouts) {
    const id = shouts.selected;
    this.shoutBtn.style.display = id ? 'block' : 'none';
    if (!id) return;
    const def = CONFIG.shouts[id];
    const label = IS_TOUCH ? def.word : `Q  ${def.word} · ${def.name}`;
    if (label !== this.shoutKey) { this.shoutBtn.textContent = label; this.shoutKey = label; }
    const k = shouts.cooldown > 0 ? 1 - shouts.cooldown / shouts.cooldownMax : 1;
    this.shoutBtn.style.setProperty('--cd', `${Math.round(k * 100)}%`);
    this.shoutBtn.classList.toggle('ready', k >= 1);
  }

  // Weapon button: shows what a tap switches to (sword -> bow -> fire -> sword).
  setBow(player) {
    if (!this.bowBtn) return;
    const modes = ['Sword', ...(player.hasBow ? ['Bow'] : []), ...(player.knowsFire ? ['Fire'] : [])];
    this.bowBtn.style.display = modes.length > 1 ? 'block' : 'none';
    const cur = player.bowMode ? 'Bow' : player.spellMode ? 'Fire' : 'Sword';
    const label = modes[(modes.indexOf(cur) + 1) % modes.length];
    if (this.bowBtn.textContent !== label) this.bowBtn.textContent = label;
  }

  // Stealth eye while crouched: closed = hidden, opening = being noticed, red = detected.
  setStealth(player, stealth) {
    if (this.crouchBtn) {
      this.crouchBtn.classList.toggle('on', player.crouched);
      const l = player.crouched ? 'Stand' : 'Sneak';
      if (this.crouchBtn.textContent !== l) this.crouchBtn.textContent = l;
    }
    const show = player.crouched && player.alive;
    this.stealthEl.style.display = show ? 'block' : 'none';
    if (!show) return;
    const k = stealth.detected ? 'detected' : stealth.notice > 0.05 ? 'caution' : 'hidden';
    if (k !== this.stealthKey) {
      this.stealthKey = k;
      this.stealthEl.className = k;
      this.stealthText.textContent = { hidden: 'Hidden', caution: 'Caution', detected: 'Detected' }[k];
    }
    this.stealthEye.style.setProperty('--open', (0.15 + 0.85 * stealth.notice).toFixed(2));
  }

  setSlow(on) { this.slowEl.classList.toggle('on', on); }

  // Small 'room CODE · 2/4' chip while in co-op.
  setCoop(session) {
    const chip = this.coopChip ??= document.getElementById('coop-chip');
    const text = session.active ? `${session.code} · ${session.count}/${CONFIG.net.maxPlayers}` : '';
    if (chip.textContent !== text) { chip.textContent = text; chip.style.display = text ? 'block' : 'none'; }
  }

  setBoss(entity) {
    this.bossEl.style.display = entity ? 'block' : 'none';
    if (!entity) return;
    if (this.bossName.textContent !== entity.name) this.bossName.textContent = entity.name;
    this.bossBar.style.transform = `scaleX(${Math.min(1, Math.max(0, entity.hp) / entity.maxHp)})`;
  }

  // Victory card; onContinue runs when it is dismissed.
  showEnding(onContinue) {
    const el = $('ending');
    el.style.display = 'flex';
    const btn = $('ending-continue');
    btn.onclick = e => { e.stopPropagation(); el.style.display = 'none'; onContinue?.(); };
  }

  // Fade to black, run fn, fade back in.
  fade(fn, time) {
    this.fadeEl.style.transition = `opacity ${time}s`;
    this.fadeEl.style.opacity = 1;
    setTimeout(() => { fn(); this.fadeEl.style.opacity = 0; }, time * 1000);
  }

  frame(dt, player) {
    this.hpBar.style.transform = `scaleX(${player.hp / player.maxHp})`;
    this.stBar.style.transform = `scaleX(${player.stamina / player.maxStamina})`;
    this.stWrap.classList.toggle('full', player.stamina >= player.maxStamina);
    this.mkWrap.style.display = player.knowsFire ? 'block' : 'none';
    if (player.knowsFire) {
      this.mkBar.style.transform = `scaleX(${player.magicka / player.maxMagicka})`;
      this.mkWrap.classList.toggle('full', player.magicka >= player.maxMagicka);
    }

    if (this.target) {
      this.targetTime -= dt;
      const t = this.target;
      this.targetBar.style.transform = `scaleX(${t.hp / t.maxHp})`;
      if (!t.alive) this.targetTime = Math.min(this.targetTime, 1.5);
      if (this.targetTime <= 0) this.target = null;
    }
    this.targetWrap.style.opacity = this.target && this.bossEl.style.display === 'none' ? 1 : 0;

    if (this.noticeTime > 0 && (this.noticeTime -= dt) <= 0) { this.notice.classList.remove('on'); this.noticeGap = 0.6; }
    else if (this.noticeGap > 0 && (this.noticeGap -= dt) <= 0) this.#nextNotice();

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
