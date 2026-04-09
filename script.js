/* ================================================
   OPEN WHEN U... — script.js  v2
   ================================================ */

/* ---- Color definitions ----
   guaranteed:  always appears at least once per 10 rolls
   weight:      probability in the random-fill pool
                5 base = 17.8% each → 89%
                pink   = 10%
                black  = 1%
                total  = 100%
   ------------------------------------------------ */
const COLORS = [
  { id:'yellow', label:'Inseguro...',            hex:'#f39c12', guaranteed:true,  weight:17.8 },
  { id:'blue',   label:'Triste?',              hex:'#3498db', guaranteed:true,  weight:17.8 },
  { id:'purple', label:'Mal Dia?',       hex:'#9b59b6', guaranteed:true,  weight:17.8 },
  { id:'red',    label:"Perdido...",hex:'#e74c3c', guaranteed:true,  weight:17.8 },
  { id:'green',  label:'Sry :c',              hex:'#2ecc71', guaranteed:true,  weight:17.8 },
  { id:'pink',   label:'Why u!',         hex:'#e91e8c', guaranteed:false, weight:10   },
  { id:'black',  label:'🌟',         hex:'#546e7a', guaranteed:false, weight:1    },
];
// total: 5×17.8 + 10 + 1 = 100 ✓

/* ---- State ---- */
let manifest   = {};
let collected  = {};
let isRevealing = false;

const LS_KEY = 'openWhenU_v2_collected';

/* ================================================
   INIT
   ================================================ */
async function init() {
  loadCollected();
  await loadManifest();
  buildJarPeeks();
  buildColorSelector();
  createDust();
}

/* ================================================
   MANIFEST
   ================================================ */
async function loadManifest() {
  try {
    const res = await fetch('manifest.json');
    if (res.ok) manifest = await res.json();
    else manifest = {};
  } catch (_) { manifest = {}; }

  COLORS.forEach(c => {
    if (!Array.isArray(manifest[c.id])) manifest[c.id] = [];
  });
}

/* ================================================
   LOCALSTORAGE
   ================================================ */
function loadCollected() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    collected = raw ? JSON.parse(raw) : {};
  } catch (_) { collected = {}; }
  COLORS.forEach(c => {
    if (!Array.isArray(collected[c.id])) collected[c.id] = [];
  });
}

function saveCollected() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(collected)); }
  catch (e) { console.error('localStorage write failed:', e); }
}

/* ================================================
   JAR INTERIOR — decorative rolls
   ================================================ */
function buildJarPeeks() {
  const container = document.getElementById('jar-peeks');
  if (!container) return;

  // Show 6 rolls with varied colors
  const preview = ['red','green','yellow','purple','blue','pink'];
  container.innerHTML = preview.map(id => {
    const c = COLORS.find(x => x.id === id);
    return `
      <div class="jar-inner-roll">
        <div class="jar-inner-ribbon" style="background:${c.hex}"></div>
      </div>`;
  }).join('');
}

/* ================================================
   JAR CLICK
   ================================================ */
function clickJar() {
  if (isRevealing) return;
  const jar = document.getElementById('jar');
  jar.classList.add('shaking');
  setTimeout(() => jar.classList.remove('shaking'), 700);
  setTimeout(showRolls, 450);
}

/* ================================================
   ROLL GENERATION (10 rolls)

   Strategy:
   1. Guarantee 1 of each "guaranteed" color (5 rolls).
   2. Fill remaining 5 slots with weighted random picks.
      To avoid the visual uniformity bug, we use
      a rejection-sampling approach so that the 5
      extra slots collectively have at least 3 distinct
      colors before giving up (max 100 attempts).
   3. Shuffle all 10.
   ================================================ */
function generateRollColors() {
  // Step 1: guaranteed
  const guaranteed = COLORS.filter(c => c.guaranteed).map(c => c.id);

  // Step 2: 5 random extras — ensure variety
  const extras = [];
  let attempts = 0;
  while (extras.length < 5 && attempts < 200) {
    attempts++;
    const pick = weightedRandomColor();
    extras.push(pick);
    // If we have 5 but fewer than 2 distinct → restart
    if (extras.length === 5) {
      const distinct = new Set(extras).size;
      if (distinct < 2) { extras.length = 0; }
    }
  }

  const all = [...guaranteed, ...extras];

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all;
}

function weightedRandomColor() {
  // Build a cumulative table each call (cheap, correct)
  let rand = Math.random() * 100;
  for (const c of COLORS) {
    rand -= c.weight;
    if (rand <= 0) return c.id;
  }
  return COLORS[0].id;
}

/* ================================================
   SHOW ROLLS SCREEN
   ================================================ */
function showRolls() {
  const colors = generateRollColors();
  const area = document.getElementById('rolls-area');
  area.innerHTML = '';

  colors.forEach((colorId, i) => {
    const c = COLORS.find(x => x.id === colorId);
    const el = document.createElement('div');
    el.className = 'roll-item';
    el.style.animationDelay = `${i * 0.055}s`;
    el.dataset.colorId = colorId;

    el.innerHTML = `
      <div class="roll-ribbon" style="background:${c.hex}">
        <div class="roll-ribbon-knot"></div>
      </div>`;

    el.onclick = () => pickRoll(el, colorId, c);
    area.appendChild(el);
  });

  document.getElementById('rolls-screen').style.display = 'flex';
}

function cancelRolls() {
  document.getElementById('rolls-screen').style.display = 'none';
}

/* ================================================
   PICK A ROLL
   ================================================ */
