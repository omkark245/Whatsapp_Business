const router = require('express').Router();
const c = require('../controllers/waAccountController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const validate = require('../middlewares/validate');
const { connectOAuthRules, connectManualRules, updateAccountRules } = require('../validators/waAccountValidators');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/', asyncHandler(c.getAccounts));
router.get('/:id/business-profile', requireAdmin, asyncHandler(c.getBusinessProfile));
router.post('/connect', requireAdmin, connectOAuthRules, validate, asyncHandler(c.connectAccount));
router.post('/connect-manual', requireAdmin, connectManualRules, validate, asyncHandler(c.connectManual));
router.patch('/:id', requireAdmin, updateAccountRules, validate, asyncHandler(c.updateAccount));
router.patch('/:id/business-profile', requireAdmin, asyncHandler(c.updateBusinessProfile));
router.delete('/:id', requireAdmin, asyncHandler(c.deleteAccount));

module.exports = router;
