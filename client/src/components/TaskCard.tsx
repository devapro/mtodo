import { useState } from 'react';
import { Card, Form, Badge, Button, Collapse } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { List, Task } from '../types';

interface Props {
  task: Task;
  lists: List[];
  canEdit?: boolean;
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
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const list = lists.find((l) => l.id === task.list_id);
  const repeat = repeatLabel(task, t);

  return (
    <Card className={`task-card mb-2 ${task.completed ? 'done' : ''}`}>
      <Card.Body className="py-2">
        <div className="d-flex align-items-start gap-2">
          <Form.Check
            type="checkbox"
            className="mt-1"
            checked={task.completed}
            disabled={!canEdit}
            onChange={() => onToggle(task)}
          />
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
                    title={t('taskCard.toggleDescription')}
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
                      title={t('taskCard.edit')}
                    >
                      ✏️
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-decoration-none text-danger"
                      onClick={() => onDelete(task)}
                      title={t('taskCard.delete')}
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
                  {list.name}
                </Badge>
              )}
              {task.due_date && (
                <Badge bg="secondary" className="tag-chip">
                  📅 {task.due_date}
                </Badge>
              )}
              {repeat && (
                <Badge bg="warning" text="dark" className="tag-chip">
                  🔁 {repeat}
                </Badge>
              )}
              {task.tags.map((t) => (
                <Badge key={t} bg="primary" className="tag-chip">
                  #{t}
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
