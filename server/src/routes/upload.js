const router = require('express').Router();
const auth = require('../middlewares/auth');
const controller = require('../controllers/uploadController');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.post('/media', asyncHandler(controller.uploadMedia));

module.exports = router;
