const router = require('express').Router();
const c = require('../controllers/authController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { registerRules, loginRules } = require('../validators/authValidators');
const { asyncHandler } = require('../utils/errors');

router.post('/register', registerRules, validate, asyncHandler(c.register));
router.post('/login', loginRules, validate, asyncHandler(c.login));
router.post('/mobile/register', registerRules, validate, asyncHandler(c.registerMobile));
router.post('/mobile/login', loginRules, validate, asyncHandler(c.loginMobile));
router.post('/change-password', auth, asyncHandler(c.changePassword));
router.post('/logout', c.logout);
router.get('/me', auth, asyncHandler(c.me));

module.exports = router;
