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
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from pathlib import Path

import config
from ticker_extraction import KNOWN_CRYPTO_TICKERS

logger = logging.getLogger("abracadabra.aggregator")


def is_crypto_ticker(ticker: str, subreddits: set) -> bool:
    """Prueft ob ein Ticker zu Krypto oder Krypto-Subreddits gehört."""
    if ticker.upper() in KNOWN_CRYPTO_TICKERS:
        return True
    crypto_subs = {"cryptocurrency", "satoshistreetbets"}
    if any(s.lower() in crypto_subs for s in subreddits):
        return True
    return False


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
        self._min_neg_sentiment = config.MIN_NEG_SENTIMENT_SCORE

        # Cooldown: Kein doppelter Alert fuer denselben Ticker innerhalb des Fensters
        self._alert_cooldown_seconds = self._window_seconds

        # Alert-Historie fuer das Dashboard (letzte 50 Alerts)
        self._alert_history: List[dict] = []
        self._max_history = 50

        logger.info(
            f"Aggregator initialisiert: Fenster={self.window_minutes}min, "
            f"Min-Erwaehnungen={self._min_mentions}, Min-Sentiment={self._min_sentiment}, "
            f"Min-Neg-Sentiment={self._min_neg_sentiment}"
        )

    def add_mention(self, ticker: str, sentiment: float, subreddit: str,
                    source_type: str = "unknown", timestamp: Optional[float] = None):
        """Fuegt eine neue Ticker-Erwaehnung hinzu."""
        mention = TickerMention(
            ticker=ticker,
            sentiment=sentiment,
            subreddit=subreddit,
            timestamp=timestamp if timestamp is not None else time.time(),
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

            # Krypto- vs Aktien-Grenzwerte
            is_crypto = is_crypto_ticker(ticker, agg.subreddits)
            
            min_mentions = 2 if is_crypto else self._min_mentions
            min_pos_sentiment = 0.9 if is_crypto else self._min_sentiment
            min_neg_sentiment = -0.6 if is_crypto else self._min_neg_sentiment

            is_positive_hype = agg.count >= min_mentions and agg.avg_sentiment >= min_pos_sentiment
            is_negative_hype = agg.count >= min_mentions and agg.avg_sentiment <= min_neg_sentiment

            if is_positive_hype or is_negative_hype:
                # Cooldown-Check: Nicht erneut alerten
                if (now - agg.last_alert_time) < self._alert_cooldown_seconds:
                    logger.debug(
                        f"Ticker {ticker}: Hype/Panik erkannt, aber Cooldown aktiv. Uebersprungen."
                    )
                    continue

                alert_type = "positive" if agg.avg_sentiment >= 0 else "negative"
                alert = {
                    "ticker": ticker,
                    "mentions": agg.count,
                    "avg_sentiment": round(agg.avg_sentiment, 3),
                    "alert_type": alert_type,
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
                    f"HYPE ALERT ({alert_type.upper()}): {ticker} | {agg.count} Erwaehnungen | "
                    f"Sentiment: {agg.avg_sentiment:.3f} | "
                    f"Subreddits: {', '.join(alert['subreddits'])}"
                )

        return alerts

    def save_state(self, filename: str):
        """Sichert den aktuellen internen Zustand (Erwaehnungen und Historie) in einer JSON-Datei."""
        try:
            output_dir = Path(config.OUTPUT_JSON_PATH).parent
            state_path = output_dir / filename
            
            serialized_data = {}
            for ticker, agg in self._data.items():
                serialized_mentions = []
                for m in agg.mentions:
                    serialized_mentions.append({
                        "ticker": m.ticker,
                        "sentiment": m.sentiment,
                        "subreddit": m.subreddit,
                        "timestamp": m.timestamp,
                        "source_type": m.source_type
                    })
                serialized_data[ticker] = {
                    "ticker": agg.ticker,
                    "last_alert_time": agg.last_alert_time,
                    "mentions": serialized_mentions
                }
            
            state = {
                "alert_history": self._alert_history,
                "data": serialized_data
            }
            
            temp_path = state_path.with_suffix(".tmp")
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            temp_path.replace(state_path)
            logger.info(f"Aggregator-State erfolgreich gesichert: {state_path.name}")
        except Exception as e:
            logger.error(f"Fehler beim Sichern des Aggregator-States: {e}")

    def load_state(self, filename: str):
        """Laedt den Zustand aus einer JSON-Datei, falls vorhanden."""
        try:
            output_dir = Path(config.OUTPUT_JSON_PATH).parent
            state_path = output_dir / filename
            if not state_path.exists():
                logger.info(f"Keine State-Datei gefunden: {state_path.name}. Starte frisch.")
                return
            
            with open(state_path, "r", encoding="utf-8") as f:
                state = json.load(f)
            
            self._alert_history = state.get("alert_history", [])
            serialized_data = state.get("data", {})
            
            for ticker, data in serialized_data.items():
                agg = TickerAggregation(
                    ticker=data.get("ticker", ticker),
                    last_alert_time=data.get("last_alert_time", 0.0)
                )
                for m in data.get("mentions", []):
                    agg.mentions.append(TickerMention(
                        ticker=m.get("ticker", ticker),
                        sentiment=m.get("sentiment", 0.0),
                        subreddit=m.get("subreddit", "unknown"),
                        timestamp=m.get("timestamp", time.time()),
                        source_type=m.get("source_type", "unknown")
                    ))
                self._data[ticker] = agg
                
            logger.info(f"Aggregator-State erfolgreich geladen: {state_path.name} ({len(self._data)} Ticker rekonstruiert)")
        except Exception as e:
            logger.error(f"Fehler beim Laden des Aggregator-States: {e}")


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
            elif s >= -0.4:
                level = "NEGATIV"
            else:
                level = "EXTREM NEGATIV"

            # Krypto- vs Aktien-Grenzwerte
            is_crypto = is_crypto_ticker(ticker, set(data["subreddits"]))
            
            min_mentions = 2 if is_crypto else self._min_mentions
            min_pos_sentiment = 0.9 if is_crypto else self._min_sentiment
            min_neg_sentiment = -0.6 if is_crypto else self._min_neg_sentiment

            # Hype-Status: erfuellt der Ticker die Alert-Bedingungen (sowohl positive als auch negative)?
            is_hype = (
                data["count"] >= min_mentions and (
                    data["avg_sentiment"] >= min_pos_sentiment or
                    data["avg_sentiment"] <= min_neg_sentiment
                )
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

def push_to_vercel(data: dict, timeframe: str):
    """Sendet die Hype-Barometer-Daten per POST-Request an Vercel-Storage."""
    import urllib.request
    import json
    
    url = config.VERCEL_STORAGE_URL
    if not url:
        logger.warning("VERCEL_STORAGE_URL ist nicht konfiguriert. Uebertrage keine Daten nach Vercel.")
        return
        
    payload = {
        "action": "save_hype",
        "timeframe": timeframe,
        "data": data
    }
    
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Abracadabra-Uploader/1.0"
    }
    
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        # Timeout von 10s, um den Background-Thread nicht zu blockieren bei Netzwerkfehlern
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            if not res_data.get("success"):
                raise Exception(res_data.get("error", "Vercel returned success=False"))
            logger.info(f"Hype-Daten ({timeframe}) erfolgreich nach Vercel-Redis uebertragen!")
    except Exception as e:
        logger.error(f"Fehler beim Uebertragen der Hype-Daten ({timeframe}) nach Vercel: {e}")


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

        # Automatisch an Vercel-Redis KV uebertragen
        timeframe = "15m" if filename == "hype_data.json" else "max"
        push_to_vercel(data, timeframe)

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

    # State sichern
    state_filename = filename.replace(".json", "_state.json")
    aggregator.save_state(state_filename)

    return alerts
