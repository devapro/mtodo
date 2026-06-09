import { useEffect, useRef, useState } from 'react';
import { Container, Card, Form, Button, Badge, Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import { SUPPORTED_LANGUAGES } from '../i18n';
import {
  ListsParseError,
  downloadLists,
  listToExport,
  parseListsFile,
} from '../lib/listsTransfer';

export default function SettingsPage() {
  const { user, setUser, refresh, signout } = useAuth();
  const { theme, toggle } = useTheme();
  const confirm = useConfirm();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const currentLang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  // Telegram linking state
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgBot, setTgBot] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

  useEffect(() => {
    api
      .telegramConfig()
      .then((cfg) => {
        setTgEnabled(cfg.enabled);
        setTgBot(cfg.botUsername);
      })
      .catch(() => setTgEnabled(false));
  }, []);

  const generateCode = async () => {
    setTgBusy(true);
    setTgError(null);
    try {
      const res = await api.telegramLinkCode();
      setLinkCode(res.code);
    } catch (err) {
      setTgError((err as Error).message);
    } finally {
      setTgBusy(false);
    }
  };

  const checkStatus = async () => {
    setTgBusy(true);
    setTgError(null);
    try {
      await refresh();
      setLinkCode(null);
    } catch (err) {
      setTgError((err as Error).message);
    } finally {
      setTgBusy(false);
    }
  };

  const unlink = async () => {
    const ok = await confirm({
      message: t('settings.tgConfirmUnlink'),
      confirmLabel: t('settings.tgUnlink'),
      variant: 'danger',
    });
    if (!ok) return;
    setTgBusy(true);
    setTgError(null);
    try {
      const res = await api.telegramUnlink();
      setUser(res.user);
      setLinkCode(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTgBusy(false);
    }
  };

  const handleSignout = () => {
    signout();
    navigate('/login');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const lists = await api.getLists();
      const exported = await Promise.all(
        lists.map(async (list) => listToExport(list, await api.getTasks({ listId: list.id })))
      );
      downloadLists(exported);
      toast.success(t('settings.listsExported', { count: exported.length }));
    } catch (err) {
      toast.error((err as Error).message || t('settings.listsExportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again re-triggers the change event.
    e.target.value = '';
    if (!file) return;

    let lists;
    try {
      lists = parseListsFile(await file.text());
    } catch (err) {
      const reason = err instanceof ListsParseError ? t(`settings.listsError.${err.message}`) : '';
      toast.error(
        reason ? `${t('settings.listsImportFailed')}: ${reason}` : t('settings.listsImportFailed')
      );
      return;
    }

    if (lists.length === 0) {
      toast.error(t('settings.listsError.empty'));
      return;
    }

    const ok = await confirm({
      message: t('settings.listsImportConfirm', { count: lists.length }),
      confirmLabel: t('settings.listsImport'),
      variant: 'primary',
    });
    if (!ok) return;

    setImporting(true);
    try {
      let taskCount = 0;
      for (const list of lists) {
        const created = await api.createList(list.name, { color: list.color, emoji: list.emoji });
        for (const task of list.tasks) {
          const newTask = await api.createTask({
            title: task.title,
            description: task.description,
            list_id: created.id,
            due_date: task.due_date,
            repeat_type: task.repeat_type,
            repeat_interval: task.repeat_interval,
            repeat_unit: task.repeat_unit,
            repeat_days: task.repeat_days,
            tags: task.tags,
          });
          // POST always creates an open task, so flip completed ones afterward.
          if (task.completed) await api.updateTask(newTask.id, { completed: true });
          taskCount += 1;
        }
      }
      toast.success(t('settings.listsImported', { lists: lists.length, tasks: taskCount }));
    } catch (err) {
      toast.error((err as Error).message || t('settings.listsImportFailed'));
    } finally {
      setImporting(false);
    }
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

      <Card className="mb-3">
        <Card.Header className="fw-semibold">{t('settings.preferences')}</Card.Header>
        <Card.Body>
          <p className="text-secondary small mb-3">{t('settings.listsHint')}</p>
          <div className="d-flex gap-2 flex-wrap">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleExport}
              disabled={exporting || importing}
            >
              {exporting ? <Spinner size="sm" animation="border" /> : t('settings.listsExport')}
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleImportClick}
              disabled={exporting || importing}
            >
              {importing ? <Spinner size="sm" animation="border" /> : t('settings.listsImport')}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="d-none"
            onChange={handleImportFile}
          />
        </Card.Body>
      </Card>

      {tgEnabled && (
        <Card className="mb-3">
          <Card.Header className="fw-semibold">
            <span aria-hidden className="me-1">✈️</span>
            {t('settings.telegram')}
          </Card.Header>
          <Card.Body>
            {tgError && (
              <Alert variant="danger" onClose={() => setTgError(null)} dismissible>
                {tgError}
              </Alert>
            )}

            {user?.telegram_id ? (
              <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
                <span className="text-secondary small">
                  {t('settings.tgConnectedAs')}{' '}
                  <Badge bg="info">
                    {user.telegram_username ? `@${user.telegram_username}` : user.telegram_id}
                  </Badge>
                </span>
                <Button variant="outline-danger" size="sm" onClick={unlink} disabled={tgBusy}>
                  {t('settings.tgUnlink')}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-secondary small mb-3">{t('settings.tgHint')}</p>
                {linkCode ? (
                  <div>
                    <p className="mb-2">
                      {t('settings.tgStep1')}{' '}
                      <code className="fs-5">/start {linkCode}</code>
                    </p>
                    {tgBot && (
                      <Button
                        as="a"
                        href={`https://t.me/${tgBot}?start=${linkCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        size="sm"
                        className="me-2"
                      >
                        {t('settings.tgOpenBot')}
                      </Button>
                    )}
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={checkStatus}
                      disabled={tgBusy}
                    >
                      {tgBusy ? <Spinner size="sm" animation="border" /> : t('settings.tgCheck')}
                    </Button>
                  </div>
                ) : (
                  <Button variant="primary" size="sm" onClick={generateCode} disabled={tgBusy}>
                    {tgBusy ? <Spinner size="sm" animation="border" /> : t('settings.tgLink')}
                  </Button>
                )}
              </>
            )}
          </Card.Body>
        </Card>
      )}

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
