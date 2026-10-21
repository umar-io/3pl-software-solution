import logging
import os

import requests

from odoo import api, models

_logger = logging.getLogger(__name__)

DEFAULT_WEBHOOK_URL = "http://host.docker.internal:8001/api/webhooks/odoo"


def _notify_fulfill(order_ids):
    """Post newly created orders to the 3PL backend.

    Runs after the transaction is committed, so the backend can read the
    order over XML-RPC (posting inside create() would race the commit).
    """
    webhook_url = os.getenv("FULFILL_WEBHOOK_URL", DEFAULT_WEBHOOK_URL)
    secret = os.getenv("FULFILL_WEBHOOK_SECRET", "")
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Webhook-Secret"] = secret

    for order_id in order_ids:
        try:
            response = requests.post(
                webhook_url,
                json={"order_id": order_id},
                headers=headers,
                timeout=5,
            )
            _logger.info(
                "3PL webhook for sale.order %s -> %s",
                order_id,
                response.status_code,
            )
        except Exception as error:  # pragma: no cover - demo resilience
            _logger.warning(
                "3PL webhook failed for sale.order %s: %s",
                order_id,
                error,
            )


class SaleOrder(models.Model):
    _inherit = "sale.order"

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        order_ids = records.ids
        if order_ids:
            self.env.cr.postcommit.add(
                lambda ids=list(order_ids): _notify_fulfill(ids)
            )
        return records
