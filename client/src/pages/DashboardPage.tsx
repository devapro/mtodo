import { useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Button, ListGroup, Form, Alert, Spinner, InputGroup } from 'react-bootstrap';
import { api } from '../api';
import { List, Task, TaskInput } from '../types';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';

type View = { kind: 'today' } | { kind: 'all' } | { kind: 'list'; id: number };

// Local (not UTC) YYYY-MM-DD so "today" matches the user's calendar day.
const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export default function DashboardPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [view, setView] = useState<View>({ kind: 'today' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [newListName, setNewListName] = useState('');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

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
    if (!confirm(`Delete task "${task.title}"?`)) return;
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
    if (!confirm(`Delete list "${list.name}"? Tasks will be kept without a list.`)) return;
    await api.deleteList(list.id);
    setLists((prev) => prev.filter((l) => l.id !== list.id));
    if (view.kind === 'list' && view.id === list.id) setView({ kind: 'today' });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => (showCompleted ? true : !t.completed))
      .filter((t) =>
        q
          ? t.title.toLowerCase().includes(q) ||
            t.tags.some((tag) => tag.toLowerCase().includes(q))
          : true
      );
  }, [tasks, search, showCompleted]);

  const heading =
    view.kind === 'today'
      ? `Today · ${todayStr()}`
      : view.kind === 'all'
        ? 'All tasks'
        : lists.find((l) => l.id === view.id)?.name || 'List';

  const openNew = () => {
    setEditing(null);
    setShowModal(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setShowModal(true);
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
                  onClick={() => setView({ kind: 'today' })}
                >
                  ⭐ Today
                </ListGroup.Item>
                <ListGroup.Item
                  action
                  active={view.kind === 'all'}
                  onClick={() => setView({ kind: 'all' })}
                >
                  📋 All tasks
                </ListGroup.Item>
              </ListGroup>
            </Card>

            <Card>
              <Card.Header className="fw-semibold">Lists</Card.Header>
              <ListGroup variant="flush">
                {lists.map((l) => (
                  <ListGroup.Item
                    key={l.id}
                    action
                    active={view.kind === 'list' && view.id === l.id}
                    onClick={() => setView({ kind: 'list', id: l.id })}
                    className="d-flex justify-content-between align-items-center"
                  >
                    <span>📁 {l.name}</span>
                    <span
                      role="button"
                      className="text-danger small"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteList(l);
                      }}
                    >
                      ✕
                    </span>
                  </ListGroup.Item>
                ))}
                {lists.length === 0 && (
                  <ListGroup.Item className="text-secondary small">
                    No lists yet
                  </ListGroup.Item>
                )}
              </ListGroup>
              <Card.Body>
                <InputGroup size="sm">
                  <Form.Control
                    placeholder="New list"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addList()}
                  />
                  <Button variant="outline-primary" onClick={addList}>
                    Add
                  </Button>
                </InputGroup>
              </Card.Body>
            </Card>
          </div>
        </Col>

        <Col lg={9}>
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h3 className="mb-0">{heading}</h3>
            <Button onClick={openNew}>+ New task</Button>
          </div>

          <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
            <Form.Control
              style={{ maxWidth: 280 }}
              placeholder="Search tasks or #tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Form.Check
              type="switch"
              id="show-completed"
              label="Show completed"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          {filtered.length === 0 ? (
            <Card body className="text-center text-secondary py-5">
              Nothing here yet. Create your first task!
            </Card>
          ) : (
            filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                lists={lists}
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
        lists={lists}
        tagSuggestions={tagSuggestions}
        defaultDate={view.kind === 'today' ? todayStr() : null}
        onClose={() => setShowModal(false)}
        onSave={saveTask}
      />
    </Container>
  );
}
