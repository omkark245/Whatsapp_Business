const router = require('express').Router();
const c = require('../controllers/contactController');
const auth = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roles');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId/export', asyncHandler(c.exportContacts));
router.get('/:waAccountId/search', asyncHandler(c.searchContacts));
router.post('/:waAccountId', requireAdmin, asyncHandler(c.createContact));
router.post('/:waAccountId/import', requireAdmin, asyncHandler(c.importContacts));
router.post('/:waAccountId/bulk-message', requireAdmin, asyncHandler(c.sendBulkMessage));
router.post('/:waAccountId/bulk-assign', requireAdmin, asyncHandler(c.bulkAssign));
router.patch('/:waAccountId/:contactId/assignment', requireAdmin, asyncHandler(c.updateAssignment));
router.put('/:waAccountId/:contactId', requireAdmin, asyncHandler(c.updateContact));
router.delete('/:waAccountId', requireAdmin, asyncHandler(c.deleteContacts));

module.exports = router;
