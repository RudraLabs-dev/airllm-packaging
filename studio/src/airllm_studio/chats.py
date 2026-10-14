"""Conversation history, stored server-side in SQLite so every window/browser sees the same chats."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    messages   TEXT NOT NULL DEFAULT '[]',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_updated ON chats(updated_at DESC);
"""
MAX_TITLE = 120


class ChatStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            self._db.execute("PRAGMA journal_mode=WAL")

    @staticmethod
    def _row(row: sqlite3.Row, with_messages: bool) -> dict:
        out = {k: row[k] for k in ("id", "title", "model", "created_at", "updated_at")}
        if with_messages:
            out["messages"] = json.loads(row["messages"])
        return out

    def list(self, limit: int = 500) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM chats ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [self._row(r, False) for r in rows]

    def get(self, chat_id: str) -> dict | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
        return self._row(row, True) if row else None

    def create(self, title: str = "", model: str = "", messages: list | None = None) -> dict:
        now = time.time()
        chat_id = uuid.uuid4().hex
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO chats (id, title, model, messages, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                (chat_id, title[:MAX_TITLE], model, json.dumps(messages or []), now, now))
        return self.get(chat_id)

    def update(self, chat_id: str, title: str | None = None, model: str | None = None,
               messages: list | None = None) -> dict | None:
        current = self.get(chat_id)
        if current is None:
            return None
        title = current["title"] if title is None else title[:MAX_TITLE]
        model = current["model"] if model is None else model
        msgs = current["messages"] if messages is None else messages
        with self._lock, self._db:
            self._db.execute(
                "UPDATE chats SET title = ?, model = ?, messages = ?, updated_at = ? WHERE id = ?",
                (title, model, json.dumps(msgs), time.time(), chat_id))
        return self.get(chat_id)

    def delete(self, chat_id: str) -> bool:
        with self._lock, self._db:
            cur = self._db.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
        return cur.rowcount > 0

    def clear(self) -> int:
        with self._lock, self._db:
            cur = self._db.execute("DELETE FROM chats")
        return cur.rowcount

    def close(self) -> None:
        with self._lock:
            self._db.close()
