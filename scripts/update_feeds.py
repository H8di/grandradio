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

def parse_audio_book(cfg):
    raw = fetch(cfg["url"])
    payload = json.loads(raw.decode("utf-8"))
    rows = payload.get("data", [])
    if isinstance(rows, dict):
        rows = rows.get("data") or rows.get("items") or [rows]

    items = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        audio = row.get("file_url") or row.get("audio") or ""
        title = row.get("title") or row.get("media_title") or row.get("sub_title") or "بدون عنوان"
        description = row.get("content") or row.get("description") or row.get("sub_title") or ""
        pub_date = row.get("created_at") or row.get("jalalian_created_at") or ""
        link = row.get("album_link") or row.get("link") or "https://shenoto.com/album/audio_book/77679"

        items.append({
            "title": title,
            "description": description,
            "pubDate": pub_date,
            "link": link,
            "audio": audio,
            "duration": row.get("duration_detail") or row.get("duration") or "",
            "feedId": cfg["id"],
            "feedLabel": cfg["label"],
        })

    return {
        "id": cfg["id"],
        "label": cfg["label"],
        "url": cfg["url"],
        "items": items,
    }

def parse_source(cfg):
    if cfg.get("type") == "shenoto_audio_book":
        return parse_audio_book(cfg)
    return parse_feed(cfg)

def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    feeds = [parse_source(feed) for feed in config["feeds"]]

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
