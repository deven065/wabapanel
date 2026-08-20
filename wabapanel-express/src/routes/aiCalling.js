const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getAgents, getAgent, createAgent, updateAgent, deleteAgent,
  initiateCall, getCallStatus, terminateCall, requestCallPermission,
  getIncomingCalls, acceptCall, rejectCall,
  getCallLogs, setDefaultAgent, aiCall,
  getCallHistory, uploadRecording,
} = require('../controllers/aiCallingController');
const {
  getCallCampaigns, getCallCampaign, createCallCampaign,
  startCallCampaign, pauseCallCampaign, deleteCallCampaign,
} = require('../controllers/callCampaignController');
const multer = require('multer');
const recUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(protect, workspaceAccess);
router.use(requireFeature('aiCalling'));
router.get('/', getAgents);
router.post('/', createAgent);
router.post('/call', initiateCall);
router.post('/ai-call', aiCall);
router.get('/incoming', getIncomingCalls);
router.get('/call/:callId', getCallStatus);
router.post('/call/:callId/terminate', terminateCall);
router.post('/call/:callId/accept', acceptCall);
router.post('/call/:callId/reject', rejectCall);
router.post('/request-permission', requestCallPermission);
router.get('/logs', getCallLogs);
router.get('/history', getCallHistory);
router.post('/call/:callId/recording', recUpload.single('file'), uploadRecording);
router.post('/default-agent', setDefaultAgent);
router.get('/campaigns', getCallCampaigns);
router.post('/campaigns', createCallCampaign);
router.get('/campaigns/:id', getCallCampaign);
router.post('/campaigns/:id/start', startCallCampaign);
router.post('/campaigns/:id/pause', pauseCallCampaign);
router.delete('/campaigns/:id', deleteCallCampaign);
router.get('/:id', getAgent);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

module.exports = router;
