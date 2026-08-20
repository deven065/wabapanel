const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getTeams, getTeam, createTeam, updateTeam, deleteTeam,
  listAgents, addAgent, removeAgent, agentPerformance, loginAsAgent,
} = require('../controllers/teamController');

router.use(protect, workspaceAccess);
router.use(requireFeature('teams'));
router.get('/', getTeams);
router.get('/agents', listAgents);
router.get('/performance', agentPerformance);
router.post('/agents', addAgent);
router.delete('/agents/:id', removeAgent);
router.post('/agents/:id/login-as', loginAsAgent);
router.put('/agents/:id', require('../controllers/teamController').updateAgent);
router.post('/', createTeam);
router.get('/:id', getTeam);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);

module.exports = router;
