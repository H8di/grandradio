#!/usr/bin/env python3
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "feeds-source.json"
OUT = ROOT / "data" / "feeds.json"

def text(node, tag):
    el = node.find(tag)
    return (el.text or "").strip() if el is not None and el.text else ""

def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GrandRadio-RSS-Updater/1.0",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()

def parse_feed(cfg):
    raw = fetch(cfg["url"])
    root = ET.fromstring(raw)

    items = []
    for item in root.findall(".//item"):
        enclosure = item.find("enclosure")
        audio = enclosure.attrib.get("url", "") if enclosure is not None else ""

        items.append({
            "title": text(item, "title"),
            "description": text(item, "description"),
            "pubDate": text(item, "pubDate"),
            "link": text(item, "link"),
            "audio": audio,
            "feedId": cfg["id"],
            "feedLabel": cfg["label"],
        })

    return {
        "id": cfg["id"],
        "label": cfg["label"],
        "url": cfg["url"],
        "items": items,
    }

def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    feeds = [parse_feed(feed) for feed in config["feeds"]]

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "feeds": feeds,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total = sum(len(feed["items"]) for feed in feeds)
    print(f"Generated {OUT} with {total} total items")
    for feed in feeds:
        print(feed["label"], len(feed["items"]))

if __name__ == "__main__":
    main()
