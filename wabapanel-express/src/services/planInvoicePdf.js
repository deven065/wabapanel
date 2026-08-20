const PDFDocument = require('pdfkit');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');

// Builds a branded PDF invoice for a plan/wallet Payment.
// Returns { buffer, invoiceNo, email }.
async function buildPlanInvoicePdf(payment) {
  const settings = await SystemSettings.findOne().lean();
  const user = payment.user && payment.user.email ? payment.user : await User.findById(payment.user);
  const inv = (settings && settings.invoice) || {};
  const appName = inv.companyName || (settings && settings.appName) || 'WabaPanel';
  const brand = (settings && settings.primaryColor) || '#059669';
  const currency = payment.currency || 'INR';
  const sym = currency === 'INR' ? 'Rs. ' : currency + ' ';
  const money = (n) => sym + Number(n || 0).toFixed(2);
  const itemName = payment.type === 'wallet_topup' ? 'Wallet Top-up' : ((payment.plan && payment.plan.name ? payment.plan.name + ' Plan' : 'Subscription'));
  const invoiceNo = 'INV-' + payment._id.toString().slice(-8).toUpperCase();

  const defaultTax = settings && Array.isArray(settings.taxes) ? settings.taxes.find(t => t.isDefault && t.isActive) : null;
  const taxRate = defaultTax ? defaultTax.rate : 0;
  const taxName = defaultTax ? defaultTax.name : 'Tax';
  const gross = Number(payment.amount || 0);
  const base = taxRate > 0 ? gross / (1 + taxRate / 100) : gross;
  const taxAmount = gross - base;

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Header band
  doc.rect(0, 0, 595, 110).fill(brand);
  doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text(appName, 50, 32);
  doc.fontSize(9).font('Helvetica').fillColor('#ffffffcc');
  let hy = 62;
  if (inv.address) { doc.fillColor('#ffffff').opacity(0.85).text(inv.address, 50, hy, { width: 280 }); hy = doc.y + 2; }
  const contactBits = [inv.phone, inv.email].filter(Boolean).join('  |  ');
  if (contactBits) { doc.text(contactBits, 50, hy, { width: 280 }); }
  doc.opacity(1);
  doc.fillColor('#ffffff').fontSize(26).font('Helvetica-Bold').text('INVOICE', 380, 32, { width: 165, align: 'right' });
  doc.fontSize(10).font('Helvetica').text(invoiceNo, 380, 66, { width: 165, align: 'right' });
  doc.text(new Date(payment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), 380, 80, { width: 165, align: 'right' });

  // Status + GSTIN row
  let y = 130;
  const paid = payment.status === 'completed';
  doc.roundedRect(50, y, 90, 22, 11).fill(paid ? '#d1fae5' : '#fef3c7');
  doc.fillColor(paid ? '#065f46' : '#92400e').fontSize(10).font('Helvetica-Bold')
    .text(String(payment.status || '').toUpperCase(), 50, y + 6, { width: 90, align: 'center' });
  if (inv.gstin) {
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica').text(`GSTIN: ${inv.gstin}`, 300, y + 7, { width: 245, align: 'right' });
  }

  // Billed To
  y += 45;
  doc.fillColor('#9ca3af').fontSize(9).font('Helvetica-Bold').text('BILLED TO', 50, y);
  doc.font('Helvetica').fontSize(11).fillColor('#111827');
  y += 14;
  if (user) {
    doc.text(user.companyName || user.name || '', 50, y);
    y = doc.y;
    if (user.companyName && user.name) { doc.fontSize(10).fillColor('#374151').text(user.name, 50, y); y = doc.y; }
    doc.fontSize(10).fillColor('#6b7280');
    if (user.email) { doc.text(user.email, 50, y); y = doc.y; }
    if (user.phone) { doc.text(user.phone, 50, y); y = doc.y; }
  }

  // Items table
  y += 25;
  doc.rect(50, y, 495, 26).fill('#f3f4f6');
  doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold');
  doc.text('DESCRIPTION', 62, y + 8);
  doc.text('AMOUNT', 380, y + 8, { width: 153, align: 'right' });
  y += 26;
  doc.font('Helvetica').fillColor('#111827').fontSize(11);
  doc.text(itemName, 62, y + 10);
  doc.text(money(taxRate > 0 ? base : gross), 380, y + 10, { width: 153, align: 'right' });
  y += 34;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();

  // Totals
  y += 14;
  doc.fontSize(10).fillColor('#6b7280');
  if (taxRate > 0) {
    doc.text('Subtotal', 330, y, { width: 120 });
    doc.fillColor('#111827').text(money(base), 450, y, { width: 83, align: 'right' });
    y += 18;
    doc.fillColor('#6b7280').text(`${taxName} (${taxRate}%)`, 330, y, { width: 120 });
    doc.fillColor('#111827').text(money(taxAmount), 450, y, { width: 83, align: 'right' });
    y += 22;
  }
  doc.rect(320, y, 225, 30).fill(brand);
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold');
  doc.text('TOTAL', 332, y + 9);
  doc.text(money(gross), 440, y + 9, { width: 93, align: 'right' });

  // Footer
  y += 60;
  doc.font('Helvetica').fontSize(9).fillColor('#9ca3af');
  doc.text(`Payment Gateway: ${payment.gateway || '-'}`, 50, y);
  y = doc.y + 6;
  doc.text(inv.footerNote || 'Thank you for your business.', 50, y, { width: 495 });
  doc.moveTo(50, 780).lineTo(545, 780).strokeColor('#e5e7eb').stroke();
  doc.fontSize(8).fillColor('#b0b7c3').text(`${appName} — ${invoiceNo}`, 50, 788, { width: 495, align: 'center' });

  doc.end();
  return { buffer: await done, invoiceNo, email: user && user.email };
}

module.exports = { buildPlanInvoicePdf };
