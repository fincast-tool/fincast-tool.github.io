"""Schnelltest: Aggregator → JSON-Export Pipeline."""
import json
from pathlib import Path

# Config braucht .env, also mocken wir das
import os
os.environ["REDDIT_CLIENT_ID"] = "test"
os.environ["REDDIT_CLIENT_SECRET"] = "test"

import config
from ticker_extraction import process_text
from aggregator import HypeAggregator, export_dashboard_json

# Aggregator erstellen
agg = HypeAggregator()

# Simulierte Reddit-Posts einspeisen
test_posts = [
    ("$NVDA earnings beat! Super bullish!", "wallstreetbets"),
    ("NVDA is unstoppable, AI revolution!", "stocks"),
    ("$NVDA to $200! Buy the dip!", "wallstreetbets"),
    ("NVDA crushed it again, amazing quarter", "stocks"),
    ("$NVDA best stock of the decade", "wallstreetbets"),
    ("$NVDA and AMD both looking strong", "wallstreetbets"),
    ("BTC breaking out! $100k incoming!", "CryptoCurrency"),
    ("Bitcoin is pumping, BTC dominance rising", "CryptoCurrency"),
    ("SOL ecosystem growing fast", "CryptoCurrency"),
]

for text, sub in test_posts:
    results = process_text(text)
    for ticker, sentiment in results:
        agg.add_mention(ticker, sentiment, sub, "submission")

# JSON exportieren
export_dashboard_json(agg)

# JSON lesen und pruefen
output = Path(config.OUTPUT_JSON_PATH)
data = json.loads(output.read_text(encoding="utf-8"))

print(f"Aktive Ticker: {data['meta']['total_active_tickers']}")
print(f"Gesamt-Erwaehnungen: {data['meta']['total_mentions']}")
print(f"Alerts: {len(data['alerts'])}")
print()
for t in data["tickers"]:
    hype = " HYPE!" if t["is_hype"] else ""
    print(f"  ${t['ticker']:5s} | {t['mentions']:2d}x | Sentiment: {t['avg_sentiment']:+.3f} | {t['sentiment_level']}{hype}")

print(f"\nJSON geschrieben nach: {output}")
print("Pipeline-Test bestanden!")
