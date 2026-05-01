const router = require('express').Router();
const c = require('../controllers/quickReplyController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId', asyncHandler(c.getQuickReplies));
router.post('/:waAccountId', requireAdmin, asyncHandler(c.createQuickReply));
router.put('/:id', requireAdmin, asyncHandler(c.updateQuickReply));
router.patch('/:id/toggle', requireAdmin, asyncHandler(c.toggleQuickReply));
router.delete('/:id', requireAdmin, asyncHandler(c.deleteQuickReply));

module.exports = router;
