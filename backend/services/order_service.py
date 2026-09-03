"""Order service — order total calculation helper."""


from services.money import money, ZERO


def _calc_total(items):
    """Calculate order total from items using canonical Decimal money arithmetic."""
    total = ZERO
    for i in items:
        price = money(i.get("price"))
        qty = int(i.get("quantity") or 0)
        total += price * qty
    return money(total)
