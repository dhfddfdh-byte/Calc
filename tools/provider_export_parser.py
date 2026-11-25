"""Parse user-provided public HTML exports. No networking or script execution.
Requires beautifulsoup4. Do not publish imported third-party datasets without permission.
"""
import json
import math
import re
from bs4 import BeautifulSoup

def number(value):
    try:
        v = float(value)
        return v if math.isfinite(v) and v >= 0 else None
    except (TypeError, ValueError):
        return None

def embedded_arrays(doc, key):
    # Decode Next.js JSON-string payloads without evaluating JavaScript.
    marker = re.compile(r'"' + re.escape(key) + r'"\s*:\s*(?=\[)')
    for script in doc.find_all("script"):
        raw = script.string or ""
        m = re.fullmatch(r'self\.__next_f\.push\(\[1,(".*")\]\);?', raw.strip(), re.S)
        if m:
            try:
                raw = json.loads(m.group(1))
            except ValueError:
                continue
        for hit in marker.finditer(raw):
            try:
                items, _ = json.JSONDecoder().raw_decode(raw[hit.end():])
                if isinstance(items, list) and items:
                    yield items
            except ValueError:
                continue

def unique(rows, key):
    seen = set()
    for row in rows:
        k = row[key]
        if not k or k in seen:
            raise ValueError("Missing or duplicate identity: " + str(k))
        seen.add(k)
    if not rows:
        raise ValueError("No records, possibly changed page layout")
    return rows

def elve_trends(doc):
    for items in embedded_arrays(doc, "initialTrends"):
        if not all(isinstance(x, dict) and all(k in x for k in ("variantId", "petId", "name", "label", "currentValue", "baselineValue", "percent", "itemType")) for x in items):
            continue
        rows = []
        for x in items:
            if x["itemType"] not in ("pets", "eggs") or x.get("hidden"):
                continue
            rows.append({"source": "elve", "variantId": str(x["variantId"]), "petId": str(x["petId"]), "name": x["name"], "variantLabel": x["label"], "variantCode": x.get("variantCode"), "mutation": x.get("mutation"), "oldValue": number(x["baselineValue"]), "newValue": number(x["currentValue"]), "reportedPct": x["percent"], "unit": None, "period": "7 days", "isNew": x.get("isNew")})
        return unique(rows, "variantId")
    raise ValueError("Elve trend payload absent")

def amvgg_catalog(doc):
    # Only for saved exports whose import/reuse is authorized. Native units
    # and the potion meaning of default fields must be verified separately.
    for items in embedded_arrays(doc, "pets"):
        if not all(isinstance(x, dict) and all(k in x for k in ("id", "name", "regularValue", "regularDemand")) for x in items):
            continue
        rows = []
        for x in items:
            rows.append({"source": "amvgg", "petId": str(x["id"]), "name": x["name"], "category": x.get("category"), "unit": None, "values": {k: number(v) for k, v in x.items() if k.endswith("Value")}, "demand": {k: v for k, v in x.items() if k.endswith("Demand") and v in ("Low", "Medium", "High")}})
        return unique(rows, "petId")
    raise ValueError("AMVGG catalog payload absent")

def amtv_list(doc, kind):
    if kind not in ("values", "demand"):
        raise ValueError("Unknown list type")
    rows = []
    groups = doc.select("li.liclass")
    rank_max = 0
    for group in groups:
        badge = group.select_one(".ctr")
        cards = group.select(".column .list-group-item")
        if not badge or not cards:
            raise ValueError("Unexpected list structure")
        label = badge.get_text(strip=True)
        if kind == "demand":
            if not re.fullmatch(r"[1-9]\d*", label):
                raise ValueError("Invalid rank")
            metric = int(label)
            rank_max = max(rank_max, metric)
        else:
            m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*RP", label)
            if not m:
                raise ValueError("Invalid RP value")
            metric = number(m.group(1))
        for card in cards:
            image = card.select_one("img[alt],image[alt]")
            key = card.select_one('input[name="pets[]"]')
            if image is None or key is None:
                raise ValueError("Missing card identity")
            m = re.fullmatch(r"(\d+)([NM]?)", key.get("value", ""))
            if not m:
                raise ValueError("Unknown item variant")
            name, sep, description = image["alt"].partition(" - ")
            if not sep or not name:
                raise ValueError("Missing name")
            growth = {"": "regular", "N": "neon", "M": "mega"}[m.group(2)]
            row = {"source": "amtv", "itemId": m.group(0), "petId": m.group(1), "name": name, "growth": growth, "description": description, "potionState": None}
            row.update({"rank": metric} if kind == "demand" else {"value": metric, "unit": "RP"})
            rows.append(row)
    if kind == "demand":
        text = doc.get_text(" ", strip=True).lower()
        period = "7 days" if "from the past week" in text else None
        for row in rows:
            row["rankMax"] = rank_max
            row["period"] = period
            row["rankScore"] = 10 * (rank_max - row["rank"] + 1) / rank_max
    return unique(rows, "itemId")

