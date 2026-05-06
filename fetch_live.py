import urllib.request
import json
import time
import subprocess
import firebase_admin
from firebase_admin import credentials, db
from xsense import XSense

# ── Config ────────────────────────────────────────────────────
INVERTER_IP   = "192.168.178.34"
INVERTER_URL  = f"http://{INVERTER_IP}/solar_api/v1/GetPowerFlowRealtimeData.fcgi"
PRICE_PER_KWH     = 0.31  # € — move to /config later
HISTORY_INTERVAL  = 300   # seconds between 24 h snapshots
XSENSE_INTERVAL   = 1800  # 30 min normal poll
XSENSE_BACKOFF    = 600   # 10 min retry after error
NETWORK_INTERVAL  = 3600  # 60 min network check

WEATHER_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=48.1833&longitude=9.9167"
    "&current=temperature_2m,weathercode"
    "&timezone=Europe%2FBerlin"
)

XSENSE_EMAIL    = "agent365924@gmail.com"
XSENSE_PASSWORD = "Agent365924!"

# ── Firebase ──────────────────────────────────────────────────
cred = credentials.Certificate("/home/frank/solar-dashboard/serviceAccount.json")
firebase_admin.initialize_app(cred, {
    "databaseURL": "https://homedashboard-5b2e0-default-rtdb.europe-west1.firebasedatabase.app"
})

# ── Xsense sensor map ─────────────────────────────────────────
SENSOR_MAP = {
    "00000001": ("water_leak",             "Water Leak"),
    "00000002": ("smoke_hwr",              "HWR"),
    "00000003": ("smoke_emi_schlafzimmer", "Emi Schlafzimmer"),
    "00000004": ("smoke_emi_spielzimmer",  "Emi Spielzimmer"),
    "00000005": ("smoke_schlafzimmer",     "Schlafzimmer"),
    "00000006": ("smoke_eingang",          "Eingang"),
    "00000007": ("smoke_buero_eg",         "Büro EG"),
    "00000009": ("thermo_hygrometer",      "Thermo-hygrometer"),
}

# ── State ─────────────────────────────────────────────────────
weather_cache  = {"temperature_c": None, "weathercode": None}
weather_last   = 0
xsense_last     = 0
xsense_api      = None
xsense_stations = []  # cached after first load_all; avoid re-fetching tree each poll
indoor_cache   = {"temperature": None, "humidity": None}
network_last   = 0
network_cache  = {"download_mbps": None, "ping_ms": None}
history_last   = 0

daily = {
    "generation_kwh":    0.0,
    "consumption_kwh":   0.0,
    "grid_import_kwh":   0.0,
    "grid_export_kwh":   0.0,
    "peak_generation_kw":  0.0,
    "peak_consumption_kw": 0.0,
    "peak_temperature_out": None,
    "peak_temperature_in":  None,
    "peak_humidity_in":     None,
    "peak_download_mbps":   None,
}
current_day = None
last_ts     = None

# ── Functions ─────────────────────────────────────────────────

def fetch_inverter():
    with urllib.request.urlopen(INVERTER_URL, timeout=10) as r:
        data = json.loads(r.read())
    site     = data["Body"]["Data"]["Site"]
    inverter = data["Body"]["Data"]["Inverters"]["1"]
    p_pv   = site.get("P_PV")   or 0
    p_load = site.get("P_Load") or 0
    p_grid = site.get("P_Grid") or 0
    p_akku = site.get("P_Akku") or 0
    soc    = inverter.get("SOC") or 0
    return {
        "timestamp":            int(time.time()),
        "generation_kw":        round(p_pv / 1000, 3),
        "consumption_kw":       round(abs(p_load) / 1000, 3),
        "grid_import_kw":       round(max(p_grid, 0) / 1000, 3),
        "grid_export_kw":       round(max(-p_grid, 0) / 1000, 3),
        "battery_kw":           round(p_akku / 1000, 3),
        "battery_soc":          round(soc, 1),
        "battery_mode":         inverter.get("Battery_Mode"),
        "battery_standby":      site.get("BatteryStandby"),
        "e_day_kwh":            inverter.get("E_Day"),
        "e_year_kwh":           inverter.get("E_Year"),
        "e_total_kwh":          inverter.get("E_Total"),
        "rel_autonomy":         site.get("rel_Autonomy"),
        "rel_self_consumption": site.get("rel_SelfConsumption"),
        "backup_mode":          site.get("BackupMode"),
        "meter_mode":           site.get("Mode"),
        "battery_temp_c":       None,
    }

