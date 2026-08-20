const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getAppointments, getAppointment, createAppointment, updateAppointment, deleteAppointment, sendReminder, rescheduleAppointment, cancelAppointment, getAvailability, updateAvailability, getSlots } = require('../controllers/appointmentController');

router.use(protect, workspaceAccess);
router.use(requireFeature('appointments'));
router.get('/availability', getAvailability);
router.put('/availability', updateAvailability);
router.get('/slots', getSlots);
router.get('/', getAppointments);
router.post('/', createAppointment);
router.get('/:id', getAppointment);
router.put('/:id', updateAppointment);
router.delete('/:id', deleteAppointment);
router.post('/:id/reminder', sendReminder);
router.post('/:id/reschedule', rescheduleAppointment);
router.post('/:id/cancel', cancelAppointment);

module.exports = router;
