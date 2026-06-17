'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { CurrentUser } from '../../lib/auth';

export type UsageSummary = {
  title: string;
  total: string;
} | null;

export type SessionData = {
  usageSummary: UsageSummary;
  user: CurrentUser;
};

type SessionState =
  | {
      data: SessionData;
      status: 'authenticated';
    }
  | {
      data: null;
      status: 'loading' | 'unauthenticated';
    };

type SessionContextValue = SessionState & {
  refresh: () => Promise<void>;
};

type SessionResponse =
  | {
      ok: true;
      usageSummary: UsageSummary;
      user: CurrentUser;
    }
  | {
      ok: false;
      user: null;
    };

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({
    data: null,
    status: 'loading'
  });

  const refresh = useCallback(async () => {
    const response = await fetch('/api/session', {
      cache: 'no-store'
    });
    const data = (await response.json().catch(() => null)) as SessionResponse | null;

    if (!response.ok || !data?.ok) {
      setSession({
        data: null,
        status: 'unauthenticated'
      });
      return;
    }

    setSession({
      data: {
        usageSummary: data.usageSummary,
        user: data.user
      },
      status: 'authenticated'
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...session,
      refresh
    }),
    [refresh, session]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return value;
}
