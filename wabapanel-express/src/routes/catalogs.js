const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getProducts, getProduct, createProduct, updateProduct, deleteProduct,
  getPublicCatalog, createPublicOrder, shareCatalog, syncToMeta,
} = require('../controllers/catalogController');

// Public shareable catalogue + checkout (no auth) — must be registered before the auth guard.
router.get('/public/:wsId', getPublicCatalog);
router.post('/public/:wsId/order', createPublicOrder);

router.use(protect, workspaceAccess);
router.use(requireFeature('ecommerce'));
router.get('/', getProducts);
router.post('/', createProduct);
router.post('/share', shareCatalog);
router.post('/sync', syncToMeta);
router.get('/:id', getProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
