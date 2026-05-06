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
    if (Object.keys(lastHistoryData).length) {
      renderChart24h(lastHistoryData);
      renderChartClimate(lastHistoryData);
      renderChartNetwork(lastHistoryData);
    }
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
  subscribeHistory();
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
  set('clim-out-temp', d.temperature_c != null ? fmt(d.temperature_c, 1) + ' °C' : '—');
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
      set('clim-temp', th.temperature != null ? fmt(th.temperature, 1) + ' °C' : '—');
      set('clim-hum',  th.humidity    != null ? fmt(th.humidity, 0) + ' %' : '—');
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
    set('info-ping', d.ping_ms       != null ? fmt(d.ping_ms,       0) : '—');
    set('net-dl',    d.download_mbps != null ? fmt(d.download_mbps, 0) + ' Mbps' : '—');
    set('net-ping',  d.ping_ms       != null ? fmt(d.ping_ms,       0) + ' ms'   : '—');
    if (d.timestamp) {
      const ts = new Date(d.timestamp * 1000);
      set('net-ts', ts.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }));
    }
  });
}

/* ── 24 h history chart ──────────────────────────────────── */
const mob = () => window.innerWidth <= 600;

let chart24h        = null;
let chartClimate    = null;
let chartNetwork    = null;
let lastHistoryData = {};

function subscribeHistory() {
  const today = new Date().toISOString().slice(0, 10);
  onValue(ref(db, `/history/${today}`), (snap) => {
    lastHistoryData = snap.val() || {};
    renderChart24h(lastHistoryData);
    renderChartClimate(lastHistoryData);
    renderChartNetwork(lastHistoryData);
  });
}

function renderChart24h(raw) {
  const canvas = document.getElementById('chart-24h');
  if (!canvas) return;

  const style   = getComputedStyle(document.documentElement);
  const gridClr = style.getPropertyValue('--border').trim();
  const textClr = style.getPropertyValue('--text-warm').trim();
  const bgCard  = style.getPropertyValue('--bg-card').trim();
  const textMain = style.getPropertyValue('--text').trim();
  const m = mob();

  const entries  = Object.entries(raw).sort((a, b) => a[0].localeCompare(b[0]));
  const labels   = entries.map(([t]) => t);
  const genData  = entries.map(([, v]) => v.generation_kw  ?? null);
  const consData = entries.map(([, v]) => v.consumption_kw ?? null);
  const socData  = entries.map(([, v]) => v.battery_soc    ?? null);

  if (chart24h) chart24h.destroy();

  chart24h = new Chart(canvas.getContext('2d'), {
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Generation',
          data: genData,
          borderColor: '#4ade80',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
        {
          type: 'line',
          label: 'Consumption',
          data: consData,
          borderColor: '#fb923c',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
        {
          type: 'line',
          label: 'Battery',
          data: socData,
          borderColor: '#60a5fa',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'soc',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: textClr,
            font: { family: 'Barlow', size: m ? 11 : 13 },
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8,
            padding: m ? 10 : 16,
          },
        },
        tooltip: {
          backgroundColor:  bgCard,
          borderColor:      gridClr,
          borderWidth:      0.5,
          titleColor:       textMain,
          bodyColor:        textClr,
          titleFont:        { family: 'Barlow Semi Condensed', size: 14, weight: '500' },
          bodyFont:         { family: 'Barlow', size: 13 },
          padding:          12,
          cornerRadius:     12,
          boxWidth:         10,
          boxHeight:        10,
          caretSize:        5,
          callbacks: {
            label(ctx) {
              if (ctx.dataset.yAxisID === 'soc')
                return `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y, 1)} %`;
              return `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y, 2)} kW`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: textClr,
            font: { family: 'Barlow', size: m ? 11 : 12 },
            maxTicksLimit: m ? 6 : 9,
            maxRotation: 0,
          },
          grid:   { color: gridClr },
          border: { color: gridClr },
        },
        y: {
          min: 0,
          ticks: {
            color: textClr,
            font: { family: 'Barlow', size: m ? 11 : 12 },
            callback: (v, i) => m ? (i === 0 ? v + ' kW' : v) : v + ' kW',
          },
          grid:   { color: gridClr },
          border: { color: gridClr },
        },
        soc: {
          position: 'right',
          min: 0,
          max: 100,
          ticks: {
            color: '#60a5fa',
            font: { family: 'Barlow', size: m ? 11 : 12 },
            callback: (v, i) => m ? (i === 0 ? v + ' %' : v) : v + ' %',
          },
          grid:   { display: false },
          border: { color: gridClr },
        },
      },
    },
  });
}

