#!/usr/bin/env python3
"""
Omni Sync Worker — Python-based periodic sync for all active integrations.

Runs on a configurable interval (default: 30 min) and:
  1. Triggers the sync-drive Supabase Edge Function to pull fresh Google Drive content
  2. Logs sync health / status for monitoring

Environment variables required (from .env):
  VITE_SUPABASE_URL          — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key (never hardcode this)
  SYNC_INTERVAL              — Seconds between sync cycles (optional, default 1800)
"""

import os
import time
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [OMNI-SYNC] %(levelname)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
SUPABASE_URL      = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SYNC_INTERVAL     = int(os.environ.get("SYNC_INTERVAL", "1800"))   # 30 min default


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type":  "application/json",
        "apikey":        SERVICE_ROLE_KEY,
    }


def trigger_sync_all() -> bool:
    """Call the sync-drive Edge Function with action=sync_all."""
    import urllib.request
    import json

    url     = f"{SUPABASE_URL}/functions/v1/sync-drive"
    payload = json.dumps({"action": "sync_all"}).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers=_headers(),
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=55) as resp:
            body = resp.read().decode()
            logger.info(f"✅ sync-drive responded {resp.status}: {body[:200]}")
            return True

    except urllib.error.HTTPError as exc:
        body = exc.read().decode() if exc.fp else ""
        logger.warning(f"⚠️  sync-drive HTTP {exc.code}: {body[:200]}")
        return False

    except TimeoutError:
        # Edge Function is still running in the background — this is normal.
        logger.info("⏳ sync-drive timed out (still running in background) — OK")
        return True

    except Exception as exc:
        logger.error(f"❌ sync-drive call failed: {exc}")
        return False


def check_env() -> bool:
    if not SUPABASE_URL:
        logger.error("❌ VITE_SUPABASE_URL is not set")
        return False
    if not SERVICE_ROLE_KEY:
        logger.error("❌ SUPABASE_SERVICE_ROLE_KEY is not set")
        return False
    return True


def run_cycle():
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    logger.info(f"🔄 Sync cycle starting at {ts}")

    if not check_env():
        logger.warning("Skipping cycle — environment not ready")
        return

    trigger_sync_all()
    logger.info(f"🏁 Cycle done. Next run in {SYNC_INTERVAL // 60} min.")


def main():
    logger.info("=" * 60)
    logger.info("🌐  Omni Sync Worker starting")
    logger.info(f"    Supabase : {(SUPABASE_URL or 'NOT SET')[:50]}")
    logger.info(f"    Key set  : {'yes' if SERVICE_ROLE_KEY else 'NO — set SUPABASE_SERVICE_ROLE_KEY'}")
    logger.info(f"    Interval : {SYNC_INTERVAL}s  ({SYNC_INTERVAL // 60} min)")
    logger.info("=" * 60)

    # Run immediately on startup, then loop
    run_cycle()

    while True:
        time.sleep(SYNC_INTERVAL)
        run_cycle()


if __name__ == "__main__":
    main()
