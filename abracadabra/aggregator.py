"""
Abracadabra - Aggregation, Scoring & JSON-Export
=================================================
Aggregiert Ticker-Erwaehnungen ueber ein konfigurierbares Zeitfenster,
berechnet Hype-Scores und exportiert alle Daten als JSON fuer das
HTML-Dashboard.
"""

import json
import time
import logging
from datetime import datetime, timezone
from collections import defaultdict
from typing import Dict, List
from dataclasses import dataclass, field
from pathlib import Path

import config

logger = logging.getLogger("abracadabra.aggregator")


@dataclass
class TickerMention:
    """Eine einzelne Ticker-Erwaehnung mit Kontext."""
    ticker: str
    sentiment: float
    subreddit: str
    timestamp: float  # Unix-Timestamp
    source_type: str  # 'submission' oder 'comment'


@dataclass
class TickerAggregation:
    """Aggregierte Daten fuer einen Ticker im Zeitfenster."""
    ticker: str
    mentions: List[TickerMention] = field(default_factory=list)
    last_alert_time: float = 0.0  # Wann zuletzt ein Alert ausgeloest wurde

    @property
    def count(self) -> int:
        return len(self.mentions)

    @property
    def avg_sentiment(self) -> float:
        if not self.mentions:
            return 0.0
        return sum(m.sentiment for m in self.mentions) / len(self.mentions)

    @property
    def subreddits(self) -> set:
        return {m.subreddit for m in self.mentions}

    def prune_old(self, window_seconds: int):
        """Entfernt Erwaehnungen, die aelter als das Zeitfenster sind."""
        cutoff = time.time() - window_seconds
        self.mentions = [m for m in self.mentions if m.timestamp > cutoff]