function renderChartClimate(raw) {
  const canvas = document.getElementById('chart-climate');
  if (!canvas) return;

  const style    = getComputedStyle(document.documentElement);
  const gridClr  = style.getPropertyValue('--border').trim();
  const textClr  = style.getPropertyValue('--text-warm').trim();
  const bgCard   = style.getPropertyValue('--bg-card').trim();
  const textMain = style.getPropertyValue('--text').trim();

  const m = mob();
  const entries = Object.entries(raw).sort((a, b) => a[0].localeCompare(b[0]));
  const labels  = entries.map(([t]) => t);

  if (chartClimate) chartClimate.destroy();

  chartClimate = new Chart(canvas.getContext('2d'), {
    data: {
      labels,
      datasets: [
        {
          type: 'line', label: 'Outdoor',
          data: entries.map(([, v]) => v.temperature_out ?? null),
          borderColor: '#fb923c', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, spanGaps: true, yAxisID: 'y',
        },
        {
          type: 'line', label: 'Indoor',
          data: entries.map(([, v]) => v.temperature_in ?? null),
          borderColor: '#60a5fa', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, spanGaps: true, yAxisID: 'y',
        },
        {
          type: 'line', label: 'Humidity',
          data: entries.map(([, v]) => v.humidity_in ?? null),
          borderColor: '#a78bfa', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, spanGaps: true, yAxisID: 'hum',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textClr, font: { family: 'Barlow', size: m ? 11 : 13 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: m ? 10 : 16 } },
        tooltip: {
          backgroundColor: bgCard, borderColor: gridClr, borderWidth: 0.5,
          titleColor: textMain, bodyColor: textClr,
          titleFont: { family: 'Barlow Semi Condensed', size: 14, weight: '500' },
          bodyFont: { family: 'Barlow', size: 13 },
          padding: 12, cornerRadius: 12, boxWidth: 10, boxHeight: 10, caretSize: 5,
          callbacks: {
            label(ctx) {
              if (ctx.dataset.yAxisID === 'hum') return `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y, 0)} %`;
              return `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y, 1)} °C`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textClr, font: { family: 'Barlow', size: m ? 11 : 12 }, maxTicksLimit: m ? 6 : 9, maxRotation: 0 },
          grid: { color: gridClr }, border: { color: gridClr },
        },
        y: {
          ticks: { color: textClr, font: { family: 'Barlow', size: m ? 11 : 12 }, callback: (v, i) => m ? (i === 0 ? v + ' °C' : v) : v + ' °C' },
          grid: { color: gridClr }, border: { color: gridClr },
        },
        hum: {
          position: 'right', min: 0, max: 100,
          ticks: { color: '#a78bfa', font: { family: 'Barlow', size: m ? 11 : 12 }, callback: (v, i) => m ? (i === 0 ? v + ' %' : v) : v + ' %' },
          grid: { display: false }, border: { color: gridClr },
        },
      },
    },
  });
}

function renderChartNetwork(raw) {
  const canvas = document.getElementById('chart-network');
  if (!canvas) return;

  const style    = getComputedStyle(document.documentElement);
  const gridClr  = style.getPropertyValue('--border').trim();
  const textClr  = style.getPropertyValue('--text-warm').trim();
  const bgCard   = style.getPropertyValue('--bg-card').trim();
  const textMain = style.getPropertyValue('--text').trim();

  const m = mob();
  const entries = Object.entries(raw).sort((a, b) => a[0].localeCompare(b[0]));
  const labels  = entries.map(([t]) => t);

  if (chartNetwork) chartNetwork.destroy();

  chartNetwork = new Chart(canvas.getContext('2d'), {
    data: {
      labels,
      datasets: [
        {
          type: 'line', label: 'Download',
          data: entries.map(([, v]) => v.download_mbps ?? null),
          borderColor: '#4ade80', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, spanGaps: true, yAxisID: 'y',
        },
        {
          type: 'line', label: 'Ping',
          data: entries.map(([, v]) => v.ping_ms ?? null),
          borderColor: '#fb923c', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, spanGaps: true, yAxisID: 'ping',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textClr, font: { family: 'Barlow', size: m ? 11 : 13 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: m ? 10 : 16 } },
        tooltip: {
          backgroundColor: bgCard, borderColor: gridClr, borderWidth: 0.5,
          titleColor: textMain, bodyColor: textClr,
          titleFont: { family: 'Barlow Semi Condensed', size: 14, weight: '500' },
          bodyFont: { family: 'Barlow', size: 13 },
          padding: 12, cornerRadius: 12, boxWidth: 10, boxHeight: 10, caretSize: 5,
          callbacks: {
            label(ctx) {
              if (ctx.dataset.yAxisID === 'ping') return `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y, 0)} ms`;
              return `  ${ctx.dataset.label}: ${fmt(ctx.parsed.y, 1)} Mbps`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textClr, font: { family: 'Barlow', size: m ? 11 : 12 }, maxTicksLimit: m ? 6 : 9, maxRotation: 0 },
          grid: { color: gridClr }, border: { color: gridClr },
        },
        y: {
          min: 0,
          ticks: { color: textClr, font: { family: 'Barlow', size: m ? 11 : 12 }, callback: (v, i) => m ? (i === 0 ? v + ' Mbps' : v) : v + ' Mbps' },
          grid: { color: gridClr }, border: { color: gridClr },
        },
        ping: {
          position: 'right', min: 0,
          ticks: { color: '#fb923c', font: { family: 'Barlow', size: m ? 11 : 12 }, callback: (v, i) => m ? (i === 0 ? v + ' ms' : v) : v + ' ms' },
          grid: { display: false }, border: { color: gridClr },
        },
      },
    },
  });
}

/* ── Totals ──────────────────────────────────────────────── */
function subscribeTotals() {
  const today = new Date().toISOString().slice(0, 10);

  // today's running totals
  onValue(ref(db, `/totals/daily/${today}`), (snap) => {
    const d = snap.val();
    if (!d) return;
    set('today-gen',       fmt(d.generation_kwh,  1) + ' kWh');
    set('today-peak-gen',  d.peak_generation_kw  != null ? fmt(d.peak_generation_kw,  2) + ' kW' : '—');
    set('today-cons',      fmt(d.consumption_kwh, 1) + ' kWh');
    set('today-peak-cons', d.peak_consumption_kw != null ? fmt(d.peak_consumption_kw, 2) + ' kW' : '—');
    set('today-imp',  fmt(d.grid_import_kwh, 2) + ' kWh');
    set('today-exp',  fmt(d.grid_export_kwh, 2) + ' kWh');
    set('clim-peak-temp-in',  d.peak_temperature_in  != null ? fmt(d.peak_temperature_in,  1) + ' °C' : '—');
    set('clim-peak-temp-out', d.peak_temperature_out != null ? fmt(d.peak_temperature_out, 1) + ' °C' : '—');
    set('clim-peak-hum',      d.peak_humidity_in     != null ? fmt(d.peak_humidity_in,     0) + ' %'  : '—');
    set('net-peak-dl',        d.peak_download_mbps   != null ? fmt(d.peak_download_mbps,   1) + ' Mbps' : '—');
    const autonomy = d.consumption_kwh > 0
      ? Math.min(100, Math.max(0, (1 - d.grid_import_kwh / d.consumption_kwh) * 100))
      : null;
    set('today-autonomy', autonomy != null ? fmt(autonomy, 1) + ' %' : '—');
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
                       grid_import_kwh: 0, grid_export_kwh: 0, cost_eur: 0,
                       peak_day_generation_kwh: 0, peak_day_consumption_kwh: 0 };
    }
    byMonth[key].generation_kwh  = (byMonth[key].generation_kwh  || 0) + (vals.generation_kwh  || 0);
    byMonth[key].consumption_kwh = (byMonth[key].consumption_kwh || 0) + (vals.consumption_kwh || 0);
    byMonth[key].grid_import_kwh = (byMonth[key].grid_import_kwh || 0) + (vals.grid_import_kwh || 0);
    byMonth[key].grid_export_kwh = (byMonth[key].grid_export_kwh || 0) + (vals.grid_export_kwh || 0);
    byMonth[key].cost_eur        = (byMonth[key].cost_eur        || 0) + (vals.cost_eur        || 0);
    byMonth[key].peak_day_generation_kwh  = Math.max(byMonth[key].peak_day_generation_kwh  || 0, vals.generation_kwh  || 0);
    byMonth[key].peak_day_consumption_kwh = Math.max(byMonth[key].peak_day_consumption_kwh || 0, vals.consumption_kwh || 0);
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
      const autonomy   = t.consumption_kwh > 0
        ? Math.min(100, Math.max(0, (1 - (t.grid_import_kwh || 0) / t.consumption_kwh) * 100))
        : null;
      const autonomyStr = autonomy != null ? fmt(autonomy, 1) + ' %' : '—';
      const card       = document.createElement('div');
      card.className   = 'month-card';
      const peakGen  = t.peak_day_generation_kwh  > 0 ? fmt(t.peak_day_generation_kwh,  1) + ' kWh' : '—';
      const peakCons = t.peak_day_consumption_kwh > 0 ? fmt(t.peak_day_consumption_kwh, 1) + ' kWh' : '—';
      card.innerHTML   = `
        <div class="month-title">${monthName}</div>
        <div class="sys-grid">
          <div class="sys-col">
            <div class="month-row"><span>Total Generation</span><b>${fmt(t.generation_kwh,  1)} kWh</b></div>
            <div class="month-row"><span>Peak Generation</span><b>${peakGen}</b></div>
            <div class="month-row"><span>Total Consumption</span><b>${fmt(t.consumption_kwh, 1)} kWh</b></div>
            <div class="month-row"><span>Peak Consumption</span><b>${peakCons}</b></div>
          </div>
          <div class="sys-col">
            <div class="month-row"><span>From Grid</span><b>${fmt(t.grid_import_kwh, 1)} kWh</b></div>
            <div class="month-row"><span>To Grid</span><b>${fmt(t.grid_export_kwh,  1)} kWh</b></div>
            <div class="month-row"><span>Autonomy</span><b>${autonomyStr}</b></div>
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

/* ── Card overlay ────────────────────────────────────────── */
let genieParams = null;

function openCardOverlay(cardCls) {
  const g     = id => document.getElementById(id)?.textContent?.trim() || '—';
  const val   = v  => `<span class="overlay-val">${v}</span>`;
  const badge = id => {
    const el = document.getElementById(id);
    if (!el) return '<span class="overlay-val">—</span>';
    const clone = el.cloneNode(true);
    clone.removeAttribute('id');
    return clone.outerHTML;
  };
  const cost = id => {
    const el = document.getElementById(id);
    if (!el) return '<span class="overlay-val">—</span>';
    const cls = el.classList.contains('cost-pos') ? ' cost-pos'
              : el.classList.contains('cost-neg') ? ' cost-neg' : '';
    return `<span class="overlay-val${cls}">${el.textContent.trim()}</span>`;
  };

  const configs = {
    'card-tl': {
      icon: '☀️', title: 'Generation',
      rows: [
        ['Self usage',       val(g('gen-autonomy'))],
        ['Total Generation', val(g('today-gen'))],
        ['Peak Generation',  val(g('today-peak-gen'))],
        ['Lifetime total',   val(g('sys-e-total'))],
      ],
    },
    'card-tr': {
      icon: document.getElementById('wx-icon')?.textContent || '⛅', title: 'Weather',
      rows: [
        ['Outdoor Temp',    val(g('wx-temp'))],
        ['Indoor Temp',     val(g('clim-temp'))],
        ['Humidity',        val(g('clim-hum'))],
        ['Peak Temp',       val(g('clim-peak-temp-out'))],
        ['Peak Humidity',   val(g('clim-peak-hum'))],
      ],
    },
    'card-bl': {
      icon: '🔋', title: 'Battery',
      rows: [
        ['Power',            val(g('bat-kw'))],
        ['Battery mode',     badge('sys-bat-mode')],
        ['Battery standby',  badge('sys-bat-standby')],
        ['Backup mode',      badge('sys-backup')],
        ['Autonomy',         val(g('sys-autonomy'))],
        ['Self usage',       val(g('sys-self'))],
      ],
    },
    'card-br': {
      icon: '⚡', title: 'Consumption',
      rows: [
        ['Grid',        val(g('grid-net'))],
        ['From Grid',   val(g('today-imp'))],
        ['To Grid',     val(g('today-exp'))],
        ['Autonomy',    val(g('today-autonomy'))],
        ['Energy Cost', cost('today-cost')],
      ],
    },
  };

  const cfg = configs[cardCls];
  if (!cfg) return;

  document.getElementById('ov-icon').textContent  = cfg.icon;
  document.getElementById('ov-title').textContent = cfg.title;
  document.getElementById('ov-rows').innerHTML = cfg.rows
    .map(([key, valHtml]) =>
      `<div class="overlay-row"><span class="overlay-key">${key}</span>${valHtml}</div>`)
    .join('');

  const overlay  = document.getElementById('card-overlay');
  const scene    = document.querySelector('.scene');
  const card     = document.querySelector('.' + cardCls);
  const sRect    = scene.getBoundingClientRect();
  const cRect    = card.getBoundingClientRect();

  const dx = (cRect.left + cRect.width  / 2) - (sRect.left + sRect.width  / 2);
  const dy = (cRect.top  + cRect.height / 2) - (sRect.top  + sRect.height / 2);
  const sx = cRect.width  / overlay.offsetWidth;
  const sy = cRect.height / overlay.offsetHeight;
  genieParams = { dx, dy, sx, sy };

  // snap to card state, no transition
  overlay.style.transition = 'none';
  overlay.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sx}, ${sy})`;
  overlay.style.opacity    = '0.3';

  scene.classList.add('overlay-open');
  void overlay.offsetWidth; // force reflow before transition starts

  // spring to centre
  overlay.style.transition = 'opacity 0.22s ease, transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)';
  overlay.style.transform  = 'translate(-50%, -50%) scale(1)';
  overlay.style.opacity    = '1';
}

function closeCardOverlay() {
  const overlay = document.getElementById('card-overlay');
  const scene   = document.querySelector('.scene');
  if (!genieParams) { scene.classList.remove('overlay-open'); return; }

  const { dx, dy, sx, sy } = genieParams;

  overlay.style.transition = 'opacity 0.22s ease, transform 0.38s cubic-bezier(0.4, 0, 1, 0.8)';
  overlay.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sx}, ${sy})`;
  overlay.style.opacity    = '0';

  scene.classList.remove('overlay-open'); // cards fade in immediately

  setTimeout(() => {
    overlay.style.transition = '';
    overlay.style.transform  = '';
    overlay.style.opacity    = '';
    genieParams = null;
  }, 400);
}

/* ── Wire events ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn')
    .addEventListener('click', doLogin);
  document.getElementById('email-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('password-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  function spawnRipple(card, e) {
    const rect = card.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    const r    = document.createElement('span');
    r.className   = 'card-ripple';
    r.style.width = r.style.height = size + 'px';
    r.style.left  = (e.clientX - rect.left - size / 2) + 'px';
    r.style.top   = (e.clientY - rect.top  - size / 2) + 'px';
    card.appendChild(r);
    r.addEventListener('animationend', () => r.remove(), { once: true });
  }

  ['card-tl', 'card-tr', 'card-bl', 'card-br'].forEach(cls => {
    const card = document.querySelector('.' + cls);
    card?.addEventListener('click', e => {
      e.stopPropagation();
      spawnRipple(card, e);
      openCardOverlay(cls);
    });
  });
  document.getElementById('card-overlay').addEventListener('click', e => {
    spawnRipple(document.getElementById('card-overlay'), e);
    closeCardOverlay();
  });

  document.querySelector('.scene').addEventListener('click', e => {
    if (document.querySelector('.scene').classList.contains('overlay-open') &&
        !e.target.closest('#card-overlay')) {
      closeCardOverlay();
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCardOverlay(); });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', e => spawnRipple(tab, e));
  });

  document.getElementById('tab-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});
