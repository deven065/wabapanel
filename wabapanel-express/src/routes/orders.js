const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getOrders, getOrder, createOrder, updateOrder, deleteOrder,
} = require('../controllers/orderController');

router.use(protect, workspaceAccess);
router.use(requireFeature('ecommerce'));
router.get('/', getOrders);
router.post('/', createOrder);
router.get('/:id', getOrder);
router.put('/:id', updateOrder);
router.delete('/:id', deleteOrder);

module.exports = router;
