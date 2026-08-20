const router = require("express").Router();
const { protect, workspaceAccess } = require("../middleware/auth");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");

router.use(protect, workspaceAccess);

// Build a PDF invoice for an order Invoice and return it as a Buffer.
async function buildInvoicePdfBuffer(invoice, workspace) {
  const PDFDocument = require("pdfkit");
  const SystemSettings = require("../models/SystemSettings");
  const settings = await SystemSettings.findOne();
  const appName = (settings && settings.appName) || (workspace && workspace.name) || "WabaPanel";
  const sym = "Rs. ";
  const money = (n) => sym + Number(n || 0).toFixed(2);
  const contact = invoice.contact || {};

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.fontSize(22).fillColor("#10b981").text(appName, { align: "left" });
  doc.fontSize(20).fillColor("#111827").text("INVOICE", 0, 50, { align: "right" });
  doc.moveDown(2);

  doc.fontSize(10).fillColor("#374151");
  doc.text(`Invoice No: ${invoice.invoiceNumber}`);
  doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`);
  doc.text(`Status: ${String(invoice.status || "pending").toUpperCase()}`);
  doc.moveDown();

  doc.fillColor("#6b7280").text("Billed To:");
  doc.fillColor("#111827").text(contact.name || "Customer");
  if (contact.email) doc.text(contact.email);
  if (contact.phone) doc.text(contact.phone);
  doc.moveDown(2);

  const tableTop = doc.y;
  doc.fillColor("#6b7280").fontSize(10);
  doc.text("Description", 50, tableTop);
  doc.text("Qty", 330, tableTop, { width: 60, align: "right" });
  doc.text("Amount", 0, tableTop, { align: "right" });
  doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).strokeColor("#e5e7eb").stroke();

  let y = tableTop + 26;
  doc.fillColor("#111827");
  (invoice.items || []).forEach((it) => {
    doc.text(it.name || "Item", 50, y, { width: 270 });
    doc.text(String(it.quantity || 1), 330, y, { width: 60, align: "right" });
    doc.text(money((it.price || 0) * (it.quantity || 1)), 0, y, { align: "right" });
    y += 22;
  });
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
  y += 10;
  if (invoice.tax) { doc.fontSize(10).fillColor("#374151").text("Tax", 50, y); doc.text(money(invoice.tax), 0, y, { align: "right" }); y += 20; }
  if (invoice.discount) { doc.fontSize(10).fillColor("#374151").text("Discount", 50, y); doc.text("-" + money(invoice.discount), 0, y, { align: "right" }); y += 20; }
  doc.fontSize(13).fillColor("#111827").text("Total", 50, y);
  doc.text(money(invoice.total), 0, y, { align: "right" });

  doc.moveDown(4);
  doc.fontSize(9).fillColor("#6b7280").text("Thank you for your business.", 50);
  doc.end();
  return done;
}

// Build a PDF invoice for a plan Payment and return it as a Buffer.
async function buildPaymentPdfBuffer(payment, workspace) {
  const { buildPlanInvoicePdf } = require("../services/planInvoicePdf");
  return buildPlanInvoicePdf(payment);
}
async function emailPaymentInvoice(payment, workspace, toOverride) {
  const built = await buildPaymentPdfBuffer(payment, workspace);
  const to = (toOverride || built.email || "").trim();
  if (!to) throw new Error(`No email address on file for invoice ${built.invoiceNo}`);
  const ec = workspace.emailChannel || {};
  if (!ec.enabled || !ec.smtpHost || !ec.user) {
    throw new Error("Email channel is not connected (configure SMTP on the Channels page)");
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: ec.smtpHost, port: ec.smtpPort || 587, secure: (ec.smtpPort || 587) === 465, family: 4,
    auth: { user: ec.user, pass: ec.pass },
  });
  await transporter.sendMail({
    from: ec.fromName ? `"${ec.fromName}" <${ec.user}>` : ec.user,
    to,
    subject: `Invoice ${built.invoiceNo}`,
    text: `Please find attached invoice ${built.invoiceNo} for a total of Rs. ${Number(payment.amount || 0).toFixed(2)}.`,
    attachments: [{ filename: `invoice-${built.invoiceNo}.pdf`, content: built.buffer }],
  });
  return to;
}

async function emailInvoice(invoice, workspace, toOverride) {
  const to = (toOverride || (invoice.contact && invoice.contact.email) || "").trim();
  if (!to) throw new Error(`No email address for invoice ${invoice.invoiceNumber}`);
  const ec = workspace.emailChannel || {};
  if (!ec.enabled || !ec.smtpHost || !ec.user) {
    throw new Error("Email channel is not connected (configure SMTP on the Channels page)");
  }
  const pdf = await buildInvoicePdfBuffer(invoice, workspace);
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: ec.smtpHost, port: ec.smtpPort || 587, secure: (ec.smtpPort || 587) === 465, family: 4,
    auth: { user: ec.user, pass: ec.pass },
  });
  await transporter.sendMail({
    from: ec.fromName ? `"${ec.fromName}" <${ec.user}>` : ec.user,
    to,
    subject: `Invoice ${invoice.invoiceNumber}`,
    text: `Please find attached invoice ${invoice.invoiceNumber} for a total of Rs. ${Number(invoice.total || 0).toFixed(2)}.`,
    attachments: [{ filename: `invoice-${invoice.invoiceNumber}.pdf`, content: pdf }],
  });
  return to;
}

router.get("/", async (req, res) => {
  try {
    const invoices = await Invoice.find({ workspace: req.workspace._id }).sort("-createdAt").populate("contact", "name phone email");

    // Subscription / plan billing entries — sourced from both actual plan
    // Payments (gateway/manual purchases) and Subscription assignments.
    const vendorId = req.workspace.owner || req.user._id;
    const subscriptions = [];
    const seenPayments = new Set();

    // 1) Real plan payments (same source as the Transactions page).
    const payments = await Payment.find({
      user: { $in: [req.user._id, vendorId] },
      type: { $in: ["subscription", "one_time"] },
      status: { $in: ["completed", "pending", "refunded"] },
    }).sort("-createdAt").populate("plan", "name price currency interval");

    for (const pay of payments) {
      seenPayments.add(String(pay._id));
      const p = pay.plan || {};
      subscriptions.push({
        _id: String(pay._id),
        source: "payment",
        invoiceNumber: "SUB-" + String(pay._id).slice(-6).toUpperCase(),
        planName: p.name || pay.description || "Plan",
        amount: pay.amount,
        currency: pay.currency || "INR",
        interval: p.interval || "monthly",
        status: pay.status,
        gateway: pay.gateway,
        startDate: pay.createdAt,
        endDate: null,
        createdAt: pay.createdAt,
      });
    }

    // 2) Subscription assignments (e.g. manually assigned by admin) that don't
    //    already have a payment above.
    const subs = await Subscription.find({ vendor: vendorId })
      .sort("-createdAt")
      .populate("plan", "name price currency interval")
      .populate("payment", "amount currency status gateway createdAt");

    for (const s of subs) {
      if (s.payment && seenPayments.has(String(s.payment._id))) continue;
      const p = s.plan || {};
      const pay = s.payment || null;
      subscriptions.push({
        _id: String(s._id),
        source: "subscription",
        invoiceNumber: "SUB-" + String(s._id).slice(-6).toUpperCase(),
        planName: p.name || "Plan",
        amount: pay ? pay.amount : (p.price || 0),
        currency: (pay && pay.currency) || p.currency || "INR",
        interval: p.interval || "monthly",
        status: pay ? pay.status : s.status,
        assignedBy: s.assignedBy,
        gateway: pay ? pay.gateway : (s.assignedBy === "manual" ? "manual" : ""),
        startDate: s.startDate,
        endDate: s.endDate,
        createdAt: s.createdAt,
      });
    }

    subscriptions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: invoices, subscriptions });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Download an order invoice as a PDF.
router.get("/:id/pdf", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate("contact", "name phone email");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const pdf = await buildInvoicePdfBuffer(invoice, req.workspace);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  } catch (e) { if (!res.headersSent) res.status(500).json({ success: false, message: e.message }); }
});

// Email a single order invoice to its contact (or an override address).
router.post("/:id/email", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate("contact", "name phone email");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    const sentTo = await emailInvoice(invoice, req.workspace, req.body && req.body.to);
    res.json({ success: true, message: `Invoice emailed to ${sentTo}` });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// Email multiple order invoices at once.
router.post("/email", async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "No invoices selected" });
    const invoices = await Invoice.find({ _id: { $in: ids }, workspace: req.workspace._id }).populate("contact", "name phone email");
    const results = { sent: 0, failed: [] };
    for (const inv of invoices) {
      try { await emailInvoice(inv, req.workspace); results.sent++; }
      catch (e) { results.failed.push({ invoice: inv.invoiceNumber, error: e.message }); }
    }
    res.json({ success: true, ...results, message: `Emailed ${results.sent} invoice(s)` + (results.failed.length ? `, ${results.failed.length} failed` : "") });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Email one or more subscription/plan invoices (payment-based) to the account email.
router.post("/sub/email", async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, message: "No invoices selected" });
    const vendorId = req.workspace.owner || req.user._id;
    const payments = await Payment.find({
      _id: { $in: ids },
      user: { $in: [req.user._id, vendorId] },
      status: "completed",
    }).populate("plan", "name");
    if (!payments.length) return res.status(400).json({ success: false, message: "No completed invoices to email" });
    const results = { sent: 0, failed: [] };
    for (const pay of payments) {
      try { await emailPaymentInvoice(pay, req.workspace, req.body && req.body.to); results.sent++; }
      catch (e) { results.failed.push({ error: e.message }); }
    }
    const failMsg = results.failed.length ? (results.failed[0].error) : "";
    res.json({ success: true, ...results, message: results.sent ? `Emailed ${results.sent} invoice(s)` + (results.failed.length ? `, ${results.failed.length} failed` : "") : (failMsg || "Failed to email") });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post("/from-order/:orderId", async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, workspace: req.workspace._id }).populate("contact");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const existing = await Invoice.findOne({ order: order._id });
    if (existing) return res.json({ success: true, data: existing, message: "Invoice already exists" });
    const inv = await Invoice.create({
      workspace: req.workspace._id,
      order: order._id,
      contact: order.contact?._id,
      invoiceNumber: "INV-" + Date.now().toString(36).toUpperCase(),
      items: (order.items || []).map(i => ({ name: i.name || i.product, quantity: i.quantity || 1, price: i.price || 0 })),
      subtotal: order.total || 0,
      tax: 0,
      total: order.total || 0,
      status: order.paymentStatus === "paid" ? "paid" : "pending",
      dueDate: new Date(Date.now() + 7 * 86400000),
    });
    res.json({ success: true, data: inv });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put("/:id", async (req, res) => {
  try {
    const inv = await Invoice.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    res.json({ success: true, data: inv });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const inv = await Invoice.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!inv) return res.status(404).json({ success: false, message: "Invoice not found" });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
