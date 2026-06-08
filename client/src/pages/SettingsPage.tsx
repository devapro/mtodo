import { Container, Card, Form, Button, Badge } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SUPPORTED_LANGUAGES } from '../i18n';

export default function SettingsPage() {
  const { user, signout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const currentLang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  const handleSignout = () => {
    signout();
    navigate('/login');
  };

  return (
    <Container className="pb-5" style={{ maxWidth: 640 }}>
      <h3 className="mb-4">{t('settings.title')}</h3>

      <Card className="mb-3">
        <Card.Header className="fw-semibold">{t('settings.appearance')}</Card.Header>
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label>{t('settings.language')}</Form.Label>
            <Form.Select
              value={currentLang}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng}>
                  {t(`language.${lng}`)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="d-flex justify-content-between align-items-center">
            <Form.Label className="mb-0">{t('settings.theme')}</Form.Label>
            <Button variant="outline-secondary" size="sm" onClick={toggle} title={t('nav.toggleTheme')}>
              {theme === 'dark' ? t('nav.light') : t('nav.dark')}
            </Button>
          </Form.Group>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="fw-semibold">{t('settings.account')}</Card.Header>
        <Card.Body className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <span className="text-secondary small">
            {t('settings.signedInAs')} <strong>{user?.email}</strong>
            {user?.role === 'admin' && (
              <Badge bg="primary" className="ms-2">
                {t('nav.adminBadge')}
              </Badge>
            )}
          </span>
          <Button variant="outline-danger" size="sm" onClick={handleSignout}>
            {t('nav.signOut')}
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
}
