const router = require('express').Router();
const c = require('../controllers/templateController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId', asyncHandler(c.getTemplates));
router.post('/:waAccountId', requireAdmin, asyncHandler(c.createTemplate));
router.post('/:waAccountId/sync', requireAdmin, asyncHandler(c.syncTemplates));
router.put('/:id', requireAdmin, asyncHandler(c.updateTemplate));
router.delete('/:id', requireAdmin, asyncHandler(c.deleteTemplate));

module.exports = router;
