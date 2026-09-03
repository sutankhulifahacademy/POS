"""Online Platform Settlement Calculation Engine.

Calculates platform fees, expected settlement, COGS, profit, and margins
for online marketplace orders (GrabFood, GoFood, ShopeeFood).

All fee components are configurable per platform + outlet + effective date.
This engine does NOT hardcode any commission rates.
"""
from datetime import date
from typing import Optional
from database import q_one, q_all
from services.money import money, ZERO


async def get_fee_config(platform_id: str, outlet_id: str = None, order_date: date = None) -> Optional[dict]:
    """
    Get the applicable fee config for a platform + outlet + date.

    Priority:
        1. Outlet-specific config with effective_date <= order_date (and end_date is NULL or > order_date)
        2. Global config (outlet_id IS NULL) with effective_date <= order_date

    Returns None if no config found.
    """
    if order_date is None:
        order_date = date.today()

    # Try outlet-specific first
    if outlet_id:
        row = await q_one("""
            SELECT * FROM platform_fee_configs
            WHERE platform_id = :pid
              AND outlet_id = :oid
              AND is_active = TRUE
              AND effective_date <= :od
              AND (end_date IS NULL OR end_date > :od)
            ORDER BY effective_date DESC
            LIMIT 1
        """, pid=platform_id, oid=outlet_id, od=order_date)
        if row:
            return dict(row)

    # Fall back to global default
    row = await q_one("""
        SELECT * FROM platform_fee_configs
        WHERE platform_id = :pid
          AND outlet_id IS NULL
          AND is_active = TRUE
          AND effective_date <= :od
          AND (end_date IS NULL OR end_date > :od)
        ORDER BY effective_date DESC
        LIMIT 1
    """, pid=platform_id, od=order_date)
    if row:
        return dict(row)

    return None


def calculate_settlement(
    gross_sales,
    config: dict,
    merchant_promo_override=None,
    advertising_override=None,
) -> dict:
    """
    Calculate full settlement breakdown from gross sales + fee config.

    Returns dict with all fee components, total deduction, expected settlement,
    effective fee %, etc. Monetary values are rounded with Decimal/ROUND_HALF_UP.

    config must contain:
        commission_pct, fixed_fee, tax_on_fee_pct,
        promo_merchant_pct, promo_platform_pct,
        advertising_fee, other_fee_pct, other_fixed_fee,
        fee_calc_base
    """
    gross = money(gross_sales)
    commission_pct = float(config.get("commission_pct") or 0)
    fixed_fee = money(config.get("fixed_fee") or 0)
    tax_on_fee_pct = float(config.get("tax_on_fee_pct") or 0)
    promo_merchant_pct = float(config.get("promo_merchant_pct") or 0)
    promo_platform_pct = float(config.get("promo_platform_pct") or 0)
    advertising_fee = money(config.get("advertising_fee") or 0)
    other_fee_pct = float(config.get("other_fee_pct") or 0)
    other_fixed_fee = money(config.get("other_fixed_fee") or 0)
    fee_calc_base = config.get("fee_calc_base") or "gross"

    # Merchant promo
    if merchant_promo_override is not None:
        merchant_promo = money(merchant_promo_override)
    else:
        merchant_promo = money(gross * promo_merchant_pct / 100)
    platform_promo = money(gross * promo_platform_pct / 100)

    # Fee calculation base
    if fee_calc_base == "after_merchant_discount":
        fee_base = gross - merchant_promo
    elif fee_calc_base == "net":
        fee_base = gross - merchant_promo - platform_promo
    else:  # gross or settlement_defined
        fee_base = gross

    # Commission
    commission_amount = money(fee_base * commission_pct / 100)

    # Other percentage fee
    other_fee = money(fee_base * other_fee_pct / 100) + other_fixed_fee

    # Advertising
    if advertising_override is not None:
        adv = money(advertising_override)
    else:
        adv = advertising_fee

    # Tax on fee (commission only — per spec examples)
    tax_on_fee = money(commission_amount * tax_on_fee_pct / 100)

    # Total deduction
    total_deduction = (
        commission_amount
        + fixed_fee
        + tax_on_fee
        + merchant_promo
        + adv
        + other_fee
    )

    # Expected settlement
    expected_settlement = gross - total_deduction

    # Effective fee %
    effective_fee_pct = (total_deduction / gross * 100) if gross > ZERO else 0

    return {
        "gross_sales": float(money(gross)),
        "commission_amount": float(money(commission_amount)),
        "fixed_fee": float(money(fixed_fee)),
        "tax_on_fee": float(money(tax_on_fee)),
        "merchant_promo": float(money(merchant_promo)),
        "platform_promo": float(money(platform_promo)),
        "advertising_fee": float(money(adv)),
        "other_fee": float(money(other_fee)),
        "total_deduction": float(money(total_deduction)),
        "expected_settlement": float(money(expected_settlement)),
        "effective_fee_pct": round(float(effective_fee_pct), 2),
    }


def calculate_profit(settlement: dict, total_cogs) -> dict:
    """Calculate profit + margins from settlement + COGS."""
    expected = money(settlement.get("expected_settlement") or 0)
    gross = money(settlement.get("gross_sales") or 0)
    cogs = money(total_cogs or 0)

    profit = expected - cogs
    profit_margin = (profit / gross * 100) if gross > ZERO else 0
    margin_on_settlement = (profit / expected * 100) if expected > ZERO else 0

    return {
        "total_cogs": float(money(cogs)),
        "gross_profit": float(money(profit)),
        "profit_margin": round(float(profit_margin), 2),
        "margin_on_settlement": round(float(margin_on_settlement), 2),
    }


def calculate_break_even_price(
    cogs: float,
    config: dict,
    target_profit: float = 0,
) -> dict:
    """
    Calculate minimum / recommended online price to break even or achieve target profit.

    For percentage-only fees:
        min_price = cogs / (1 - variable_fee_pct)

    With fixed fees:
        recommended = (cogs + fixed_fee + target_profit) / (1 - variable_fee_pct)
    """
    commission_pct = float(config.get("commission_pct") or 0)
    tax_on_fee_pct = float(config.get("tax_on_fee_pct") or 0)
    other_fee_pct = float(config.get("other_fee_pct") or 0)
    fixed_fee = float(config.get("fixed_fee") or 0)
    other_fixed_fee = float(config.get("other_fixed_fee") or 0)
    advertising_fee = float(config.get("advertising_fee") or 0)

    # Effective variable fee percentage (commission + tax on commission + other %)
    variable_fee_pct = (commission_pct * (1 + tax_on_fee_pct / 100)) + other_fee_pct
    variable_fee_decimal = variable_fee_pct / 100

    total_fixed = fixed_fee + other_fixed_fee + advertising_fee

    if variable_fee_decimal >= 1:
        return {
            "break_even_price": None,
            "recommended_price": None,
            "error": "Variable fee >= 100%, cannot calculate break-even",
        }

    break_even = (cogs + total_fixed) / (1 - variable_fee_decimal)
    recommended = (cogs + total_fixed + target_profit) / (1 - variable_fee_decimal)

    return {
        "break_even_price": round(break_even, 2),
        "recommended_price": round(recommended, 2),
        "variable_fee_pct": round(variable_fee_pct, 2),
        "total_fixed_cost": round(total_fixed, 2),
        "target_profit": round(target_profit, 2),
    }
