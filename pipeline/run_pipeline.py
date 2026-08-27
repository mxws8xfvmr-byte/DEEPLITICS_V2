"""
Orchestriert die gesamte Pipeline:
  1. RSS-Feeds von allen Quellen abrufen           (fetch_feeds)
  2. Pro Artikel Volltext nachladen                (extract_article)
  3. Nahezu-Duplikate entfernen                     (dedupe_articles)
  4. Artikel zu Storys clustern                     (cluster_articles)
  5. Pro Cluster eine Story synthetisieren           (synthesize_story),
     PARALLEL über einen Thread-Pool, s. Version 6 unten
  6. Marktdaten anreichern (yfinance)              (enrich_market_data)
  7. Ergebnis als data/stories.json schreiben        (-> Frontend liest das)
"""

from __future__ import annotations

from enrich_market_data import enrich_all_stories
import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.cluster import cluster_articles
from pipeline.llm_cluster import llm_cluster_articles
from pipeline.config import DEFAULT_CONFIG, FULL_DEPTH_CONFIG, LITE_SCALE_CONFIG, PipelineConfig
from pipeline.extract_article import fetch_and_extract_with_image
from pipeline.enrich_entity_images import enrich_entity_images
from pipeline.fetch_feeds import fetch_all
from pipeline.synthesize_story import build_prompt, synthesize_with_claude

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

PROFILES = {
    "default": DEFAULT_CONFIG,
    "lite": LITE_SCALE_CONFIG,
    "full": FULL_DEPTH_CONFIG,
}


def dedupe_articles(articles: list[dict], title_similarity: float = 0.85) -> list[dict]:
    """Entfernt Artikel mit (fast) identischem Titel."""
    kept: list[dict] = []
    for a in articles:
        is_dupe = any(
            SequenceMatcher(None, a["title"].lower(), k["title"].lower()).ratio()
            > title_similarity
            for k in kept
        )
        if not is_dupe:
            kept.append(a)
    return kept


def _load_existing_stories() -> list[dict]:
    """Lädt bereits gespeicherte Storys aus data/stories.json."""
    path = DATA_DIR / "stories.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[warn] data/stories.json nicht lesbar ({exc}), starte mit leerer Historie.", file=sys.stderr)
        return []
    return data if isinstance(data, list) else []


def _merge_stories(
    new_stories: list[dict],
    existing_stories: list[dict],
    title_similarity: float = 0.82,
    max_total: int | None = None,
) -> list[dict]:
    """Stellt neue Stories VOR alte. Doppelte werden entfernt."""
    def is_dupe(existing: dict, fresh: dict) -> bool:
        return SequenceMatcher(
            None,
            (existing.get("title") or "").lower(),
            (fresh.get("title") or "").lower(),
        ).ratio() > title_similarity

    kept_existing = [
        e for e in existing_stories
        if not any(is_dupe(e, n) for n in new_stories)
    ]
    merged = new_stories + kept_existing
    if max_total is not None and len(merged) > max_total:
        dropped = len(merged) - max_total
        print(
            f"[info] {dropped} älteste Storys über dem Limit (--max-total-stories "
            f"{max_total}) entfernt.",
            file=sys.stderr,
        )
        merged = merged[:max_total]
    return merged


def _synthesize_one(cluster: list[dict], config: PipelineConfig) -> dict:
    """Eine Story synthetisieren."""
    try:
        return synthesize_with_claude(cluster, config=config)
    except RuntimeError as e:
        if "ANTHROPIC_API_KEY" in str(e) or "nicht installiert" in str(e):
            print(f"[info] Kein LLM-API-Zugriff ({e}). Schreibe Prompt stattdessen.", file=sys.stderr)
            return {
                "title": cluster[0]["title"],
                "needs_llm_synthesis": True,
                "prompt": build_prompt(cluster, config=config),
                "sources": sorted({a["source"] for a in cluster}),
                "article_urls": [a.get("link") or a.get("url") for a in cluster],
            }
        raise


def run(
    max_articles_per_source: int | None = None,
    enrich_fulltext: bool = True,
    config: PipelineConfig = DEFAULT_CONFIG,
) -> list[dict]:
    max_articles_per_source = (
        max_articles_per_source
        if max_articles_per_source is not None
        else config.max_articles_per_source
    )
    t_start = time.time()

    print("[1/6] Fetching RSS feeds...", file=sys.stderr)
    raw = fetch_all()

    by_source: dict[str, list[dict]] = {}
    for a in raw:
        by_source.setdefault(a["source"], []).append(a)
    limited = [a for arts in by_source.values() for a in arts[:max_articles_per_source]]

    print(f"[2/6] Deduping ({len(limited)} raw items)...", file=sys.stderr)
    deduped = dedupe_articles(limited)

    if enrich_fulltext:
        print(
            f"[3/6] Extracting full text for {len(deduped)} articles "
            f"(concurrency={config.fetch_concurrency})...",
            file=sys.stderr,
        )
        with ThreadPoolExecutor(max_workers=max(1, config.fetch_concurrency)) as pool:
            results = list(pool.map(lambda a: fetch_and_extract_with_image(a["link"]), deduped))
        for a, (text, og_image) in zip(deduped, results):
            a["text"] = text or a.get("summary", "")
            a["combined_text"] = f"{a['title']} {a['text'][:500]}"
            a["og_image"] = og_image
    else:
        for a in deduped:
            a["text"] = a.get("summary", "")
            a["combined_text"] = f"{a['title']} {a['text']}"

    print("[4/6] Clustering into storylines (LLM-basiert, Fallback TF-IDF)...", file=sys.stderr)
    clusters = llm_cluster_articles(deduped, config=config)
    if clusters is None:
        clusters = cluster_articles(deduped, config=config)
    
    multi_source_clusters = [
        c for c in clusters if len({a["source"] for a in c}) >= config.min_sources_for_story
    ]

    if config.max_stories_per_run is not None:
        skipped = max(0, len(multi_source_clusters) - config.max_stories_per_run)
        if skipped:
            print(
                f"[info] {len(multi_source_clusters)} Multi-Source-Cluster gefunden, "
                f"verarbeite die {config.max_stories_per_run} größten "
                f"(--max-stories), {skipped} übersprungen.",
                file=sys.stderr,
            )
        multi_source_clusters = multi_source_clusters[: config.max_stories_per_run]

    n = len(multi_source_clusters)
    print(
        f"[5/6] Synthesizing {n} stories "
        f"(depth={config.research_depth}, concurrency={config.synthesis_concurrency})...",
        file=sys.stderr,
    )

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "articles_enriched.json").write_text(
        json.dumps(deduped, indent=2, ensure_ascii=False)
    )

    existing_stories = _load_existing_stories()
    print(
        f"[info] {len(existing_stories)} bestehende Storys geladen -- "
        f"werden mit den neuen zusammengeführt (nicht überschrieben).",
        file=sys.stderr,
    )

    stories: list[dict | None] = [None] * n
    errors = 0

    with ThreadPoolExecutor(max_workers=max(1, config.synthesis_concurrency)) as pool:
        future_to_idx = {
            pool.submit(_synthesize_one, cluster, config): i
            for i, cluster in enumerate(multi_source_clusters)
        }
        done = 0
        for future in as_completed(future_to_idx):
            i = future_to_idx[future]
            done += 1
            try:
                story = future.result()
                try:
                    enrich_entity_images(story)
                except Exception as img_exc:
                    print(f"    [warn] Bildanreicherung fehlgeschlagen:
