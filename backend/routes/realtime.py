"""
Real-time WebSocket endpoint for POS monitoring.
Events: NEW_SALE, SALE_CANCELLED, SHIFT_OPENED, SHIFT_CLOSED, etc.
"""
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from database import q_all

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        self.active_connections: list[dict] = []

    async def connect(self, websocket: WebSocket, user_info: dict):
        await websocket.accept()
        conn = {"ws": websocket, "user": user_info}
        self.active_connections.append(conn)
        await websocket.send_json({
            "type": "CONNECTED",
            "message": "Real-time connection established",
            "timestamp": datetime.utcnow().isoformat(),
        })

    def disconnect(self, websocket: WebSocket):
        self.active_connections = [
            c for c in self.active_connections if c["ws"] != websocket
        ]

    async def broadcast(self, event_type: str, data: dict, outlet_id: str = None):
        """
        Broadcast event to connected clients.
        - Owner receives all events.
        - Other roles only receive events for their outlets.
        """
        message = {
            "type": event_type,
            "data": data,
            "outlet_id": outlet_id,
            "timestamp": datetime.utcnow().isoformat(),
        }

        disconnected = []
        for conn in self.active_connections:
            try:
                user = conn["user"]
                # Owner receives everything
                if user.get("role") == "owner":
                    await conn["ws"].send_json(message)
                # Others receive only their outlet events
                elif outlet_id and outlet_id in user.get("outlet_ids", []):
                    await conn["ws"].send_json(message)
                # No outlet_id = broadcast to all
                elif not outlet_id:
                    await conn["ws"].send_json(message)
            except Exception:
                disconnected.append(conn)

        for conn in disconnected:
            self.disconnect(conn["ws"])


manager = ConnectionManager()


@router.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time monitoring.
    Client sends auth token as first message.
    """
    import jwt
    from config import JWT_SECRET, JWT_ALGORITHM

    # Accept connection first
    await websocket.accept()

    # Wait for auth message
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        auth_data = json.loads(auth_msg)
        token = auth_data.get("token", "")

        if not token:
            await websocket.send_json({"type": "ERROR", "message": "No token provided"})
            await websocket.close(code=4001, reason="No token provided")
            return

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            await websocket.send_json({"type": "ERROR", "message": "Invalid token"})
            await websocket.close(code=4003, reason="Invalid token")
            return

        user_id = payload["sub"]
        role = payload["role"]

        # Get user outlet access
        if role != "owner":
            outlets = await q_all(
                "SELECT outlet_id FROM user_outlet_access WHERE user_id = :uid",
                uid=user_id,
            )
            outlet_ids = [str(o["outlet_id"]) for o in outlets]
        else:
            outlet_ids = []

        user_info = {
            "id": user_id,
            "role": role,
            "outlet_ids": outlet_ids,
        }

        # Register connection
        conn = {"ws": websocket, "user": user_info}
        manager.active_connections.append(conn)

        await websocket.send_json({
            "type": "CONNECTED",
            "message": "Real-time connection established",
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Keep connection alive, listen for messages
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "PONG", "timestamp": datetime.utcnow().isoformat()})

    except asyncio.TimeoutError:
        try:
            await websocket.close(code=4002, reason="Auth timeout")
        except Exception:
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        manager.disconnect(websocket)


# ============ HELPER FUNCTIONS (called from other routes) ============

async def emit_new_sale(sale_data: dict, outlet_id: str = None):
    """Call this after a sale is created to notify connected clients."""
    await manager.broadcast("NEW_SALE", sale_data, outlet_id)


async def emit_shift_opened(shift_data: dict, outlet_id: str = None):
    await manager.broadcast("SHIFT_OPENED", shift_data, outlet_id)


async def emit_shift_closed(shift_data: dict, outlet_id: str = None):
    await manager.broadcast("SHIFT_CLOSED", shift_data, outlet_id)


async def emit_low_stock(product_data: dict, outlet_id: str = None):
    await manager.broadcast("LOW_STOCK", product_data, outlet_id)


async def emit_attendance_checkin(data: dict, outlet_id: str = None):
    await manager.broadcast("ATTENDANCE_CHECKIN", data, outlet_id)


async def emit_attendance_checkout(data: dict, outlet_id: str = None):
    await manager.broadcast("ATTENDANCE_CHECKOUT", data, outlet_id)


async def emit_new_order(data: dict, outlet_id: str = None):
    await manager.broadcast("NEW_ORDER", data, outlet_id)


async def emit_payment_completed(data: dict, outlet_id: str = None):
    await manager.broadcast("PAYMENT_COMPLETED", data, outlet_id)
