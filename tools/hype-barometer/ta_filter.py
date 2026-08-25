"""
Abracadabra - On-Demand Technical Analysis Modul
=================================================
Dieses Modul bietet eine Schnittstelle zur schnellen, API-schonenden
technischen Analyse (TA) von Hype-Tickern. Es lädt on-demand historische
15-Minuten-Kerzen für Aktien oder Kryptowährungen, berechnet Key-Indikatoren
und klassifiziert das aktuelle Setup in PRE-BREAKOUT, OVERBOUGHT, CONSOLIDATION
oder NEUTRAL.

Autoren & Trader: Quantitative Trading & Dev-Team Fincast Hub
"""

import logging
import requests
import pandas as pd
import pandas_ta_classic as ta
import yfinance as yf
from typing import Optional, Dict, Any
import time
import threading

# Thread-safe in-memory cache für technische Analysen (10 Min. TTL)
_ta_cache_lock = threading.Lock()
_ta_cache: Dict[str, Dict[str, Any]] = {}
CACHE_DURATION_SECONDS = 600  # 10 Minuten in Sekunden

# Logger-Konfiguration für das TA-Modul
logger = logging.getLogger("abracadabra.ta_filter")


def fetch_stock_data(ticker: str) -> Optional[pd.DataFrame]:
    """
    Lädt Aktien-Daten über yfinance für die letzten 5 Tage
    im 15-Minuten-Intervall.
    """
    ticker_clean = ticker.upper().strip()
    logger.info(f"Lade 15m-Aktien-Daten für {ticker_clean} (letzte 5 Tage)...")
    try:
        stock = yf.Ticker(ticker_clean)
        # 15m Kerzen für die letzten 5 Tage herunterladen
        df = stock.history(period="5d", interval="15m")
        if df.empty or len(df) < 20:
            logger.warning(f"Keine oder unzureichende Daten für Aktien-Ticker '{ticker_clean}' über yfinance.")
            return None
        return df
    except Exception as e:
        logger.error(f"Fehler beim Laden der yfinance-Daten für '{ticker_clean}': {e}")
        return None


def fetch_crypto_data(ticker: str) -> Optional[pd.DataFrame]:
    """
    Fragt die Binance-API ab, um die letzten 100 Kerzen (15m)
    für das entsprechende USDT-Paar (z.B. SOLUSDT) zu laden.
    """
    ticker_clean = ticker.upper().strip()
    # Sicherstellen, dass das Ticker-Symbol auf USDT endet
    if not ticker_clean.endswith("USDT"):
        symbol = f"{ticker_clean}USDT"
    else:
        symbol = ticker_clean
        ticker_clean = symbol.replace("USDT", "")  # Ticker-Symbol bereinigen

    logger.info(f"Lade 15m-Krypto-Daten von Binance für {symbol} (letzte 100 Kerzen)...")
    url = "https://api.binance.com/api/v3/klines"
    params = {
        "symbol": symbol,
        "interval": "15m",
        "limit": 100
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code != 200:
            logger.warning(f"Binance-API meldet Status {response.status_code} für '{symbol}'. Versuche Fallback...")
            return None
        
        data = response.json()
        if not isinstance(data, list) or len(data) < 20:
            logger.warning(f"Unerwartetes Datenformat oder ungenügend Kerzen von Binance für '{symbol}'.")
            return None
            
        # DataFrame aus Binance klines erstellen
        df = pd.DataFrame(data, columns=[
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "count", "taker_buy_base", "taker_buy_quote", "ignore"
        ])
        
        # Datentypen für Analyse konvertieren
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)
            
        return df
    except Exception as e:
        logger.error(f"Fehler bei Binance-API-Abfrage für '{symbol}': {e}")
        return None


