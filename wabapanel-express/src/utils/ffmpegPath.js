// Resolve a usable ffmpeg binary. Customer installs do not always have system
// ffmpeg (install.sh never installs it), which silently broke voice-note/video
// conversion. Prefer an explicit FFMPEG_PATH, then the bundled static binary
// shipped with the app (vendor/ffmpeg), then the npm ffmpeg-static package, and
// finally the system 'ffmpeg' on PATH.
const fs = require('fs');
const path = require('path');

let _cached = null;

function _usable(p) {
  try {
    if (!p) return false;
    if (!fs.existsSync(p)) return false;
    // Ensure the bundled binary is executable (file-copy patches can drop the +x bit).
    try { fs.chmodSync(p, 0o755); } catch { /* best effort */ }
    return true;
  } catch { return false; }
}

function resolveFfmpeg() {
  if (_cached) return _cached;
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  // Bundled static binary: src/utils -> ../../vendor/ffmpeg
  candidates.push(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
  try { const s = require('ffmpeg-static'); if (s) candidates.push(s); } catch { /* not installed */ }
  for (const c of candidates) {
    if (_usable(c)) { _cached = c; return _cached; }
  }
  _cached = 'ffmpeg'; // system PATH fallback
  return _cached;
}

module.exports = { resolveFfmpeg };
