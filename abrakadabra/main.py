"""
Abrakadabra - Hype-Barometer
==============================
Hauptskript: Orchestriert Reddit-Streaming, Ticker-Extraktion,
Sentiment-Analyse und Telegram-Alerts.

Starte mit: python main.py
"""

import sys
import time
import signal
import logging
import threading
import os
import json
from pathlib import Path
from datetime import datetime

# Module importieren
import config
from reddit_ingestion import create_reddit_client, stream_submissions, stream_comments
from rss_ingestion import stream_rss_submissions
from ticker_extraction import process_text
from aggregator import HypeAggregator, process_and_export

# FastAPI & Uvicorn fuer Online-Hosting / Local Hosting
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

# ─── Logging konfigurieren ──────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-28s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("abrakadabra.log", encoding="utf-8"),
    ]
)
logger = logging.getLogger("abrakadabra.main")

# Globaler Stop-Flag fuer sauberes Herunterfahren
_shutdown_event = threading.Event()


# ─── FastAPI Webserver Setup ──────────────────────────────────
app = FastAPI(title="Abrakadabra API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/hype")
def get_hype_data():
    try:
        p = Path(config.OUTPUT_JSON_PATH)
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"error": "No 15m data generated yet"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/hype-max")
def get_hype_max_data():
    try:
        p = Path(config.OUTPUT_JSON_PATH).parent / "hype_data_max.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"error": "No 24h data generated yet"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
def read_root():
    # Render Health-Check-Sicherung: Gibt 200 OK zurueck, damit der Dienst online bleibt
    return {"status": "ok", "message": "Abrakadabra API is running. Go to /hype.html for the dashboard."}

# Statische Dateien mounten, damit das Dashboard (hype.html) direkt vom API-Port geladen werden kann.
# Muss als letztes gemountet werden, da es alle Pfade faengt.
app.mount("/", StaticFiles(directory=".", html=True), name="static")


def _signal_handler(sig, frame):
    """Handler fuer Ctrl+C / SIGTERM → sauberes Shutdown."""
    logger.info("Shutdown-Signal empfangen. Fahre herunter...")
    _shutdown_event.set()


signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)


def _process_item(item: dict, aggregator_15m: HypeAggregator, aggregator_24h: HypeAggregator):
    """
    Verarbeitet ein einzelnes Reddit-Item (Submission oder Comment).
    Extrahiert Ticker, berechnet Sentiment und fuegt zum Aggregator hinzu.
    """
    text = item.get("text", "")
    if not text or len(text) < 10:
        return

    # Ticker & Sentiment extrahieren
    results = process_text(text)

    for ticker, sentiment in results:
        aggregator_15m.add_mention(
            ticker=ticker,
            sentiment=sentiment,
            subreddit=item.get("subreddit", "unknown"),
            source_type=item.get("type", "unknown"),
        )
        aggregator_24h.add_mention(
            ticker=ticker,
            sentiment=sentiment,
            subreddit=item.get("subreddit", "unknown"),
            source_type=item.get("type", "unknown"),
        )


def _submission_worker(reddit, aggregator_15m: HypeAggregator, aggregator_24h: HypeAggregator):
    """Worker-Thread: Streamt Submissions und verarbeitet sie."""
    logger.info("Submission-Worker gestartet.")
    try:
        for item in stream_submissions(reddit):
            if _shutdown_event.is_set():
                break
            _process_item(item, aggregator_15m, aggregator_24h)
    except Exception as e:
        logger.error(f"Submission-Worker Fehler: {e}")


def _comment_worker(reddit, aggregator_15m: HypeAggregator, aggregator_24h: HypeAggregator):
    """Worker-Thread: Streamt Kommentare und verarbeitet sie."""
    logger.info("Comment-Worker gestartet.")
    try:
        for item in stream_comments(reddit):
            if _shutdown_event.is_set():
                break
            _process_item(item, aggregator_15m, aggregator_24h)
    except Exception as e:
        logger.error(f"Comment-Worker Fehler: {e}")


def _rss_worker(aggregator_15m: HypeAggregator, aggregator_24h: HypeAggregator):
    """
    Worker-Thread: Streamt Posts ueber oeffentliche RSS-Feeds (Fallback).
    """
    try:
        logger.info(f"Starte RSS-Stream fuer: {config.SUBREDDITS}")
        for item in stream_rss_submissions(config.SUBREDDITS):
            if _shutdown_event.is_set():
                break

            results = process_text(item["text"])
            for ticker, sentiment in results:
                aggregator_15m.add_mention(
                    ticker=ticker,
                    sentiment=sentiment,
                    subreddit=item["subreddit"],
                    source_type=item["type"],
                )
                aggregator_24h.add_mention(
                    ticker=ticker,
                    sentiment=sentiment,
                    subreddit=item["subreddit"],
                    source_type=item["type"],
                )
    except Exception as e:
        logger.error(f"RSS-Worker abgestuerzt: {e}")