def fetch_weather():
    try:
        with urllib.request.urlopen(WEATHER_URL, timeout=10) as r:
            data = json.loads(r.read())
        current = data["current"]
        return {
            "temperature_c": round(current["temperature_2m"], 1),
            "weathercode":   current["weathercode"],
        }
    except Exception as e:
        print(f"Weather error: {e}")
        return {"temperature_c": None, "weathercode": None}

def fetch_xsense():
    global xsense_api, xsense_stations
    try:
        if xsense_api is None:
            api = XSense()
            api.init()
            api.login(XSENSE_EMAIL, XSENSE_PASSWORD)
            api.load_all()
            xsense_stations = [
                s for _, h in api.houses.items()
                  for _, s in h.stations.items()
            ]
            xsense_api = api
            print(f"Xsense: session ready, {len(xsense_stations)} station(s)")

        sensors = {}
        for station in xsense_stations:
            xsense_api.get_state(station)
            for _, device in station.devices.items():
                sn = device.sn
                if sn not in SENSOR_MAP:
                    continue
                key, name = SENSOR_MAP[sn]
                v      = device.data
                online = v.get("online") == "1"
                if key == "thermo_hygrometer":
                    sensors[key] = {
                        "name":        name,
                        "online":      online,
                        "temperature": v.get("temperature"),
                        "humidity":    v.get("humidity"),
                        "battery":     v.get("batInfo"),
                    }
                else:
                    sensors[key] = {
                        "name":    name,
                        "online":  online,
                        "alarm":   v.get("alarmStatus", False),
                        "battery": v.get("batInfo"),
                    }

        db.reference("/sensors").set(sensors)
        if "thermo_hygrometer" in sensors:
            th = sensors["thermo_hygrometer"]
            indoor_cache["temperature"] = th.get("temperature")
            indoor_cache["humidity"]    = th.get("humidity")
        print(f"Xsense written: {list(sensors.keys())}")
        return True

    except Exception as e:
        print(f"Xsense error: {e}")
        xsense_api      = None
        xsense_stations = []
        return False

def fetch_network():
    try:
        # 3-packet ping — quiet, no flood, hard timeout
        out = subprocess.run(
            ["ping", "-c", "3", "-q", "8.8.8.8"],
            capture_output=True, text=True, timeout=15
        )
        ping_ms = None
        for line in out.stdout.splitlines():
            if "rtt min/avg" in line:
                ping_ms = round(float(line.split("=")[1].strip().split("/")[1]), 1)
                break

        # single-connection 5 MB download — timer starts after connection+TLS so only data transfer is measured
        req = urllib.request.Request(
            "https://speed.cloudflare.com/__down?bytes=5000000",
            headers={"User-Agent": "solar-dashboard/1.0"},
        )
        received = 0
        with urllib.request.urlopen(req, timeout=30) as r:
            t0 = time.monotonic()  # start after handshake, response headers received
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                received += len(chunk)
        elapsed = max(time.monotonic() - t0, 0.001)
        download_mbps = round(received * 8 / elapsed / 1_000_000, 1)

        result = {
            "timestamp":     int(time.time()),
            "download_mbps": download_mbps,
            "ping_ms":       ping_ms,
        }
        db.reference("/network").set(result)
        network_cache["download_mbps"] = download_mbps
        network_cache["ping_ms"]       = ping_ms
        print(f"Network: {result}")
    except Exception as e:
        print(f"Network error: {e}")

