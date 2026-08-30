/*
useRealtime — WebSocket hook for real-time POS monitoring.
Connects to /api/ws/realtime and provides connection status + events.
*/
import { useState, useEffect, useRef, useCallback } from "react";

export function useRealtime(token, onEvent) {
  const [status, setStatus] = useState("disconnected"); // connected, reconnecting, disconnected
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (!token) return;

    // Build WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws/realtime`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send auth token
        ws.send(JSON.stringify({ token }));
        setStatus("reconnecting");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "CONNECTED") {
            setStatus("connected");
          } else if (msg.type === "PONG") {
            // Keep-alive response
          } else if (onEventRef.current) {
            onEventRef.current(msg);
          }
        } catch (e) {
          console.error("WebSocket parse error:", e);
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        // Auto-reconnect after 3 seconds
        reconnectTimerRef.current = setTimeout(() => {
          setStatus("reconnecting");
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        setStatus("reconnecting");
      };
    } catch (e) {
      console.error("WebSocket connection error:", e);
      setStatus("reconnecting");
      reconnectTimerRef.current = setTimeout(connect, 3000);
    }
  }, [token]);

  useEffect(() => {
    connect();

    // Ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Reconnect function
  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  return { status, reconnect };
}

export default useRealtime;
