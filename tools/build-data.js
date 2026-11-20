#!/usr/bin/env node
/*
 * Génère data/game-data.js à partir des données statiques publiques de ClashKing
 * (https://github.com/ClashKingInc/ClashKingAssets), extraites des fichiers du jeu.
 *
 * Usage :  node tools/build-data.js            -> télécharge les données à jour
 *          node tools/build-data.js <dossier>   -> utilise static_data.json + FR.json locaux
 *
 * À relancer après une mise à jour du jeu (nouveau HDV, nouvelles troupes…).
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/ClashKingInc/ClashKingAssets/HEAD/assets';
const OUT = path.join(__dirname, '..', 'data', 'game-data.js');

async function load(localDir) {
  if (localDir) {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(localDir, f), 'utf8'));
    return [read('static_data.json'), read(fs.existsSync(path.join(localDir, 'FR.json')) ? 'FR.json' : 'translations_FR.json')];
  }
  const get = async (f) => {
    const r = await fetch(`${BASE}/${f}`);
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return r.json();
  };
  return Promise.all([get('static_data.json'), get('translations/FR.json')]);
}

const BUILDING_GROUP = {
  'Town Hall': 'core', 'BB Builder Hall': 'core', Defense: 'defense', Army: 'army',
  Resource: 'resource', Wall: 'wall', Worker: 'other', Worker2: 'other', Helper: 'other',
};
const TROOP_GROUP = {
  Barracks: 'troop', 'Dark Barracks': 'dark', Workshop: 'siege', 'Squad Barracks': 'squad',
  'Builder Barracks': 'bbtroop',
};

(async () => {
  const [sd, fr] = await load(process.argv[2]);
  const t = (x) => (x.TID && fr[x.TID.name]) || x.name;
  const items = {};
  const heroIdByName = {};
  const skipped = [];

  // Bâtiments & pièges : l'entrée du niveau L décrit le coût pour ATTEINDRE L.
  const addStructure = (x, kind) => {
    const village = x.village === 'builderBase' ? 'bb' : 'home';
    const lv = (x.levels || []).map((l) => [l.level, l.required_townhall ?? 0, l.build_cost || 0, l.build_time || 0]);
    const item = {
      n: t(x), en: x.name, k: kind, v: village,
      g: kind === 'trap' ? 'trap' : BUILDING_GROUP[x.type] || 'other',
      r: x.upgrade_resource || null, lv,
    };
    if (x.levels?.[0]?.required_townhall == null && village === 'home' && x._id === 1000001) lv[0][1] = 1;
    const merge = x.levels?.[0]?.merge_requirement;
    if (merge) {
      const m = {};
      for (const req of merge) m[req._id] = (m[req._id] || 0) + 1;
      item.merge = m;
    }
    items[x._id] = item;
  };
  sd.buildings.forEach((b) => addStructure(b, 'building'));
  sd.traps.forEach((b) => addStructure(b, 'trap'));

  // Unités : l'entrée du niveau L décrit le coût pour passer de L à L+1 -> on décale.
  // HDV requis par le bâtiment de production (ex. Usine de sorts noirs niv. 1 -> HDV 8).
  const prodTH = (x) => {
    if (!x.production_building) return 0;
    const village = x.village === 'builderBase' ? 'builderBase' : 'home';
    const b = sd.buildings.find((b) => b.name === x.production_building && (b.village === village || !x.village));
    const l = b?.levels?.[(x.production_building_level || 1) - 1];
    return l?.required_townhall || 0;
  };
  const addUnit = (x, kind, group, extra = {}) => {
    const levels = x.levels || [];
    const minTH = prodTH(x);
    const lv = levels.map((l, i) => {
      const prev = levels[i - 1];
      return [l.level, Math.max(l.required_townhall ?? 0, minTH), prev ? prev.upgrade_cost || 0 : 0, prev ? prev.upgrade_time || 0 : 0];
    });
    items[x._id] = {
      n: t(x), en: x.name, k: kind, v: x.village === 'builderBase' ? 'bb' : 'home', g: group,
      r: x.upgrade_resource || null, lv, ...extra,
    };
  };

  for (const x of sd.troops) {
    if (x.super_troop || x.is_seasonal) { skipped.push(x.name); continue; }
    const g = TROOP_GROUP[x.production_building];
    if (!g) { skipped.push(x.name); continue; }
    addUnit(x, 'unit', g);
  }
  for (const x of sd.spells) {
    if (x.is_seasonal || (x.levels || []).length <= 1) { skipped.push(x.name); continue; }
    addUnit(x, 'spell', x.production_building === 'Dark Spell Factory' ? 'darkspell' : 'spell');
  }
  for (const x of sd.heroes) {
    heroIdByName[x.name] = x._id;
    addUnit(x, 'hero', x.village === 'builderBase' ? 'bbhero' : 'hero');
  }
  for (const x of sd.pets) addUnit(x, 'pet', 'pet');
  for (const x of sd.guardians || []) addUnit(x, 'guardian', 'guardian');

  // Équipements : coût en minerais [brillant, luisant, étoilé], pas de durée.
  for (const x of sd.equipment) {
    const levels = x.levels || [];
    const lv = levels.map((l, i) => {
      const c = levels[i - 1]?.upgrade_cost || {};
      return [l.level, l.required_townhall ?? 0, [c.shiny_ore || 0, c.glowy_ore || 0, c.starry_ore || 0], 0];
    });
    items[x._id] = {
      n: t(x), en: x.name, k: 'equipment', v: 'home', g: 'equipment', r: 'Ore', lv,
      hero: heroIdByName[x.hero] || null, rar: x.rarity === 'Epic' ? 'epic' : 'common',
    };
  }

  // Quantités débloquées par niveau d'HDV / de MDO (cumulées côté site).
  const unlocks = { home: {}, bb: {} };
  const hallMerge = {};
  const collect = (hallId, key) => {
    const hall = sd.buildings.find((b) => b._id === hallId);
    for (const l of hall.levels) {
      const u = {};
      for (const x of l.unlocks || []) u[x._id] = (u[x._id] || 0) + x.quantity;
      unlocks[key][l.level] = u;
      if (l.merge_requirement) {
        hallMerge[l.level] = {};
        for (const req of l.merge_requirement) hallMerge[l.level][req._id] = (hallMerge[l.level][req._id] || 0) + 1;
      }
    }
  };
  collect(1000001, 'home');
  collect(1000034, 'bb');

  // Niveau 1 d'un bâtiment = premier HDV/MDO qui le débloque (certaines entrées ont un HDV requis vide).
  for (const key of ['home', 'bb']) {
    const levels = Object.keys(unlocks[key]).map(Number).sort((a, b) => a - b);
    const first = {};
    for (const L of levels) for (const id of Object.keys(unlocks[key][L])) if (!(id in first)) first[id] = L;
    for (const [id, L] of Object.entries(first)) {
      const it = items[id];
      if (!it || !it.lv.length || it.lv[0][1] > 0) continue; // ne corrige que les HDV requis manquants
      it.lv[0][1] = L;
      for (const row of it.lv) if (row[1] < it.lv[0][1]) row[1] = it.lv[0][1];
    }
  }
  // Gigabombe = arme de l'HDV, pas un piège à poser.
  if (items[12000020]) { items[12000020].weapon = true; items[12000020].n += " (arme de l'HDV)"; }

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'ClashKingAssets static_data.json',
    maxTH: sd.buildings.find((b) => b._id === 1000001).levels.length,
    maxBH: sd.buildings.find((b) => b._id === 1000034).levels.length,
    items, unlocks, hallMerge,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '// Fichier généré par tools/build-data.js — ne pas modifier à la main.\nwindow.GAME_DATA = ' + JSON.stringify(out) + ';\n');
  console.log(`OK : ${Object.keys(items).length} éléments, HDV max ${out.maxTH}, MDO max ${out.maxBH}`);
  console.log(`Ignorés (super troupes / saisonniers) : ${skipped.length}`);
  console.log(`-> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko)`);
})().catch((e) => { console.error(e); process.exit(1); });
