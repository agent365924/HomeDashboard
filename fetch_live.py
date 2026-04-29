import urllib.request
import json
import time
import firebase_admin
from firebase_admin import credentials, db

INVERTER_IP = "192.168.178.34"
URL = f"http://{INVERTER_IP}/solar_api/v1/GetPowerFlowRealtimeData.fcgi"

cred = credentials.Certificate("/home/frank/solar-dashboard/serviceAccount.json")
firebase_admin.initialize_app(cred, {
    "databaseURL": "https://YOUR-PROJECT-ID-default-rtdb.europe-west1.firebasedatabase.app"
})

def fetch():
    with urllib.request.urlopen(URL, timeout=10) as response:
        data = json.loads(response.read())

    site = data["Body"]["Data"]["Site"]
    inverter = data["Body"]["Data"]["Inverters"]["1"]

    p_pv   = site.get("P_PV") or 0
    p_load = site.get("P_Load") or 0
    p_grid = site.get("P_Grid") or 0
    p_akku = site.get("P_Akku") or 0
    soc    = inverter.get("SOC") or 0

    live = {
        "timestamp":      int(time.time()),
        "generation_kw":  round(p_pv / 1000, 3),
        "consumption_kw": round(abs(p_load) / 1000, 3),
        "grid_import_kw": round(max(p_grid, 0) / 1000, 3),
        "grid_export_kw": round(max(-p_grid, 0) / 1000, 3),
        "battery_kw":     round(p_akku / 1000, 3),
        "battery_soc":    round(soc, 1),
        "temperature_c":  None,
        "battery_temp_c": None
    }

    db.reference("/live").set(live)
    print(f"Written: {live}")

while True:
    try:
        fetch()
    except Exception as e:
        print(f"Error: {e}")
    print("---")
    time.sleep(10)
