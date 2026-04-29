const express = require('express');
const router = express.Router();
const { receiveMessage, verifyWebhook } = require('../webhooks/whatsapp');

router.get('/', verifyWebhook);
router.post('/', receiveMessage);

module.exports = router;