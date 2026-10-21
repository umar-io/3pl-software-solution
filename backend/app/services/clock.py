"""One place for "what time is it".

In demo mode the data is a snapshot, so time is frozen at the moment the
snapshot was taken. That keeps ages, 30-day windows and trend dates consistent
no matter when the demo is viewed.
"""

import json
import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

DEFAULT_SNAPSHOT = Path(__file__).resolve().parent.parent / "demo" / "snapshot.json"


def demo_mode() -> bool:
    return os.getenv("DEMO_MODE") == "1"


def snapshot_path() -> Path:
    return Path(os.getenv("DEMO_SNAPSHOT", DEFAULT_SNAPSHOT))


@lru_cache(maxsize=1)
def load_snapshot() -> dict:
    with open(snapshot_path(), encoding="utf-8") as fh:
        return json.load(fh)


def now() -> datetime:
    """Timezone-aware current time (frozen to the snapshot in demo mode)."""
    if demo_mode():
        return datetime.fromisoformat(load_snapshot()["taken_at"])
    return datetime.now(timezone.utc)


def utcnow_naive() -> datetime:
    return now().astimezone(timezone.utc).replace(tzinfo=None)