async function pickRoll(rollEl, colorId, colorDef) {
  if (isRevealing) return;
  isRevealing = true;

  document.querySelectorAll('.roll-item').forEach(r => {
    if (r !== rollEl) r.classList.add('faded');
  });
  rollEl.classList.add('picked');

  const ribbon = rollEl.querySelector('.roll-ribbon');
  ribbon.classList.add('falling');

  await sleep(750);

  document.getElementById('rolls-screen').style.display = 'none';

  const imgPath = pickImage(colorId);
  showReveal(colorDef, imgPath);

  isRevealing = false;
}

/* ================================================
   IMAGE SELECTION
   60% new, 40% repeat (falls back gracefully)
   ================================================ */
function pickImage(colorId) {
  const all    = manifest[colorId]  || [];
  const seen   = collected[colorId] || [];
  if (all.length === 0) return null;

  const unseen = all.filter(f => !seen.includes(f));
  const repeat = seen.filter(f => all.includes(f));

  let chosen = null;

  if      (unseen.length > 0 && repeat.length === 0) chosen = randomFrom(unseen);
  else if (unseen.length === 0 && repeat.length > 0) chosen = randomFrom(repeat);
  else if (unseen.length > 0 && repeat.length > 0)
    chosen = Math.random() < 0.60 ? randomFrom(unseen) : randomFrom(repeat);

  if (!chosen) return null;

  if (!seen.includes(chosen)) {
    collected[colorId].push(chosen);
    saveCollected();
  }

  return `images/${colorId}/${chosen}`;
}

/* ================================================
   REVEAL MODAL
   ================================================ */
function showReveal(colorDef, imgPath) {
  const overlay = document.getElementById('reveal-overlay');
  const img     = document.getElementById('reveal-img');
  const noImg   = document.getElementById('reveal-no-img');
  const ribbon  = document.getElementById('ribbon-piece');

  ribbon.style.background = colorDef.hex;
  ribbon.classList.remove('dropping');

  if (imgPath) {
    img.src = imgPath;
    img.style.display = 'block';
    noImg.style.display = 'none';
  } else {
    img.style.display = 'none';
    img.src = '';
    noImg.style.display = 'flex';
  }

  overlay.style.display = 'flex';

  requestAnimationFrame(() =>
    requestAnimationFrame(() => ribbon.classList.add('dropping'))
  );
}

function closeReveal() {
  document.getElementById('reveal-overlay').style.display = 'none';
  document.getElementById('ribbon-piece').classList.remove('dropping');
}

/* ================================================
   FOLDER MODAL
   ================================================ */
function openFolder() {
  buildColorSelector();
  document.getElementById('folder-overlay').style.display = 'flex';
  setActiveColorBtn(COLORS[0].id);
  showColorMemories(COLORS[0].id);
}

function closeFolder() {
  document.getElementById('folder-overlay').style.display = 'none';
}

function buildColorSelector() {
  const bar = document.getElementById('color-selector');
  if (!bar) return;

  const activeId = bar.querySelector('.color-btn.active')?.dataset.colorId || COLORS[0].id;
  bar.innerHTML = '';

  COLORS.forEach(c => {
    const count = (collected[c.id] || []).length;
    const btn   = document.createElement('button');
    btn.className = 'color-btn';
    btn.dataset.colorId = c.id;
    btn.style.background = c.hex;

    const shortLabel = c.label.split(' ').slice(0, 2).join(' ');
    btn.innerHTML = `${shortLabel}<span class="count-badge">${count}</span>`;
    btn.onclick = () => {
      setActiveColorBtn(c.id);
      showColorMemories(c.id);
    };
    bar.appendChild(btn);
  });

  setActiveColorBtn(activeId);
}

function setActiveColorBtn(colorId) {
  document.querySelectorAll('.color-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.colorId === colorId)
  );
}

function showColorMemories(colorId) {
  const grid = document.getElementById('memory-gallery');
  const c    = COLORS.find(x => x.id === colorId);
  const imgs = collected[colorId] || [];

  if (imgs.length === 0) {
    grid.innerHTML = `
      <div class="gallery-empty">
        <span class="empty-emoji">📭</span>
        <p>Aún no tienes recuerdos aquí...</p>
        <p style="font-size:.8em;color:#c0a07a;">Abre el jarro y elige un rollito</p>
      </div>`;
    return;
  }

  grid.innerHTML = imgs.map(filename => {
    const path = `images/${colorId}/${filename}`;
    return `
      <div class="memory-thumb" style="border-color:${c.hex}"
           onclick="openLightbox('${path}')">
        <img src="${path}" alt=""
             onerror="this.parentElement.style.display='none'">
      </div>`;
  }).join('');
}

/* ================================================
   LIGHTBOX
   ================================================ */
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

/* ================================================
   DUST PARTICLES
   ================================================ */
function createDust() {
  const container = document.getElementById('dust');
  if (!container) return;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'dust-particle';
    p.style.left   = `${10 + Math.random() * 80}%`;
    p.style.top    = `${40 + Math.random() * 55}%`;
    p.style.animationDuration = `${5 + Math.random() * 10}s`;
    p.style.animationDelay   = `${Math.random() * 10}s`;
    p.style.opacity = String(Math.random() * 0.55);
    p.style.width  = `${1 + Math.random() * 2}px`;
    p.style.height = p.style.width;
    container.appendChild(p);
  }
}

/* ================================================
   KEYBOARD
   ================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLightbox();
    closeFolder();
    closeReveal();
    cancelRolls();
  }
});

/* ================================================
   UTILS
   ================================================ */
const sleep      = ms => new Promise(r => setTimeout(r, ms));
const randomFrom = arr => arr[Math.floor(Math.random() * arr.length)];

/* ---- START ---- */
init();
