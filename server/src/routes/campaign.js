const router = require('express').Router();
const c = require('../controllers/campaignController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { createCampaignRules } = require('../validators/campaignValidators');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId', asyncHandler(c.getCampaigns));
router.post('/:waAccountId', createCampaignRules, validate, asyncHandler(c.createCampaign));
router.post('/:id/run', asyncHandler(c.runCampaign));
router.post('/:id/resend', asyncHandler(c.resendCampaign));
router.get('/:id/stats', asyncHandler(c.getCampaignStats));
router.delete('/:id', asyncHandler(c.deleteCampaign));

module.exports = router;
