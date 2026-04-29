/* ═══════════════════════════════════════════════════════════
   Home Dashboard — app.js  (ES module)
   ═══════════════════════════════════════════════════════════ */

import { initializeApp }               from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         onAuthStateChanged }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, onValue }   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/* ── Firebase config ─────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT',
  storageBucket:     'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
  databaseURL:       'https://YOUR_PROJECT-default-rtdb.europe-west1.firebasedatabase.app',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* ── Theme ───────────────────────────────────────────────── */
const THEME_KEY = 'hd_theme';

function applyTheme(light) {
  document.documentElement.classList.toggle('light', light);
}

applyTheme(localStorage.getItem(THEME_KEY) === 'light');

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light');
    localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  });
});

/* ── Auth ────────────────────────────────────────────────── */
onAuthStateChanged(auth, (user) => {
  const overlay = document.getElementById('login-overlay');
  if (user) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 400);
    startApp();
  } else {
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';
    document.getElementById('email-input')?.focus();
  }
});

async function doLogin() {
  const email    = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const errorEl  = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errorEl.classList.remove('visible');
  btn.disabled    = true;
  btn.textContent = '…';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    errorEl.classList.add('visible');
    const pw = document.getElementById('password-input');
    pw.value = '';
    pw.classList.add('shake');
    pw.addEventListener('animationend', () => pw.classList.remove('shake'), { once: true });
    pw.focus();
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Enter';
  }
}

/* ── Status helpers ──────────────────────────────────────── */
let staleTimer = null;

function setStatus(type) {
  document.getElementById('status-live').classList.add('hidden');
  document.getElementById('status-stale').classList.add('hidden');
  document.getElementById('status-error').classList.add('hidden');
  if (type) document.getElementById('status-' + type).classList.remove('hidden');
}

function resetStaleTimer() {
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => setStatus('stale'), 35000);
}

/* ── App start ───────────────────────────────────────────── */
function startApp() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      subscribeLive();
      subscribeDaily();
    });
  } else {
    subscribeLive();
    subscribeDaily();
  }
}

