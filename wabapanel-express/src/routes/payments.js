const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  subscribe, startTrial, verifyPayment, walletTopup, verifyWalletTopup, verifyHostedPayment,
  getPaymentHistory, getWalletTransactions, getPlans, createOrder, getWalletHistory,
  downloadInvoice, getEnabledGateways, getAutoRenewStatus, cancelAutoRenew, getClientCurrencies,
  deletePaymentHistory,
} = require('../controllers/paymentController');

router.use(protect);
router.get('/plans', getPlans);
router.get('/gateways', getEnabledGateways);
router.get('/currencies', getClientCurrencies);
router.post('/order', createOrder);
router.post('/subscribe', subscribe);
router.post('/start-trial', startTrial);
router.post('/verify', verifyPayment);
router.post('/hosted/verify', verifyHostedPayment);
router.post('/wallet/topup', walletTopup);
router.post('/wallet/verify', verifyWalletTopup);
router.get('/history', getPaymentHistory);
router.delete('/history/:id', deletePaymentHistory);
router.get('/wallet/transactions', getWalletTransactions);
router.get('/wallet/history', getWalletHistory);
router.get('/invoice/:id', downloadInvoice);
router.get('/auto-renew', getAutoRenewStatus);
router.post('/auto-renew/cancel', cancelAutoRenew);

module.exports = router;