def load_daily_from_firebase(date_str):
    """Read back today's running totals from Firebase on restart."""
    try:
        snap = db.reference(f"/totals/daily/{date_str}").get()
        if snap:
            return {
                "generation_kwh":    snap.get("generation_kwh",    0.0),
                "consumption_kwh":   snap.get("consumption_kwh",   0.0),
                "grid_import_kwh":   snap.get("grid_import_kwh",   0.0),
                "grid_export_kwh":   snap.get("grid_export_kwh",   0.0),
                "peak_generation_kw":  snap.get("peak_generation_kw",  0.0),
                "peak_consumption_kw": snap.get("peak_consumption_kw", 0.0),
                "peak_temperature_out": snap.get("peak_temperature_out"),
                "peak_temperature_in":  snap.get("peak_temperature_in"),
                "peak_humidity_in":     snap.get("peak_humidity_in"),
                "peak_download_mbps":   snap.get("peak_download_mbps"),
            }
    except Exception as e:
        print(f"Daily load error: {e}")
    return {
        "generation_kwh":    0.0,
        "consumption_kwh":   0.0,
        "grid_import_kwh":   0.0,
        "grid_export_kwh":   0.0,
        "peak_generation_kw":  0.0,
        "peak_consumption_kw": 0.0,
        "peak_temperature_out": None,
        "peak_temperature_in":  None,
        "peak_humidity_in":     None,
        "peak_download_mbps":   None,
    }

def write_daily(date_str):
    """Write running daily totals to Firebase."""
    cost   = round(daily["grid_import_kwh"] * PRICE_PER_KWH, 2)
    record = {
        "generation_kwh":    round(daily["generation_kwh"],    3),
        "consumption_kwh":   round(daily["consumption_kwh"],   3),
        "grid_import_kwh":   round(daily["grid_import_kwh"],   3),
        "grid_export_kwh":   round(daily["grid_export_kwh"],   3),
        "cost_eur":          cost,
        "peak_generation_kw":  round(daily["peak_generation_kw"],  3),
        "peak_consumption_kw": round(daily["peak_consumption_kw"], 3),
        "peak_temperature_out": round(daily["peak_temperature_out"], 1) if daily["peak_temperature_out"] is not None else None,
        "peak_temperature_in":  round(daily["peak_temperature_in"],  1) if daily["peak_temperature_in"]  is not None else None,
        "peak_humidity_in":     round(daily["peak_humidity_in"],     1) if daily["peak_humidity_in"]     is not None else None,
        "peak_download_mbps":   round(daily["peak_download_mbps"],   1) if daily["peak_download_mbps"]   is not None else None,
    }
    db.reference(f"/totals/daily/{date_str}").set(record)
    print(f"Daily written ({date_str}): {record}")

def rollup_and_cleanup(today):
    """Run on day change: monthly rollup on 1st, cleanup entries older than 31 days."""
    try:
        all_daily = db.reference("/totals/daily").get() or {}
        today_dt  = time.strptime(today, "%Y-%m-%d")

        if today_dt.tm_mday == 1:
            if today_dt.tm_mon == 1:
                prev_year, prev_mon = today_dt.tm_year - 1, 12
            else:
                prev_year, prev_mon = today_dt.tm_year, today_dt.tm_mon - 1
            prev_prefix = f"{prev_year:04d}-{prev_mon:02d}"
            prev_days   = {k: v for k, v in all_daily.items() if k.startswith(prev_prefix)}

            if prev_days:
                totals = {"generation_kwh": 0.0, "consumption_kwh": 0.0,
                          "grid_import_kwh": 0.0, "grid_export_kwh": 0.0, "cost_eur": 0.0}
                for d in prev_days.values():
                    for k in totals:
                        totals[k] += d.get(k, 0.0)
                for k in totals:
                    totals[k] = round(totals[k], 2 if k == "cost_eur" else 3)
                db.reference(f"/totals/monthly/{prev_prefix}").set(totals)
                print(f"Monthly rollup: {prev_prefix} -> {totals}")
                for date_key in prev_days:
                    db.reference(f"/totals/daily/{date_key}").delete()
                print(f"Deleted {len(prev_days)} daily entries for {prev_prefix}")

        yesterday = time.strftime("%Y-%m-%d", time.localtime(time.mktime(today_dt) - 86400))
        db.reference(f"/history/{yesterday}").delete()
        print(f"Deleted history: {yesterday}")

        cutoff = time.mktime(today_dt) - 31 * 86400
        for date_key in list(all_daily.keys()):
            try:
                if time.mktime(time.strptime(date_key, "%Y-%m-%d")) < cutoff:
                    db.reference(f"/totals/daily/{date_key}").delete()
                    print(f"Cleaned up: {date_key}")
            except Exception:
                pass

    except Exception as e:
        print(f"Rollup/cleanup error: {e}")

