const router = require('express').Router();
const c = require('../controllers/labelController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId', asyncHandler(c.getLabels));
router.post('/:waAccountId', requireAdmin, asyncHandler(c.createLabel));
router.put('/:id', requireAdmin, asyncHandler(c.updateLabel));
router.delete('/:id', requireAdmin, asyncHandler(c.deleteLabel));
router.post('/:labelId/assign', requireAdmin, asyncHandler(c.assignLabel));
router.delete('/:labelId/contacts/:contactId', requireAdmin, asyncHandler(c.removeLabel));

module.exports = router;
