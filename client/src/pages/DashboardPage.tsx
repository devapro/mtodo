import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Container, Row, Col, Card, Button, ListGroup, Form, Alert, Spinner,
  InputGroup, Badge, Dropdown, Offcanvas,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { List, Task, TaskInput } from '../types';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import ShareModal from '../components/ShareModal';
import ListModal from '../components/ListModal';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { parseQuickAdd, todayStr } from '../utils';

const listIcon = (l: List): string => {
  if (l.role === 'owner') return l.shared_count > 0 ? '🔗' : '📁';
  return '👥';
};

type View = { kind: 'today' } | { kind: 'all' } | { kind: 'list'; id: number };
type SortBy = 'manual' | 'due' | 'title' | 'completed';

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const quickAddRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [view, setView] = useState<View>({ kind: 'today' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [prefillTitle, setPrefillTitle] = useState('');
  const [newListName, setNewListName] = useState('');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [shareList, setShareList] = useState<List | null>(null);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('manual');
  const [mutatingIds, setMutatingIds] = useState<Set<number>>(new Set());
  const [listBusy, setListBusy] = useState(false);
  // Open-task counts per list (for sidebar badges).
  const [listOpenCounts, setListOpenCounts] = useState<Record<number, number>>({});

  const activeListId = view.kind === 'list' ? view.id : null;
  const currentList = view.kind === 'list' ? lists.find((l) => l.id === view.id) : undefined;
  const canEditCurrent = view.kind !== 'list' || !!currentList?.can_edit;

  const canEditTask = (task: Task): boolean => {
    if (user && task.user_id === user.id) return true;
    const l = lists.find((x) => x.id === task.list_id);
    return l ? l.can_edit : true;
  };

  const loadTasks = useCallback(async () => {
    setError(null);
    try {
      let result: Task[];
      if (view.kind === 'today') result = await api.getTasks({ date: todayStr() });
      else if (view.kind === 'list') result = await api.getTasks({ listId: view.id });
      else result = await api.getTasks();
      setTasks(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [view]);

  const loadMeta = useCallback(async () => {
    const [l, tags] = await Promise.all([api.getLists(), api.getTags()]);
    setLists(l);
    setTagSuggestions(tags.map((x) => x.name));
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const all = await api.getTasks();
      const counts: Record<number, number> = {};
      for (const task of all) {
        if (!task.completed && task.list_id != null) {
          counts[task.list_id] = (counts[task.list_id] || 0) + 1;
        }
      }
      setListOpenCounts(counts);
    } catch {
      // Non-critical — sidebar badges just won't update.
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMeta(), loadTasks(), refreshCounts()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const markMutating = (id: number, on: boolean) => {
    setMutatingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const saveTask = async (input: TaskInput, id?: number) => {
    if (id) await api.updateTask(id, input);
    else await api.createTask(input);
    await Promise.all([loadTasks(), loadMeta(), refreshCounts()]);
  };

  const toggleTask = async (task: Task) => {
    const prev = task.completed;
    markMutating(task.id, true);
    // Optimistic flip.
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, completed: !prev } : x)));
    try {
      const updated = await api.toggleTask(task.id);
      setTasks((ts) => ts.map((x) => (x.id === task.id ? updated : x)));
      refreshCounts();
    } catch (e) {
      // Roll back.
      setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, completed: prev } : x)));
      toast.error((e as Error).message);
    } finally {
      markMutating(task.id, false);
    }
  };

  const deleteTask = async (task: Task) => {
    const ok = await confirm({
      message: t('dashboard.confirmDeleteTask', { title: task.title }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    markMutating(task.id, true);
    const snapshot = tasks;
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
    try {
      await api.deleteTask(task.id);
      refreshCounts();
    } catch (e) {
      setTasks(snapshot);
      toast.error((e as Error).message);
    } finally {
      markMutating(task.id, false);
    }
  };

  const addList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setListBusy(true);
    try {
      const list = await api.createList(name);
      setLists((prev) => [...prev, list]);
      setNewListName('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setListBusy(false);
    }
  };

  const saveList = async (id: number, body: { name: string; emoji: string | null }) => {
    const updated = await api.updateList(id, body);
    setLists((prev) => prev.map((l) => (l.id === id ? updated : l)));
  };

  const deleteList = async (list: List) => {
    const ok = await confirm({
      message: t('dashboard.confirmDeleteList', { name: list.name }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    setListBusy(true);
    try {
      await api.deleteList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      if (view.kind === 'list' && view.id === list.id) setView({ kind: 'today' });
      refreshCounts();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setListBusy(false);
    }
  };

  const leaveList = async (list: List) => {
    if (!user) return;
    const ok = await confirm({
      message: t('dashboard.confirmLeaveList', { name: list.name }),
      confirmLabel: t('dashboard.leaveList'),
      variant: 'danger',
    });
    if (!ok) return;
    setListBusy(true);
    try {
      await api.leaveList(list.id, user.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      if (view.kind === 'list' && view.id === list.id) setView({ kind: 'today' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setListBusy(false);
    }
  };

  const quickAdd = async () => {
    const raw = quickTitle.trim();
    if (!raw) return;
    setQuickBusy(true);
    try {
      const parsed = parseQuickAdd(raw);
      if (!parsed.title) return;
      await saveTask({
        title: parsed.title,
        list_id: activeListId,
        due_date: parsed.dueDate ?? (view.kind === 'today' ? todayStr() : null),
        tags: parsed.tags.length ? parsed.tags : undefined,
      });
      setQuickTitle('');
      toast.success(t('dashboard.taskAdded'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setQuickBusy(false);
    }
  };

  const changeView = (next: View) => {
    setActiveTag(null);
    setView(next);
    setShowSidebar(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = tasks
      .filter((x) => (showCompleted ? true : !x.completed))
      .filter((x) => (activeTag ? x.tags.includes(activeTag) : true))
      .filter((x) =>
        q
          ? x.title.toLowerCase().includes(q) ||
            x.tags.some((tag) => tag.toLowerCase().includes(q))
          : true
      );

    if (sortBy === 'due') {
      result = [...result].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    } else if (sortBy === 'title') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'completed') {
      result = [...result].sort((a, b) => Number(a.completed) - Number(b.completed));
    }
    // 'manual' keeps the server order (created_at DESC).

    return result;
  }, [tasks, search, showCompleted, activeTag, sortBy]);

  const stats = useMemo(() => {
    const open = tasks.filter((x) => !x.completed).length;
    const done = tasks.filter((x) => x.completed).length;
    const overdue = tasks.filter(
      (x) => !x.completed && x.due_date && x.due_date < todayStr()
    ).length;
    return { open, done, overdue, total: tasks.length };
  }, [tasks]);

  const heading =
    view.kind === 'today'
      ? t('dashboard.headingToday', { date: todayStr() })
      : view.kind === 'all'
        ? t('dashboard.headingAll')
        : currentList
          ? `${currentList.emoji ? currentList.emoji + ' ' : ''}${currentList.name}`
          : t('dashboard.headingList');

  const openNew = (title = '') => {
    setEditing(null);
    setPrefillTitle(title);
    setShowModal(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setPrefillTitle('');
    setShowModal(true);
  };
  const expandQuickAdd = () => {
    openNew(quickTitle.trim());
    setQuickTitle('');
  };

  // Keyboard shortcuts: n = new task, / = focus search, t/a = switch views.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing =
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n') {
        e.preventDefault();
        openNew();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 't') {
        changeView({ kind: 'today' });
      } else if (e.key === 'a') {
        changeView({ kind: 'all' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  const sidebarContent = (
    <>
      <Card className="mb-3">
        <ListGroup variant="flush">
          <ListGroup.Item
            action
            active={view.kind === 'today'}
            onClick={() => changeView({ kind: 'today' })}
            className="d-flex justify-content-between align-items-center"
          >
            <span>{t('dashboard.today')}</span>
          </ListGroup.Item>
          <ListGroup.Item
            action
            active={view.kind === 'all'}
            onClick={() => changeView({ kind: 'all' })}
          >
            {t('dashboard.allTasks')}
          </ListGroup.Item>
        </ListGroup>
      </Card>

      <Card className="mb-3">
        <Card.Header className="fw-semibold">{t('dashboard.lists')}</Card.Header>
        <ListGroup variant="flush">
          {lists.map((l) => (
            <ListGroup.Item
              key={l.id}
              action
              active={view.kind === 'list' && view.id === l.id}
              onClick={() => changeView({ kind: 'list', id: l.id })}
              className="d-flex justify-content-between align-items-center gap-2"
            >
              <span className="text-truncate">
                {l.emoji || listIcon(l)} {l.name}
              </span>
              <span className="d-flex gap-1 align-items-center flex-shrink-0">
                {(listOpenCounts[l.id] ?? 0) > 0 && (
                  <Badge bg="secondary" className="tag-chip">
                    {listOpenCounts[l.id]}
                  </Badge>
                )}
                {l.role !== 'owner' && !l.can_edit && (
                  <Badge bg="secondary" className="tag-chip">
                    {t('dashboard.readOnly')}
                  </Badge>
                )}
                {l.role === 'owner' && l.shared_count > 0 && (
                  <Badge bg="info" className="tag-chip">
                    {t('dashboard.shared')}
                  </Badge>
                )}
              </span>
            </ListGroup.Item>
          ))}
          {lists.length === 0 && (
            <ListGroup.Item className="text-secondary small">
              {t('dashboard.noLists')}
            </ListGroup.Item>
          )}
        </ListGroup>
        <Card.Body>
          <InputGroup size="sm">
            <Form.Control
              placeholder={t('dashboard.newListPlaceholder')}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addList()}
              disabled={listBusy}
            />
            <Button variant="outline-primary" onClick={addList} disabled={listBusy || !newListName.trim()}>
              {listBusy ? <Spinner size="sm" animation="border" /> : t('common.add')}
            </Button>
          </InputGroup>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="fw-semibold d-flex justify-content-between align-items-center">
          <span>{t('dashboard.tags')}</span>
          {activeTag && (
            <Button
              variant="link"
              size="sm"
              className="p-0 text-decoration-none"
              onClick={() => setActiveTag(null)}
            >
              {t('common.clear')}
            </Button>
          )}
        </Card.Header>
        <Card.Body className="d-flex flex-wrap gap-1">
          {tagSuggestions.length === 0 && (
            <span className="text-secondary small">{t('dashboard.noTags')}</span>
          )}
          {tagSuggestions.map((tag) => (
            <Badge
              key={tag}
              as="button"
              bg={activeTag === tag ? 'primary' : 'secondary'}
              className="tag-chip border-0"
              onClick={() => setActiveTag((cur) => (cur === tag ? null : tag))}
            >
              #{tag}
            </Badge>
          ))}
        </Card.Body>
      </Card>
    </>
  );

  const emptyMessage =
    search.trim() || activeTag
      ? t('dashboard.emptyFiltered')
      : view.kind === 'today'
        ? t('dashboard.emptyToday')
        : view.kind === 'list'
          ? t('dashboard.emptyList')
          : t('dashboard.empty');

  return (
    <Container className="pb-5">
      <Row>
        <Col lg={3} className="mb-4 d-none d-lg-block">
          <div className="sidebar">{sidebarContent}</div>
        </Col>

        <Offcanvas show={showSidebar} onHide={() => setShowSidebar(false)}>
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>{t('dashboard.menu')}</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>{sidebarContent}</Offcanvas.Body>
        </Offcanvas>

        <Col lg={9}>
          <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                className="d-lg-none"
                onClick={() => setShowSidebar(true)}
                aria-label={t('dashboard.menu')}
              >
                ☰
              </Button>
              <h3 className="mb-0">
                {heading}
                {currentList && currentList.role !== 'owner' && (
                  <Badge
                    bg={currentList.can_edit ? 'info' : 'secondary'}
                    className="ms-2 align-middle"
                  >
                    {currentList.can_edit
                      ? t('dashboard.sharedCanEdit')
                      : t('dashboard.sharedReadOnly')}
                  </Badge>
                )}
                {activeTag && (
                  <Badge bg="primary" className="ms-2 align-middle">
                    #{activeTag}
                  </Badge>
                )}
              </h3>
            </div>

            {currentList && (
              <Dropdown align="end">
                <Dropdown.Toggle variant="outline-secondary" size="sm" id="list-actions" aria-label={t('dashboard.listActions')}>
                  ⋯
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {currentList.role === 'owner' ? (
                    <>
                      <Dropdown.Item onClick={() => setEditingList(currentList)}>
                        ✏️ {t('dashboard.editList')}
                      </Dropdown.Item>
                      <Dropdown.Item onClick={() => setShareList(currentList)}>
                        👥 {t('dashboard.sharePerson')}
                      </Dropdown.Item>
                      {currentList.shared_count > 0 && (
                        <Dropdown.Header className="small">
                          {t('dashboard.sharedWith', { count: currentList.shared_count })}
                        </Dropdown.Header>
                      )}
                      <Dropdown.Divider />
                      <Dropdown.Item
                        className="text-danger"
                        onClick={() => deleteList(currentList)}
                      >
                        {t('dashboard.deleteList')}
                      </Dropdown.Item>
                    </>
                  ) : (
                    <>
                      <Dropdown.Header className="small">
                        {t('dashboard.ownedBy', { email: currentList.owner_email })}
                      </Dropdown.Header>
                      <Dropdown.Item
                        className="text-danger"
                        onClick={() => leaveList(currentList)}
                      >
                        {t('dashboard.leaveList')}
                      </Dropdown.Item>
                    </>
                  )}
                </Dropdown.Menu>
              </Dropdown>
            )}
          </div>

          {stats.total > 0 && (
            <p className="text-secondary small mb-3">
              {t('dashboard.stats', { open: stats.open, done: stats.done })}
              {stats.overdue > 0 && (
                <Badge bg="danger" className="ms-2">
                  {t('dashboard.overdueCount', { count: stats.overdue })}
                </Badge>
              )}
            </p>
          )}

          {canEditCurrent ? (
            <InputGroup className="mb-3">
              <Form.Control
                ref={quickAddRef}
                placeholder={t('dashboard.quickAddPlaceholder')}
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    quickAdd();
                  }
                }}
                disabled={quickBusy}
              />
              <Button onClick={quickAdd} disabled={quickBusy || !quickTitle.trim()}>
                {quickBusy ? t('dashboard.adding') : t('common.add')}
              </Button>
              <Button
                variant="outline-secondary"
                onClick={expandQuickAdd}
                title={t('dashboard.moreOptionsTitle')}
                aria-label={t('dashboard.moreOptionsTitle')}
              >
                {t('dashboard.moreOptions')}
              </Button>
            </InputGroup>
          ) : (
            <Alert variant="secondary" className="py-2 mb-3 small">
              {t('dashboard.readonlyAlert')}
            </Alert>
          )}

          <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
            <Form.Control
              ref={searchRef}
              style={{ maxWidth: 280 }}
              placeholder={t('dashboard.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('dashboard.searchPlaceholder')}
            />
            <Form.Select
              style={{ maxWidth: 180 }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              aria-label={t('dashboard.sortBy')}
            >
              <option value="manual">{t('dashboard.sortManual')}</option>
              <option value="due">{t('dashboard.sortDue')}</option>
              <option value="title">{t('dashboard.sortTitle')}</option>
              <option value="completed">{t('dashboard.sortCompleted')}</option>
            </Form.Select>
            <Form.Check
              type="switch"
              id="show-completed"
              label={t('dashboard.showCompleted')}
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          {filtered.length === 0 ? (
            <Card body className="text-center py-5 empty-state">
              <div className="empty-icon mb-3" aria-hidden>✨</div>
              <p className="text-secondary mb-3">{emptyMessage}</p>
              {canEditCurrent && !search.trim() && !activeTag && (
                <Button variant="primary" onClick={() => openNew()}>
                  {t('dashboard.createFirstTask')}
                </Button>
              )}
            </Card>
          ) : (
            filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                lists={lists}
                canEdit={canEditTask(task)}
                busy={mutatingIds.has(task.id)}
                onToggle={toggleTask}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            ))
          )}

          <p className="text-secondary small mt-4 text-center keyboard-hints">
            {t('dashboard.keyboardHints')}
          </p>
        </Col>
      </Row>

      <TaskModal
        show={showModal}
        task={editing}
        lists={lists.filter((l) => l.can_edit)}
        tagSuggestions={tagSuggestions}
        defaultDate={view.kind === 'today' ? todayStr() : null}
        defaultListId={activeListId}
        defaultTitle={prefillTitle}
        onClose={() => setShowModal(false)}
        onSave={saveTask}
      />

      <ShareModal
        show={!!shareList}
        list={shareList}
        onClose={() => setShareList(null)}
        onChanged={loadMeta}
      />

      <ListModal
        show={!!editingList}
        list={editingList}
        onClose={() => setEditingList(null)}
        onSave={saveList}
      />
    </Container>
  );
}
