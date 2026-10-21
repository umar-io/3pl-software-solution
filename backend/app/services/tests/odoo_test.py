from app.services.odoo import OdooClient

odoo = OdooClient()

orders = odoo.search_read(
    "sale.order",
    fields=[
        "name",
        "partner_id",
        "amount_total",
        "state",
    ],
    limit=5,
)

for order in orders:
    print(order)