def analyze_ticker_trading_setup(ticker: str, asset_type: str) -> Optional[Dict[str, Any]]:
    """
    Führt eine On-Demand Technische Analyse für einen Hype-Ticker durch.
    
    Parameter:
    - ticker (str): Das Symbol (z.B. "GME" oder "SOL")
    - asset_type (str): "stock" oder "crypto"
    
    Rückgabe:
    - Dict mit Analyse-Ergebnissen oder None bei Fehlern/fehlenden Daten.
    """
    ticker = ticker.upper().strip()
    asset_type = asset_type.lower().strip()
    cache_key = f"{ticker}_{asset_type}"

    # 0. Cache-Lookup (API-schonend und extrem performant)
    with _ta_cache_lock:
        if cache_key in _ta_cache:
            cached = _ta_cache[cache_key]
            if time.time() - cached["timestamp"] < CACHE_DURATION_SECONDS:
                logger.info(f"Cache-Hit für {ticker} ({asset_type.upper()}). Verwende in-memory TA-Daten.")
                return cached["data"]
    
    # 1. On-Demand Datenbeschaffung
    if asset_type == "stock":
        df = fetch_stock_data(ticker)
    elif asset_type == "crypto":
        df = fetch_crypto_data(ticker)
    else:
        logger.error(f"Ungültiger asset_type '{asset_type}'. Erlaubt sind 'stock' oder 'crypto'.")
        return None
        
    if df is None:
        return None
        
    try:
        # Spaltennamen zur Sicherheit standardisieren (Kleinbuchstaben)
        df.columns = [col.lower() for col in df.columns]
        
        # 2. Lokale Indikator-Berechnung (pandas_ta & pandas)
        
        # RSI 14 auf Basis der Schlusspreise (15m) berechnen
        df["rsi_14"] = ta.rsi(df["close"], length=14)
        
        # EMA 9 und EMA 20 berechnen
        df["ema_9"] = ta.ema(df["close"], length=9)
        df["ema_20"] = ta.ema(df["close"], length=20)
        
        # Volume Spike: Aktuelles Volumen / Durchschnittsvolumen der letzten 20 Kerzen
        # rolling(20) berechnet den gleitenden Durchschnitt über ein Fenster von 20 Kerzen
        df["vol_ma20"] = df["volume"].rolling(window=20).mean()
        
        # Höchster Schlusskurs im abgerufenen Zeitfenster (lokales ATH)
        local_ath = df["close"].max()
        
        # Die aktuellsten Werte aus der letzten Zeile extrahieren
        current_row = df.iloc[-1]
        current_price = float(current_row["close"])
        rsi_val = float(current_row["rsi_14"])
        ema9_val = float(current_row["ema_9"])
        ema20_val = float(current_row["ema_20"])
        current_vol = float(current_row["volume"])
        vol_ma20_val = float(current_row["vol_ma20"])
        
        # Fehlerabsicherung bei der Volumen-Spike-Berechnung (Division durch Null)
        if vol_ma20_val > 0:
            volume_spike = current_vol / vol_ma20_val
        else:
            volume_spike = 1.0
            
        # Prozentuale Distanz des aktuellen Kurses zum lokalen ATH (Ausbruchslevel)
        if local_ath > 0:
            ath_dist_pct = ((local_ath - current_price) / local_ath) * 100.0
        else:
            ath_dist_pct = 0.0
            
        # NaN-Check: Falls Indikatoren nicht berechnet werden konnten (z.B. zu wenige Zeilen)
        if pd.isna(rsi_val) or pd.isna(ema9_val) or pd.isna(ema20_val):
            logger.warning(f"TA Indikatoren enthalten NaN-Werte für '{ticker}'.")
            return None

        # 3. Setup-Klassifizierung (Quantitative Filterregeln)
        
        # Distanz zum EMA 9 und EMA 20 in % berechnen (für Consolidation Check)
        dist_to_ema9_pct = (abs(current_price - ema9_val) / ema9_val) * 100.0
        dist_to_ema20_pct = (abs(current_price - ema20_val) / ema20_val) * 100.0
        
        # Klassifizierungslogik (Optimiert für Profi-Breakout-Trading):
        # - PRE-BREAKOUT: Aufwärtstrend (EMA 9 > EMA 20), RSI in Momentum-Zone (53-75), deutlicher Volume Spike (> 1.5) und sehr nah am lokalen ATH (< 3.0%)
        # - OVERBOUGHT: RSI über 78 (Gefahr von FOMO)
        # - CONSOLIDATION: Neutraler RSI (45-55), Kurs dicht an den EMAs (< 1.5% Abweichung), unauffälliges Volumen (<= 1.2)
        # - NEUTRAL: Kein klares Muster erfüllt
        
        is_pre_breakout = (
            (ema9_val > ema20_val) and
            (53.0 <= rsi_val <= 75.0) and
            (volume_spike > 1.5) and
            (ath_dist_pct < 3.0)
        )
        
        is_overbought = (rsi_val > 78.0)
        
        is_consolidation = (
            (45.0 <= rsi_val <= 55.0) and
            (dist_to_ema9_pct <= 1.5) and
            (dist_to_ema20_pct <= 1.5) and
            (volume_spike <= 1.2)
        )
        
        if is_pre_breakout:
            setup_label = "PRE-BREAKOUT"
        elif is_overbought:
            setup_label = "OVERBOUGHT"
        elif is_consolidation:
            setup_label = "CONSOLIDATION"
        else:
            setup_label = "NEUTRAL"
            
        # 4. Output-Format (Strukturiertes Dictionary)
        result = {
            "ticker": ticker,
            "asset_type": asset_type,
            "current_price": round(current_price, 4 if asset_type == "crypto" else 2),
            "rsi_value": round(rsi_val, 2),
            "volume_spike_factor": round(volume_spike, 2),
            "distance_to_local_ath_pct": round(ath_dist_pct, 2),
            "ema_9": round(ema9_val, 4 if asset_type == "crypto" else 2),
            "ema_20": round(ema20_val, 4 if asset_type == "crypto" else 2),
            "setup_label": setup_label
        }
        
        # In Cache sichern
        with _ta_cache_lock:
            _ta_cache[cache_key] = {
                "timestamp": time.time(),
                "data": result
            }

        return result
        
    except Exception as e:
        logger.error(f"Fehler bei der Berechnung des TA-Setups für '{ticker}': {e}")
        return None


