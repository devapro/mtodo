import { useEffect, useState } from 'react';
import { Modal, Form, Button, Row, Col, Collapse } from 'react-bootstrap';
import MDEditor from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';
import { useTranslation } from 'react-i18next';
import TagInput from './TagInput';
import { List, RepeatType, RepeatUnit, Task, TaskInput } from '../types';
import { useTheme } from '../context/ThemeContext';

interface Props {
  show: boolean;
  task: Task | null;
  lists: List[];
  tagSuggestions: string[];
  defaultDate?: string | null;
  defaultListId?: number | null;
  defaultTitle?: string;
  onClose: () => void;
  onSave: (input: TaskInput, id?: number) => Promise<void>;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default function TaskModal({
  show,
  task,
  lists,
  tagSuggestions,
  defaultDate,
  defaultListId,
  defaultTitle,
  onClose,
  onSave,
}: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string>('');
  const [listId, setListId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [repeatType, setRepeatType] = useState<RepeatType>('none');
  const [repeatInterval, setRepeatInterval] = useState<number>(1);
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>('day');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDays, setMonthDays] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setListId(task.list_id ? String(task.list_id) : '');
      setDueDate(task.due_date || '');
      setRepeatType(task.repeat_type);
      setRepeatInterval(task.repeat_interval || 1);
      setRepeatUnit((task.repeat_unit as RepeatUnit) || 'day');
      const days = task.repeat_days ? (JSON.parse(task.repeat_days) as number[]) : [];
      if (task.repeat_type === 'weekly') setWeekdays(days);
      else setWeekdays([]);
      setMonthDays(task.repeat_type === 'monthly' ? days.join(', ') : '');
      setTags(task.tags || []);
      // Auto-expand the optional section if the task already uses any of it.
      setAdvancedOpen(
        !!task.list_id ||
          !!task.due_date ||
          task.repeat_type !== 'none' ||
          !!task.description
      );
    } else {
      setTitle(defaultTitle || '');
      setDescription('');
      setListId(defaultListId ? String(defaultListId) : '');
      setDueDate(defaultDate || '');
      setRepeatType('none');
      setRepeatInterval(1);
      setRepeatUnit('day');
      setWeekdays([]);
      setMonthDays('');
      setTags([]);
      setAdvancedOpen(false);
    }
  }, [show, task, defaultDate, defaultListId, defaultTitle]);

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);

    let repeat_days: number[] | null = null;
    if (repeatType === 'weekly') repeat_days = weekdays;
    else if (repeatType === 'monthly') {
      repeat_days = monthDays
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 31);
    }

    const input: TaskInput = {
      title: title.trim(),
      description: description || null,
      list_id: listId ? Number(listId) : null,
      due_date: dueDate || null,
      repeat_type: repeatType,
      repeat_interval: repeatType === 'custom' ? repeatInterval : null,
      repeat_unit: repeatType === 'custom' ? repeatUnit : null,
      repeat_days,
      tags,
    };

    try {
      await onSave(input, task?.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{task ? t('taskModal.editTask') : t('taskModal.newTask')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>{t('taskModal.title')}</Form.Label>
            <Form.Control
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('taskModal.titlePlaceholder')}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>{t('taskModal.tags')}</Form.Label>
            <TagInput value={tags} suggestions={tagSuggestions} onChange={setTags} />
          </Form.Group>

          <div className="border-top pt-2 mb-2">
            <Button
              type="button"
              variant="link"
              className="p-0 text-decoration-none"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              {advancedOpen ? '▲' : '▼'} {t('taskModal.advancedToggle')}
            </Button>
          </div>

          <Collapse in={advancedOpen}>
            <div>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('taskModal.list')}</Form.Label>
                    <Form.Select value={listId} onChange={(e) => setListId(e.target.value)}>
                      <option value="">{t('taskModal.noList')}</option>
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>{t('taskModal.date')}</Form.Label>
                    <Form.Control
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>{t('taskModal.repeat')}</Form.Label>
                <Form.Select
                  value={repeatType}
                  onChange={(e) => setRepeatType(e.target.value as RepeatType)}
                >
                  <option value="none">{t('taskModal.repeatNone')}</option>
                  <option value="daily">{t('taskModal.repeatDaily')}</option>
                  <option value="weekly">{t('taskModal.repeatWeekly')}</option>
                  <option value="monthly">{t('taskModal.repeatMonthly')}</option>
                  <option value="custom">{t('taskModal.repeatCustom')}</option>
                </Form.Select>
              </Form.Group>

              {repeatType === 'weekly' && (
                <Form.Group className="mb-3">
                  <Form.Label>{t('taskModal.repeatOn')}</Form.Label>
                  <div className="d-flex flex-wrap gap-2">
                    {WEEKDAY_KEYS.map((key, idx) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={weekdays.includes(idx) ? 'primary' : 'outline-secondary'}
                        onClick={() => toggleWeekday(idx)}
                      >
                        {t(`weekdays.${key}`)}
                      </Button>
                    ))}
                  </div>
                  <Form.Text>{t('taskModal.weeklyHint')}</Form.Text>
                </Form.Group>
              )}

              {repeatType === 'monthly' && (
                <Form.Group className="mb-3">
                  <Form.Label>{t('taskModal.daysOfMonth')}</Form.Label>
                  <Form.Control
                    value={monthDays}
                    onChange={(e) => setMonthDays(e.target.value)}
                    placeholder={t('taskModal.daysOfMonthPlaceholder')}
                  />
                  <Form.Text>{t('taskModal.daysOfMonthHint')}</Form.Text>
                </Form.Group>
              )}

              {repeatType === 'custom' && (
                <Row className="mb-3 align-items-end">
                  <Col xs={6}>
                    <Form.Label>{t('taskModal.every')}</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(Math.max(1, Number(e.target.value)))}
                    />
                  </Col>
                  <Col xs={6}>
                    <Form.Select
                      value={repeatUnit}
                      onChange={(e) => setRepeatUnit(e.target.value as RepeatUnit)}
                    >
                      <option value="day">{t('taskModal.unitDay')}</option>
                      <option value="week">{t('taskModal.unitWeek')}</option>
                      <option value="month">{t('taskModal.unitMonth')}</option>
                    </Form.Select>
                  </Col>
                </Row>
              )}

              <Form.Group className="mb-2">
                <Form.Label>{t('taskModal.description')}</Form.Label>
                <div data-color-mode={theme}>
                  <MDEditor
                    value={description}
                    onChange={(v) => setDescription(v || '')}
                    height={240}
                    previewOptions={{ rehypePlugins: [[rehypeSanitize]] }}
                  />
                </div>
              </Form.Group>
            </div>
          </Collapse>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={submit} disabled={busy || !title.trim()}>
          {busy ? t('taskModal.saving') : t('taskModal.saveTask')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
