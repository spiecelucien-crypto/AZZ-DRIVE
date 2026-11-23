#!/usr/bin/env python3
"""Met à jour windows/data/radars.json depuis OpenStreetMap (Overpass).

Format : {"BE": [[lon, lat, vitesse_max, direction], ...], ...}
vitesse_max = 0 si inconnue, direction = -1 si inconnue (degrés sinon).
Un pays qui échoue garde ses données précédentes.
"""
import json, sys, time, urllib.request, urllib.parse, pathlib

COUNTRIES = sys.argv[1:] or ["BE", "NL", "LU", "FR", "CH", "DE"]
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
OUT = pathlib.Path(__file__).resolve().parent.parent / "windows" / "data" / "radars.json"
DIRS = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}


def query(iso):
    return (f'[out:json][timeout:300];area["ISO3166-1"="{iso}"][admin_level=2]->.a;'
            '(node["highway"="speed_camera"](area.a);node["enforcement"="maxspeed"](area.a););out;')


def run(q):
    for attempt in range(3):
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(),
                                             headers={"User-Agent": "AZZDrive/1.0 (github.com/spiecelucien-crypto/AZZ-DRIVE)"})
                with urllib.request.urlopen(req, timeout=320) as r:
                    return json.load(r)
            except Exception as e:  # noqa: BLE001
                print(f"  {ep}: {e}", file=sys.stderr)
        time.sleep(30 * (attempt + 1))
    return None


def num(v, default):
    try:
        return int(float(str(v).split()[0]))
    except Exception:  # noqa: BLE001
        return default


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    for iso in COUNTRIES:
        print(iso, file=sys.stderr)
        d = run(query(iso))
        if not d:
            print(f"  {iso}: échec, données conservées", file=sys.stderr)
            continue
        pts, seen = [], set()
        for e in d.get("elements", []):
            if "lon" not in e:
                continue
            t = e.get("tags", {})
            dr = t.get("direction", "")
            dr = DIRS.get(dr.upper(), -1) if dr and not dr.replace(".", "").isdigit() else num(dr, -1)
            p = [round(e["lon"], 5), round(e["lat"], 5), num(t.get("maxspeed", ""), 0), dr]
            k = (p[0], p[1])
            if k not in seen:
                seen.add(k)
                pts.append(p)
        data[iso] = pts
        print(f"  {iso}: {len(pts)} radars", file=sys.stderr)
        time.sleep(10)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")))


if __name__ == "__main__":
    main()
