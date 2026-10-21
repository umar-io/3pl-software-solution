import random
from datetime import datetime, timedelta

import odoo
from odoo import api, SUPERUSER_ID
from odoo.tools import config


DB_NAME = "umar-odoo"


PRODUCTS = [
    {
        "name": "Vitamin C Serum",
        "default_code": "GC-001",
        "price": 12500,
        "category": "Skincare",
        "stock": 84,
    },
    {
        "name": "Hydrating Face Cream",
        "default_code": "GC-002",
        "price": 9500,
        "category": "Skincare",
        "stock": 126,
    },
    {
        "name": "SPF 50 Sunscreen",
        "default_code": "GC-003",
        "price": 11000,
        "category": "Skincare",
        "stock": 57,
    },
    {
        "name": "Gentle Face Cleanser",
        "default_code": "GC-004",
        "price": 7500,
        "category": "Skincare",
        "stock": 143,
    },
    {
        "name": "Classic Black T-Shirt",
        "default_code": "UT-001",
        "price": 15000,
        "category": "Fashion",
        "stock": 92,
    },
    {
        "name": "Oversized Hoodie",
        "default_code": "UT-002",
        "price": 28000,
        "category": "Fashion",
        "stock": 34,
    },
    {
        "name": "Cargo Pants",
        "default_code": "UT-003",
        "price": 32000,
        "category": "Fashion",
        "stock": 48,
    },
    {
        "name": "Scented Candle",
        "default_code": "HN-001",
        "price": 8500,
        "category": "Home & Living",
        "stock": 215,
    },
    {
        "name": "Ceramic Mug",
        "default_code": "HN-002",
        "price": 6000,
        "category": "Home & Living",
        "stock": 76,
    },
    {
        "name": "Throw Pillow",
        "default_code": "HN-003",
        "price": 12000,
        "category": "Home & Living",
        "stock": 41,
    },
]


MERCHANTS = [
    {
        "name": "Glow Cosmetics",
        "email": "ops@glowcosmetics.example",
        "phone": "+234 801 000 1001",
    },
    {
        "name": "Urban Threads",
        "email": "ops@urbanthreads.example",
        "phone": "+234 801 000 1002",
    },
    {
        "name": "HomeNest",
        "email": "ops@homenest.example",
        "phone": "+234 801 000 1003",
    },
]


CUSTOMERS = [
    ("David Adewale", "Lekki"),
    ("Sarah Johnson", "Ikeja"),
    ("Chinedu Okafor", "Yaba"),
    ("Aisha Bello", "Surulere"),
    ("Emeka Nwosu", "Ajah"),
    ("Tolu Williams", "Gbagada"),
    ("Michael Okoro", "Maryland"),
    ("Blessing Eze", "Ikorodu"),
    ("Daniel James", "Victoria Island"),
    ("Amaka Obi", "Magodo"),
    ("Samuel Peter", "Yaba"),
    ("Grace Umeh", "Lekki"),
]


def get_or_create_category(env, name):
    category = env["product.category"].search(
        [("name", "=", name)],
        limit=1,
    )

    if not category:
        category = env["product.category"].create({
            "name": name,
        })

    return category


def get_or_create_partner(env, name, email=None, phone=None):
    partner = env["res.partner"].search(
        [("name", "=", name)],
        limit=1,
    )

    if not partner:
        partner = env["res.partner"].create({
            "name": name,
            "email": email,
            "phone": phone,
            "company_type": "company",
        })

    return partner


def create_products(env):
    print("\nCreating products...")

    products = []

    for data in PRODUCTS:
        existing = env["product.product"].search(
            [("default_code", "=", data["default_code"])],
            limit=1,
        )

        if existing:
            product = existing
            print(f"  ✓ {data['default_code']} already exists")
        else:
            category = get_or_create_category(
                env,
                data["category"],
            )

            product_template = env["product.template"].create({
                "name": data["name"],
                "default_code": data["default_code"],
                "list_price": data["price"],
                "categ_id": category.id,
                "is_storable": True,
            })

            product = product_template.product_variant_id

            print(f"  + Created {data['default_code']} - {data['name']}")

        products.append((product, data["stock"]))

    return products


def set_stock(env, products):
    print("\nSetting inventory...")

    warehouse = env["stock.warehouse"].search([], limit=1)

    if not warehouse:
        raise RuntimeError(
            "No warehouse found. Create a warehouse in Odoo first."
        )

    stock_location = warehouse.lot_stock_id

    for product, quantity in products:
        existing_quant = env["stock.quant"].search([
            ("product_id", "=", product.id),
            ("location_id", "=", stock_location.id),
        ], limit=1)

        if existing_quant:
            existing_quant.inventory_quantity = quantity
            existing_quant.action_apply_inventory()
        else:
            quant = env["stock.quant"].create({
                "product_id": product.id,
                "location_id": stock_location.id,
                "inventory_quantity": quantity,
            })

            quant.action_apply_inventory()

        print(
            f"  ✓ {product.default_code}: "
            f"{quantity} units"
        )


def create_merchants(env):
    print("\nCreating merchants...")

    merchants = []

    for data in MERCHANTS:
        merchant = get_or_create_partner(
            env,
            data["name"],
            data["email"],
            data["phone"],
        )

        merchants.append(merchant)

        print(f"  ✓ {merchant.name}")

    return merchants


def create_customers(env):
    print("\nCreating customers...")

    customers = []

    for name, city in CUSTOMERS:
        customer = env["res.partner"].search(
            [("name", "=", name)],
            limit=1,
        )

        if not customer:
            customer = env["res.partner"].create({
                "name": name,
                "city": city,
                "country_id": env.ref("base.ng").id,
                "company_type": "person",
            })

        customers.append(customer)

        print(f"  ✓ {name} ({city})")

    return customers


def create_orders(env, products, merchants, customers):
    print("\nCreating sales orders...")

    sale_order_model = env["sale.order"]

    order_count = 20

    for i in range(order_count):
        merchant = random.choice(merchants)
        customer = random.choice(customers)

        selected_products = random.sample(
            products,
            random.randint(1, 3),
        )

        order_lines = []

        for product, _ in selected_products:
            quantity = random.randint(1, 3)

            order_lines.append((0, 0, {
                "product_id": product.id,
                "product_uom_qty": quantity,
                "price_unit": product.list_price,
            }))

        order_name = f"3PL-{1001 + i}"

        existing = sale_order_model.search(
            [("client_order_ref", "=", order_name)],
            limit=1,
        )

        if existing:
            print(f"  ✓ {order_name} already exists")
            continue

        order = sale_order_model.create({
            "partner_id": customer.id,
            "client_order_ref": order_name,
            "order_line": order_lines,
        })

        order.action_confirm()

        print(
            f"  + {order_name} | "
            f"{merchant.name} | "
            f"{customer.name}"
        )


def main():
    print("=" * 60)
    print("FULFILL 3PL - ODOO DATA SEED")
    print("=" * 60)

    config.parse_config([
        "--db_host=db",
        "--db_port=5432",
        "--db_user=odoo",
        "--db_password=odoo",
    ])

    registry = odoo.registry(DB_NAME)

    with registry.cursor() as cr:
        env = api.Environment(
            cr,
            SUPERUSER_ID,
            {},
        )

        products = create_products(env)

        set_stock(
            env,
            products,
        )

        merchants = create_merchants(env)

        customers = create_customers(env)

        create_orders(
            env,
            products,
            merchants,
            customers,
        )

        cr.commit()

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    main()
