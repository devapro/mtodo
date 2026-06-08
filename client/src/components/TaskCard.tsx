import { useState } from 'react';
import { Card, Form, Badge, Button, Collapse, Spinner } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { List, Task } from '../types';
import { describeDueDate, isOverdue } from '../utils';

interface Props {
  task: Task;
  lists: List[];
  canEdit?: boolean;
  busy?: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function repeatLabel(task: Task, t: TFunction): string | null {
  switch (task.repeat_type) {
    case 'daily':
      return t('taskCard.daily');
    case 'weekly':
      return t('taskCard.weekly');
    case 'monthly':
      return t('taskCard.monthly');
    case 'custom': {
      const unitKey =
        task.repeat_unit === 'week'
          ? 'taskModal.unitWeek'
          : task.repeat_unit === 'month'
            ? 'taskModal.unitMonth'
            : 'taskModal.unitDay';
      return t('taskCard.customEvery', {
        interval: task.repeat_interval || 1,
        unit: t(unitKey),
      });
    }
    default:
      return null;
  }
}

export default function TaskCard({
  task,
  lists,
  canEdit = true,
  busy = false,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const list = lists.find((l) => l.id === task.list_id);
  const repeat = repeatLabel(task, t);
  const overdue = isOverdue(task.due_date, task.completed);

  const dueBadge = task.due_date
    ? describeDueDate(task.due_date, {
        today: t('taskCard.today'),
        tomorrow: t('taskCard.tomorrow'),
        yesterday: t('taskCard.yesterday'),
      })
    : null;

  return (
    <Card
      className={`task-card mb-2 ${task.completed ? 'done' : ''} ${overdue ? 'overdue' : ''} ${busy ? 'mutating' : ''}`}
    >
      <Card.Body className="py-2">
        <div className="d-flex align-items-start gap-2">
          {busy ? (
            <Spinner animation="border" size="sm" className="mt-1 flex-shrink-0" />
          ) : (
            <Form.Check
              type="checkbox"
              className="mt-1"
              checked={task.completed}
              disabled={!canEdit}
              onChange={() => onToggle(task)}
              aria-label={task.completed ? t('taskCard.markIncomplete') : t('taskCard.markComplete')}
            />
          )}
          <div className="flex-grow-1">
            <div className="d-flex justify-content-between align-items-start">
              <span className="task-title fw-semibold">{task.title}</span>
              <div className="d-flex gap-1">
                {task.description && (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 text-decoration-none"
                    onClick={() => setOpen((o) => !o)}
                    aria-label={t('taskCard.toggleDescription')}
                    aria-expanded={open}
                  >
                    {open ? '▲' : '▼'}
                  </Button>
                )}
                {canEdit && (
                  <>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-decoration-none"
                      onClick={() => onEdit(task)}
                      aria-label={t('taskCard.edit')}
                      disabled={busy}
                    >
                      ✏️
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-decoration-none text-danger"
                      onClick={() => onDelete(task)}
                      aria-label={t('taskCard.delete')}
                      disabled={busy}
                    >
                      🗑️
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="d-flex flex-wrap gap-1 mt-1 align-items-center">
              {list && (
                <Badge bg="info" className="tag-chip">
                  {list.emoji ? `${list.emoji} ` : ''}{list.name}
                </Badge>
              )}
              {dueBadge && (
                <Badge
                  bg={
                    dueBadge.tone === 'overdue'
                      ? 'danger'
                      : dueBadge.tone === 'today'
                        ? 'warning'
                        : dueBadge.tone === 'soon'
                          ? 'secondary'
                          : 'secondary'
                  }
                  text={dueBadge.tone === 'today' ? 'dark' : undefined}
                  className="tag-chip"
                >
                  📅 {dueBadge.label}
                </Badge>
              )}
              {repeat && (
                <Badge bg="warning" text="dark" className="tag-chip">
                  🔁 {repeat}
                </Badge>
              )}
              {task.tags.map((tag) => (
                <Badge key={tag} bg="primary" className="tag-chip">
                  #{tag}
                </Badge>
              ))}
            </div>

            {task.description && (
              <Collapse in={open}>
                <div>
                  <div className="md-preview border-top mt-2 pt-2 small">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {task.description}
                    </ReactMarkdown>
                  </div>
                </div>
              </Collapse>
            )}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
