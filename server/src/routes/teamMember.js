const router = require('express').Router();
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const controller = require('../controllers/teamMemberController');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.get('/', asyncHandler(controller.getMembers));
router.post('/', asyncHandler(controller.createMember));
router.patch('/:id', asyncHandler(controller.updateMember));
router.delete('/:id', asyncHandler(controller.deleteMember));
router.post('/:id/reset-password', asyncHandler(controller.resetPassword));

module.exports = router;
