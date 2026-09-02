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

def resolve_media_url(url):
    """Resolve Shenoto play endpoints to the final media/CDN URL.

    A 1-byte Range request avoids downloading the full audio file.
    If resolution fails, keep the original URL as a safe fallback.
    """
    if not url:
        return ""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 GrandRadio/1.0",
                "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
                "Range": "bytes=0-0",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.geturl() or url
    except Exception as exc:
        print(f"Could not resolve media URL: {url} ({exc})")
        return url

def parse_feed(cfg):
    raw = fetch(cfg["url"])
    root = ET.fromstring(raw)

    items = []
    for item in root.findall(".//item"):
        enclosure = item.find("enclosure")
        audio = enclosure.attrib.get("url", "") if enclosure is not None else ""
        audio = resolve_media_url(audio)

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
        audio = str(row.get("file_url") or row.get("audio") or "").strip()

        # Only keep REAL audiobook media returned by Shenoto.
        # The infinite/play API may inject ads or recommendation rows.
        is_real_audio = (
            "/service/api/play/audio_book/" in audio
            or "cdn-arch.shenoto.com/shenoto-media/" in audio
        )
        if not is_real_audio:
            continue

        # Convert the Shenoto playback endpoint to the final direct CDN/media URL.
        # This is more reliable in iPhone/iPad WebKit than the redirecting endpoint.
        audio = resolve_media_url(audio)

        title = row.get("title") or row.get("media_title") or row.get("sub_title") or "بدون عنوان"
        description = row.get("content") or row.get("description") or row.get("sub_title") or ""
        if description == "null":
            description = ""
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
