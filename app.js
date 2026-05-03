/* ═══════════════════════════════════════════════════════════
   Home Dashboard — app.js  (ES module)
   ═══════════════════════════════════════════════════════════ */

import { initializeApp }               from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         onAuthStateChanged }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, onValue }   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/* ── Tariff ──────────────────────────────────────────────── */
const PRICE_IMPORT_KWH = 0.31;
const PRICE_EXPORT_KWH = 0.08;

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
    updateHouseImage();
  });
});

/* ── House theme-based image swap ────────────────────────── */
const HOUSE_DAY   = 'https://raw.githubusercontent.com/agent365924/HomeDashboard/b0b5655a8d8a950e6f0d99c49ad9f3599e26f4f0/house_day.png';
const HOUSE_NIGHT = 'https://raw.githubusercontent.com/agent365924/HomeDashboard/1679d48f1a24f6805e6035273b3c2d107453f451/house_night.png';

function updateHouseImage() {
  const img = document.getElementById('house-img');
  if (!img) return;
  const isLight = document.documentElement.classList.contains('light');
  img.src = isLight ? HOUSE_DAY : HOUSE_NIGHT;
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
  set('bat-kw', fmt(d.battery_kw, 2) + ' kW');

  /* grid card — consumption as main, net grid as sub */
  set('grid-main', fmt(d.consumption_kw, 2));
  const netGrid = d.grid_import_kw - d.grid_export_kw;
  const netStr  = netGrid < 0
    ? '−' + fmt(Math.abs(netGrid), 2) + ' kW'
    : fmt(netGrid, 2) + ' kW';
  set('grid-net', netStr);

  /* climate panel — outdoor */
  set('clim-out-temp', d.temperature_c != null ? fmt(d.temperature_c, 1) + '°' : '—');
  const wxClim = WX[d.weathercode] ?? { label: '—' };
  set('clim-wx-desc', wxClim.label);

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
const SECURITY_KEYS = [
  'smoke_hwr', 'smoke_emi_schlafzimmer', 'smoke_emi_spielzimmer',
  'smoke_schlafzimmer', 'smoke_eingang', 'smoke_buero_eg', 'water_leak',
];

function subscribeSensors() {
  onValue(ref(db, '/sensors'), (snap) => {
    const sensors = snap.val();
    if (!sensors) return;

    const th = sensors.thermo_hygrometer;
    if (th) {
      set('info-temp', th.temperature != null ? fmt(th.temperature, 1) + '°' : '—°');
      set('info-hum',  th.humidity    != null ? fmt(th.humidity, 0) + ' %' : '— %');
      set('clim-temp', th.temperature != null ? fmt(th.temperature, 1) : '—');
      set('clim-hum',  th.humidity    != null ? fmt(th.humidity, 0) : '—');
    }

    renderSensorPills(sensors);
    renderSecurityPanel(sensors);
  });
}

function renderSensorPills(sensors) {
  const entries = Object.values(sensors);
  const offlineCount = entries.filter(s => !s.online).length;
  const anyAlarm     = entries.some(s => s.alarm);

  const onlineDot  = document.getElementById('pill-online-dot');
  const onlineText = document.getElementById('pill-online-text');
  const alarmDot   = document.getElementById('pill-alarm-dot');
  const alarmText  = document.getElementById('pill-alarm-text');
  if (!onlineDot) return;

  if (offlineCount === 0) {
    onlineDot.className  = 'pill-dot pill-dot-ok';
    onlineText.textContent = 'online';
  } else {
    onlineDot.className  = 'pill-dot pill-dot-alarm';
    onlineText.textContent = offlineCount + ' offline';
  }

  if (anyAlarm) {
    alarmDot.className  = 'pill-dot pill-dot-alarm';
    alarmText.textContent = 'ALARM';
  } else {
    alarmDot.className  = 'pill-dot pill-dot-muted';
    alarmText.textContent = 'no alarms';
  }
}

function renderSecurityPanel(sensors) {
  const container = document.getElementById('security-list');
  if (!container) return;

  const rows = SECURITY_KEYS
    .filter(k => sensors[k])
    .map(k => {
      const s = sensors[k];
      const onlineClass = s.online ? 'badge-ok'   : 'badge-warn';
      const onlineText  = s.online ? 'online'      : 'offline';
      const alarmClass  = s.alarm  ? 'badge-warn'  : 'badge-off';
      const alarmText   = s.alarm  ? 'ALARM'        : 'ok';
      return `<div class="sys-row">
        <span class="sys-key">${s.name}</span>
        <div class="sensor-badges">
          <span class="badge ${onlineClass}">${onlineText}</span>
          <span class="badge ${alarmClass}">${alarmText}</span>
        </div>
      </div>`;
    });

  container.innerHTML = rows.join('');
}

/* ── Network ─────────────────────────────────────────────── */
function subscribeNetwork() {
  onValue(ref(db, '/network'), (snap) => {
    const d = snap.val();
    if (!d) return;
    set('info-dl',   d.download_mbps != null ? fmt(d.download_mbps, 0) : '—');
    set('info-ul',   d.upload_mbps   != null ? fmt(d.upload_mbps,   0) : '—');
    set('info-ping', d.ping_ms       != null ? fmt(d.ping_ms,       0) : '—');
    set('net-dl',    d.download_mbps != null ? fmt(d.download_mbps, 0) + ' Mbps' : '—');
    set('net-ul',    d.upload_mbps   != null ? fmt(d.upload_mbps,   0) + ' Mbps' : '—');
    set('net-ping',  d.ping_ms       != null ? fmt(d.ping_ms,       0) + ' ms'   : '—');
    if (d.timestamp) {
      const ts = new Date(d.timestamp * 1000);
      set('net-ts', ts.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }));
    }
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
    if (costEl) {
      const v = (d.grid_import_kwh || 0) * PRICE_IMPORT_KWH
              - (d.grid_export_kwh || 0) * PRICE_EXPORT_KWH;
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
      const cost       = (t.grid_import_kwh || 0) * PRICE_IMPORT_KWH
                       - (t.grid_export_kwh || 0) * PRICE_EXPORT_KWH;
      const costClass  = cost <= 0 ? 'cost-pos' : 'cost-neg';
      const costStr    = (cost < 0 ? '−' : '') + fmt(Math.abs(cost), 2) + ' €';
      const card       = document.createElement('div');
      card.className   = 'month-card';
      card.innerHTML   = `
        <div class="month-title">${monthName}</div>
        <div class="sys-grid">
          <div class="sys-col">
            <div class="month-row"><span>Total Generation</span><b>${fmt(t.generation_kwh,  1)} kWh</b></div>
            <div class="month-row"><span>Total Consumption</span><b>${fmt(t.consumption_kwh, 1)} kWh</b></div>
          </div>
          <div class="sys-col">
            <div class="month-row"><span>From Grid</span><b>${fmt(t.grid_import_kwh, 1)} kWh</b></div>
            <div class="month-row"><span>To Grid</span><b>${fmt(t.grid_export_kwh,  1)} kWh</b></div>
            <div class="month-row"><span>Energy Cost</span><b class="${costClass}">${costStr}</b></div>
          </div>
        </div>
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

  document.getElementById('tab-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});
