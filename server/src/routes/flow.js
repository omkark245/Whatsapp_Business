const router = require('express').Router();
const c = require('../controllers/flowController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.get('/:waAccountId', asyncHandler(c.getFlows));
router.get('/detail/:id', asyncHandler(c.getFlow));
router.post('/:waAccountId/starter', asyncHandler(c.createStarterFlow));
router.post('/:waAccountId', asyncHandler(c.createFlow));
router.put('/:id', asyncHandler(c.updateFlow));
router.patch('/:id/toggle', asyncHandler(c.toggleFlow));
router.delete('/:id', asyncHandler(c.deleteFlow));

module.exports = router;
