// localStorage save. Every read/write is wrapped: private mode or full storage must not crash the game.
import { CONFIG } from '../config.js';

const KEY = CONFIG.save.key;

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.v === 1 ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, time: Date.now(), ...data }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
