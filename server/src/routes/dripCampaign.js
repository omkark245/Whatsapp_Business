const router = require('express').Router();
const c = require('../controllers/dripCampaignController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const validate = require('../middlewares/validate');
const { createDripCampaignRules } = require('../validators/dripCampaignValidators');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.get('/:waAccountId', asyncHandler(c.getDripCampaigns));
router.post('/:waAccountId', createDripCampaignRules, validate, asyncHandler(c.createDripCampaign));
router.put('/:id', asyncHandler(c.updateDripCampaign));
router.post('/:id/activate', asyncHandler(c.activateDripCampaign));
router.post('/:id/pause', asyncHandler(c.pauseDripCampaign));
router.get('/:id/stats', asyncHandler(c.getDripCampaignStats));
router.delete('/:id', asyncHandler(c.deleteDripCampaign));

module.exports = router;
