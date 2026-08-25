"""
Abracadabra - Ticker-Extraktion & Sentiment-Analyse
=====================================================
Extrahiert Aktien- und Krypto-Ticker aus Texten via Regex.
Analysiert die Stimmung (Sentiment) mit VADER.
"""

import re
import logging
from typing import List, Tuple

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger("abracadabra.ticker")

# VADER Sentiment Analyzer (einmalig initialisieren)
_vader = SentimentIntensityAnalyzer()

# Bekannte Krypto-Ticker
KNOWN_CRYPTO_TICKERS = {
    "BTC", "ETH", "SOL", "ADA", "DOT", "DOGE", "SHIB", "XRP",
    "AVAX", "MATIC", "LINK", "UNI", "AAVE", "ATOM", "ALGO",
    "FTM", "NEAR", "APT", "ARB", "SUI", "SEI", "TIA",
    "INJ", "PEPE", "WIF", "BONK", "FLOKI", "RENDER", "FET",
    "TAO", "RNDR", "WLD", "JUP", "PYTH", "LTC",
    "BCH", "FIL", "ICP", "HBAR", "VET", "EGLD", "SAND",
    "MANA", "AXS", "GALA", "ENJ", "CRO", "KCS", "BNB",
}

# Bekannte Aktien-Ticker (haeufig diskutierte)
KNOWN_STOCK_TICKERS = {
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "TSLA",
    "META", "AMD", "INTC", "PLTR", "GME", "AMC",
    "NOK", "SOFI", "LCID", "RIVN", "NIO", "BABA",
    "COIN", "HOOD", "RBLX", "SNAP", "PINS",
    "UBER", "LYFT", "PYPL", "DIS", "NFLX", "SPOT",
    "ROKU", "CRWD", "DKNG", "ABNB", "SNOW",
    "SHOP", "MELI", "TTD", "ENPH", "FSLR",
    "PLUG", "SPCE", "TLRY", "SNDL", "MARA", "RIOT",
    "UPST", "AFRM", "SMCI", "ARM", "MSTR", "IONQ", "RGTI",
}

