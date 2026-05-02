/* ═══════════════════════════════════════════════════════════
   Home Dashboard — app.js  (ES module)
   ═══════════════════════════════════════════════════════════ */

import { initializeApp }               from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         onAuthStateChanged }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, onValue }   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/* ── Firebase config ─────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyBhjBzQPlaGYicVXw015qoQRMkSQXyOMfU',
  authDomain:        'homedashboard-5b2e0.firebaseapp.com',
  databaseURL:       'https://homedashboard-5b2e0-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'homedashboard-5b2e0',
  storageBucket:     'homedashboard-5b2e0.firebasestorage.app',
  messagingSenderId: '707757582553',
  appId:             '1:707757582553:web:03c672dcb6125afc87b6c8',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* ── Weather code map (WMO) ──────────────────────────────── */
const WX = {
  0:  { label: 'Clear sky',          icon: '☀️' },
  1:  { label: 'Mainly clear',       icon: '🌤️' },
  2:  { label: 'Partly cloudy',      icon: '⛅' },
  3:  { label: 'Overcast',           icon: '☁️' },
  45: { label: 'Foggy',              icon: '🌫️' },
  48: { label: 'Icy fog',            icon: '🌫️' },
  51: { label: 'Light drizzle',      icon: '🌦️' },
  53: { label: 'Drizzle',            icon: '🌦️' },
  55: { label: 'Heavy drizzle',      icon: '🌧️' },
  61: { label: 'Light rain',         icon: '🌧️' },
  63: { label: 'Rain',               icon: '🌧️' },
  65: { label: 'Heavy rain',         icon: '🌧️' },
  71: { label: 'Light snow',         icon: '🌨️' },
  73: { label: 'Snow',               icon: '❄️' },
  75: { label: 'Heavy snow',         icon: '❄️' },
  77: { label: 'Snow grains',        icon: '🌨️' },
  80: { label: 'Rain showers',       icon: '🌦️' },
  81: { label: 'Showers',            icon: '🌧️' },
  82: { label: 'Heavy showers',      icon: '⛈️' },
  85: { label: 'Snow showers',       icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm',       icon: '⛈️' },
  96: { label: 'Thunderstorm',       icon: '⛈️' },
  99: { label: 'Thunderstorm',       icon: '⛈️' },
};

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

/* ── House day/night swap ────────────────────────────────── */
function updateHouseImage() {
  const img = document.getElementById('house-img');
  if (!img) return;
  const h = new Date().getHours();
  const isDay = h >= 7 && h < 20;
  img.src = isDay
    ? 'https://raw.githubusercontent.com/agent365924/HomeDashboard/1679d48f1a24f6805e6035273b3c2d107453f451/house_day.png'
    : 'https://raw.githubusercontent.com/agent365924/HomeDashboard/1679d48f1a24f6805e6035273b3c2d107453f451/house_night.png';
}

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
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
}

