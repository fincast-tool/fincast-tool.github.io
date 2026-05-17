"""
Abrakadabra - Reddit RSS Ingestion (Fallback)
==============================================
Liest Reddit-Posts ueber oeffentliche RSS-Feeds aus, wenn
keine API-Keys vorhanden sind.
"""

import time
import logging
import feedparser
import re
from typing import Generator, Dict, Any

import config

logger = logging.getLogger("abrakadabra.rss_ingestion")


def strip_html(text: str) -> str:
    """Entfernt HTML-Tags aus dem RSS-Description-Feld."""
    clean = re.compile('<.*?>')
    return re.sub(clean, ' ', text)


def stream_rss_submissions(subreddits: str) -> Generator[Dict[str, Any], None, None]:
    """
    Fragt periodisch die RSS-Feeds der angegebenen Subreddits ab.
    Generiert Dictionaries mit den Post-Daten.
    """
    subs = subreddits.split("+")
    urls = [f"https://www.reddit.com/r/{sub}/new.rss" for sub in subs]
    
    # Set aufbewahren, um Duplikate zu vermeiden (IDs der letzten Posts)
    seen_ids = set()
    
    # Intervall fuer RSS Abfragen (nicht zu schnell, sonst IP-Ban)
    poll_interval = 60  
    
    logger.info(f"Starte RSS-Fallback-Modus fuer Subreddits: {', '.join(subs)}")
    logger.info(f"Abfrage-Intervall: {poll_interval} Sekunden")

    # Eigener User-Agent, um nicht sofort als generischer Python-Bot geblockt zu werden
    user_agent = config.REDDIT_USER_AGENT
    feedparser.USER_AGENT = user_agent

    while True:
        try:
            for i, url in enumerate(urls):
                sub_name = subs[i]
                logger.debug(f"Frage RSS ab: {sub_name}")
                
                # Fetch und Parse
                feed = feedparser.parse(url)
                
                if feed.bozo and hasattr(feed, 'bozo_exception'):
                    # Manchmal wirft reddit 429 Too Many Requests per RSS
                    logger.warning(f"Fehler beim Lesen des Feeds {sub_name}: {feed.bozo_exception}")
                    continue

                for entry in reversed(feed.entries):  # Aelteste zuerst, um Chronologie zu wahren
                    entry_id = entry.id
                    
                    if entry_id not in seen_ids:
                        seen_ids.add(entry_id)
                        
                        # Set begrenzen um Memory Leak zu vermeiden
                        if len(seen_ids) > 2000:
                            # Wir leeren das Set teilweise (einfach halbiert)
                            seen_ids = set(list(seen_ids)[-1000:])
                        
                        # Titel und Inhalt kombinieren
                        title = entry.title
                        content_html = entry.description if hasattr(entry, 'description') else ""
                        content = strip_html(content_html)
                        
                        full_text = f"{title}\n\n{content}"
                        
                        yield {
                            "subreddit": sub_name,
                            "type": "submission",
                            "text": full_text,
                            "title": title,
                            "author": entry.author if hasattr(entry, 'author') else "unknown"
                        }
                        
            time.sleep(poll_interval)
            
        except Exception as e:
            logger.error(f"Unerwarteter Fehler im RSS-Stream: {e}")
            logger.info("Warte 60 Sekunden bis zum naechsten Versuch...")
            time.sleep(60)
