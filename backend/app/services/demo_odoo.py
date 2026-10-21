"""A read-only stand-in for OdooClient that answers from a JSON snapshot.

It implements just the calls the services make (search_read, read,
search_count) with a small domain evaluator, so the real service code runs
unchanged in demo mode. Anything that would write raises DemoReadOnly.
"""

import operator
import re

from app.services.clock import load_snapshot


class DemoReadOnly(Exception):
    def __init__(self, what: str = "This action"):
        super().__init__(f"{what} is disabled: Odoo is read-only in the public demo.")


def _plain(value):
    """Many2one values arrive as [id, name]; compare on the id."""
    if isinstance(value, (list, tuple)) and len(value) == 2 and isinstance(value[0], int):
        return value[0]
    return value


def _like(pattern: str, value, case: bool) -> bool:
    if not isinstance(value, str):
        return False
    regex = re.escape(pattern).replace("%", ".*").replace("_", ".")
    return re.fullmatch(regex if "%" in pattern else f".*{regex}.*", value, 0 if case else re.I) is not None


_CMP = {
    "=": operator.eq,
    "!=": operator.ne,
    ">=": operator.ge,
    "<=": operator.le,
    ">": operator.gt,
    "<": operator.lt,
}


def _match(record: dict, term) -> bool:
    field, op, wanted = term
    value = _plain(record.get(field, False))
    if op in ("in", "not in"):
        hit = value in [_plain(w) for w in wanted]
        return hit if op == "in" else not hit
    if op in ("like", "ilike"):
        return _like(wanted, value, op == "like")
    if op in _CMP:
        if op in ("=", "!="):
            return _CMP[op](value, _plain(wanted))
        if value is False or value is None:
            return False
        return _CMP[op](value, wanted)
    raise NotImplementedError(f"Demo snapshot does not support operator {op!r}")


def _sort_key(value):
    """Empty values group together; everything else compares in its own type."""
    value = _plain(value)
    return (value in (False, None), 0 if value in (False, None) else value)


class SnapshotOdooClient:
    def __init__(self):
        self.data: dict[str, list[dict]] = load_snapshot()["odoo"]

    def _rows(self, model: str, domain) -> list[dict]:
        if model not in self.data:
            raise NotImplementedError(f"Demo snapshot has no model {model!r}")
        terms = [t for t in (domain or []) if not isinstance(t, str)]  # '&' only; no '|'
        if len(terms) != len(domain or []):
            raise NotImplementedError("Demo snapshot supports AND-only domains")
        return [r for r in self.data[model] if all(_match(r, t) for t in terms)]

    @staticmethod
    def _project(record: dict, fields) -> dict:
        if not fields:
            return dict(record)
        return {"id": record["id"], **{f: record.get(f, False) for f in fields}}

    def search_read(self, model, domain=None, fields=None, limit=None, order=None):
        rows = self._rows(model, domain)
        for clause in reversed([c.strip() for c in (order or "").split(",") if c.strip()]):
            field, _, direction = clause.partition(" ")
            # Stable sorts applied from the last key to the first give a multi-key order.
            rows.sort(
                key=lambda r, f=field: _sort_key(r.get(f)),
                reverse=direction.strip().lower() == "desc",
            )
        if limit is not None:
            rows = rows[:limit]
        return [self._project(r, fields) for r in rows]

    def search_count(self, model, domain=None):
        return len(self._rows(model, domain))

    def read(self, model, ids, fields=None):
        wanted = set(ids)
        return [self._project(r, fields) for r in self.data.get(model, []) if r["id"] in wanted]

    # Everything below would change Odoo.
    def call(self, model, method, args=None, kwargs=None):
        raise DemoReadOnly(f"{model}.{method}")

    def message_post(self, model, ids, body):
        raise DemoReadOnly("Posting to Odoo")
