import { Navbar, Container, Nav } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

export default function NavBar() {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const { t } = useTranslation();

  return (
    <Navbar expand="md" className="border-bottom mb-4" bg="body-tertiary">
      <Container>
        <Navbar.Brand as={Link} to="/" className="brand-gradient fs-4">
          mTodo
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/">
              {t('nav.tasks')}
            </Nav.Link>
            {user?.role === 'admin' && (
              <Nav.Link as={Link} to="/admin">
                {t('nav.admin')}
              </Nav.Link>
            )}
          </Nav>
          <div className="d-flex align-items-center gap-3">
            <span
              className="small text-secondary d-flex align-items-center gap-1"
              title={connected ? t('nav.liveOn') : t('nav.liveOff')}
            >
              <span
                aria-hidden
                className={`rounded-circle d-inline-block ${connected ? 'bg-success' : 'bg-secondary'}`}
                style={{ width: 8, height: 8 }}
              />
              {connected ? t('nav.live') : t('nav.offline')}
            </span>
            <Link
              to="/settings"
              className="btn btn-outline-secondary btn-sm d-flex align-items-center"
              title={t('nav.settings')}
              aria-label={t('nav.settings')}
            >
              <span aria-hidden style={{ fontSize: '1.1rem', lineHeight: 1 }}>
                ⚙️
              </span>
            </Link>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
