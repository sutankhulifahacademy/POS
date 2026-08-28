"""Order service — order total calculation helper."""


def _calc_total(items):
    return sum(float(i["price"]) * int(i["quantity"]) for i in items)