# ── Main loop ─────────────────────────────────────────────────
while True:
    try:
        now   = time.time()
        today = time.strftime("%Y-%m-%d")

        # day change / first run
        if current_day != today:
            if current_day is not None:
                rollup_and_cleanup(today)
            current_day = today
            daily       = load_daily_from_firebase(today)
            last_ts     = now
            xsense_api      = None  # force fresh session each day
            xsense_stations = []
            print(f"Day set to {today}, resumed: {daily}")

        # weather every 10 min
        if now - weather_last > 600:
            weather_cache = fetch_weather()
            weather_last  = now
            print(f"Weather: {weather_cache}")

        # network check every 60 min
        if now - network_last > NETWORK_INTERVAL:
            fetch_network()
            network_last = now

        # xsense every 30 min; back off 10 min on error
        # DISABLED — suspected cause of hang at 08:00; re-enable once confirmed clear
        # if now - xsense_last > XSENSE_INTERVAL:
        #     ok = fetch_xsense()
        #     xsense_last = now if ok else now - XSENSE_INTERVAL + XSENSE_BACKOFF

        # inverter every cycle
        live = fetch_inverter()
        live["temperature_c"] = weather_cache["temperature_c"]
        live["weathercode"]   = weather_cache["weathercode"]
        db.reference("/live").set(live)
        print(f"Written: {live}")

        # accumulate energy — clamp dt to 20 s max to absorb blocking calls
        dt = min((now - last_ts) / 3600, 20 / 3600)
        daily["generation_kwh"]  += live["generation_kw"]  * dt
        daily["consumption_kwh"] += live["consumption_kw"] * dt
        daily["grid_import_kwh"] += live["grid_import_kw"] * dt
        daily["grid_export_kwh"] += live["grid_export_kw"] * dt
        daily["peak_generation_kw"]  = max(daily["peak_generation_kw"],  live["generation_kw"])
        daily["peak_consumption_kw"] = max(daily["peak_consumption_kw"], live["consumption_kw"])
        if live["temperature_c"] is not None:
            prev = daily["peak_temperature_out"]
            daily["peak_temperature_out"] = live["temperature_c"] if prev is None else max(prev, live["temperature_c"])
        if indoor_cache["temperature"] is not None:
            prev = daily["peak_temperature_in"]
            daily["peak_temperature_in"] = indoor_cache["temperature"] if prev is None else max(prev, indoor_cache["temperature"])
        if indoor_cache["humidity"] is not None:
            prev = daily["peak_humidity_in"]
            daily["peak_humidity_in"] = indoor_cache["humidity"] if prev is None else max(prev, indoor_cache["humidity"])
        if network_cache["download_mbps"] is not None:
            prev = daily["peak_download_mbps"]
            daily["peak_download_mbps"] = network_cache["download_mbps"] if prev is None else max(prev, network_cache["download_mbps"])
        last_ts = now

        # write daily totals
        write_daily(today)

        # history snapshot every 5 min
        if now - history_last >= HISTORY_INTERVAL:
            time_str = time.strftime("%H:%M")
            db.reference(f"/history/{today}/{time_str}").set({
                "generation_kw":  live["generation_kw"],
                "consumption_kw": live["consumption_kw"],
                "battery_soc":    live["battery_soc"],
                "temperature_out": live["temperature_c"],
                "temperature_in":  indoor_cache["temperature"],
                "humidity_in":     indoor_cache["humidity"],
                "download_mbps":   network_cache["download_mbps"],
                "ping_ms":         network_cache["ping_ms"],
            })
            history_last = now
            print(f"History: {today}/{time_str}")

    except Exception as e:
        print(f"Error: {e}")

    print("---")
    time.sleep(10)
