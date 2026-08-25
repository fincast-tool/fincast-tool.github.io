"""
Abracadabra - Reddit Ingestion Modul
=====================================
Streamt Submissions und Kommentare aus den konfigurierten Subreddits
via PRAW. Enthält einen Spam-Filter basierend auf Account-Alter und Karma.
"""

import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Generator

import praw
from praw.models import Submission, Comment

import config

logger = logging.getLogger("abracadabra.reddit")


def create_reddit_client() -> praw.Reddit:
    """
    Erstellt und gibt eine authentifizierte Reddit-Instanz zurück.
    Nutzt 'read-only'-Modus (kein Login nötig, nur API-Keys).
    """
    try:
        reddit = praw.Reddit(
            client_id=config.REDDIT_CLIENT_ID,
            client_secret=config.REDDIT_CLIENT_SECRET,
            user_agent=config.REDDIT_USER_AGENT,
        )
        # Verbindungstest
        reddit.read_only = True
        logger.info("Reddit-Client erfolgreich erstellt (read-only).")
        return reddit
    except Exception as e:
        logger.critical(f"Reddit-Client konnte nicht erstellt werden: {e}")
        raise


def _is_spam_account(author) -> bool:
    """
    Prüft, ob ein Reddit-Account als Spam eingestuft wird.
    Kriterien: Account-Alter < MIN_ACCOUNT_AGE_DAYS oder Karma < MIN_ACCOUNT_KARMA.
    
    Gibt True zurück, wenn der Account Spam ist (→ ignorieren).
    """
    if author is None:
        # Gelöschte Accounts → ignorieren
        return True

    try:
        # Account-Alter prüfen
        account_created = datetime.fromtimestamp(author.created_utc, tz=timezone.utc)
        account_age = datetime.now(tz=timezone.utc) - account_created

        if account_age < timedelta(days=config.MIN_ACCOUNT_AGE_DAYS):
            logger.debug(f"Spam-Filter: Account '{author.name}' ist zu jung ({account_age.days} Tage).")
            return True

        # Karma prüfen (comment_karma + link_karma)
        total_karma = getattr(author, "comment_karma", 0) + getattr(author, "link_karma", 0)
        if total_karma < config.MIN_ACCOUNT_KARMA:
            logger.debug(f"Spam-Filter: Account '{author.name}' hat zu wenig Karma ({total_karma}).")
            return True

        return False

    except Exception as e:
        # Bei suspendierten / gelöschten Accounts kann PRAW Fehler werfen
        logger.debug(f"Spam-Filter-Fehler bei Account-Prüfung: {e}")
        return True


def stream_submissions(reddit: praw.Reddit) -> Generator[dict, None, None]:
    """
    Streamt neue Submissions aus den konfigurierten Subreddits.
    Gibt normalisierte Dicts mit Text, Subreddit und Metadaten zurück.
    
    Bei Verbindungsabbrüchen wird automatisch neu verbunden (Retry).
    """
    subreddit = reddit.subreddit(config.SUBREDDITS)
    logger.info(f"Starte Submission-Stream für: r/{config.SUBREDDITS}")

    while True:
        try:
            # skip_existing=True → nur brandneue Posts ab jetzt
            for submission in subreddit.stream.submissions(skip_existing=True, pause_after=-1):
                if submission is None:
                    # pause_after=-1 gibt None zurück, wenn keine neuen Posts da sind
                    break

                # Spam-Filter anwenden
                if _is_spam_account(submission.author):
                    continue

                # Titel + Selftext kombinieren für maximale Ticker-Erkennung
                full_text = f"{submission.title} {submission.selftext or ''}"

                yield {
                    "type": "submission",
                    "text": full_text,
                    "subreddit": str(submission.subreddit),
                    "author": str(submission.author),
                    "score": submission.score,
                    "url": submission.url,
                    "created_utc": submission.created_utc,
                    "id": submission.id,
                }

        except Exception as e:
            logger.error(f"Fehler im Submission-Stream: {e}. Neuverbindung in 30s...")
            time.sleep(30)


def stream_comments(reddit: praw.Reddit) -> Generator[dict, None, None]:
    """
    Streamt neue Kommentare aus den konfigurierten Subreddits.
    Gibt normalisierte Dicts mit Text, Subreddit und Metadaten zurück.
    """
    subreddit = reddit.subreddit(config.SUBREDDITS)
    logger.info(f"Starte Kommentar-Stream für: r/{config.SUBREDDITS}")

    while True:
        try:
            for comment in subreddit.stream.comments(skip_existing=True, pause_after=-1):
                if comment is None:
                    break

                # Spam-Filter anwenden
                if _is_spam_account(comment.author):
                    continue

                yield {
                    "type": "comment",
                    "text": comment.body or "",
                    "subreddit": str(comment.subreddit),
                    "author": str(comment.author),
                    "score": comment.score,
                    "url": f"https://reddit.com{comment.permalink}",
                    "created_utc": comment.created_utc,
                    "id": comment.id,
                }

        except Exception as e:
            logger.error(f"Fehler im Kommentar-Stream: {e}. Neuverbindung in 30s...")
            time.sleep(30)
