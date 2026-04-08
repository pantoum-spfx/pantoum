import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '@shared/types/WebSocketProtocol';
import { useUpgradeStore } from '../stores/upgradeStore';
import { useConnectionStore } from '../stores/connectionStore';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Thin WebSocket pipe that dispatches all messages to the upgrade store.
 * Messages are buffered and flushed at ~60fps via requestAnimationFrame
 * to avoid per-message state updates that block the event loop.
 */
export function useWebSocket(sessionId: string | null): { connected: boolean } {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const bufferRef = useRef<WSMessage[]>([]);
  const rafRef = useRef<number>(0);
  const connected = useConnectionStore((s) => s.wsConnected);

  // Flush buffered messages in a single batch via RAF
  const flush = useCallback(() => {
    const batch = bufferRef.current;
    if (batch.length > 0) {
      bufferRef.current = [];
      useUpgradeStore.getState().dispatchWSMessageBatch(batch);
    }
    rafRef.current = requestAnimationFrame(flush);
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (sessionId && msg.sessionId !== sessionId) return;
        bufferRef.current.push(msg);
      } catch {
        // Ignore malformed messages
      }
    },
    [sessionId],
  );

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        useConnectionStore.getState().setWsConnected(true);
        reconnectAttempts.current = 0;
        // Start RAF flush loop
        rafRef.current = requestAnimationFrame(flush);
        // Subscribe to the session — triggers replay of any events buffered before this connection
        if (sessionId) {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        useConnectionStore.getState().setWsConnected(false);
        wsRef.current = null;

        // Cancel RAF loop
        cancelAnimationFrame(rafRef.current);
        // Flush any remaining buffered messages
        const remaining = bufferRef.current;
        if (remaining.length > 0) {
          bufferRef.current = [];
          useUpgradeStore.getState().dispatchWSMessageBatch(remaining);
        }

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS && sessionId) {
          reconnectAttempts.current++;
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        // Will trigger onclose
      };
    } catch {
      // Connection failed
    }
  }, [sessionId, handleMessage, flush]);

  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      // Flush remaining on cleanup
      const remaining = bufferRef.current;
      if (remaining.length > 0) {
        bufferRef.current = [];
        useUpgradeStore.getState().dispatchWSMessageBatch(remaining);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, connect]);

  return { connected };
}
