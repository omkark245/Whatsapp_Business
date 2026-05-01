const router = require('express').Router();
const c = require('../controllers/contactGroupController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId', asyncHandler(c.getGroups));
router.post('/:waAccountId', requireAdmin, asyncHandler(c.createGroup));
router.post('/:id/contacts', requireAdmin, asyncHandler(c.addContacts));
router.patch('/:id/assignment', requireAdmin, asyncHandler(c.updateAssignment));
router.delete('/:id/contacts/:contactId', requireAdmin, asyncHandler(c.removeContact));
router.delete('/:id', requireAdmin, asyncHandler(c.deleteGroup));

module.exports = router;
