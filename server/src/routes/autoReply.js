const router = require('express').Router();
const c = require('../controllers/autoReplyController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const validate = require('../middlewares/validate');
const { createAutoReplyRules, updateAutoReplyRules } = require('../validators/autoReplyValidators');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.get('/:waAccountId', asyncHandler(c.getAutoReplies));
router.post('/:waAccountId', createAutoReplyRules, validate, asyncHandler(c.createAutoReply));
router.put('/:id', updateAutoReplyRules, validate, asyncHandler(c.updateAutoReply));
router.patch('/:id/toggle', asyncHandler(c.toggleAutoReply));
router.delete('/:id', asyncHandler(c.deleteAutoReply));

module.exports = router;
