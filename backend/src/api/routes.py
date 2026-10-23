from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..infrastructure.database import get_db, SessionRecord, AlertLog

router = APIRouter(prefix="/api")


@router.get("/status")
async def get_status():
    return {
        "status": "online",
        "service": "VigilEdge Edge Biometrics Monitor",
        "version": "1.0.0",
    }


@router.get("/history")
async def get_history(
    limit: int = 10, db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Returns recent monitoring sessions and ergonomic summary."""
    stmt = select(SessionRecord).order_by(desc(SessionRecord.id)).limit(limit)
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    output = []
    for s in sessions:
        posture_pct = 0.0
        if s.duration_seconds and s.duration_seconds > 0:
            posture_pct = min(100.0, (s.good_posture_seconds / s.duration_seconds) * 100.0)

        output.append({
            "id": s.id,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "duration_minutes": round(s.duration_seconds / 60.0, 1) if s.duration_seconds else 0.0,
            "good_posture_percentage": round(posture_pct, 1),
            "alert_count": s.alert_count,
            "microsleep_count": s.microsleep_count,
        })
    return output


@router.get("/alerts")
async def get_recent_alerts(
    limit: int = 20, db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Returns recent alert logs."""
    stmt = select(AlertLog).order_by(desc(AlertLog.id)).limit(limit)
    result = await db.execute(stmt)
    alerts = result.scalars().all()

    return [
        {
            "id": a.id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "alert_type": a.alert_type,
            "alert_level": a.alert_level,
            "message": a.message,
        }
        for a in alerts
    ]
