import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CLIENT_ID, streamEvents } from '../api';
import { ChangeEvent } from '../types';
import { useAuth } from './AuthContext';

/**
 * Keeps one realtime connection (GET /api/events) open while signed in and
 * fans change events out to subscribers. Reconnects with exponential backoff;
 * after a reconnect it emits a synthetic event for every resource so views
 * resync whatever they missed while offline.
 */

type Listener = (event: ChangeEvent) => void;

interface RealtimeCtx {
  connected: boolean;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeCtx | undefined>(undefined);

const ALL_TYPES: ChangeEvent['type'][] = ['tasks', 'lists', 'tags', 'settings'];
/** Server heartbeats every 25s; treat 60s of silence as a dead connection. */
const WATCHDOG_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const userId = user?.id;

  useEffect(() => {
    if (userId === undefined) return;
    const stop = new AbortController();

    const dispatch = (event: ChangeEvent) => {
      // Settings live on the user object in AuthContext.
      if (event.type === 'settings') refreshRef.current().catch(() => undefined);
      for (const l of listeners.current) l(event);
    };

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        stop.signal.addEventListener('abort', () => {
          clearTimeout(t);
          resolve();
        });
      });

    (async () => {
      let attempt = 0;
      let hasConnectedBefore = false;
      while (!stop.signal.aborted) {
        // Per-connection controller so the watchdog can kill a stale stream.
        const conn = new AbortController();
        const abortConn = () => conn.abort();
        stop.signal.addEventListener('abort', abortConn);
        let watchdog = setTimeout(abortConn, WATCHDOG_MS);
        const kick = () => {
          clearTimeout(watchdog);
          watchdog = setTimeout(abortConn, WATCHDOG_MS);
        };

        try {
          await streamEvents(conn.signal, {
            onActivity: kick,
            onReady: () => {
              attempt = 0;
              setConnected(true);
              if (hasConnectedBefore) {
                for (const type of ALL_TYPES) dispatch({ type });
              }
              hasConnectedBefore = true;
            },
            onChange: (event) => {
              // Skip echoes of changes this tab made itself.
              if (event.source && event.source === CLIENT_ID) return;
              dispatch(event);
            },
          });
        } catch {
          // Network error, HTTP error, or watchdog/abort — fall through to retry.
        } finally {
          clearTimeout(watchdog);
          stop.signal.removeEventListener('abort', abortConn);
        }

        setConnected(false);
        if (stop.signal.aborted) break;
        attempt += 1;
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 5));
        await wait(backoff + Math.random() * 500);
      }
    })();

    return () => stop.abort();
  }, [userId]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ connected, subscribe }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeCtx {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}

/** Run `handler` for every realtime change event (latest handler is always used). */
export function useRealtimeEvents(handler: (event: ChangeEvent) => void): void {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