def amtv_exotics(doc):
    rows = []
    for card in doc.select(".pet-flex-list .pet-list-row-card"):
        link = card.select_one(".pet-title-link")
        rarity = card.select_one(".rarity-badge")
        origin = card.select_one(".origin-badge")
        if not link or not rarity or not origin:
            raise ValueError("Incomplete exotic card")
        m = re.search(r"[?&]id=(\d+)", link.get("href", ""))
        if not m:
            raise ValueError("Missing exotic item ID")
        rows.append({"source": "amtv", "petId": m.group(1), "name": link.get_text(strip=True), "rarity": rarity.get_text(strip=True), "origin": origin.get_text(" ", strip=True), "exotic": True})
    return unique(rows, "petId")

def amtv_changes(doc):
    table = doc.select_one("#myTable")
    select = doc.select_one("select option[selected]")
    if not table or not select:
        raise ValueError("Missing change table or period")
    header = [x.get_text(strip=True) for x in table.select("thead th")]
    if header != ["Item", "Old Value", "New Value", "Change"]:
        raise ValueError("Unexpected change table header")
    context = re.search(r"version=([RNM])&timeframe=([a-z0-9_]+)", select.get("value", ""))
    if not context:
        raise ValueError("Unknown change context")
    rows = []
    for tr in table.select("tbody tr"):
        cells = tr.select("td")
        if len(cells) != 4:
            raise ValueError("Unexpected change row")
        img = cells[0].select_one("img[alt]")
        if not img:
            raise ValueError("Missing change identity")
        m = re.fullmatch(r"images[/\\](\d+)\.png", img.get("src", ""))
        if not m:
            raise ValueError("Missing change ID")
        values = [re.fullmatch(r"(\d+(?:\.\d+)?)\s*RP", cell.get_text(strip=True)) for cell in cells[1:3]]
        if not all(values):
            raise ValueError("Invalid change values")
        direction = -1 if cells[3].select_one(".fa-arrow-down") else 1 if cells[3].select_one(".fa-arrow-up") else None
        pct = re.search(r"(\d+(?:\.\d+)?)\s*%", cells[3].get_text(" ", strip=True))
        rows.append({"source": "amtv", "petId": m.group(1), "name": img["alt"], "growth": {"R":"regular","N":"neon","M":"mega"}[context.group(1)], "period": context.group(2), "oldValue": number(values[0].group(1)), "newValue": number(values[1].group(1)), "reportedPct": direction * float(pct.group(1)) if pct and direction is not None else None, "unit": "RP", "potionState": None})
    return unique(rows, "petId")

def parse_export(html):
    doc = BeautifulSoup(html, "html.parser")
    canonical = doc.select_one('link[rel="canonical"]')
    url = canonical.get("href", "") if canonical else ""
    handlers = {
        "https://elvebredd.com/value-updates": elve_trends,
        "https://amvgg.com/trades": amvgg_catalog,
        "https://adoptmetradingvalues.com/pet-demand-list.php": lambda d: amtv_list(d, "demand"),
    }
    if url not in handlers:
        raise ValueError("Unsupported export or client-rendered page: " + url)
    return handlers[url](doc)

def parse_pasted_documents(text):
    # The supplied text can contain several pasted HTML documents in sequence.
    for part in re.split(r"(?i)(?=<html(?:\s|>))", text):
        if part.lower().startswith("<html"):
            yield part.split("</html>", 1)[0] + "</html>"
