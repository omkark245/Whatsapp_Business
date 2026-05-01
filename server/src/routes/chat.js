const router = require('express').Router();
const c = require('../controllers/chatController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { sendMessageRules, getContactsRules } = require('../validators/chatValidators');
const { asyncHandler } = require('../utils/errors');

router.use(auth);
router.get('/:waAccountId/contacts', getContactsRules, validate, asyncHandler(c.getContacts));
router.get('/messages/:contactId', asyncHandler(c.getMessages));
router.post('/send/:contactId', sendMessageRules, validate, asyncHandler(c.sendMessage));
router.post('/read/:contactId', asyncHandler(c.markAsRead));

module.exports = router;
