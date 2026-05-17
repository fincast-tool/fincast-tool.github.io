"""
Abrakadabra - Konfigurationsmodul
=================================
Lädt alle Umgebungsvariablen aus der .env-Datei und stellt sie
als typisierte Konfigurationswerte bereit.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# .env-Datei laden (sucht im aktuellen Verzeichnis)
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    # Auf Cloud-Servern wie Render/Railway existiert oft keine .env-Datei,
    # da die Variablen direkt im Dashboard eingetragen werden. 
    # Wir laden .env.example als Fallback fuer Default-Werte.
    _example_path = Path(__file__).resolve().parent / ".env.example"
    if _example_path.exists():
        load_dotenv(dotenv_path=_example_path)


def _require(key: str) -> str:
    """Liest einen Pflicht-Wert aus der Umgebung oder bricht ab."""
    value = os.getenv(key)
    if not value:
        print(f"FEHLER: Umgebungsvariable '{key}' ist nicht gesetzt! Prüfe deine .env-Datei.")
        sys.exit(1)
    return value


# ─── Reddit API (Optional fuer RSS-Fallback) ────────────────
REDDIT_CLIENT_ID: str = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET: str = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT: str = os.getenv("REDDIT_USER_AGENT", "Abrakadabra/2.0")

# Pruefen ob API-Keys vorhanden sind
USE_REDDIT_API = bool(REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET and REDDIT_CLIENT_ID != "dein_client_id")

# ─── Ausgabe-Pfad (JSON fuer das HTML-Dashboard) ────────────
_default_output = str(Path(__file__).resolve().parent / "hype_data.json")
OUTPUT_JSON_PATH: str = os.getenv("OUTPUT_JSON_PATH", _default_output)

# ─── Subreddits ─────────────────────────────────────────────
SUBREDDITS: str = os.getenv(
    "SUBREDDITS",
    "wallstreetbets+CryptoCurrency+stocks"
)

# ─── Aggregations-Einstellungen ─────────────────────────────
AGGREGATION_WINDOW_MINUTES: int = int(os.getenv("AGGREGATION_WINDOW_MINUTES", "15"))
MIN_MENTIONS_FOR_ALERT: int = int(os.getenv("MIN_MENTIONS_FOR_ALERT", "4"))
MIN_SENTIMENT_SCORE: float = float(os.getenv("MIN_SENTIMENT_SCORE", "0.6"))

# ─── Spam-Filter-Einstellungen ──────────────────────────────
MIN_ACCOUNT_KARMA: int = int(os.getenv("MIN_ACCOUNT_KARMA", "50"))
MIN_ACCOUNT_AGE_DAYS: int = int(os.getenv("MIN_ACCOUNT_AGE_DAYS", "30"))

# ─── Timing ─────────────────────────────────────────────────
ALERT_CHECK_INTERVAL_SECONDS: int = int(os.getenv("ALERT_CHECK_INTERVAL_SECONDS", "60"))
