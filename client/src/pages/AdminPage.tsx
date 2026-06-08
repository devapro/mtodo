import { useEffect, useState } from 'react';
import { Container, Table, Card, Badge, Button, Alert, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { AdminUser } from '../types';
import { useAuth } from '../context/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm(t('admin.confirmDelete', { email: u.email }))) return;
    try {
      await api.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Container className="pb-5">
      <h3 className="mb-3">{t('admin.title')}</h3>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
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
                    <td>{u.email}</td>
                    <td>
                      <Badge bg={u.role === 'admin' ? 'primary' : 'secondary'}>{u.role}</Badge>
                    </td>
                    <td>{u.task_count}</td>
                    <td className="small text-secondary">{u.created_at}</td>
                    <td className="text-end">
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
    </Container>
  );
}
