"""Online Platform Settlement Calculation Engine.

Calculates platform fees, expected settlement, COGS, profit, and margins
for online marketplace orders (GrabFood, GoFood, ShopeeFood).

All fee components are configurable per platform + outlet + effective date.
This engine does NOT hardcode any commission rates.
"""
from datetime import date
from typing import Optional
from database import q_one, q_all


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
    gross_sales: float,
    config: dict,
    merchant_promo_override: float = None,
    advertising_override: float = None,
) -> dict:
    """
    Calculate full settlement breakdown from gross sales + fee config.

    Returns dict with all fee components, total deduction, expected settlement,
    effective fee %, etc.

    config must contain:
        commission_pct, fixed_fee, tax_on_fee_pct,
        promo_merchant_pct, promo_platform_pct,
        advertising_fee, other_fee_pct, other_fixed_fee,
        fee_calc_base
    """
    gross = float(gross_sales or 0)
    commission_pct = float(config.get("commission_pct") or 0)
    fixed_fee = float(config.get("fixed_fee") or 0)
    tax_on_fee_pct = float(config.get("tax_on_fee_pct") or 0)
    promo_merchant_pct = float(config.get("promo_merchant_pct") or 0)
    promo_platform_pct = float(config.get("promo_platform_pct") or 0)
    advertising_fee = float(config.get("advertising_fee") or 0)
    other_fee_pct = float(config.get("other_fee_pct") or 0)
    other_fixed_fee = float(config.get("other_fixed_fee") or 0)
    fee_calc_base = config.get("fee_calc_base") or "gross"

    # Merchant promo
    merchant_promo = merchant_promo_override if merchant_promo_override is not None else gross * promo_merchant_pct / 100
    platform_promo = gross * promo_platform_pct / 100

    # Fee calculation base
    if fee_calc_base == "after_merchant_discount":
        fee_base = gross - merchant_promo
    elif fee_calc_base == "net":
        fee_base = gross - merchant_promo - platform_promo
    else:  # gross or settlement_defined
        fee_base = gross

    # Commission
    commission_amount = fee_base * commission_pct / 100

    # Other percentage fee
    other_fee = fee_base * other_fee_pct / 100 + other_fixed_fee

    # Advertising
    adv = advertising_override if advertising_override is not None else advertising_fee

    # Tax on fee (commission only — per spec examples)
    tax_on_fee = commission_amount * tax_on_fee_pct / 100

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
    effective_fee_pct = (total_deduction / gross * 100) if gross > 0 else 0

    return {
        "gross_sales": round(gross, 2),
        "commission_amount": round(commission_amount, 2),
        "fixed_fee": round(fixed_fee, 2),
        "tax_on_fee": round(tax_on_fee, 2),
        "merchant_promo": round(merchant_promo, 2),
        "platform_promo": round(platform_promo, 2),
        "advertising_fee": round(adv, 2),
        "other_fee": round(other_fee, 2),
        "total_deduction": round(total_deduction, 2),
        "expected_settlement": round(expected_settlement, 2),
        "effective_fee_pct": round(effective_fee_pct, 2),
    }


def calculate_profit(settlement: dict, total_cogs: float) -> dict:
    """Calculate profit + margins from settlement + COGS."""
    expected = float(settlement.get("expected_settlement") or 0)
    gross = float(settlement.get("gross_sales") or 0)
    cogs = float(total_cogs or 0)

    profit = expected - cogs
    profit_margin = (profit / gross * 100) if gross > 0 else 0
    margin_on_settlement = (profit / expected * 100) if expected > 0 else 0

    return {
        "total_cogs": round(cogs, 2),
        "gross_profit": round(profit, 2),
        "profit_margin": round(profit_margin, 2),
        "margin_on_settlement": round(margin_on_settlement, 2),
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
