// ==UserScript==
// @name         AdGate Skip
// @namespace    https://github.com/MidZai/adgate-skip
// @version      1.0.0
// @description  Passe le compteur de pubs du lecteur et bloque les popunders.
// @author       MidZai/adgate-skip
// @homepageURL  https://github.com/MidZai/adgate-skip
// @supportURL   https://github.com/MidZai/adgate-skip/issues
// @downloadURL  https://raw.githubusercontent.com/MidZai/adgate-skip/main/adgate-skip.user.js
// @updateURL    https://raw.githubusercontent.com/MidZai/adgate-skip/main/adgate-skip.user.js
// @match        https://senpai-stream.bond/*
// @match        https://*.senpai-stream.bond/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

// Le lecteur est un composant Livewire : currentStep et total_steps vivent
// côté serveur. Le bouton "Continuer" du site est un lien wire:click doublé
// d'un window.open vers la régie, donc la pub n'est jamais une condition,
// juste un effet de bord. On appelle la méthode directement.

(() => {
  'use strict';

  // Le player est réinjecté dans une iframe de même origine une fois le gate
  // passé. Sans ça le script repart en boucle dedans.
  if (window.top !== window.self || window.__adgateSkip) return;
  window.__adgateSkip = true;

  const config = {
    auto: true,
    blockPopups: true,
    autoPlay: true,
    delay: 450,        // entre deux incréments
    maxCalls: 15,      // garde-fou, 5 suffisent normalement
    timeout: 25000,    // attente max du composant
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('%c[adgate]', 'color:#e50914;font-weight:600', ...a);

  // Rendre null ferait croire au site qu'un bloqueur de popup est actif et
  // déclencherait une alert() bloquante, d'où le faux handle.
  function muteWindowOpen() {
    if (!config.blockPopups || window.__adgateMuted) return;
    window.__adgateMuted = true;
    window.__adgateOpen = window.open;

    window.open = url => {
      log('popup bloqué', url);
      return {
        closed: false,
        close() { this.closed = true; },
        focus() {}, blur() {}, postMessage() {},
        location: { href: url, assign() {}, replace() {} },
        document: { write() {}, writeln() {}, close() {} },
      };
    };

    try {
      Object.defineProperty(window, 'open', {
        value: window.open, writable: false, configurable: false,
      });
    } catch { /* déjà verrouillé */ }
  }

  // L'id du composant change à chaque chargement, on le retrouve par son état.
  function componentId() {
    if (!window.Livewire) return null;

    try {
      for (const c of window.Livewire.all?.() ?? []) {
        const data = c?.snapshot?.data ?? {};
        if ('total_steps' in data || 'currentStep' in data) return c.id;
      }
    } catch { /* API interne, on retombe sur le DOM */ }

    for (const el of document.querySelectorAll('[wire\\:id]')) {
      if (/total_steps|currentStep/.test(el.getAttribute('wire:snapshot') || '')) {
        return el.getAttribute('wire:id');
      }
    }
    return null;
  }

  function wire() {
    const id = componentId();
    if (!id) return null;
    try { return window.Livewire.find(id) || null; } catch { return null; }
  }

  function field(w, key) {
    if (!w) return null;
    try {
      const v = typeof w.get === 'function' ? w.get(key) : w[key];
      return v == null ? null : Number(v);
    } catch { return null; }   // le proxy jette si le composant vient d'être démonté
  }

  function progress(w) {
    const pct = field(w, 'percentage');
    if (Number.isFinite(pct)) return pct;

    const step = field(w, 'currentStep');
    const total = field(w, 'total_steps');
    if (Number.isFinite(step) && Number.isFinite(total) && total > 0) {
      return (step / total) * 100;
    }

    const ring = document.querySelector('.text-3xl.font-bold.text-primary-500');
    const m = ring?.textContent?.match(/(\d+)\s*%/);
    return m ? Number(m[1]) : null;
  }

  // Piège : innerText ne marche pas ici. L'overlay est masqué par Alpine
  // (x-show="cf_turnstile_response") tant que le Turnstile n'a pas répondu,
  // donc il est absent de innerText dès le chargement alors que le gate est
  // bien actif. innerHTML est le seul reflet fiable.
  function unlocked() {
    if (!document.body) return false;
    if (/ZONE PUBLICITAIRE/i.test(document.body.innerHTML)) return false;
    return !!document.querySelector('video, iframe[src]');
  }

  async function waitFor(fn, timeout) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  }

  let busy = false;
  let gen = 0;

  // Une seule séquence à la fois : deux boucles concurrentes partent dans le
  // même batch Livewire, ce qui incrémente de 2 d'un coup et gâche des appels.
  async function skip(source) {
    const mine = ++gen;
    while (busy) await sleep(50);
    if (mine !== gen) return;           // une demande plus récente a pris la main

    busy = true;
    badge.set('busy', 'Skip en cours…');

    try {
      muteWindowOpen();

      const w = await waitFor(wire, config.timeout);
      if (!w) {
        badge.set('error', 'Lecteur introuvable');
        log('composant introuvable, le site a probablement changé');
        return;
      }

      log(`départ (${source}) à ${progress(w) ?? '?'}%`);

      for (let i = 0; i < config.maxCalls; i++) {
        if (mine !== gen) return;       // navigation entre-temps

        const c = wire() || w;
        const pct = progress(c);

        if (Number.isFinite(pct)) {
          if (pct >= 100) break;
        } else if (unlocked()) {
          break;
        }

        badge.set('busy', `Skip… ${Math.round(pct ?? 0)}%`);
        try {
          await c.call('incrementSteps');
        } catch (e) {
          log('incrementSteps a échoué', e);
          break;
        }
        await sleep(config.delay);
      }

      const pct = progress(wire()) ?? 0;
      if (pct >= 100 || unlocked()) {
        badge.set('done', 'Pubs passées');
        log('lecteur débloqué');
        if (config.autoPlay) play();
      } else {
        badge.set('error', `Bloqué à ${Math.round(pct)}%`);
        log(`arrêt à ${pct}%, rafraîchis la page pour remettre le compteur à zéro`);
      }
    } finally {
      busy = false;
    }
  }

  async function play() {
    await sleep(600);
    const btn = document.querySelector('[wire\\:click="watching"]');
    if (btn && getComputedStyle(btn).display !== 'none') btn.click();
  }

  // Bouton de secours, en shadow DOM pour échapper au Tailwind du site.
  const badge = (() => {
    let host, button, text, timer;

    const css = `
      button {
        display: flex; align-items: center; gap: 8px;
        font: 600 13px/1 system-ui, -apple-system, sans-serif;
        color: #fff; background: #e50914; border: 0;
        padding: 11px 16px; border-radius: 999px; cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 0, 0, .45);
        opacity: .55; transition: opacity .2s, background .2s, transform .1s;
      }
      button:hover { opacity: 1; transform: translateY(-1px) }
      button:active { transform: translateY(0) }
      button[data-state="busy"] { background: #f59e0b; opacity: 1 }
      button[data-state="done"] { background: #16a34a; opacity: 1 }
      button[data-state="error"] { background: #7f1d1d; opacity: 1 }
      i { width: 7px; height: 7px; border-radius: 50%; background: #fff; flex: none }
      button[data-state="busy"] i { animation: pulse .8s infinite }
      @keyframes pulse { 50% { opacity: .25 } }
    `;

    function mount() {
      if (host?.isConnected || !document.body) return;

      host = document.createElement('div');
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
      const root = host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = css;

      button = document.createElement('button');
      button.dataset.state = 'idle';
      button.title = 'Forcer le skip (Ctrl+Shift+S)';
      text = document.createElement('span');
      text.textContent = 'Skip pubs';
      button.append(document.createElement('i'), text);
      button.onclick = () => skip('bouton');

      root.append(style, button);
      document.body.append(host);
    }

    return {
      mount,
      set(state, label) {
        mount();
        if (!button) return;
        button.dataset.state = state;
        text.textContent = label;
        clearTimeout(timer);
        if (state === 'done' || state === 'error') {
          timer = setTimeout(() => {
            button.dataset.state = 'idle';
            text.textContent = 'Skip pubs';
          }, 6000);
        }
      },
    };
  })();

  // On ne devine pas l'URL : on attend simplement que le composant existe,
  // ce qui couvre aussi bien les épisodes que les films.
  function start() {
    badge.mount();
    if (!config.auto) return;
    waitFor(wire, config.timeout).then(w => {
      if (!w) return;
      if ((progress(w) ?? 0) >= 100 || unlocked()) return;
      skip('auto');
    });
  }

  muteWindowOpen();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  // wire:navigate remonte un composant neuf, compteur remis à zéro. On ne
  // touche pas à `busy`, skip() gère lui-même l'annulation via `gen`.
  document.addEventListener('livewire:navigated', start);

  addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      skip('raccourci');
    }
  });
})();
