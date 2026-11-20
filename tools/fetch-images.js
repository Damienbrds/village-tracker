#!/usr/bin/env node
/*
 * Télécharge les images du jeu depuis ClashKingAssets et génère data/images.js.
 * À lancer après tools/build-data.js :   node tools/fetch-images.js
 * Les fichiers déjà présents ne sont pas retéléchargés.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/ClashKingInc/ClashKingAssets/HEAD/assets';
const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'img');
const OUT = path.join(ROOT, 'data', 'images.js');

global.window = {};
require(path.join(ROOT, 'data', 'game-data.js'));
const { items } = window.GAME_DATA;

// "Builder's Hut" -> "builder's_hut", "P.E.K.K.A" -> "pekka", "B.O.T.O’s Shack" -> "botos_shack"
const slug = (name) => name.toLowerCase().replace(/’/g, "'").replace(/\./g, '').replace(/\s+/g, '_');
const variants = (name) => {
  const s = slug(name);
  return [...new Set([s, s.replace(/'/g, ''), s.replace(/'/g, '_'), s.replace(/-/g, '_')])];
};

// Quelques noms différents entre les données et les dossiers d'images.
const ALIASES = {
  1000089: 'firespitter', 4000097: 'apprentice_warden', 4000059: 'electro_dragon', 4000177: 'meteor_golem',
};

(async () => {
  const manifest = await (await fetch(`${BASE}/manifest.json`)).json();
  const all = new Set(Object.values(manifest.assets).flat().map((a) => a.path));
  const has = (p) => all.has(p);

  const map = {};      // id -> chemin unique, ou { niveau: chemin }
  const missing = [];
  const wanted = new Set();

  for (const [id, it] of Object.entries(items)) {
    const village = it.v === 'bb' ? 'builder-base' : 'home-village';
    const names = ALIASES[id] ? [ALIASES[id]] : variants(it.en);
    let found = null;

    if (it.k === 'building' || it.k === 'trap') {
      const root = it.k === 'trap' ? 'traps' : 'buildings';
      for (const n of names) {
        const levels = {};
        for (const row of it.lv) {
          const p = `${root}/${village}/${n}/level_${row[0]}.webp`;
          if (has(p)) levels[row[0]] = p;
        }
        if (Object.keys(levels).length) { found = levels; break; }
      }
    } else {
      for (const n of names) {
        const candidates = {
          unit: [`troops/${n}/icon.webp`],
          spell: [`spells/${n}.webp`],
          hero: [`heroes/${n}/icon.webp`],
          pet: [`pets/${n}/icon.webp`],
          guardian: [`guardians/${n}/icon.webp`],
          equipment: [`equipment/${n}.webp`],
        }[it.k] || [];
        found = candidates.find(has);
        if (found) break;
      }
    }
    if (!found) { missing.push(`${id} ${it.en}`); continue; }
    map[id] = found;
    (typeof found === 'string' ? [found] : Object.values(found)).forEach((p) => wanted.add(p));
  }

  // Portraits des héros et icônes de ressources.
  const extras = {};
  for (const [id, it] of Object.entries(items)) {
    if (it.k !== 'hero') continue;
    const p = `heroes/${slug(it.en)}/portrait.webp`;
    if (has(p)) { extras['portrait_' + id] = p; wanted.add(p); }
  }
  for (const r of ['gold', 'elixir', 'dark_elixir', 'builder_gold', 'builder_elixir', 'gems', 'shiny_ore', 'glowy_ore', 'starry_ore']) {
    const p = `resources/${r}.webp`;
    if (has(p)) { extras['res_' + r] = p; wanted.add(p); }
  }

  // Téléchargement (8 en parallèle).
  const list = [...wanted].filter((p) => !fs.existsSync(path.join(IMG_DIR, p)));
  let done = 0, failed = 0;
  const worker = async () => {
    while (list.length) {
      const p = list.shift();
      try {
        const r = await fetch(`${BASE}/${p.split('/').map(encodeURIComponent).join('/')}`);
        if (!r.ok) throw new Error(r.status);
        const file = path.join(IMG_DIR, p);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        done++;
      } catch (e) { failed++; console.warn('échec', p, e.message); }
    }
  };
  const total = list.length;
  await Promise.all(Array.from({ length: 8 }, worker));

  const rel = (p) => 'assets/img/' + p;
  const out = {};
  for (const [id, v] of Object.entries(map)) {
    out[id] = typeof v === 'string' ? rel(v) : Object.fromEntries(Object.entries(v).map(([l, p]) => [l, rel(p)]));
  }
  for (const [k, p] of Object.entries(extras)) out[k] = rel(p);
  fs.writeFileSync(OUT, '// Fichier généré par tools/fetch-images.js — ne pas modifier à la main.\nwindow.GAME_IMAGES = ' + JSON.stringify(out) + ';\n');

  console.log(`Images : ${wanted.size} au total, ${done}/${total} téléchargées, ${failed} échecs.`);
  console.log(`Éléments avec image : ${Object.keys(map).length}/${Object.keys(items).length}`);
  if (missing.length) console.log('Sans image :', missing.join(' | '));
})().catch((e) => { console.error(e); process.exit(1); });
