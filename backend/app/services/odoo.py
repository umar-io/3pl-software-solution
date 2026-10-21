# THIS IS WHERE ANY REQUEST SENT TO ODOO SERVER VERSION 17.00 IS HANDLED..

import os
import threading
import xmlrpc.client

from dotenv import load_dotenv

load_dotenv()


class OdooClient:
    def __init__(self):
        self.url = os.getenv("ODOO_URL")
        self.db = os.getenv("ODOO_DB")
        self.username = os.getenv("ODOO_USERNAME")
        self.password = os.getenv("ODOO_PASSWORD")

        self.common = xmlrpc.client.ServerProxy(
            f"{self.url}/xmlrpc/2/common"
        )

        self.models = xmlrpc.client.ServerProxy(
            f"{self.url}/xmlrpc/2/object"
        )

        # ServerProxy shares one HTTP connection, so serialise calls across threads.
        self._lock = threading.RLock()

        self.uid = self.common.authenticate(
            self.db,
            self.username,
            self.password,
            {},
        )

        if not self.uid:
            raise Exception("Failed to authenticate with Odoo")

    def call(self, model, method, args=None, kwargs=None):
        with self._lock:
            return self.models.execute_kw(
                self.db,
                self.uid,
                self.password,
                model,
                method,
                args or [],
                kwargs or {},
            )

    def search_read(
        self,
        model,
        domain=None,
        fields=None,
        limit=None,
        order=None,
    ):
        options = {"fields": fields or []}
        if limit is not None:
            options["limit"] = limit
        if order:
            options["order"] = order
        return self.call(model, "search_read", [domain or []], options)

    def search_count(self, model, domain=None):
        return self.call(model, "search_count", [domain or []])

    def read(self, model, ids, fields=None):
        return self.call(model, "read", [ids], {"fields": fields or []})

    def message_post(self, model, ids, body):
        return self.call(
            model,
            "message_post",
            [ids],
            {"body": body, "message_type": "comment"},
        )


_client: OdooClient | None = None


def get_odoo_client() -> OdooClient:
    """Shared, lazily-created client so the app can boot before Odoo is ready."""
    global _client
    if _client is None:
        if os.getenv("DEMO_MODE") == "1":
            from app.services.demo_odoo import SnapshotOdooClient

            _client = SnapshotOdooClient()
        else:
            _client = OdooClient()
    return _client
