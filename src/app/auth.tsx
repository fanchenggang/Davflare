import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface Credentials {
  username: string;
  password: string;
}

const STORAGE_KEY = "flaredrive.auth";

let current: Credentials | null = load();
const listeners = new Set<() => void>();

function load(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

function persist(credentials: Credentials | null) {
  try {
    if (credentials) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore persistence failures
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getCredentials() {
  return current;
}

export function setCredentials(credentials: Credentials) {
  current = credentials;
  persist(credentials);
  emit();
}

export function clearCredentials() {
  current = null;
  persist(null);
  emit();
}

export function basicAuthHeader() {
  if (!current) return undefined;
  return `Basic ${btoa(`${current.username}:${current.password}`)}`;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers || {});
  const authorization = basicAuthHeader();
  if (authorization) headers.set("Authorization", authorization);
  // Lets /webdav keep serving the file manager when the WebDAV mount switch is off.
  headers.set("X-Davflare-UI", "1");

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) clearCredentials();
  return response;
}

function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface AuthContextValue {
  username: string | null;
  login: (credentials: Credentials) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  username: null,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    current?.username ?? null
  );

  useEffect(
    () =>
      subscribeAuth(() => {
        setUsername(current?.username ?? null);
      }),
    []
  );

  const login = useCallback((credentials: Credentials) => {
    setCredentials(credentials);
  }, []);

  const logout = useCallback(() => {
    clearCredentials();
  }, []);

  const value = useMemo(
    () => ({ username, login, logout }),
    [username, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
