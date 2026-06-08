import { useEffect, useState } from 'react';
import { Container, Table, Card, Badge, Button, Alert, Spinner } from 'react-bootstrap';
import { api } from '../api';
import { AdminUser } from '../types';
import { useAuth } from '../context/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
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
    if (!confirm(`Delete user ${u.email}? All their data will be removed.`)) return;
    try {
      await api.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Container className="pb-5">
      <h3 className="mb-3">Admin · Users</h3>
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
                  <th>#</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Tasks</th>
                  <th>Joined</th>
                  <th className="text-end">Actions</th>
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
                        Delete
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
