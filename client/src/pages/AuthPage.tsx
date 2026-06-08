import { useState, FormEvent } from 'react';
import { Card, Form, Button, Alert, Container } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AuthPage() {
  const { signin, signup } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="auth-wrapper">
      <Container style={{ maxWidth: 420 }}>
        <div className="text-end mb-2">
          <Button variant="outline-secondary" size="sm" onClick={toggle}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </Button>
        </div>
        <Card className="shadow-sm border-0">
          <Card.Body className="p-4">
            <h1 className="brand-gradient text-center mb-1">mTodo</h1>
            <p className="text-center text-secondary mb-4">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </p>

            {error && <Alert variant="danger">{error}</Alert>}

            <Form onSubmit={submit}>
              <Form.Group className="mb-3">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </Form.Group>
              <Button type="submit" className="w-100" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
              </Button>
            </Form>

            <div className="text-center mt-3">
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                }}
              >
                {mode === 'signin'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
