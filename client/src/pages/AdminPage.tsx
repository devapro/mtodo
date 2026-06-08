import { useEffect, useState } from 'react';
import {
  Container,
  Table,
  Card,
  Badge,
  Button,
  Alert,
  Spinner,
  Modal,
  Form,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { AdminUser, Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

export default function AdminPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('user');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // reset password modal
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getUsers()
      .then(setUsers)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (u: AdminUser) => {
    const ok = await confirm({
      message: t('admin.confirmDelete', { email: u.email }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success(t('admin.userDeleted'));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openCreate = () => {
    setNewEmail('');
    setNewPassword('');
    setNewRole('user');
    setCreateError(null);
    setShowCreate(true);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateBusy(true);
    setCreateError(null);
    try {
      const created = await api.createUser(newEmail.trim(), newPassword, newRole);
      setUsers((prev) => [...prev, created]);
      setShowCreate(false);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreateBusy(false);
    }
  };

  const openReset = (u: AdminUser) => {
    setResetTarget(u);
    setResetPassword('');
    setResetError(null);
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await api.resetUserPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <Container className="pb-5">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="mb-0">{t('admin.title')}</h3>
        <Button variant="primary" onClick={openCreate}>
          {t('admin.newUser')}
        </Button>
      </div>
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}
      <Card>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : (
            <Table responsive hover className="align-middle mb-0">
              <thead>
                <tr>
                  <th>{t('admin.id')}</th>
                  <th>{t('admin.email')}</th>
                  <th>{t('admin.role')}</th>
                  <th>{t('admin.tasks')}</th>
                  <th>{t('admin.joined')}</th>
                  <th className="text-end">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>
                      {u.email}
                      {u.telegram_id && (
                        <span
                          className="ms-2"
                          title={
                            u.telegram_username
                              ? t('admin.telegramLinkedAs', { username: u.telegram_username })
                              : t('admin.telegramLinked')
                          }
                          aria-label={t('admin.telegramLinked')}
                          style={{ cursor: 'default' }}
                        >
                          ✈️
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge bg={u.role === 'admin' ? 'primary' : 'secondary'}>{u.role}</Badge>
                    </td>
                    <td>{u.task_count}</td>
                    <td className="small text-secondary">{u.created_at}</td>
                    <td className="text-end">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="me-2"
                        onClick={() => openReset(u)}
                      >
                        {t('admin.resetPassword')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={u.id === user?.id}
                        onClick={() => remove(u)}
                      >
                        {t('admin.delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Modal show={showCreate} onHide={() => setShowCreate(false)} centered>
        <Form onSubmit={submitCreate}>
          <Modal.Header closeButton>
            <Modal.Title>{t('admin.newUser')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {createError && <Alert variant="danger">{createError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>{t('admin.email')}</Form.Label>
              <Form.Control
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoFocus
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t('admin.password')}</Form.Label>
              <Form.Control
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
              <Form.Text className="text-secondary">{t('admin.passwordHint')}</Form.Text>
            </Form.Group>
            <Form.Group>
              <Form.Label>{t('admin.role')}</Form.Label>
              <Form.Select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {t('admin.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={createBusy}>
              {createBusy ? <Spinner size="sm" animation="border" /> : t('admin.create')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!resetTarget} onHide={() => setResetTarget(null)} centered>
        <Form onSubmit={submitReset}>
          <Modal.Header closeButton>
            <Modal.Title>{t('admin.resetPassword')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {resetError && <Alert variant="danger">{resetError}</Alert>}
            <p className="text-secondary">
              {t('admin.resetPasswordFor', { email: resetTarget?.email ?? '' })}
            </p>
            <Form.Group>
              <Form.Label>{t('admin.newPassword')}</Form.Label>
              <Form.Control
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={6}
                autoFocus
                required
              />
              <Form.Text className="text-secondary">{t('admin.passwordHint')}</Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              {t('admin.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={resetBusy}>
              {resetBusy ? <Spinner size="sm" animation="border" /> : t('admin.save')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
