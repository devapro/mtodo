import { useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Button, ListGroup, Form, Alert, Spinner, InputGroup, Badge, Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { List, Task, TaskInput } from '../types';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import ShareModal from '../components/ShareModal';
import { useAuth } from '../context/AuthContext';

// Icon used in the sidebar to distinguish list ownership/sharing.
const listIcon = (l: List): string => {
  if (l.role === 'owner') return l.shared_count > 0 ? '🔗' : '📁';
  return '👥'; // shared with me
};

type View = { kind: 'today' } | { kind: 'all' } | { kind: 'list'; id: number };

// Local (not UTC) YYYY-MM-DD so "today" matches the user's calendar day.
const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
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

  const activeListId = view.kind === 'list' ? view.id : null;
  const currentList = view.kind === 'list' ? lists.find((l) => l.id === view.id) : undefined;
  // In a list view, whether the current user may add/modify tasks here.
  const canEditCurrent = view.kind !== 'list' || !!currentList?.can_edit;

  // Per-task edit permission (own task, or task in a list you can edit).
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
    const [l, t] = await Promise.all([api.getLists(), api.getTags()]);
    setLists(l);
    setTagSuggestions(t.map((x) => x.name));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMeta(), loadTasks()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const saveTask = async (input: TaskInput, id?: number) => {
    if (id) await api.updateTask(id, input);
    else await api.createTask(input);
    await Promise.all([loadTasks(), loadMeta()]);
  };

  const toggleTask = async (task: Task) => {
    const updated = await api.toggleTask(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  };

  const deleteTask = async (task: Task) => {
    if (!confirm(t('dashboard.confirmDeleteTask', { title: task.title }))) return;
    await api.deleteTask(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  };

  const addList = async () => {
    const name = newListName.trim();
    if (!name) return;
    const list = await api.createList(name);
    setLists((prev) => [...prev, list]);
    setNewListName('');
  };

  const deleteList = async (list: List) => {
    if (!confirm(t('dashboard.confirmDeleteList', { name: list.name }))) return;
    await api.deleteList(list.id);
    setLists((prev) => prev.filter((l) => l.id !== list.id));
    if (view.kind === 'list' && view.id === list.id) setView({ kind: 'today' });
  };

  const leaveList = async (list: List) => {
    if (!user) return;
    if (!confirm(t('dashboard.confirmLeaveList', { name: list.name }))) return;
    await api.leaveList(list.id, user.id);
    setLists((prev) => prev.filter((l) => l.id !== list.id));
    if (view.kind === 'list' && view.id === list.id) setView({ kind: 'today' });
  };

  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickBusy(true);
    try {
      await saveTask({
        title,
        list_id: activeListId,
        due_date: view.kind === 'today' ? todayStr() : null,
      });
      setQuickTitle('');
    } finally {
      setQuickBusy(false);
    }
  };

  const changeView = (next: View) => {
    setActiveTag(null);
    setView(next);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => (showCompleted ? true : !t.completed))
      .filter((t) => (activeTag ? t.tags.includes(activeTag) : true))
      .filter((t) =>
        q
          ? t.title.toLowerCase().includes(q) ||
            t.tags.some((tag) => tag.toLowerCase().includes(q))
          : true
      );
  }, [tasks, search, showCompleted, activeTag]);

  const heading =
    view.kind === 'today'
      ? t('dashboard.headingToday', { date: todayStr() })
      : view.kind === 'all'
        ? t('dashboard.headingAll')
        : lists.find((l) => l.id === view.id)?.name || t('dashboard.headingList');

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

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  return (
    <Container className="pb-5">
      <Row>
        <Col lg={3} className="mb-4">
          <div className="sidebar">
            <Card className="mb-3">
              <ListGroup variant="flush">
                <ListGroup.Item
                  action
                  active={view.kind === 'today'}
                  onClick={() => changeView({ kind: 'today' })}
                >
                  {t('dashboard.today')}
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
                      {listIcon(l)} {l.name}
                    </span>
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
                  />
                  <Button variant="outline-primary" onClick={addList}>
                    {t('common.add')}
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
                {tagSuggestions.map((t) => (
                  <Badge
                    key={t}
                    bg={activeTag === t ? 'primary' : 'secondary'}
                    className="tag-chip"
                    role="button"
                    onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
                  >
                    #{t}
                  </Badge>
                ))}
              </Card.Body>
            </Card>
          </div>
        </Col>

        <Col lg={9}>
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
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

            {currentList && (
              <Dropdown align="end">
                <Dropdown.Toggle variant="outline-secondary" size="sm" id="list-actions">
                  ⋯
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {currentList.role === 'owner' ? (
                    <>
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

          {canEditCurrent ? (
            <InputGroup className="mb-3">
              <Form.Control
                placeholder={t('dashboard.quickAddPlaceholder')}
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    quickAdd();
                  }
                }}
              />
              <Button onClick={quickAdd} disabled={quickBusy || !quickTitle.trim()}>
                {quickBusy ? t('dashboard.adding') : t('common.add')}
              </Button>
              <Button
                variant="outline-secondary"
                onClick={expandQuickAdd}
                title={t('dashboard.moreOptionsTitle')}
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
              style={{ maxWidth: 280 }}
              placeholder={t('dashboard.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            <Card body className="text-center text-secondary py-5">
              {t('dashboard.empty')}
            </Card>
          ) : (
            filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                lists={lists}
                canEdit={canEditTask(task)}
                onToggle={toggleTask}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            ))
          )}
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
    </Container>
  );
}
