import { useEffect, useState, FormEvent } from 'react';
import { Modal, Form, Button, Alert, ListGroup, Badge, Spinner, InputGroup } from 'react-bootstrap';
import { api } from '../api';
import { List, ListShare } from '../types';

interface Props {
  show: boolean;
  list: List | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function ShareModal({ show, list, onClose, onChanged }: Props) {
  const [shares, setShares] = useState<ListShare[]>([]);
  const [email, setEmail] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show || !list) return;
    setError(null);
    setEmail('');
    setCanEdit(false);
    setLoading(true);
    api
      .getShares(list.id)
      .then(setShares)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [show, list]);

  if (!list) return null;

  const refresh = async () => {
    const next = await api.getShares(list.id);
    setShares(next);
    onChanged();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.shareList(list.id, email.trim(), canEdit);
      setShares(next);
      setEmail('');
      setCanEdit(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changePermission = async (share: ListShare, nextCanEdit: boolean) => {
    setError(null);
    try {
      await api.shareList(list.id, share.email, nextCanEdit);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const revoke = async (share: ListShare) => {
    setError(null);
    try {
      await api.removeShare(list.id, share.user_id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Share “{list.name}”</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}

        <Form onSubmit={submit} className="mb-3">
          <Form.Label>Invite someone by email</Form.Label>
          <InputGroup>
            <Form.Control
              type="email"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Form.Select
              style={{ maxWidth: 150 }}
              value={canEdit ? 'edit' : 'view'}
              onChange={(e) => setCanEdit(e.target.value === 'edit')}
            >
              <option value="view">Read only</option>
              <option value="edit">Can edit</option>
            </Form.Select>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Sharing…' : 'Share'}
            </Button>
          </InputGroup>
          <Form.Text className="text-secondary">
            Read-only members can view tasks but only the owner and editors can change them.
          </Form.Text>
        </Form>

        <div className="fw-semibold mb-2">People with access</div>
        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <ListGroup>
            <ListGroup.Item className="d-flex justify-content-between align-items-center">
              <span>
                {list.owner_email} <Badge bg="primary">owner</Badge>
              </span>
            </ListGroup.Item>
            {shares.map((s) => (
              <ListGroup.Item
                key={s.user_id}
                className="d-flex justify-content-between align-items-center gap-2"
              >
                <span className="text-truncate">{s.email}</span>
                <div className="d-flex align-items-center gap-2">
                  <Form.Select
                    size="sm"
                    style={{ width: 120 }}
                    value={s.can_edit ? 'edit' : 'view'}
                    onChange={(e) => changePermission(s, e.target.value === 'edit')}
                  >
                    <option value="view">Read only</option>
                    <option value="edit">Can edit</option>
                  </Form.Select>
                  <Button variant="outline-danger" size="sm" onClick={() => revoke(s)}>
                    Remove
                  </Button>
                </div>
              </ListGroup.Item>
            ))}
            {shares.length === 0 && (
              <ListGroup.Item className="text-secondary small">
                Not shared with anyone yet.
              </ListGroup.Item>
            )}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
