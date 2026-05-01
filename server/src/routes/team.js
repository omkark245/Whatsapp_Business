const router = require('express').Router();
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const controller = require('../controllers/teamController');
const { asyncHandler } = require('../utils/errors');

router.use(auth, requireAdmin);
router.get('/', asyncHandler(controller.getTeams));
router.post('/', asyncHandler(controller.createTeam));
router.patch('/:id', asyncHandler(controller.updateTeam));
router.delete('/:id', asyncHandler(controller.deleteTeam));

module.exports = router;
