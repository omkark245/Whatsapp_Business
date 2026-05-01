const router = require('express').Router();
const c = require('../controllers/analyticsController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.get('/:waAccountId/usage', asyncHandler(c.getUsageAnalytics));
router.get('/:waAccountId', asyncHandler(c.getCampaignAnalytics));

module.exports = router;