class HypeAggregator:
    """
    Zentrale Aggregations-Engine.
    Sammelt Ticker-Erwaehnungen, prueft Hype-Bedingungen
    und exportiert Daten als JSON fuer das Dashboard.
    """

    def __init__(self, window_minutes: int = config.AGGREGATION_WINDOW_MINUTES):
        # Dict: ticker_symbol -> TickerAggregation
        self._data: Dict[str, TickerAggregation] = defaultdict(
            lambda: TickerAggregation(ticker="")
        )
        self.window_minutes = window_minutes
        self._window_seconds = window_minutes * 60
        self._min_mentions = config.MIN_MENTIONS_FOR_ALERT
        self._min_sentiment = config.MIN_SENTIMENT_SCORE

        # Cooldown: Kein doppelter Alert fuer denselben Ticker innerhalb des Fensters
        self._alert_cooldown_seconds = self._window_seconds

        # Alert-Historie fuer das Dashboard (letzte 50 Alerts)
        self._alert_history: List[dict] = []
        self._max_history = 50

        logger.info(
            f"Aggregator initialisiert: Fenster={self.window_minutes}min, "
            f"Min-Erwaehnungen={self._min_mentions}, Min-Sentiment={self._min_sentiment}"
        )

    def add_mention(self, ticker: str, sentiment: float, subreddit: str,
                    source_type: str = "unknown"):
        """Fuegt eine neue Ticker-Erwaehnung hinzu."""
        mention = TickerMention(
            ticker=ticker,
            sentiment=sentiment,
            subreddit=subreddit,
            timestamp=time.time(),
            source_type=source_type,
        )

        if self._data[ticker].ticker == "":
            self._data[ticker].ticker = ticker

        self._data[ticker].mentions.append(mention)
        logger.debug(
            f"Erwaehnung hinzugefuegt: {ticker} (Sentiment: {sentiment:.2f}, "
            f"Subreddit: r/{subreddit})"
        )

    def check_alerts(self) -> List[dict]:
        """
        Prueft alle aggregierten Ticker auf Hype-Bedingungen.
        Gibt eine Liste von Alert-Dicts zurueck fuer Ticker, die
        die Schwellenwerte ueberschreiten.

        Hype-Bedingung:
          - Erwaehnungen >= MIN_MENTIONS_FOR_ALERT
          - Durchschn. Sentiment >= MIN_SENTIMENT_SCORE
          - Kein kuerzlicher Alert (Cooldown)
        """
        alerts = []
        now = time.time()

        for ticker, agg in self._data.items():
            # Alte Erwaehnungen bereinigen
            agg.prune_old(self._window_seconds)

            if agg.count == 0:
                continue

            # Hype-Bedingungen pruefen
            if agg.count >= self._min_mentions and agg.avg_sentiment >= self._min_sentiment:
                # Cooldown-Check: Nicht erneut alerten
                if (now - agg.last_alert_time) < self._alert_cooldown_seconds:
                    logger.debug(
                        f"Ticker {ticker}: Hype erkannt, aber Cooldown aktiv. Uebersprungen."
                    )
                    continue

                alert = {
                    "ticker": ticker,
                    "mentions": agg.count,
                    "avg_sentiment": round(agg.avg_sentiment, 3),
                    "subreddits": sorted(agg.subreddits),
                    "window_minutes": self.window_minutes,
                    "triggered_at": datetime.now(tz=timezone.utc).isoformat(),
                }
                alerts.append(alert)
                agg.last_alert_time = now

                # In Historie aufnehmen
                self._alert_history.insert(0, alert)
                if len(self._alert_history) > self._max_history:
                    self._alert_history = self._alert_history[:self._max_history]

                logger.info(
                    f"HYPE ALERT: {ticker} | {agg.count} Erwaehnungen | "
                    f"Sentiment: {agg.avg_sentiment:.3f} | "
                    f"Subreddits: {', '.join(alert['subreddits'])}"
                )

        return alerts

    def get_stats(self) -> Dict[str, dict]:
        """Gibt aktuelle Statistiken aller Ticker zurueck."""
        stats = {}
        for ticker, agg in self._data.items():
            agg.prune_old(self._window_seconds)
            if agg.count > 0:
                stats[ticker] = {
                    "count": agg.count,
                    "avg_sentiment": round(agg.avg_sentiment, 3),
                    "subreddits": sorted(agg.subreddits),
                }
        return stats

    def get_dashboard_data(self) -> dict:
        """
        Erstellt das komplette JSON-Objekt fuer das HTML-Dashboard.
        Enthaelt: Alle aktiven Ticker, Alerts, Metadaten.
        """
        stats = self.get_stats()

        # Ticker nach Erwaehnungen sortiert
        ranked_tickers = []
        for ticker, data in sorted(stats.items(), key=lambda x: x[1]["count"], reverse=True):
            # Sentiment-Level bestimmen
            s = data["avg_sentiment"]
            if s >= 0.6:
                level = "EXTREM POSITIV"
            elif s >= 0.4:
                level = "SEHR POSITIV"
            elif s >= 0.2:
                level = "POSITIV"
            elif s >= -0.2:
                level = "NEUTRAL"
            else:
                level = "NEGATIV"

            # Hype-Status: erfuellt der Ticker die Alert-Bedingungen?
            is_hype = (
                data["count"] >= self._min_mentions and
                data["avg_sentiment"] >= self._min_sentiment
            )

            ranked_tickers.append({
                "ticker": ticker,
                "mentions": data["count"],
                "avg_sentiment": data["avg_sentiment"],
                "sentiment_level": level,
                "subreddits": data["subreddits"],
                "is_hype": is_hype,
            })

        # Gesamtzahl aller verarbeiteten Erwaehnungen
        total_mentions = sum(d["count"] for d in stats.values())

        return {
            "meta": {
                "last_updated": datetime.now(tz=timezone.utc).isoformat(),
                "window_minutes": self.window_minutes,
                "min_mentions": self._min_mentions,
                "min_sentiment": self._min_sentiment,
                "subreddits_monitored": config.SUBREDDITS,
                "total_active_tickers": len(ranked_tickers),
                "total_mentions": total_mentions,
            },
            "tickers": ranked_tickers,
            "alerts": self._alert_history,
        }


# ─── JSON-Export Funktionen ─────────────────────────────────

def export_dashboard_json(aggregator: HypeAggregator, filename: str = "hype_data.json"):
    """
    Exportiert die aktuellen Dashboard-Daten als JSON-Datei.
    Wird periodisch aus der Main-Loop aufgerufen.
    """
    try:
        data = aggregator.get_dashboard_data()
        output_dir = Path(config.OUTPUT_JSON_PATH).parent
        output_path = output_dir / filename

        # Atomar schreiben (temp-Datei -> rename) um Race-Conditions zu vermeiden
        temp_path = output_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        temp_path.replace(output_path)

        ticker_count = data["meta"]["total_active_tickers"]
        mention_count = data["meta"]["total_mentions"]
        logger.info(
            f"Dashboard-JSON exportiert: {ticker_count} Ticker, "
            f"{mention_count} Erwaehnungen -> {output_path.name}"
        )

    except Exception as e:
        logger.error(f"JSON-Export fehlgeschlagen: {e}")


def process_and_export(aggregator: HypeAggregator, filename: str = "hype_data.json"):
    """
    Prueft den Aggregator auf Hype-Bedingungen und exportiert
    die Daten als JSON fuer das Dashboard.
    """
    alerts = aggregator.check_alerts()

    if alerts:
        logger.info(f"{len(alerts)} neuer Hype-Alert(s) erkannt!")

    # Dashboard-JSON immer aktualisieren (auch ohne neue Alerts)
    export_dashboard_json(aggregator, filename)

    return alerts
