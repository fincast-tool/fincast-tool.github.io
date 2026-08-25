import os
import sys
from pathlib import Path

# Add project root to python path to find local modules
project_root = str(Path(__file__).resolve().parent.parent)
sys.path.insert(0, project_root)

# Mock required environment variables
os.environ["REDDIT_CLIENT_ID"] = "test"
os.environ["REDDIT_CLIENT_SECRET"] = "test"

import config
from aggregator import HypeAggregator, export_dashboard_json

# Create Aggregator
agg = HypeAggregator()

# 1. Add mentions for a test ticker
agg.add_mention("GME", 0.5, "wallstreetbets", "submission")
agg.add_mention("GME", 0.6, "stocks", "comment")

# 2. Mock a custom analyze_ticker_trading_setup return values to force a PRE-BREAKOUT state
import ta_filter

# Store original function
original_analyze = ta_filter.analyze_ticker_trading_setup

def mock_analyze(ticker, asset_type):
    if ticker == "GME":
        return {
            "ticker": "GME",
            "asset_type": "stock",
            "current_price": 25.5,
            "rsi_value": 62.5,
            "volume_spike_factor": 2.1,
            "distance_to_local_ath_pct": 1.2,
            "ema_9": 24.8,
            "ema_20": 24.2,
            "setup_label": "PRE-BREAKOUT"
        }
    return original_analyze(ticker, asset_type)

# Apply mock
ta_filter.analyze_ticker_trading_setup = mock_analyze

print("--- STARTE PRE-BREAKOUT UNIT TEST ---")
# Compile dashboard data
data = agg.get_dashboard_data()

print(f"Aktive Ticker: {data['meta']['total_active_tickers']}")
print(f"Alerts in Feed: {len(data['alerts'])}")

pre_breakout_alerts = [a for a in data['alerts'] if a['alert_type'] == 'pre-breakout']
print(f"Pre-Breakout Alerts gefunden: {len(pre_breakout_alerts)}")

if len(pre_breakout_alerts) > 0:
    alert = pre_breakout_alerts[0]
    print("\nTriggered Alert Details:")
    print(f"  Ticker: ${alert['ticker']}")
    print(f"  Alert Type: {alert['alert_type']}")
    print(f"  Mentions: {alert['mentions']}")
    print(f"  Triggered At: {alert['triggered_at']}")
    print("\nSUCCESS: PRE-BREAKOUT Signale werden perfekt in den Signal-Feed eingepflegt!")
else:
    print("\nFAILURE: PRE-BREAKOUT Signal wurde nicht erzeugt.")

# Restore original function
ta_filter.analyze_ticker_trading_setup = original_analyze
