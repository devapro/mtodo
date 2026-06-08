import { useEffect, useState, FormEvent } from 'react';
import { Modal, Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { List } from '../types';

interface Props {
  show: boolean;
  list: List | null;
  onClose: () => void;
  onSave: (id: number, body: { name: string; emoji: string | null }) => Promise<void>;
}

const EMOJI_CHOICES = [
  '📁', '📝', '✅', '⭐', '🔥', '💡', '🎯', '🚀',
  '🏠', '💼', '🛒', '🍎', '💪', '📚', '✈️', '🎁',
  '❤️', '🎵', '💰', '🌱', '🐱', '☕', '🔧', '📅',
];

export default function ListModal({ show, list, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show || !list) return;
    setName(list.name);
    setEmoji(list.emoji);
    setError(null);
  }, [show, list]);

  if (!list) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(list.id, { name: name.trim(), emoji });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title>{t('listModal.title')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>{t('listModal.name')}</Form.Label>
            <InputGroup>
              <Form.Control
                className="text-center flex-grow-0"
                style={{ width: 56, fontSize: '1.1rem' }}
                value={emoji ?? ''}
                maxLength={16}
                placeholder="🙂"
                aria-label={t('listModal.emoji')}
                onChange={(e) => setEmoji(e.target.value || null)}
              />
              <Form.Control
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </InputGroup>
          </Form.Group>
          <Form.Group>
            <Form.Label className="d-flex justify-content-between align-items-center">
              <span>{t('listModal.emoji')}</span>
              {emoji && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 text-decoration-none"
                  onClick={() => setEmoji(null)}
                >
                  {t('listModal.clearEmoji')}
                </Button>
              )}
            </Form.Label>
            <div className="d-flex flex-wrap gap-1">
              {EMOJI_CHOICES.map((e) => (
                <Button
                  key={e}
                  type="button"
                  variant={emoji === e ? 'primary' : 'outline-secondary'}
                  onClick={() => setEmoji(e)}
                  style={{ fontSize: '1.1rem', lineHeight: 1, width: 44 }}
                >
                  {e}
                </Button>
              ))}
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
