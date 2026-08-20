// Extract plain text from an uploaded file buffer for the AI knowledge base.
// Supports PDF, Word (docx), Excel (xlsx/xls), CSV and plain text.
// Images/video are stored as references only (no text extracted).

const MAX_CHARS = 60000; // per-document cap

function clean(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

async function extractText(buffer, mimetype, filename) {
  const name = (filename || '').toLowerCase();
  const mt = (mimetype || '').toLowerCase();

  try {
    if (mt === 'application/pdf' || name.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return { text: clean(data.text), status: 'ready' };
    }

    if (
      mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: clean(value), status: 'ready' };
    }

    if (
      mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mt === 'application/vnd.ms-excel' ||
      name.endsWith('.xlsx') || name.endsWith('.xls')
    ) {
      const xlsx = require('xlsx');
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const parts = [];
      for (const sheetName of wb.SheetNames) {
        const csv = xlsx.utils.sheet_to_csv(wb.Sheets[sheetName]);
        if (csv && csv.trim()) parts.push(`# Sheet: ${sheetName}\n${csv}`);
      }
      return { text: clean(parts.join('\n\n')), status: 'ready' };
    }

    if (mt === 'text/csv' || mt.startsWith('text/') || name.endsWith('.csv') || name.endsWith('.txt')) {
      return { text: clean(buffer.toString('utf8')), status: 'ready' };
    }
  } catch (err) {
    return { text: '', status: 'error', note: err.message };
  }

  // Images, video, audio and other binaries: no text extraction.
  return { text: '', status: 'no_text', note: 'No text extracted (file stored for reference only)' };
}

// Combine all ready knowledge-doc texts for a workspace into one string (capped).
async function getWorkspaceKnowledge(workspaceId, maxChars = 20000) {
  const AIKnowledgeDoc = require('../models/AIKnowledgeDoc');
  const docs = await AIKnowledgeDoc.find({
    workspace: workspaceId,
    status: 'ready',
    chars: { $gt: 0 },
  }).select('filename extractedText').lean();
  let out = '';
  for (const d of docs) {
    const block = `\n\n--- ${d.filename} ---\n${d.extractedText}`;
    if (out.length + block.length > maxChars) {
      out += block.slice(0, Math.max(0, maxChars - out.length));
      break;
    }
    out += block;
  }
  return out.trim();
}

module.exports = { extractText, getWorkspaceKnowledge, MAX_CHARS };
