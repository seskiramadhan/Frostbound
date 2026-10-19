// Conversation panel at the bottom of the screen: speaker, text, answer buttons.
// build() returns { text, options: [{ label, run, disabled?, note? }] }; run() returns
// true to keep the panel open (it is rebuilt) or false to close it. Pauses single player.
const $ = id => document.getElementById(id);

export class Dialog {
  constructor() {
    this.el = $('dialog');
    this.nameEl = $('dialog-name');
    this.textEl = $('dialog-text');
    this.optsEl = $('dialog-opts');
    this.open = false;
    this.npc = null;
    this.reply = null;     // one-off line shown instead of the usual text (e.g. after handing in)
  }

  show(npc, build) {
    this.npc = npc;
    this.build = build;
    this.open = true;
    this.reply = null;
    this.el.style.display = 'flex';
    this.render();
  }

  say(line) { this.reply = line; }

  close() {
    this.open = false;
    this.npc = null;
    this.el.style.display = 'none';
    this.onClose?.();
  }

  render() {
    if (!this.open) return;
    const d = this.build();
    this.nameEl.textContent = this.npc.name;
    this.textEl.textContent = this.reply ?? d.text;
    this.reply = null;
    this.optsEl.innerHTML = '';
    for (const o of d.options) {
      const b = document.createElement('button');
      b.className = 'dlg-opt' + (o.cls ? ` ${o.cls}` : '');
      b.textContent = o.label;
      if (o.note) { const n = document.createElement('span'); n.textContent = o.note; b.appendChild(n); }
      b.disabled = !!o.disabled;
      b.addEventListener('click', () => { if (o.run()) this.render(); else this.close(); });
      this.optsEl.appendChild(b);
    }
  }
}