def _alert_worker(aggregator_15m: HypeAggregator, aggregator_24h: HypeAggregator):
    """
    Worker-Thread: Prueft periodisch auf Hype-Bedingungen
    und exportiert Dashboard-Daten als JSON.
    """
    logger.info(
        f"Alert-Worker gestartet. Check-Intervall: "
        f"{config.ALERT_CHECK_INTERVAL_SECONDS}s"
    )
    while not _shutdown_event.is_set():
        try:
            # Alerts pruefen und Dashboard-JSON exportieren fuer beide Zeiteinheiten
            process_and_export(aggregator_15m, "hype_data.json")
            process_and_export(aggregator_24h, "hype_data_max.json")

        except Exception as e:
            logger.error(f"Alert-Worker Fehler: {e}")

        _shutdown_event.wait(timeout=config.ALERT_CHECK_INTERVAL_SECONDS)

def _print_banner():
    """Zeigt das Startbanner an."""


    banner = """
    =======================================================
    |                                                     |
    |      A B R A K A D A B R A                          |
    |         Hype-Barometer v2.1 (Dual Engine)           |
    |                                                     |
    |   Reddit -> Ticker -> Sentiment -> Dashboard JSON   |
    |                                                     |
    =======================================================
    """
    print(banner)


def _web_server_worker():
    """Worker-Thread fuer den FastAPI Web- & API-Server."""
    # Standardport 8000 fuer lokalen Start, Render/Railway injectet das ueber PORT
    port = int(os.getenv("PORT", 8000))
    logger.info(f"API- & Web-Server wird gestartet auf Port {port}...")
    try:
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
    except Exception as e:
        logger.error(f"Webserver Fehler: {e}")


def main():
    """Hauptfunktion: Startet alle Worker-Threads und die Alert-Schleife."""
    _print_banner()

    logger.info("=" * 55)
    logger.info("Abrakadabra startet...")
    logger.info(f"Subreddits: r/{config.SUBREDDITS}")
    logger.info(f"Aggregations-Fenster: {config.AGGREGATION_WINDOW_MINUTES} Minuten")
    logger.info(f"Min. Erwaehnungen fuer Alert: {config.MIN_MENTIONS_FOR_ALERT}")
    logger.info(f"Min. Sentiment-Score: {config.MIN_SENTIMENT_SCORE}")
    logger.info(f"Alert-Check-Intervall: {config.ALERT_CHECK_INTERVAL_SECONDS}s")
    logger.info(f"Spam-Filter: Account-Alter >= {config.MIN_ACCOUNT_AGE_DAYS}d, "
                f"Karma >= {config.MIN_ACCOUNT_KARMA}")
    logger.info("=" * 55)

    # Zwei Aggregatoren initialisieren: 15 Minuten und 24 Stunden (1440 min)
    aggregator_15m = HypeAggregator(window_minutes=15)
    aggregator_24h = HypeAggregator(window_minutes=1440)

    # Worker-Threads starten
    threads = []

    if config.USE_REDDIT_API:
        logger.info("STARTE IM [API-MODUS] (Live-Streaming mit PRAW)")
        # Reddit-Client erstellen
        try:
            reddit = create_reddit_client()
        except Exception as e:
            logger.critical(f"Konnte Reddit-Client nicht erstellen: {e}")
            sys.exit(1)

        submission_thread = threading.Thread(
            target=_submission_worker,
            args=(reddit, aggregator_15m, aggregator_24h),
            name="SubmissionWorker",
            daemon=True,
        )
        threads.append(submission_thread)

        comment_thread = threading.Thread(
            target=_comment_worker,
            args=(reddit, aggregator_15m, aggregator_24h),
            name="CommentWorker",
            daemon=True,
        )
        threads.append(comment_thread)
    else:
        logger.warning("STARTE IM [RSS-MODUS] (Keine API-Keys, Fallback auf öffentliche Feeds)")
        rss_thread = threading.Thread(
            target=_rss_worker,
            args=(aggregator_15m, aggregator_24h),
            name="RssWorker",
            daemon=True,
        )
        threads.append(rss_thread)

    alert_thread = threading.Thread(
        target=_alert_worker,
        args=(aggregator_15m, aggregator_24h),
        name="AlertWorker",
        daemon=True,
    )
    threads.append(alert_thread)

    web_thread = threading.Thread(
        target=_web_server_worker,
        name="WebAndApiServer",
        daemon=True,
    )
    threads.append(web_thread)

    # Alle Threads starten
    for t in threads:
        t.start()
        logger.info(f"Thread '{t.name}' gestartet.")

    logger.info("Alle Worker laufen. Druecke Ctrl+C zum Beenden.")
    logger.info("-" * 55)

    # Hauptthread wartet auf Shutdown-Signal
    try:
        while not _shutdown_event.is_set():
            _shutdown_event.wait(timeout=1.0)
    except KeyboardInterrupt:
        _shutdown_event.set()

    logger.info("Warte auf Worker-Threads...")
    for t in threads:
        t.join(timeout=5)

    logger.info("Abrakadabra beendet. Auf Wiedersehen! 🎩")


if __name__ == "__main__":
    main()