# Blacklist: Haeufige Woerter, die wie Ticker aussehen
TICKER_BLACKLIST = {
    "ARE", "FOR", "ALL", "CAN", "HAS", "HIS", "HER", "HIM",
    "HOW", "ITS", "LET", "MAY", "NEW", "NOW", "OLD", "OUR",
    "OUT", "OWN", "SAY", "SHE", "TOO", "TWO", "WAY", "WHO",
    "DID", "GET", "GOT", "HIT", "MAN", "MEN", "RAN",
    "RED", "RUN", "SET", "SIT", "TOP", "WIN", "WON", "YET",
    "ADD", "AGO", "AID", "AIM", "AIR", "ANY", "APE", "ASK",
    "BAD", "BAG", "BAN", "BAR", "BIG", "BIT", "BOX",
    "BUS", "BUT", "BUY", "CAR", "CUT", "DAD", "DAY", "DIE",
    "DOG", "DRY", "EAR", "EAT", "END", "ERA", "EYE", "FAR",
    "CEO", "CFO", "CTO", "COO", "IPO", "ETF", "SEC", "FDA",
    "FED", "GDP", "ATH", "IMO", "LOL", "OMG", "WTF", "IDK",
    "PSA", "TIL", "FAQ", "AMA", "RIP", "OTC", "USD",
    "EUR", "GBP", "JPY", "CAD", "AUD",
    "PUMP", "DUMP", "HOLD", "HODL", "MOON", "YOLO", "FOMO",
    "BEAR", "BULL", "CALL", "PUTS", "LONG", "SELL",
    "NEXT", "BEST", "HUGE", "REAL", "RISK", "SAFE", "SAVE",
    "SEND", "STOP", "TAKE", "TELL", "THAN", "THAT", "THEM",
    "THEN", "THEY", "THIS", "TOLD", "VERY", "WANT", "WEEK",
    "WELL", "WENT", "WERE", "WHAT", "WHEN", "WILL", "WITH",
    "WORD", "WORK", "YEAR", "YOUR", "ZERO",
    "FREE", "FULL", "GAIN", "GAME", "GIVE", "GOES", "GONE",
    "GOOD", "HALF", "HAND", "HARD", "HAVE", "HEAD", "HEAR",
    "HELP", "HERE", "HIGH", "HOPE", "HOUR", "IDEA", "JUST",
    "KEEP", "KIND", "KNOW", "LAST", "LATE", "LEAD",
    "LEFT", "LESS", "LIFE", "LIKE", "LINE", "LIST", "LIVE",
    "LOOK", "LOSE", "LOSS", "LOST", "LOVE", "LUCK",
    "MADE", "MAIN", "MAKE", "MANY", "MARK", "MASS", "MEAN",
    "MEET", "MIND", "MISS", "MORE", "MOST", "MOVE", "MUCH",
    "MUST", "NAME", "NEED", "NEWS", "NICE", "NOTE", "ONLY",
    "OPEN", "OVER", "PACK", "PAGE", "PAID", "PART",
    "PASS", "PAST", "PATH", "PICK", "PLAN", "PLAY", "PLUS",
    "POST", "PULL", "PURE", "PUSH", "RATE", "READ",
    "REST", "RICH", "RIDE", "RISE", "ROAD", "ROLE", "RULE",
    "SAME", "SAYS", "SEEN", "SEEM", "SELF", "SHOW", "SHUT",
    "SIDE", "SIGN", "SIZE", "SKIN", "SLOW", "SOME", "SOON",
    "SORT", "STAR", "STAY", "STEP", "SUCH", "SURE",
    "TALK", "TEAM", "TERM", "TEST", "TEXT", "TIME", "TINY",
    "TURN", "TYPE", "UPON", "USED", "USER", "VIEW", "VOTE",
    "WAIT", "WAKE", "WALK", "WALL", "WARN", "WIDE",
    "WILD", "WISE", "WISH",
    "EACH", "EARN", "EASE", "EAST", "EDGE", "EDIT", "ELSE",
    "EVEN", "EVER", "FACE", "FACT", "FAIL", "FAIR",
    "FALL", "FAST", "FEAR", "FEED", "FEEL", "FILL",
    "FIND", "FINE", "FIRE", "FIRM", "FISH",
    "FLAT", "FLOW", "FOOD", "FOOT", "FORM", "FOUR", "FUND",
    "DD", "TA", "PM", "AM", "US", "UK", "EU", "AI", "IT",
    "OR", "SO", "UP", "ON", "IN", "AT", "BY", "NO", "GO",
    "DO", "IF", "AN", "AS", "BE", "HE", "ME", "MY", "OF",
    "TO", "WE",
}

# Regex-Patterns
_DOLLAR_TICKER_PATTERN = re.compile(r'\$([A-Z]{1,5})\b')
_BARE_TICKER_PATTERN = re.compile(r'(?<![$\w])([A-Z]{2,5})(?!\w)')


def extract_tickers(text: str) -> List[str]:
    """
    Extrahiert Finanz-Ticker aus einem Text.
    Erkennt Dollar-Prefix ($AAPL) und bekannte Bare-Ticker (BTC).
    Filtert per Blacklist falsche Positive heraus.
    """
    found_tickers = set()

    # Dollar-Prefix-Ticker ($AAPL, $BTC) -> hoechste Konfidenz
    for ticker in _DOLLAR_TICKER_PATTERN.findall(text):
        t = ticker.upper()
        if t not in TICKER_BLACKLIST:
            found_tickers.add(t)

    # Bekannte Ticker ohne Prefix
    for ticker in _BARE_TICKER_PATTERN.findall(text):
        t = ticker.upper()
        if t not in TICKER_BLACKLIST:
            if t in KNOWN_CRYPTO_TICKERS or t in KNOWN_STOCK_TICKERS:
                found_tickers.add(t)

    return list(found_tickers)


def analyze_sentiment(text: str) -> float:
    """Berechnet den VADER Compound-Score (-1.0 bis +1.0)."""
    try:
        scores = _vader.polarity_scores(text)
        return scores["compound"]
    except Exception as e:
        logger.warning(f"Sentiment-Analyse fehlgeschlagen: {e}")
        return 0.0


def process_text(text: str) -> List[Tuple[str, float]]:
    """
    Extrahiert Ticker und ordnet jedem den Sentiment-Score zu.
    Rueckgabe: Liste von (ticker, compound_score) Tupeln.
    """
    tickers = extract_tickers(text)
    if not tickers:
        return []
    sentiment = analyze_sentiment(text)
    return [(ticker, sentiment) for ticker in tickers]