/* ── Live data ───────────────────────────────────────────── */
function subscribeLive() {
  onValue(ref(db, '/live'), (snap) => {
    const d = snap.val();
    if (!d) return;
    renderLive(d);
    resetStaleTimer();
    setStatus('live');
    const ts = new Date(d.timestamp * 1000);
    document.getElementById('last-update').textContent =
      'Last update: ' + ts.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, () => setStatus('error'));
}

function renderLive(d) {
  /* generation */
  set('gen-now', fmt(d.generation_kw, 2) + ' kW');
  set('gen-day', d.e_day_kwh != null ? fmt(d.e_day_kwh, 1) : '—');

  /* weather */
  set('wx-temp', d.temperature_c != null ? fmt(d.temperature_c, 1) : '—');

  /* battery */
  set('bat-soc', fmt(d.battery_soc, 1));
  set('bat-kw',  fmt(Math.abs(d.battery_kw), 2) + ' kW');
  set('bat-mode-label', d.battery_kw >= 0 ? 'Charging' : 'Discharging');

  /* grid */
  const exporting = d.grid_export_kw > 0;
  set('grid-label',     exporting ? 'To Grid'   : 'From Grid');
  set('grid-main',      exporting ? fmt(d.grid_export_kw, 2) : fmt(d.grid_import_kw, 2));
  set('grid-sub-label', exporting ? 'From Grid' : 'To Grid');
  set('grid-sub',       exporting
    ? fmt(d.grid_import_kw, 2) + ' kWh'
    : fmt(d.grid_export_kw, 2) + ' kWh');

  /* connector line color */
  const lineGrid = document.getElementById('line-grid');
  if (lineGrid) lineGrid.className.baseVal = 'line ' + (exporting ? 'line-export' : 'line-import');

  /* cost — fetched from config node; placeholder calc here */
  const costEl = document.getElementById('cost-val');
  if (costEl && d.grid_import_kw != null) {
    /* cost is computed in daily aggregation; show placeholder until daily loads */
    costEl.textContent = '—';
    costEl.className   = 'cost-neutral';
  }

  /* system status panel */
  setBadge('sys-bat-mode',    d.battery_mode,
    d.battery_mode === 'normal' ? 'ok' : 'warn');
  setBadge('sys-bat-standby', d.battery_standby ? 'active' : 'off',
    d.battery_standby ? 'warn' : 'off');
  setBadge('sys-backup',      d.backup_mode ? 'on' : 'off',
    d.backup_mode ? 'warn' : 'off');
  set('sys-meter',    d.meter_mode ?? '—');
  set('sys-e-day',    d.e_day_kwh  != null ? fmt(d.e_day_kwh,  1) + ' kWh' : '—');
  set('sys-e-year',   d.e_year_kwh != null ? fmt(d.e_year_kwh, 0) + ' kWh' : '—');
  set('sys-e-total',  d.e_total_kwh != null
    ? (d.e_total_kwh / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MWh'
    : '—');
  set('sys-autonomy', d.rel_autonomy       != null ? fmt(d.rel_autonomy, 1) + ' %' : '—');
  set('sys-self',     d.rel_self_consumption != null ? fmt(d.rel_self_consumption, 1) + ' %' : '—');
}

/* ── Daily / history data ────────────────────────────────── */
function subscribeDaily() {
  onValue(ref(db, '/daily'), (snap) => {
    const data = snap.val();
    if (!data) return;
    renderHistory(data);
    renderTodayCost(data);
  });
}

function renderHistory(data) {
  /* Group days by month, newest first */
  const byMonth = {};
  Object.entries(data)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([date, vals]) => {
      const [y, m] = date.split('-');
      const key    = y + '-' + m;
      if (!byMonth[key]) byMonth[key] = { y, m, days: [] };
      byMonth[key].days.push({ date, ...vals });
    });

  const list = document.getElementById('history-list');
  list.innerHTML = '';

  Object.entries(byMonth).forEach(([, month]) => {
    const totals = month.days.reduce((acc, d) => {
      acc.gen  += d.generation_kwh  || 0;
      acc.cons += d.consumption_kwh || 0;
      acc.imp  += d.grid_import_kwh || 0;
      acc.exp  += d.grid_export_kwh || 0;
      acc.cost += d.cost_eur        || 0;
      return acc;
    }, { gen: 0, cons: 0, imp: 0, exp: 0, cost: 0 });

    const monthName = new Date(+month.y, +month.m - 1, 1)
      .toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const costClass = totals.cost <= 0 ? 'pos' : 'neg';

    const card = document.createElement('div');
    card.className = 'month-card';
    card.innerHTML = `
      <div class="month-title">${monthName}</div>
      <div class="month-row"><span>Consumption</span><b>${fmt(totals.cons, 1)} kWh</b></div>
      <div class="month-row"><span>Generation</span><b>${fmt(totals.gen, 1)} kWh</b></div>
      <div class="month-row"><span>From Grid</span><b>${fmt(totals.imp, 1)} kWh</b></div>
      <div class="month-row"><span>To Grid</span><b>${fmt(totals.exp, 1)} kWh</b></div>
      <div class="month-row"><span>Energy costs</span><b class="${costClass}">${fmt(totals.cost, 2)} €</b></div>
    `;
    list.appendChild(card);
  });
}

function renderTodayCost(data) {
  const today = new Date().toISOString().slice(0, 10);
  const d     = data[today];
  const costEl = document.getElementById('cost-val');
  if (!costEl) return;
  if (d && d.cost_eur != null) {
    const v = d.cost_eur;
    costEl.textContent = (v >= 0 ? '' : '−') + fmt(Math.abs(v), 2) + ' €';
    costEl.className   = v <= 0 ? 'cost-pos' : 'cost-neg';
  }
}

/* ── Utilities ───────────────────────────────────────────── */
function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setBadge(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'badge badge-' + (type || 'off');
}

function fmt(val, decimals) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ── Wire events ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn')
    .addEventListener('click', doLogin);
  document.getElementById('email-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('password-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});
