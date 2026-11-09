import { Router } from 'express';
import { authRequired, actorOf } from '../auth';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createTaskSchema,
  updateTaskSchema,
} from '../validate';
import * as tasks from '../services/tasks';

const router = Router();
router.use(authRequired);

// GET /tasks?listId=&date=&today=true
router.get('/', (req, res) => {
  const { listId, date, today } = req.query;
  const target =
    typeof date === 'string' && date
      ? date
      : today === 'true'
        ? new Date().toISOString().slice(0, 10)
        : undefined;
  res.json(
    tasks.listTasks(actorOf(req), {
      listId: listId !== undefined && listId !== '' ? Number(listId) : undefined,
      date: target,
    })
  );
});

router.get('/:id', validateParams(idParamSchema), (req, res) => {
  res.json(tasks.getTask(actorOf(req), Number(req.params.id)));
});

router.post('/', validateBody(createTaskSchema), (req, res) => {
  res.status(201).json(tasks.createTask(actorOf(req), req.body));
});

router.put('/:id', validateParams(idParamSchema), validateBody(updateTaskSchema), (req, res) => {
  res.json(tasks.updateTask(actorOf(req), Number(req.params.id), req.body));
});

router.patch('/:id/toggle', validateParams(idParamSchema), (req, res) => {
  res.json(tasks.toggleTask(actorOf(req), Number(req.params.id)));
});

router.delete('/:id', validateParams(idParamSchema), (req, res) => {
  tasks.deleteTask(actorOf(req), Number(req.params.id));
  res.status(204).end();
});

export default router;
