'use client';

// What: React context provider for the BYOK (Bring Your Own Key) API key.
//       Holds the key in React state only — never persisted to
//       localStorage/sessionStorage/cookies per spec D3. Cleared on tab
//       close / hard refresh / sign-out.
// Why:  Spec D3 — "Held in React state (memory only). Cleared on tab
//       close." The provider wraps the (app) layout so all descendant
//       components (Settings page, AnswerThread, StartTriage) can read
//       and set the key without prop drilling.
// Does NOT: Persist the key anywhere. Validate the key — that's the
//           /api/key-validate route's job.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ByokKeyContextValue = {
  byokKey: string | null;
  setByokKey: (key: string) => void;
  clearByokKey: () => void;
};

const ByokKeyContext = createContext<ByokKeyContextValue | null>(null);

/**
 * Provider for the BYOK API key. Mount in (app)/layout.tsx so all
 * authenticated pages can consume the key.
 */
export function ByokKeyProvider({ children }: { children: ReactNode }) {
  const [byokKey, setByokKeyState] = useState<string | null>(null);

  const setByokKey = useCallback((key: string) => {
    setByokKeyState(key);
  }, []);

  const clearByokKey = useCallback(() => {
    setByokKeyState(null);
  }, []);

  const value = useMemo(
    () => ({ byokKey, setByokKey, clearByokKey }),
    [byokKey, setByokKey, clearByokKey]
  );

  return (
    <ByokKeyContext.Provider value={value}>{children}</ByokKeyContext.Provider>
  );
}

/**
 * Hook to consume the BYOK key context. Throws if used outside of
 * ByokKeyProvider (defense-in-depth — all (app) routes should be wrapped).
 */
export function useByokKey(): ByokKeyContextValue {
  const ctx = useContext(ByokKeyContext);
  if (!ctx) {
    throw new Error('useByokKey must be used within a ByokKeyProvider');
  }
  return ctx;
}
