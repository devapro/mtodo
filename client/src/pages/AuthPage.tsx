import { useEffect, useState, FormEvent } from 'react';
import { Card, Form, Button, Alert, Container } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import { TelegramLoginData } from '../types';
import TelegramLoginButton from '../components/TelegramLoginButton';

export default function AuthPage() {
  const { signin, signup, signinWithTelegram } = useAuth();
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgBot, setTgBot] = useState<string | null>(null);

  useEffect(() => {
    api
      .telegramConfig()
      .then((cfg) => {
        if (cfg.enabled && cfg.botUsername) setTgBot(cfg.botUsername);
      })
      .catch(() => setTgBot(null));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signin(email, password);
      else await signup(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTelegram = async (data: TelegramLoginData) => {
    setError(null);
    try {
      await signinWithTelegram(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="auth-wrapper">
      <Container style={{ maxWidth: 420 }}>
        <div className="text-end mb-2">
          <Button variant="outline-secondary" size="sm" onClick={toggle}>
            {theme === 'dark' ? t('nav.light') : t('nav.dark')}
          </Button>
        </div>
        <Card className="shadow-sm border-0">
          <Card.Body className="p-4">
            <h1 className="brand-gradient text-center mb-1">mTodo</h1>
            <p className="text-center text-secondary mb-4">
              {mode === 'signin' ? t('auth.welcomeBack') : t('auth.createAccount')}
            </p>

            {error && <Alert variant="danger">{error}</Alert>}

            <Form onSubmit={submit}>
              <Form.Group className="mb-3">
                <Form.Label>{t('auth.email')}</Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  autoFocus
                />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>{t('auth.password')}</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                  minLength={6}
                />
              </Form.Group>
              <Button type="submit" className="w-100" disabled={busy}>
                {busy
                  ? t('common.pleaseWait')
                  : mode === 'signin'
                    ? t('auth.signIn')
                    : t('auth.signUp')}
              </Button>
            </Form>

            {tgBot && (
              <>
                <div className="d-flex align-items-center my-3 text-secondary">
                  <hr className="flex-grow-1" />
                  <span className="px-2 small">{t('auth.or')}</span>
                  <hr className="flex-grow-1" />
                </div>
                <div className="d-flex justify-content-center">
                  <TelegramLoginButton botUsername={tgBot} onAuth={handleTelegram} />
                </div>
              </>
            )}

            <div className="text-center mt-3">
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                }}
              >
                {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