# ==============================================================================
# INTEGRATIONS-BEISPIEL & SELBSTTEST
# ==============================================================================
if __name__ == "__main__":
    # Konsolen-Logging aktivieren für den Testlauf
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    
    print("\n--- STARTE ON-DEMAND TA-FILTER SELBSTTEST ---")
    
    # 1. Test Crypto (Solana)
    print("\n[TEST 1] Krypto - Solana (SOL):")
    crypto_result = analyze_ticker_trading_setup("SOL", "crypto")
    if crypto_result:
        print("Erfolgreich analysiert:")
        for k, v in crypto_result.items():
            print(f"  {k}: {v}")
    else:
        print("Konnte SOL nicht analysieren.")
        
    # 2. Test Stock (Nvidia)
    print("\n[TEST 2] Aktie - Nvidia (NVDA):")
    stock_result = analyze_ticker_trading_setup("NVDA", "stock")
    if stock_result:
        print("Erfolgreich analysiert:")
        for k, v in stock_result.items():
            print(f"  {k}: {v}")
    else:
        print("Konnte NVDA nicht analysieren. (Hinweis: Falls außerhalb der Handelszeiten, yfinance liefert evtl. leere Daten oder es gibt API-Limits)")
        
    # 3. Test Invalid Ticker
    print("\n[TEST 3] Ungültiger Ticker (Fehlertoleranz-Test):")
    invalid_result = analyze_ticker_trading_setup("XYZ_INVALID_TICKER", "stock")
    print(f"Ergebnis für ungültigen Ticker: {invalid_result} (Erwartet: None)")
    
    print("\n--- TESTENDE ---")
