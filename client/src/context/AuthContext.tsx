import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken } from '../api';
import { TelegramLoginData, User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signin: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  signinWithTelegram: (data: TelegramLoginData) => Promise<void>;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
  signout: () => void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signin = async (email: string, password: string) => {
    const res = await api.signin(email, password);
    setToken(res.token);
    setUser(res.user);
  };

  const signup = async (email: string, password: string) => {
    const res = await api.signup(email, password);
    setToken(res.token);
    setUser(res.user);
  };

  const signinWithTelegram = async (data: TelegramLoginData) => {
    const res = await api.telegramLogin(data);
    setToken(res.token);
    setUser(res.user);
  };

  const refresh = async () => {
    const res = await api.me();
    setUser(res.user);
  };

  const signout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signin, signup, signinWithTelegram, setUser, refresh, signout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
