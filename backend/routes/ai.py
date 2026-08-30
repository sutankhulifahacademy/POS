"""
AI routes — Business Assistant, Daily Briefing, Anomaly Detection, Forecasting.
All responses are data-driven from database queries. No hallucination.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from routes.deps import *
from routes.auth import require_permission

router = APIRouter()


class AIQuestion(BaseModel):
    question: str
    outlet_id: Optional[str] = None


# ============ AI ASSISTANT ============
@router.post("/ai/assistant")
async def ai_assistant(
    body: AIQuestion,
    user=Depends(require_permission("ai", "query")),
):
    """
    AI Business Assistant — answer business questions based on database data.
    No hallucination: all answers come from actual queries.
    Respects outlet authorization.
    """
    from services.ai_service import ai_assistant as _assistant
    result = await _assistant(body.question, user, body.outlet_id)
    return result


# ============ AI DAILY BRIEFING ============
@router.get("/ai/daily-briefing")
async def ai_daily_briefing(
    outlet_id: Optional[str] = None,
    user=Depends(require_permission("ai", "briefing")),
):
    """
    AI Daily Briefing — summary of today's business performance.
    All numbers come from database.
    """
    from services.ai_service import ai_daily_briefing as _briefing
    result = await _briefing(user, outlet_id)
    return result


# ============ AI ANOMALY DETECTION ============
@router.get("/ai/anomalies")
async def ai_anomalies(
    outlet_id: Optional[str] = None,
    user=Depends(require_permission("ai", "anomaly")),
):
    """
    AI Anomaly Detection — detect unusual patterns in sales, discount, stock.
    Only reports anomalies, not fraud accusations.
    """
    from services.ai_service import ai_anomaly_detection as _anomaly
    result = await _anomaly(user, outlet_id)
    return result


# ============ AI FORECASTING ============
@router.get("/ai/forecast")
async def ai_forecast(
    days: int = Query(7, ge=1, le=30),
    outlet_id: Optional[str] = None,
    user=Depends(require_permission("ai", "forecast")),
):
    """
    AI Forecasting — predict future sales based on historical data.
    Uses moving average. Confidence based on data variance.
    Returns 'Insufficient historical data' if less than 7 days of data.
    """
    from services.ai_service import ai_forecast as _forecast
    result = await _forecast(user, outlet_id, days)
    return result
