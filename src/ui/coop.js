// Co-op tab of the Bag menu: pick a name, host a room or join one by code, share the link,
// and (host) start a dragon hunt.
import { CONFIG } from '../config.js';

const NAME_KEY = 'frostbound.name';

function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function saveName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* storage unavailable */ }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class CoopPanel {
  // hunt: { blocker() -> reason | null, start(), level(), active() }
  constructor(session, hunt) {
    this.session = session;
    this.hunt = hunt;
    this.status = '';
    this.name = loadName() || `Nord${Math.floor(100 + Math.random() * 900)}`;
    this.codeDraft = '';
  }

  inviteLink() {
    return `${location.origin}${location.pathname}?join=${this.session.code}`;
  }

  // Draw into `box`; `rerender` redraws the whole menu after async steps.
  render(box, rerender) {
    const s = this.session;
    const row = (cls, text) => { const r = el('div', cls, text); box.appendChild(r); return r; };

    if (s.active) {
      row('m-head', s.role === 'host' ? 'Your room' : 'In a room');
      row('coop-code', s.code);
      row('m-hint', `${s.count} / ${CONFIG.net.maxPlayers} players: ${s.names().join(', ')}`);
      if (s.role === 'host') {
        const share = row('coop-row');
        const btn = el('button', 'coop-btn', navigator.share ? 'Share invite link' : 'Copy invite link');
        btn.addEventListener('click', async () => {
          const url = this.inviteLink();
          try {
            if (navigator.share) await navigator.share({ title: 'Frostbound', text: `Join my game! Room ${s.code}`, url });
            else { await navigator.clipboard.writeText(url); this.status = 'Link copied'; rerender(); }
          } catch { /* share sheet closed */ }
        });
        share.appendChild(btn);
        row('m-hint', 'Friends open the link (or type the code in their Co-op tab).');
      }
      row('m-head', 'Dragon hunt');
      if (this.hunt.active()) row('m-hint', 'A hunt is on: look to the sky!');
      else if (s.role === 'host') {
        const why = this.hunt.blocker();
        const hb = el('button', 'coop-btn', `Start a dragon hunt (level ${this.hunt.level()})`);
        hb.disabled = !!why;
        hb.addEventListener('click', () => { this.hunt.start(); rerender(); });
        row('coop-row').appendChild(hb);
        row('m-hint', why ?? 'A dragon comes for your group. Tougher every hunt; everyone gets gold.');
      } else row('m-hint', 'The host can start a dragon hunt for the whole group.');

      const leave = el('button', 'coop-btn quiet', 'Leave room');
      leave.addEventListener('click', () => { s.leave(); rerender(); });
      row('coop-row').appendChild(leave);
      if (this.status) row('m-hint', this.status);
      row('m-hint', 'Enemies are shared (the host runs them); loot and quests are your own.');
      return;
    }

    // Name
    row('m-head', 'Your name');
    const nameRow = row('coop-row');
    const nameIn = el('input', 'coop-input');
    nameIn.maxLength = 16;
    nameIn.value = this.name;
    nameIn.addEventListener('input', () => { this.name = nameIn.value.trim(); saveName(this.name); });
    nameRow.appendChild(nameIn);

    const busy = s.role === 'connecting';
    row('m-head', 'Host');
    const hostBtn = el('button', 'coop-btn', busy ? 'Connecting…' : 'Host a game');
    hostBtn.disabled = busy;
    hostBtn.addEventListener('click', () => this.host(rerender));
    row('coop-row').appendChild(hostBtn);

    row('m-head', 'Join a friend');
    const joinRow = row('coop-row');
    const codeIn = el('input', 'coop-input code');
    codeIn.placeholder = 'CODE';
    codeIn.maxLength = CONFIG.net.codeLength;
    codeIn.autocapitalize = 'characters';
    codeIn.value = this.codeDraft;
    codeIn.addEventListener('input', () => { this.codeDraft = codeIn.value.toUpperCase(); codeIn.value = this.codeDraft; });
    const joinBtn = el('button', 'coop-btn', 'Join');
    joinBtn.disabled = busy;
    joinBtn.addEventListener('click', () => this.join(this.codeDraft, rerender));
    joinRow.append(codeIn, joinBtn);

    if (this.status) row('m-hint coop-status', this.status);
    row('m-hint', `Up to ${CONFIG.net.maxPlayers} players. Works best on Wi-Fi.`);
  }

  async host(rerender) {
    this.status = '';
    const p = this.session.host(this.name || 'Host');
    rerender();
    try { await p; this.status = ''; } catch (e) { this.status = e.message; }
    rerender();
  }

  async join(code, rerender) {
    if (!code || code.length < CONFIG.net.codeLength) { this.status = 'Enter the room code'; rerender(); return; }
    this.status = '';
    const p = this.session.join(code, this.name || 'Traveller');
    rerender();
    try { await p; this.status = ''; } catch (e) { this.status = e.message; }
    rerender();
  }
}
