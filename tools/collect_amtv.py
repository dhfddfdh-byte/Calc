"""AMTV public-page collection entry point. Explicit enablement required.
Run only where automated access and data use are permitted. No stealth, no
cookies, no browser impersonation. Output is local; never auto-committed.
"""
import argparse
import datetime
import json
import os
import pathlib
import tempfile
import time
import urllib.error
import urllib.request
import urllib.robotparser
from provider_export_parser import parse_export

ORIGIN = "https://adoptmetradingvalues.com"
PAGES = {
    "values": "/pet-value-list.php",
    "demand": "/pet-demand-list.php",
    "exotics": "/exotic-pet-list.php",
    "changes": "/rising-and-falling-values.php",
}
AGENT = "CalcMarketCollector"
LIMIT = 10 * 1024 * 1024

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

OPENER = urllib.request.build_opener(NoRedirect())

def fetch(path, max_bytes=LIMIT):
    req = urllib.request.Request(ORIGIN + path, headers={
        "User-Agent": AGENT,
        "Accept": "text/html,text/plain;q=0.9",
    })
    with OPENER.open(req, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError("HTTP " + str(response.status))
        body = response.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise RuntimeError("Oversized response")
        return body.decode(response.headers.get_content_charset() or "utf-8")

def checked_collect(output):
    if os.environ.get("CALC_AMTV_APPROVED") != "yes":
        raise RuntimeError("AMTV collection disabled until permission/scope is established")
    # Fail closed if robots.txt is unavailable or cannot be interpreted.
    robots = fetch("/robots.txt", 512 * 1024)
    if "user-agent:" not in robots.lower() or "<html" in robots.lower():
        raise RuntimeError("Robots policy could not be verified")
    policy = urllib.robotparser.RobotFileParser()
    policy.parse(robots.splitlines())
    for path in PAGES.values():
        if not policy.can_fetch(AGENT, ORIGIN + path):
            raise RuntimeError("Robots policy disallows " + path)
    delay = max(10, policy.crawl_delay(AGENT) or 0)
    rate = policy.request_rate(AGENT)
    if rate and rate.requests > 0:
        delay = max(delay, rate.seconds / rate.requests)
    output = pathlib.Path(output)
    old = json.loads(output.read_text()) if output.exists() else None
    data = {}
    for key, path in PAGES.items():
        time.sleep(delay)
        # Any denial, rate limit or schema change aborts the run.
        rows = parse_export(fetch(path))
        previous = old.get("data", {}).get(key, []) if old else []
        if key in ("values", "demand") and (len(rows) < 100 or (previous and len(rows) < len(previous) * .8)):
            raise RuntimeError("Incomplete catalog: " + key)
        data[key] = rows
    payload = {
        "source": "amtv",
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "upstreamUpdatedAt": None,
        "data": data,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as file:
            temp = pathlib.Path(file.name)
            json.dump(payload, file, ensure_ascii=False, allow_nan=False)
        temp.replace(output)
    finally:
        if temp and temp.exists():
            temp.unlink()
    return {key: len(rows) for key, rows in data.items()}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(checked_collect(args.output))
