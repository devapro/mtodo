import { Navbar, Container, Nav, Button, Badge, Dropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SUPPORTED_LANGUAGES } from '../i18n';

export default function NavBar() {
  const { user, signout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const handleSignout = () => {
    signout();
    navigate('/login');
  };

  const currentLang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

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
            <Dropdown align="end">
              <Dropdown.Toggle variant="outline-secondary" size="sm" id="lang-switcher">
                {t(`language.${currentLang}`)}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {SUPPORTED_LANGUAGES.map((lng) => (
                  <Dropdown.Item
                    key={lng}
                    active={currentLang === lng}
                    onClick={() => i18n.changeLanguage(lng)}
                  >
                    {t(`language.${lng}`)}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggle}
              title={t('nav.toggleTheme')}
            >
              {theme === 'dark' ? t('nav.light') : t('nav.dark')}
            </Button>
            <span className="text-secondary small d-none d-sm-inline">
              {user?.email}
              {user?.role === 'admin' && (
                <Badge bg="primary" className="ms-2">
                  {t('nav.adminBadge')}
                </Badge>
              )}
            </span>
            <Button variant="outline-danger" size="sm" onClick={handleSignout}>
              {t('nav.signOut')}
            </Button>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
