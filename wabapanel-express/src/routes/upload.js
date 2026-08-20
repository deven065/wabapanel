const router = require('express').Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { uploadFile, uploadMultiple, deleteFile } = require('../controllers/uploadController');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/amr',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ];
  // Accept any image format (jpg/png/gif/webp/svg/ico/bmp/avif/tiff/...) for logos,
  // favicons and other branding — dimensions/size don't matter. Some browsers send
  // .ico/.svg with a generic mimetype, so fall back to the file extension too.
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  const imageExts = ['ico', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tif', 'tiff', 'heic', 'heif'];
  const isImage = file.mimetype.startsWith('image/') || imageExts.includes(ext);
  // Accept any video format (mov/webm/mkv/avi/...) — the upload controller
  // transcodes non-mp4 videos to WhatsApp-compatible mp4.
  const videoExts = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'm4v'];
  const isVideo = file.mimetype.startsWith('video/') || videoExts.includes(ext);
  if (isImage || isVideo || allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // large source ok; media is compressed/transcoded to platform limits
});

router.use(protect);
router.post('/', upload.single('file'), uploadFile);
router.post('/multiple', upload.array('files', 10), uploadMultiple);
router.delete('/', deleteFile);

module.exports = router;