function init() {
  updateHouseImage();
  // refresh house image every hour
  setInterval(updateHouseImage, 3600000);
  subscribeLive();
  subscribeSensors();
  subscribeNetwork();
  subscribeTotals();
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
  /* generation — real-time kW */
  set('gen-kw', fmt(d.generation_kw, 2));
  set('gen-autonomy', d.rel_self_consumption != null ? fmt(d.rel_self_consumption, 1) + ' %' : '— %');

  /* weather */
  set('wx-temp', d.temperature_c != null ? fmt(d.temperature_c, 1) + '°' : '—°');
  const wx = WX[d.weathercode] ?? { label: '—', icon: '⛅' };
  const wxIcon = document.getElementById('wx-icon');
  if (wxIcon) wxIcon.textContent = wx.icon;
  set('wx-desc', wx.label);

  /* battery */
  set('bat-soc', fmt(d.battery_soc, 1));
  set('bat-kw',  fmt(Math.abs(d.battery_kw), 2) + ' kW');

  /* grid card — consumption as main, net grid as sub */
  set('grid-main', fmt(d.consumption_kw, 2));
  const netGrid = d.grid_import_kw - d.grid_export_kw;
  const netStr  = netGrid < 0
    ? '−' + fmt(Math.abs(netGrid), 2) + ' kW'
    : fmt(netGrid, 2) + ' kW';
  set('grid-net', netStr);

  /* system status panel */
  setBadge('sys-bat-mode',    d.battery_mode,
    d.battery_mode === 'normal' ? 'ok' : 'warn');
  setBadge('sys-bat-standby', d.battery_standby ? 'active' : 'off',
    d.battery_standby ? 'warn' : 'off');
  setBadge('sys-backup',      d.backup_mode ? 'on' : 'off',
    d.backup_mode ? 'warn' : 'off');
  setBadge('sys-meter', d.meter_mode ?? '—', 'info');
  set('sys-e-day',    d.e_day_kwh  != null ? fmt(d.e_day_kwh,  1) + ' kWh' : '—');
  set('sys-e-year',   d.e_year_kwh != null ? fmt(d.e_year_kwh, 0) + ' kWh' : '—');
  set('sys-e-total',  d.e_total_kwh != null
    ? (d.e_total_kwh / 1000000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MWh'
    : '—');
  set('sys-autonomy', d.rel_autonomy         != null ? fmt(d.rel_autonomy, 1) + ' %' : '—');
  set('sys-self',     d.rel_self_consumption != null ? fmt(d.rel_self_consumption, 1) + ' %' : '—');
}

/* ── Sensors ─────────────────────────────────────────────── */
function subscribeSensors() {
  onValue(ref(db, '/sensors/thermo_hygrometer'), (snap) => {
    const d = snap.val();
    if (!d) return;
    set('info-temp', d.temperature != null ? fmt(d.temperature, 1) + '°' : '—°');
    set('info-hum',  d.humidity    != null ? fmt(d.humidity, 0) + ' %' : '— %');
  });
}

/* ── Network ─────────────────────────────────────────────── */
function subscribeNetwork() {
  onValue(ref(db, '/network'), (snap) => {
    const d = snap.val();
    if (!d) return;
    set('info-dl',   d.download_mbps != null ? fmt(d.download_mbps, 0) : '—');
    set('info-ul',   d.upload_mbps   != null ? fmt(d.upload_mbps,   0) : '—');
    set('info-ping', d.ping_ms       != null ? fmt(d.ping_ms,       0) : '—');
  });
}

/* ── Totals ──────────────────────────────────────────────── */
function subscribeTotals() {
  const today = new Date().toISOString().slice(0, 10);

  // today's running totals
  onValue(ref(db, `/totals/daily/${today}`), (snap) => {
    const d = snap.val();
    if (!d) return;
    set('today-gen',  fmt(d.generation_kwh,  1) + ' kWh');
    set('today-cons', fmt(d.consumption_kwh, 1) + ' kWh');
    set('today-imp',  fmt(d.grid_import_kwh, 2) + ' kWh');
    set('today-exp',  fmt(d.grid_export_kwh, 2) + ' kWh');
    const costEl = document.getElementById('today-cost');
    if (costEl && d.cost_eur != null) {
      const v = d.cost_eur;
      costEl.textContent = (v < 0 ? '−' : '') + fmt(Math.abs(v), 2) + ' €';
      costEl.className   = 'sys-val ' + (v <= 0 ? 'cost-pos' : 'cost-neg');
    }
  });

  // monthly history — combine /totals/monthly + current month from /totals/daily
  onValue(ref(db, '/totals/monthly'), (snap) => {
    const monthly = snap.val() || {};
    onValue(ref(db, '/totals/daily'), (snapD) => {
      const daily = snapD.val() || {};
      renderHistory(monthly, daily);
    }, { onlyOnce: true });
  });
}

function renderHistory(monthly, daily) {
  // aggregate daily entries by month for current month
  const byMonth = { ...monthly };

  Object.entries(daily).forEach(([date, vals]) => {
    const key = date.slice(0, 7); // YYYY-MM
    if (!byMonth[key]) {
      byMonth[key] = { generation_kwh: 0, consumption_kwh: 0,
                       grid_import_kwh: 0, grid_export_kwh: 0, cost_eur: 0 };
    }
    byMonth[key].generation_kwh  = (byMonth[key].generation_kwh  || 0) + (vals.generation_kwh  || 0);
    byMonth[key].consumption_kwh = (byMonth[key].consumption_kwh || 0) + (vals.consumption_kwh || 0);
    byMonth[key].grid_import_kwh = (byMonth[key].grid_import_kwh || 0) + (vals.grid_import_kwh || 0);
    byMonth[key].grid_export_kwh = (byMonth[key].grid_export_kwh || 0) + (vals.grid_export_kwh || 0);
    byMonth[key].cost_eur        = (byMonth[key].cost_eur        || 0) + (vals.cost_eur        || 0);
  });

  const list = document.getElementById('history-list');
  list.innerHTML = '';

  Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([key, t]) => {
      const [y, m]     = key.split('-');
      const monthName  = new Date(+y, +m - 1, 1)
        .toLocaleString('de-DE', { month: 'long', year: 'numeric' });
      const costClass  = (t.cost_eur || 0) <= 0 ? 'cost-pos' : 'cost-neg';
      const card       = document.createElement('div');
      card.className   = 'month-card';
      card.innerHTML   = `
        <div class="month-title">${monthName}</div>
        <div class="month-row"><span>Total Generation</span><b>${fmt(t.generation_kwh,  1)} kWh</b></div>
        <div class="month-row"><span>Total Consumption</span><b>${fmt(t.consumption_kwh, 1)} kWh</b></div>
        <div class="month-row"><span>From Grid</span><b>${fmt(t.grid_import_kwh, 1)} kWh</b></div>
        <div class="month-row"><span>To Grid</span><b>${fmt(t.grid_export_kwh,  1)} kWh</b></div>
        <div class="month-row"><span>Energy Cost</span><b class="${costClass}">${fmt(Math.abs(t.cost_eur || 0), 2)} €</b></div>
      `;
      list.appendChild(card);
    });
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
