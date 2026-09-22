// Stub sign-in for the harness: who logged in decides entitlement, which is
// what the persona-gated screens (PlanDetails) render on. Usernames match the
// personas in test-data/testdata.json; there is no real auth behind this.
import React, { createContext, useContext, useState } from 'react';

const RESTRICTED_USERS = new Set(['member.restricted']);

interface Session {
  username: string | null;
  isEntitled: boolean;
  signIn: (username: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const value: Session = {
    username,
    isEntitled: username !== null && !RESTRICTED_USERS.has(username),
    signIn: setUsername,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
