"""Canonical money arithmetic helpers.

All financial calculations must use Decimal with ROUND_HALF_UP
to avoid binary floating-point drift and inconsistent rounding semantics.
"""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation


MONEY_PRECISION = Decimal("0.01")


def money(value) -> Decimal:
    """Convert any value to a canonical Decimal money amount.

    Accepts int, float, str, Decimal, or None (treated as 0).
    Rounds to 2 decimal places using ROUND_HALF_UP.
    """
    if value is None:
        value = 0
    try:
        d = Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        d = Decimal(0)
    return d.quantize(MONEY_PRECISION, rounding=ROUND_HALF_UP)


def quantize(value: Decimal) -> Decimal:
    """Round a Decimal to the canonical money precision."""
    return value.quantize(MONEY_PRECISION, rounding=ROUND_HALF_UP)


ZERO = money(0)
