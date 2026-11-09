import { Router } from 'express';
import { authRequired, actorOf } from '../auth';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createListSchema,
  updateListSchema,
  shareListSchema,
} from '../validate';
import * as lists from '../services/lists';

const router = Router();
router.use(authRequired);

// GET /lists - owned lists + lists shared with the current user
router.get('/', (req, res) => {
  res.json(lists.listLists(actorOf(req)));
});

router.post('/', validateBody(createListSchema), (req, res) => {
  res.status(201).json(lists.createList(actorOf(req), req.body));
});

router.put('/:id', validateParams(idParamSchema), validateBody(updateListSchema), (req, res) => {
  res.json(lists.updateList(actorOf(req), Number(req.params.id), req.body));
});

router.delete('/:id', validateParams(idParamSchema), (req, res) => {
  lists.deleteList(actorOf(req), Number(req.params.id));
  res.status(204).end();
});

// ----- Sharing -----

// GET /lists/:id/shares - owner only
router.get('/:id/shares', validateParams(idParamSchema), (req, res) => {
  res.json(lists.listShares(actorOf(req), Number(req.params.id)));
});

// POST /lists/:id/shares { email, can_edit } - owner only, upsert
router.post(
  '/:id/shares',
  validateParams(idParamSchema),
  validateBody(shareListSchema),
  (req, res) => {
    res
      .status(201)
      .json(lists.shareList(actorOf(req), Number(req.params.id), req.body.email, req.body.can_edit));
  }
);

// DELETE /lists/:id/shares/:userId
// Owner can revoke anyone; a shared user can remove themselves (leave).
router.delete('/:id/shares/:userId', (req, res) => {
  lists.removeShare(actorOf(req), Number(req.params.id), Number(req.params.userId));
  res.status(204).end();
});

export default router;
