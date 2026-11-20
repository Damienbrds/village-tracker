/* Village Tracker — suivi de progression à partir de l'export de données Clash of Clans. */
(() => {
  'use strict';

  const D = window.GAME_DATA;
  const I = D.items;
  const STORE_KEY = 'vt.export';
  const SETTINGS_KEY = 'vt.settings';
  const TOWN_HALL = 1000001;
  const BUILDER_HALL = 1000034;
  const BUILDER_HUTS = [1000015, 1000064];

  const IMG = window.GAME_IMAGES || {};
  const $ = (s) => document.querySelector(s);

  // Image d'un élément au niveau donné (ou au niveau disponible le plus proche).
  function imgSrc(id, lvl) {
    const v = IMG[id];
    if (!v) return null;
    if (typeof v === 'string') return v;
    const levels = Object.keys(v).map(Number).sort((a, b) => a - b);
    const L = levels.filter((x) => x <= Math.max(1, lvl)).pop() ?? levels[0];
    return v[L];
  }
  const thumb = (id, lvl, cls = 'thumb') => {
    const src = imgSrc(id, lvl);
    return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async">` : `<span class="${cls} thumb-empty"></span>`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- Stockage
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* navigation privée */ }
    },
  };

  // ---------------------------------------------------------------- Formatage
  const nf = new Intl.NumberFormat('fr-FR');
  const short = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString().replace('.', ',');
  function fmtNum(n) {
    if (n >= 1e9) return short(n / 1e9) + ' Md';
    if (n >= 1e6) return short(n / 1e6) + ' M';
    if (n >= 1e4) return short(n / 1e3) + ' k';
    return nf.format(Math.round(n));
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (!sec) return '0';
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    // Au-delà d'un mois : en mois et jours (mois moyen de 30,44 jours).
    if (d >= 30) {
      const MONTH = 30.4375;
      const totalDays = sec / 86400;
      let months = Math.floor(totalDays / MONTH);
      let days = Math.round(totalDays - months * MONTH);
      if (days >= 30) { months++; days = 0; }
      return days ? `${months} mois ${days} j` : `${months} mois`;
    }
    if (d) return h ? `${d} j ${h} h` : `${d} j`;
    if (h) return m ? `${h} h ${m} min` : `${h} h`;
    if (m) return `${m} min`;
    return `${sec} s`;
  }
  function fmtCountdown(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const p = (n) => String(n).padStart(2, '0');
    return (d ? `${d} j ` : '') + `${p(h)}:${p(m)}:${p(s)}`;
  }
  function fmtAgo(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const RES = {
    gold: { label: 'Or', cls: 'gold', img: 'res_gold' },
    elixir: { label: 'Élixir', cls: 'elixir', img: 'res_elixir' },
    dark: { label: 'Élixir noir', cls: 'dark', img: 'res_dark_elixir' },
    wall: { label: 'Or ou élixir (murs)', cls: 'gold', img: 'res_gold' },
    bgold: { label: 'Or des ouvriers', cls: 'bgold', img: 'res_builder_gold' },
    belixir: { label: 'Élixir des ouvriers', cls: 'belixir', img: 'res_builder_elixir' },
    gems: { label: 'Gemmes', cls: 'gems', img: 'res_gems' },
    shiny: { label: 'Minerai brillant', cls: 'ore', img: 'res_shiny_ore' },
    glowy: { label: 'Minerai luisant', cls: 'elixir', img: 'res_glowy_ore' },
    starry: { label: 'Minerai étoilé', cls: 'gold', img: 'res_starry_ore' },
  };
  const resIcon = (k) => (IMG[RES[k].img] ? `<img class="res-ico" src="${IMG[RES[k].img]}" alt="">` : `<span class="dot bg-${RES[k].cls}"></span>`);
  const RES_KEY = { Gold: 'gold', Elixir: 'elixir', 'Dark Elixir': 'dark', 'Builder Gold': 'bgold', 'Builder Elixir': 'belixir', Gems: 'gems' };

  const GROUP_LABEL = {
    core: 'Hôtel de ville', defense: 'Défenses', trap: 'Pièges', army: 'Armée', resource: 'Ressources', other: 'Ouvriers & assistants',
    wall: 'Murs', troop: 'Troupes', dark: 'Troupes noires', siege: 'Engins de siège', spell: 'Sorts', darkspell: 'Sorts noirs',
    squad: 'Brigades', hero: 'Héros', pet: 'Familiers', guardian: 'Gardiens', bbtroop: 'Troupes', bbhero: 'Héros', equipment: 'Équipements',
  };
  const TABS = [
    { id: 'overview', label: "Vue d'ensemble" },
    { id: 'buildings', label: 'Bâtiments', village: 'home', groups: ['core', 'defense', 'trap', 'army', 'resource', 'other'] },
    { id: 'walls', label: 'Murs', village: 'home', groups: ['wall'] },
    { id: 'lab', label: 'Laboratoire', village: 'home', groups: ['troop', 'dark', 'spell', 'darkspell', 'siege', 'squad'] },
    { id: 'heroes', label: 'Héros & familiers', village: 'home', groups: ['hero', 'pet', 'guardian'] },
    { id: 'equipment', label: 'Équipements', village: 'home', groups: ['equipment'] },
    { id: 'bb', label: 'Base des ouvriers', village: 'bb', groups: ['core', 'defense', 'trap', 'army', 'resource', 'other', 'wall', 'bbtroop', 'bbhero'] },
  ];

  // ---------------------------------------------------------------- Lecture de l'export
  function parseExport(text) {
    let raw;
    try { raw = JSON.parse(String(text).trim()); } catch {
      throw new Error("Ce texte n'est pas un JSON valide. Vérifie que tu as bien copié tout l'export.");
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.buildings)) {
      throw new Error("JSON valide, mais ce n'est pas un export de village (champ « buildings » manquant).");
    }
    if (!raw.buildings.some((b) => b && b.data === TOWN_HALL)) {
      throw new Error("L'hôtel de ville est introuvable dans cet export.");
    }
    return raw;
  }

  function buildModel(raw) {
    const ts = (Number(raw.timestamp) || Math.floor(Date.now() / 1000)) * 1000;
    const owned = {};
    for (const arr of Object.values(raw)) {
      if (!Array.isArray(arr)) continue;
      for (const e of arr) {
        if (!e || typeof e !== 'object' || e.data == null) continue;
        const it = I[e.data];
        if (!it) continue;
        const list = (owned[e.data] ||= []);
        const cnt = Math.max(1, Number(e.cnt) || 1);
        for (let i = 0; i < cnt; i++) {
          const timer = i === 0 ? Number(e.timer) || 0 : 0;
          const lvl = Number(e.lvl) || (it.k === 'building' || it.k === 'trap' ? 1 : 0);
          list.push({ lvl, end: timer > 0 ? ts + timer * 1000 : null, weapon: e.weapon });
        }
      }
    }
    const thEntry = owned[TOWN_HALL]?.[0];
    return {
      raw, ts, owned,
      tag: raw.tag || '',
      th: thEntry?.lvl || 1,
      weapon: thEntry?.weapon || 0,
      bh: owned[BUILDER_HALL]?.[0]?.lvl || 0,
    };
  }

  // ---------------------------------------------------------------- Calculs
  function maxAt(it, id, H) {
    if (+id === TOWN_HALL || +id === BUILDER_HALL) return Math.min(H, it.lv.length);
    let m = 0;
    for (const r of it.lv) if (r[1] <= H) m = r[0];
    return m;
  }

  const expectedCache = new Map();
  function expectedCounts(village, H) {
    const key = village + H;
    if (expectedCache.has(key)) return expectedCache.get(key);
    const c = {};
    for (const [L, u] of Object.entries(D.unlocks[village])) {
      if (+L > H) continue;
      for (const [id, q] of Object.entries(u)) c[id] = (c[id] || 0) + q;
    }
    for (const id of Object.keys(c)) {
      const m = I[id]?.merge;
      if (m) for (const [src, n] of Object.entries(m)) c[src] = (c[src] || 0) - c[id] * n;
    }
    if (village === 'home') {
      for (const [L, m] of Object.entries(D.hallMerge)) if (+L <= H) for (const [src, n] of Object.entries(m)) c[src] = (c[src] || 0) - n;
      c[TOWN_HALL] = 1;
    } else {
      c[BUILDER_HALL] = 1;
    }
    expectedCache.set(key, c);
    return c;
  }

  const isStructure = (it) => it.k === 'building' || it.k === 'trap';
  const weightOf = (it, row) => {
    if (it.k === 'equipment') return 1;
    if (it.g === 'wall') return row[2] || 1;
    return row[3] || 60;
  };

  function analyze(id, H, model, now) {
    const it = I[id];
    const max = maxAt(it, id, H);
    const prevMax = maxAt(it, id, H - 1);
    // Une amélioration terminée depuis l'export compte comme le niveau suivant.
    const inst = (model.owned[id] || []).map((o) => (o.end && now >= o.end ? { ...o, lvl: o.lvl + 1, end: null } : { ...o }));
    let missing = 0;

    if (isStructure(it) && !it.weapon) {
      const exp = Math.max(0, expectedCounts(it.v, H)[id] || 0);
      missing = Math.max(0, exp - inst.length);
      for (let i = 0; i < missing; i++) inst.push({ lvl: 0, end: null, missing: true });
    } else if (!isStructure(it) && it.k !== 'equipment' && inst.length === 0 && max > 0) {
      missing = 1;
      inst.push({ lvl: 0, end: null, missing: true });
    }
    if (!inst.length) return null;
    if (max === 0 && !model.owned[id]) return null;

    const res = {};
    let time = 0, levels = 0, done = 0, total = 0;
    const running = [];
    for (const o of inst) {
      o.eff = o.end ? o.lvl + 1 : o.lvl;
      if (o.end) running.push(o);
      for (let L = o.eff + 1; L <= max; L++) {
        const row = it.lv[L - 1];
        if (!row) continue;
        levels++;
        time += row[3];
        if (it.k === 'equipment') {
          const [a, b, c] = row[2];
          res.shiny = (res.shiny || 0) + a; res.glowy = (res.glowy || 0) + b; res.starry = (res.starry || 0) + c;
        } else {
          const key = it.g === 'wall' && it.v === 'home' ? 'wall' : RES_KEY[it.r] || 'gold';
          res[key] = (res[key] || 0) + row[2];
        }
      }
      // Équipements : progression mesurée depuis le niveau 1 (leur max ne dépend presque pas de l'HDV).
      const base = it.k === 'equipment' ? 1 : Math.min(o.lvl, prevMax);
      for (let L = base + 1; L <= max; L++) {
        const row = it.lv[L - 1];
        if (!row) continue;
        const w = weightOf(it, row);
        total += w;
        if (L <= o.eff) done += w;
      }
    }
    const minLvl = Math.min(...inst.map((o) => o.lvl));
    const maxLvl = Math.max(...inst.map((o) => o.lvl));
    return {
      id, it, max, prevMax, inst, missing, res, time, levels, done, total, running, minLvl, maxLvl,
      isMax: levels === 0 && !missing && !running.length,
    };
  }

  function analyzeTab(tab, model, H, now) {
    const rows = [];
    for (const id of Object.keys(I)) {
      const it = I[id];
      if (it.v !== tab.village || !tab.groups.includes(it.g)) continue;
      const a = analyze(id, H, model, now);
      if (a) rows.push(a);
    }
    return rows;
  }

  function summarize(rows) {
    const s = { res: {}, time: 0, levels: 0, done: 0, total: 0, missing: 0, items: rows.length, maxed: 0 };
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.res)) s.res[k] = (s.res[k] || 0) + v;
      s.time += r.time; s.levels += r.levels; s.done += r.done; s.total += r.total; s.missing += r.missing;
      if (r.isMax) s.maxed++;
    }
    s.pct = s.total ? s.done / s.total : 1;
    return s;
  }

  function hallFor(tab, model, settings) {
    return tab.village === 'bb' ? model.bh : Math.max(model.th, settings.target || model.th);
  }

  // ---------------------------------------------------------------- État
  let model = null;
  const DEFAULT_POTIONS = { builder: { n: 0, g: 10 }, lab: { n: 3, g: 24 }, pet: { n: 3, g: 24 } };
  let settings = Object.assign({ tab: 'overview', target: 0, hideMax: false, search: '' }, store.get(SETTINGS_KEY, {}));
  settings.potions = Object.assign({}, DEFAULT_POTIONS, settings.potions || {});

  // Une potion dure 1 h et fait avancer de g heures : sur une semaine (168 h),
  // on avance donc de 168 - n + n×g heures au lieu de 168.
  function withPotions(sec, p) {
    const n = Math.max(0, +p.n || 0), g = Math.max(1, +p.g || 1);
    const perWeek = 168 - n + n * g;
    return sec * (168 / perWeek);
  }
  const saveSettings = () => store.set(SETTINGS_KEY, settings);

  // ---------------------------------------------------------------- Rendu : éléments communs
  function ring(pct, size = 52) {
    const r = 22, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, pct));
    return `<div class="ring ${p >= 0.999 ? 'done' : ''}" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="${r}" fill="none" stroke-width="5"/>
      <circle class="val" cx="26" cy="26" r="${r}" fill="none" stroke-width="5" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>
      <span>${Math.floor(p * 100)}%</span></div>`;
  }
  const bar = (pct) => `<div class="bar ${pct >= 0.999 ? 'done' : ''}"><i style="width:${(Math.max(0, Math.min(1, pct)) * 100).toFixed(1)}%"></i></div>`;

  function resList(res) {
    const keys = Object.keys(RES).filter((k) => res[k] > 0);
    if (!keys.length) return '<div class="empty">Rien à dépenser 🎉</div>';
    return `<div class="res-list">${keys.map((k) => `
      <div class="res">${resIcon(k)}<span class="name">${RES[k].label}</span>
      <span class="amt c-${RES[k].cls}" title="${nf.format(res[k])}">${fmtNum(res[k])}</span></div>`).join('')}</div>`;
  }
  function costInline(res) {
    return Object.keys(RES).filter((k) => res[k] > 0)
      .map((k) => `<span class="cost c-${RES[k].cls}" title="${RES[k].label} : ${nf.format(res[k])}">${IMG[RES[k].img] ? `<img class="cost-ico" src="${IMG[RES[k].img]}" alt="">` : ''}${fmtNum(res[k])}</span>`).join(' ');
  }

  function workerOf(it) {
    if (it.k === 'pet') return 'Animalerie';
    if (it.k === 'unit' || it.k === 'spell') return it.v === 'bb' ? 'Labo astral' : 'Laboratoire';
    if (it.k === 'equipment') return 'Forgeron';
    return it.v === 'bb' ? 'Ouvrier (base des ouvriers)' : 'Ouvrier';
  }

  function allRunning(now) {
    const list = [];
    for (const [id, arr] of Object.entries(model.owned)) {
      const it = I[id];
      for (const o of arr) {
        if (!o.end) continue;
        const row = it.lv[o.lvl];
        const dur = row ? row[3] * 1000 : 0;
        list.push({ id, it, from: o.lvl, to: o.lvl + 1, end: o.end, start: dur ? o.end - dur : model.ts });
      }
    }
    return list.sort((a, b) => a.end - b.end);
  }

  // ---------------------------------------------------------------- Rendu : vue d'ensemble
  function renderOverview(now) {
    const H = Math.max(model.th, settings.target || model.th);
    const sums = {};
    for (const tab of TABS.slice(1)) {
      if (tab.village === 'bb' && !model.bh) continue;
      sums[tab.id] = summarize(analyzeTab(tab, model, hallFor(tab, model, settings), now));
    }
    const home = ['buildings', 'walls', 'lab', 'heroes', 'equipment'].map((k) => sums[k]).filter(Boolean);
    const allRes = {};
    for (const s of home) for (const [k, v] of Object.entries(s.res)) allRes[k] = (allRes[k] || 0) + v;
    const totalDone = home.reduce((a, s) => a + (s === sums.equipment || s === sums.walls ? 0 : s.done), 0);
    const totalAll = home.reduce((a, s) => a + (s === sums.equipment || s === sums.walls ? 0 : s.total), 0);
    const pct = totalAll ? totalDone / totalAll : 1;

    const builders = BUILDER_HUTS.reduce((n, id) => n + (model.owned[id]?.length || 0), 0) || 1;
    const running = allRunning(now);
    const runningHome = running.filter((r) => r.it.v === 'home');
    const busyBuilders = runningHome.filter((r) => workerOf(r.it) === 'Ouvrier' && r.end > now).length;

    const heroTime = sums.heroes ? analyzeTab({ village: 'home', groups: ['hero'] }, model, H, now).reduce((a, r) => a + r.time, 0) : 0;
    const petTime = sums.heroes ? sums.heroes.time - heroTime : 0;
    const builderTime = (sums.buildings?.time || 0) + heroTime;
    const labTime = sums.lab?.time || 0;

    const thName = H > model.th ? `Objectif HDV ${H}` : `Hôtel de ville ${model.th}`;
    const ringsHtml = TABS.slice(1).filter((t) => sums[t.id]).map((t) => {
      const s = sums[t.id];
      const sub = s.levels ? `${s.levels} niveau${s.levels > 1 ? 'x' : ''} restant${s.levels > 1 ? 's' : ''}` : 'Tout est au max';
      return `<button class="ring-card" type="button" data-goto="${t.id}">${ring(s.pct)}<div><div class="t">${t.label}</div><div class="s">${sub}</div></div></button>`;
    }).join('');

    const liveHtml = running.length ? running.map((r) => liveRow(r, now)).join('') : '<div class="empty">Aucune amélioration en cours dans cet export.</div>';

    return `
      <div class="grid cols-3">
        <div class="card hero-card">
          <div class="th-badge">${imgSrc(TOWN_HALL, model.th) ? `<img src="${imgSrc(TOWN_HALL, model.th)}" alt="Hôtel de ville ${model.th}">` : ''}<span class="th-num">${model.th}</span></div>
          <div>
            <p class="hero-title">${esc(thName)}</p>
            <p class="hero-sub">${model.weapon ? `Arme de l'HDV niv. ${model.weapon} · ` : ''}${builders} ouvriers · ${busyBuilders} occupé${busyBuilders > 1 ? 's' : ''}${model.bh ? ` · Base des ouvriers : MDO ${model.bh}` : ''}</p>
          </div>
          <div class="hero-stats">
            <div class="stat"><div class="v">${Math.floor(pct * 100)}%</div><div class="k">progression du village</div></div>
            <div class="stat"><div class="v">${fmtDur(builderTime / builders)}</div><div class="k">d'ouvriers restants (÷${builders})</div></div>
            <div class="stat"><div class="v">${fmtDur(labTime)}</div><div class="k">de laboratoire</div></div>
          </div>
          <div class="potions">
            ${potionPanel('builder', 'Ouvriers', builderTime / builders, now)}
            ${potionPanel('lab', 'Laboratoire', labTime, now)}
            ${potionPanel('pet', 'Animalerie', petTime, now)}
          </div>
        </div>

        <div class="card" style="grid-column: 1 / -1">
          <h2>Progression par catégorie <span class="sub">pondérée par le temps d'amélioration</span></h2>
          <div class="rings">${ringsHtml}</div>
        </div>

        <div class="card">
          <h2>En cours <span class="sub">${running.length}</span></h2>
          <div class="live-list">${liveHtml}</div>
        </div>

        <div class="card">
          <h2>Ressources restantes <span class="sub">village principal</span></h2>
          ${resList(allRes)}
        </div>

        <div class="card">
          <h2>Temps restant</h2>
          <div class="kv">
            <span class="k">Bâtiments + héros (total)</span><span class="v">${fmtDur(builderTime)}</span>
            <span class="k">… avec ${builders} ouvriers</span><span class="v">${fmtDur(builderTime / builders)}</span>
            <span class="k">Laboratoire</span><span class="v">${fmtDur(labTime)}</span>
            <span class="k">Animalerie</span><span class="v">${fmtDur(petTime)}</span>
            <span class="k">Bâtiments à construire</span><span class="v">${sums.buildings?.missing || 0}</span>
            <span class="k">Murs à améliorer</span><span class="v">${sums.walls?.levels || 0} niv.</span>
          </div>
        </div>
      </div>`;
  }

  const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  function potionPanel(key, label, sec, now) {
    const p = settings.potions[key];
    const boosted = withPotions(sec, p);
    const saved = sec - boosted;
    const done = sec <= 0;
    return `<div class="potion">
      <div class="potion-head"><span class="potion-title">${label}</span>
        <span class="potion-raw" title="Sans potion">${done ? 'Terminé' : 'sans potion : ' + fmtDur(sec)}</span></div>
      <div class="potion-main">
        <span class="potion-time">${done ? '✓' : fmtDur(boosted)}</span>
        ${!done && saved >= 3600 ? `<span class="badge ok">−${fmtDur(saved)}</span>` : ''}
      </div>
      <div class="potion-end">${done ? 'Rien à améliorer' : 'Fin estimée : ' + dayFmt.format(new Date(now + boosted * 1000))}</div>
      <div class="potion-cfg">
        <label><input type="number" min="0" max="50" step="1" value="${p.n}" data-potion="${key}.n" aria-label="Potions par semaine (${label})"> potions/sem.</label>
        <label>× <input type="number" min="1" max="100" step="1" value="${p.g}" data-potion="${key}.g" aria-label="Heures gagnées par potion (${label})"> h</label>
      </div>
    </div>`;
  }

  function liveRow(r, now) {
    const span = Math.max(1, r.end - r.start);
    const pct = (now - r.start) / span;
    const doneNow = now >= r.end;
    return `<div class="live">
      <div class="what">${thumb(r.id, r.to, 'thumb sm')}<span>${esc(r.it.n)} <small>${r.from} → ${r.to} · ${workerOf(r.it)}</small></span></div>
      <div class="when ${doneNow ? 'done' : ''}" data-end="${r.end}">${doneNow ? 'Terminé ✓' : fmtCountdown(r.end - now)}</div>
      <div class="bar-wrap" style="grid-column:1/-1">${bar(doneNow ? 1 : pct)}</div>
      <div class="eta">Fin ${dateFmt.format(new Date(r.end))}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- Rendu : listes
  function itemCard(a, now) {
    const { it, max, inst } = a;
    const chips = inst
      .slice()
      .sort((x, y) => (y.end ? 1 : 0) - (x.end ? 1 : 0) || y.lvl - x.lvl)
      .map((o) => {
        if (o.missing) return `<span class="chip missing" title="${isStructure(it) ? 'À construire' : 'Pas encore débloqué'}">–</span>`;
        let cls = '';
        if (o.end) cls = 'up';
        else if (o.lvl >= max) cls = 'max';
        else if (o.lvl < a.prevMax) cls = 'low';
        const label = o.end ? `${o.lvl}→${o.lvl + 1}` : o.lvl;
        const tip = o.end ? `En amélioration : fin ${dateFmt.format(new Date(o.end))}` : `Niveau ${o.lvl}`;
        return `<span class="chip ${cls}" title="${esc(tip)}">${label}</span>`;
      });
    const showChips = inst.length > 1 || a.running.length || a.missing;

    let badge = '';
    if (a.isMax) badge = '<span class="badge ok">Max</span>';
    else if (a.missing && isStructure(it)) badge = `<span class="badge bad">À construire ×${a.missing}</span>`;
    else if (a.missing) badge = '<span class="badge info">À débloquer</span>';
    else if (a.running.length) badge = '<span class="badge warn">En cours</span>';

    const lvlText = inst.length > 1 && a.minLvl !== a.maxLvl ? `<b>${a.minLvl}–${a.maxLvl}</b> / ${max}` : `<b>${a.maxLvl}</b> / ${max}`;
    const foot = a.levels
      ? `<span>${a.levels} niv. restant${a.levels > 1 ? 's' : ''}</span>${a.time ? `<span>⏱ ${fmtDur(a.time)}</span>` : ''}<span>${costInline(a.res)}</span>`
      : (a.running.length ? '<span>Dernière amélioration en cours</span>' : '');

    const ratio = a.total ? a.done / a.total : 1;
    return `<div class="item ${a.isMax ? 'is-max' : ''}">
      ${thumb(a.id, a.maxLvl || 1, 'thumb' + (a.maxLvl ? '' : ' ghost'))}
      <div class="item-body">
        <div class="item-top"><span class="item-name" title="${esc(it.n)}">${esc(it.n)}${inst.length > 1 ? ` <span class="item-lvl">×${inst.length}</span>` : ''}</span>${badge}<span class="item-lvl">${lvlText}</span></div>
        ${showChips ? `<div class="chips">${chips.join('')}</div>` : ''}
        ${bar(ratio)}
        ${foot ? `<div class="item-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  }

  function filterRows(rows) {
    const q = settings.search.trim().toLowerCase();
    return rows.filter((a) => {
      if (settings.hideMax && a.isMax) return false;
      if (q && !a.it.n.toLowerCase().includes(q) && !a.it.en.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function sectionHtml(title, rows, now, extra = '') {
    const s = summarize(rows);
    const shown = filterRows(rows);
    if (!shown.length) return '';
    const meta = [`${s.maxed}/${s.items} au max`, s.time ? `⏱ ${fmtDur(s.time)}` : '', costInline(s.res)].filter(Boolean).join(' · ');
    return `<div class="section">
      <div class="section-head"><h3>${esc(title)}</h3><span class="meta">${meta}</span></div>
      ${extra}
      <div class="items">${shown.map((a) => itemCard(a, now)).join('')}</div>
    </div>`;
  }

  function renderGroups(tab, now) {
    const H = hallFor(tab, model, settings);
    if (tab.village === 'bb' && !H) return '<div class="notice">La base des ouvriers n\'est pas encore débloquée sur ce compte.</div>';
    const rows = analyzeTab(tab, model, H, now);
    const order = { core: 0 };
    const out = [];
    if (tab.village === 'bb') out.push(`<div class="notice">Base des ouvriers : calculs basés sur ta maison des ouvriers niveau ${H}.</div>`);
    if (tab.id === 'equipment') return renderEquipment(rows, now);
    for (const g of tab.groups) {
      const groupRows = rows.filter((a) => a.it.g === g)
        .sort((x, y) => (order[x.it.g] ?? 1) - (order[y.it.g] ?? 1) || (y.levels ? 1 : 0) - (x.levels ? 1 : 0) || y.time - x.time);
      if (!groupRows.length) continue;
      if (g === 'wall') { out.push(renderWalls(groupRows[0], now)); continue; }
      out.push(sectionHtml(GROUP_LABEL[g], groupRows, now));
    }
    const html = out.join('');
    return html || '<div class="empty">Rien à afficher avec ces filtres.</div>';
  }

  function renderEquipment(rows, now) {
    const heroes = {};
    for (const a of rows) (heroes[a.it.hero] ||= []).push(a);
    const notOwned = Object.entries(I).filter(([id, it]) => it.k === 'equipment' && !model.owned[id]);
    let html = '<div class="notice">Seuls les équipements que tu possèdes sont comptés. Les épiques montent jusqu\'au niveau 27, les communs jusqu\'au 18 (selon l\'HDV).</div>';
    for (const [heroId, list] of Object.entries(heroes)) {
      list.sort((x, y) => y.levels - x.levels);
      html += sectionHtml(I[heroId]?.n || 'Autres', list, now);
    }
    if (notOwned.length) {
      html += `<div class="section"><div class="section-head"><h3>Pas encore obtenus</h3><span class="meta">${notOwned.length}</span></div>
        <div class="chips">${notOwned.map(([id, it]) => `<span class="badge with-img">${thumb(id, 1, 'thumb xs')}${esc(it.n)}</span>`).join('')}</div></div>`;
    }
    return html;
  }

  function renderWalls(a, now) {
    const { it, max, inst } = a;
    const byLvl = {};
    for (const o of inst) { const k = o.missing ? 0 : o.lvl; byLvl[k] = (byLvl[k] || 0) + 1; }
    const levels = Object.keys(byLvl).map(Number).sort((x, y) => y - x);
    const total = inst.length;
    const color = (L) => {
      if (L === 0) return 'var(--bad)';
      if (L >= max) return 'var(--ok)';
      const t = L / max;
      return `hsl(${30 + t * 15} 90% ${45 + t * 15}%)`;
    };
    const costTo = (L) => { let c = 0; for (let x = L + 1; x <= max; x++) c += it.lv[x - 1]?.[2] || 0; return c; };
    const rowsHtml = levels.map((L) => `<tr>
        <td>${L === 0 ? 'À construire' : 'Niveau ' + L}</td><td>${byLvl[L]}</td>
        <td>${L >= max ? '—' : fmtNum(costTo(L))}</td><td>${L >= max ? '—' : fmtNum(costTo(L) * byLvl[L])}</td></tr>`).join('');
    const maxed = byLvl[max] || 0;
    const s = summarize([a]);
    return `<div class="section">
      <div class="section-head">${thumb(a.id, a.maxLvl, 'thumb sm')}<h3>${esc(it.n)}s</h3><span class="meta">${maxed}/${total} au niveau ${max} · ${costInline(s.res)}</span></div>
      <div class="card">
        <div class="wall-bar">${levels.map((L) => `<div style="flex:${byLvl[L]};background:${color(L)}" title="Niveau ${L} : ${byLvl[L]}">${byLvl[L] / total > 0.06 ? (L || '–') : ''}</div>`).join('')}</div>
        <table class="wall-table">
          <thead><tr><th>Niveau</th><th>Nombre</th><th>Coût par mur jusqu'au max</th><th>Total</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p class="fineprint">Les murs peuvent se payer en or ou en élixir à partir d'un certain niveau.</p>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- Rendu principal
  function renderMeta() {
    if (!model) { $('#meta').innerHTML = ''; return; }
    const age = Date.now() - model.ts;
    $('#meta').innerHTML = `
      ${model.tag ? `<span class="tag">${esc(model.tag)}</span>` : ''}
      <span class="pill">HDV ${model.th}</span>
      <span class="pill ${age > 86400000 ? 'stale' : ''}" id="age" title="${esc(dateFmt.format(new Date(model.ts)))}">Export ${fmtAgo(model.ts)}</span>`;
  }

  function renderTabs(now) {
    $('#tabs').innerHTML = TABS.map((t) => {
      if (t.id === 'bb' && !model.bh) return '';
      let count = '';
      if (t.groups) {
        const s = summarize(analyzeTab(t, model, hallFor(t, model, settings), now));
        count = s.levels ? `<span class="count">${s.levels}</span>` : '<span class="count">✓</span>';
      }
      return `<button class="tab" role="tab" type="button" data-tab="${t.id}" aria-selected="${settings.tab === t.id}">${t.label}${count}</button>`;
    }).join('') + '<span class="tab-lens" aria-hidden="true"></span>';
    placeLens();
  }

  // Lentille « liquid glass » : repart de l'ancienne position et glisse vers l'onglet actif.
  let lensPos = null;
  function placeLens() {
    const tabs = $('#tabs');
    const lens = tabs && tabs.querySelector('.tab-lens');
    const sel = tabs && tabs.querySelector('[aria-selected="true"]');
    if (!lens || !sel || !sel.offsetWidth) return;
    const next = { x: sel.offsetLeft, w: sel.offsetWidth };
    const prev = lensPos || next;
    lens.classList.add('no-anim');
    lens.style.translate = `${prev.x}px 0`;
    lens.style.width = `${prev.w}px`;
    void lens.offsetWidth; // fige la position de départ
    lens.classList.remove('no-anim');
    lens.style.translate = `${next.x}px 0`;
    lens.style.width = `${next.w}px`;
    if (prev.x !== next.x) {
      lens.classList.remove('moving'); void lens.offsetWidth; lens.classList.add('moving');
    }
    lensPos = next;
  }
  window.addEventListener('resize', () => { lensPos = null; placeLens(); });
  if (document.fonts) document.fonts.ready.then(() => { lensPos = null; placeLens(); });

  // Reflet qui suit le pointeur sur les surfaces en verre.
  const GLASS = '.card, .import-card, .item, .btn.ghost, .ring-card, .live';
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest(GLASS);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // Thème clair / sombre, avec une révélation circulaire depuis le bouton.
  $('#btn-theme').addEventListener('click', (e) => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('vt-theme', next); } catch { /* navigation privée */ }
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { apply(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      root.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    });
  });

  function render() {
    if (!model) return;
    const now = Date.now();
    if (!TABS.some((t) => t.id === settings.tab) || (settings.tab === 'bb' && !model.bh)) settings.tab = 'overview';
    if (!settings.target || settings.target < model.th) settings.target = model.th;

    const sel = $('#target');
    sel.innerHTML = '';
    for (let h = model.th; h <= D.maxTH; h++) {
      const o = document.createElement('option');
      o.value = h; o.textContent = h === model.th ? `HDV ${h} (actuel)` : `HDV ${h}`;
      sel.appendChild(o);
    }
    sel.value = settings.target;
    $('#hide-max').checked = settings.hideMax;
    $('#search').value = settings.search;

    renderMeta();
    renderTabs(now);
    const tab = TABS.find((t) => t.id === settings.tab);
    $('#toolbar').hidden = tab.id === 'overview';
    $('#content').innerHTML = tab.id === 'overview' ? renderOverview(now) : renderGroups(tab, now);
  }

  // Compte à rebours : on met à jour le texte chaque seconde, et on recalcule tout quand une amélioration se termine.
  setInterval(() => {
    if (!model || $('#app-view').hidden) return;
    const now = Date.now();
    let finished = false;
    document.querySelectorAll('[data-end]').forEach((el) => {
      const end = +el.dataset.end;
      if (now >= end) { if (!el.classList.contains('done')) finished = true; }
      else el.textContent = fmtCountdown(end - now);
    });
    const age = $('#age');
    if (age) age.textContent = `Export ${fmtAgo(model.ts)}`;
    if (finished) render();
  }, 1000);

  // ---------------------------------------------------------------- Import
  function showImport(canCancel) {
    $('#import-view').hidden = false;
    $('#app-view').hidden = true;
    $('#btn-cancel').hidden = !canCancel;
    $('#btn-import').hidden = true;
    $('#import-error').textContent = '';
    $('#import-text').focus();
  }
  function showApp() {
    $('#import-view').hidden = true;
    $('#app-view').hidden = false;
    $('#btn-import').hidden = false;
    render();
  }
  function load(text, persist = true) {
    const raw = parseExport(text);
    model = buildModel(raw);
    if (persist) store.set(STORE_KEY, raw);
    settings.target = model.th;
    saveSettings();
    $('#import-text').value = '';
    showApp();
  }
  function tryLoad(text) {
    try { load(text); } catch (e) { $('#import-error').textContent = e.message; }
  }

  $('#btn-load').addEventListener('click', () => tryLoad($('#import-text').value));
  $('#btn-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('#import-text').value = text;
      tryLoad(text);
    } catch {
      $('#import-error').textContent = 'Accès au presse-papiers refusé : colle le texte avec Ctrl+V dans la zone ci-dessus.';
    }
  });
  $('#btn-demo').addEventListener('click', () => {
    try { load(JSON.stringify(makeDemo()), false); } catch (e) { $('#import-error').textContent = e.message; }
  });
  $('#btn-cancel').addEventListener('click', () => { if (model) showApp(); });
  $('#btn-import').addEventListener('click', () => showImport(true));

  const ta = $('#import-text');
  ta.addEventListener('dragover', (e) => { e.preventDefault(); ta.classList.add('dragover'); });
  ta.addEventListener('dragleave', () => ta.classList.remove('dragover'));
  ta.addEventListener('drop', async (e) => {
    e.preventDefault();
    ta.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) { ta.value = await f.text(); tryLoad(ta.value); }
  });

  // ---------------------------------------------------------------- Interactions
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-goto]');
    if (!t) return;
    settings.tab = t.dataset.tab || t.dataset.goto;
    saveSettings();
    render();
    window.scrollTo({ top: 0 });
  });
  document.addEventListener('change', (e) => {
    const key = e.target.dataset?.potion;
    if (!key) return;
    const [pole, field] = key.split('.');
    const v = Math.round(Number(e.target.value));
    settings.potions[pole] = { ...settings.potions[pole], [field]: Number.isFinite(v) ? Math.max(field === 'g' ? 1 : 0, v) : DEFAULT_POTIONS[pole][field] };
    saveSettings();
    render();
  });
  $('#target').addEventListener('change', (e) => { settings.target = +e.target.value; saveSettings(); render(); });
  $('#hide-max').addEventListener('change', (e) => { settings.hideMax = e.target.checked; saveSettings(); render(); });
  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      settings.search = e.target.value; saveSettings();
      const pos = e.target.selectionStart;
      render();
      $('#search').focus(); $('#search').setSelectionRange(pos, pos);
    }, 150);
  });

  // ---------------------------------------------------------------- Démo (village fictif HDV 15)
  function makeDemo() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const H = 15, BH = 8;
    const now = Math.floor(Date.now() / 1000);
    const out = { tag: '#DEMO0000', timestamp: now - 2 * 3600, buildings: [], traps: [], units: [], siege_machines: [], heroes: [], spells: [], pets: [], equipment: [], buildings2: [], traps2: [], units2: [], heroes2: [] };
    const pick = (it, id, h) => {
      const max = maxAt(it, id, h), prev = Math.max(1, maxAt(it, id, h - 1));
      return Math.max(1, Math.min(max, prev + Math.floor(rnd() * (max - prev + 1))));
    };
    for (const [village, h, bKey, tKey] of [['home', H, 'buildings', 'traps'], ['bb', BH, 'buildings2', 'traps2']]) {
      for (const [id, n] of Object.entries(expectedCounts(village, h))) {
        const it = I[id];
        if (!it || it.weapon || n <= 0) continue;
        if (it.g === 'wall') {
          const max = maxAt(it, id, h);
          out[bKey].push({ data: +id, lvl: max, cnt: Math.floor(n * 0.3) }, { data: +id, lvl: max - 1, cnt: Math.floor(n * 0.5) }, { data: +id, lvl: max - 2, cnt: n - Math.floor(n * 0.3) - Math.floor(n * 0.5) });
          continue;
        }
        const firstAtH = it.lv[0][1] === h;
        for (let i = 0; i < n; i++) {
          if (firstAtH && i === n - 1 && n > 1) continue; // un bâtiment neuf pas encore construit
          const lvl = +id === TOWN_HALL ? H : +id === BUILDER_HALL ? BH : pick(it, id, h);
          const e = { data: +id, lvl, cnt: 1 };
          if (+id === TOWN_HALL) e.weapon = 3;
          (it.k === 'trap' ? out[tKey] : out[bKey]).push(e);
        }
      }
    }
    const timers = [3600 * 5 + 1200, 3600 * 30, 86400 * 3 + 3600 * 7, 600];
    let ti = 0;
    for (const e of out.buildings) {
      const it = I[e.data];
      if (ti < 4 && it.g === 'defense' && e.lvl < maxAt(it, e.data, H) && rnd() < 0.25) e.timer = timers[ti++];
    }
    for (const [id, it] of Object.entries(I)) {
      const max = maxAt(it, id, it.v === 'bb' ? BH : H);
      if (!max) continue;
      const h = it.v === 'bb' ? BH : H;
      const key = { unit: it.g === 'siege' ? 'siege_machines' : 'units', spell: 'spells', hero: 'heroes', pet: 'pets' }[it.k];
      if (key) {
        if (it.g === 'squad') continue;
        const bbKey = { units: 'units2', heroes: 'heroes2' }[key];
        out[it.v === 'bb' ? bbKey : key].push({ data: +id, lvl: pick(it, id, h) });
      } else if (it.k === 'equipment' && (it.rar === 'common' ? it.lv[0][1] <= H : rnd() < 0.5)) {
        out.equipment.push({ data: +id, lvl: Math.max(1, Math.floor(rnd() * maxAt(it, id, H)) + 1) });
      }
    }
    const lab = out.units.find((u) => u.lvl < maxAt(I[u.data], u.data, H));
    if (lab) lab.timer = 86400 + 3600 * 4;
    if (out.heroes[0]) out.heroes[0].timer = 3600 * 18;
    if (out.pets[0]) out.pets[0].timer = 3600 * 9;
    return out;
  }

  // ---------------------------------------------------------------- Démarrage
  $('#data-version').textContent = `mises à jour du ${D.generated} (HDV max ${D.maxTH})`;
  const saved = store.get(STORE_KEY, null);
  if (saved) {
    try { model = buildModel(parseExport(JSON.stringify(saved))); showApp(); } catch { showImport(false); }
  } else {
    showImport(false);
  }
})();
