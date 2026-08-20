'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, FileText, ChevronDown, MessageCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import CampaignReportAnalytics from '@/components/campaigns/CampaignReportAnalytics';
import { campaignApi, templateApi } from '@/lib/api';
import toast from 'react-hot-toast';

type ReportRecipient = { phone: string; name: string; status: string; error: string; at: string; replied?: boolean; chatId?: string };
type ReportButton = { label: string; count: number; contacts: { name: string; phone: string }[] };
type ReportData = {
  campaign: { _id: string; name: string; status: string; template: string; createdAt: string };
  counts: { total: number; sent: number; delivered: number; read: number; failed: number; deliveredTotal: number; sentTotal: number; replied: number };
  recipients: ReportRecipient[];
  buttons: ReportButton[];
};

// Shared campaign delivery report (used by Broadcasts, Preset and Drip campaigns).
// Opens when `campaignId` is set; fetches the report for that campaign id.
export default function CampaignReportModal({
  campaignId,
  campaignName,
  onClose,
}: {
  campaignId: string | null;
  campaignName?: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'sent' | 'delivered' | 'read' | 'failed' | 'replied'>('all');
  const [templates, setTemplates] = useState<{ _id: string; name: string }[]>([]);
  const [resendTemplateId, setResendTemplateId] = useState('');
  const [resending, setResending] = useState(false);
  const [openBtn, setOpenBtn] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setReportLoading(true);
    setReportFilter('all');
    setResendTemplateId('');
    try {
      const r = await campaignApi.report(id);
      setReport(r.data.data);
    } catch { toast.error('Failed to load report'); }
    finally { setReportLoading(false); }
  }, []);

  useEffect(() => {
    if (!campaignId) { setReport(null); return; }
    load(campaignId);
    templateApi.list({ limit: 500 })
      .then((r) => setTemplates(((r.data.data || []) as { _id: string; name: string; status?: string }[]).filter(t => (t.status || '').toLowerCase() === 'approved')))
      .catch(() => {});
  }, [campaignId, load]);

  // Which category can be (re)sent, and how many recipients it covers. `failed` resends;
  // sent/delivered/read/all are retargeting (send again without touching the originals).
  const resendAudience: 'all' | 'sent' | 'delivered' | 'read' | 'failed' | null =
    report && reportFilter !== 'replied' ? reportFilter : null;
  const resendCount = report && resendAudience
    ? (resendAudience === 'all' ? report.counts.total
      : resendAudience === 'sent' ? report.counts.sent
      : resendAudience === 'delivered' ? report.counts.deliveredTotal
      : resendAudience === 'read' ? report.counts.read
      : report.counts.failed)
    : 0;

  const handleResend = async () => {
    if (!report || resending || !resendAudience || !resendCount) return;
    const chosen = resendTemplateId ? templates.find(t => t._id === resendTemplateId) : null;
    const verb = resendAudience === 'failed' ? 'Resend' : 'Send';
    if (!confirm(`${verb} ${chosen ? `template "${chosen.name}"` : 'the campaign template'} to ${resendCount} "${resendAudience}" recipient(s)?`)) return;
    setResending(true);
    try {
      const r = await campaignApi.resendFailed(report.campaign._id, { templateId: resendTemplateId || undefined, audience: resendAudience });
      toast.success(r.data.data?.message || 'Sending started');
      setTimeout(() => load(report.campaign._id), 4000);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Send failed');
    }
    setResending(false);
  };

  const matchesFilter = (r: ReportRecipient) =>
    reportFilter === 'all' ? true
      : reportFilter === 'replied' ? !!r.replied
      : reportFilter === 'delivered' ? (r.status === 'delivered' || r.status === 'read')
      : r.status === reportFilter;

  // A recipient who replied is shown as "replied" in the Status column (button-click
  // stats are separate and untouched). Chat link opens that contact's conversation
  // inside the panel; falls back to wa.me when no conversation exists yet.
  const dispStatus = (r: ReportRecipient) => (r.replied ? 'replied' : r.status);
  const digitsOnly = (p: string) => String(p || '').replace(/\D/g, '');
  const chatHref = (r: ReportRecipient) =>
    r.chatId ? `/client/chat?conv=${r.chatId}` : (digitsOnly(r.phone) ? `https://wa.me/${digitsOnly(r.phone)}` : '');
  const chatHrefAbs = (r: ReportRecipient) => {
    const h = chatHref(r);
    return h.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${h}` : h;
  };

  const exportCsv = () => {
    if (!report) return;
    const c = report.counts;
    const rows = report.recipients.filter(matchesFilter);
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(`Campaign,${esc(report.campaign.name)}`);
    lines.push(`Template,${esc(report.campaign.template)}`);
    lines.push('');
    lines.push('Summary');
    lines.push(`Total,${c.total}`);
    lines.push(`Sent (not delivered),${c.sent}`);
    lines.push(`Delivered,${c.deliveredTotal}`);
    lines.push(`Read,${c.read}`);
    lines.push(`Failed,${c.failed}`);
    lines.push(`Replied,${c.replied}`);
    if (report.buttons.length) {
      lines.push('');
      lines.push('Button clicks (number-wise)');
      lines.push('Button,Clicks,Contact,Number');
      report.buttons.forEach(b => {
        if (b.contacts.length) {
          b.contacts.forEach((ct, i) => lines.push([esc(i === 0 ? b.label : ''), esc(i === 0 ? b.count : ''), esc(ct.name || ''), esc(ct.phone || '')].join(',')));
        } else {
          lines.push([esc(b.label), esc(b.count), '', ''].join(','));
        }
      });
    }
    lines.push('');
    lines.push(`Recipients (filter: ${reportFilter})`);
    lines.push('Contact,Number,Status,Reason,Chat Link');
    rows.forEach(r => lines.push([esc(r.name || ''), esc(r.phone), esc(dispStatus(r)), esc(r.error || ''), esc(chatHrefAbs(r))].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${report.campaign.name.replace(/[^a-z0-9]+/gi, '_')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!report) return;
    const c = report.counts;
    const rowsHtml = report.recipients.filter(matchesFilter).map(r => {
      const href = chatHrefAbs(r);
      const link = href ? `<a href="${href}">Open chat</a>` : '';
      return `<tr><td>${r.name || '-'}</td><td>${r.phone}</td><td>${dispStatus(r)}</td><td>${r.error || ''}</td><td>${link}</td></tr>`;
    }).join('');
    const eh = (s: string | number) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const btnHtml = report.buttons.length
      ? `<h3>Button clicks (number-wise)</h3>` + report.buttons.map(b =>
          `<h4 style="margin:12px 0 2px;font-size:13px">${eh(b.label)} — ${b.count} clicked</h4>` +
          `<table><thead><tr><th>Contact</th><th>Number</th></tr></thead><tbody>${
            b.contacts.length ? b.contacts.map(ct => `<tr><td>${eh(ct.name || '-')}</td><td>${eh(ct.phone || '')}</td></tr>`).join('') : '<tr><td colspan="2">—</td></tr>'
          }</tbody></table>`).join('')
      : '';
    const html = `<!doctype html><html><head><title>Report — ${report.campaign.name}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px}h3{margin-top:20px}
      table{border-collapse:collapse;width:100%;margin-top:8px;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}.sum td{border:none;padding:2px 12px 2px 0}</style></head><body>
      <h1>Report — ${report.campaign.name}</h1>
      <p>Template: ${report.campaign.template || '-'}</p>
      <table class="sum"><tr><td><b>Total</b></td><td>${c.total}</td><td><b>Sent (not delivered)</b></td><td>${c.sent}</td></tr>
      <tr><td><b>Delivered</b></td><td>${c.deliveredTotal}</td><td><b>Read</b></td><td>${c.read}</td></tr>
      <tr><td><b>Failed</b></td><td>${c.failed}</td><td><b>Replied</b></td><td>${c.replied}</td></tr></table>
      ${btnHtml}
      <h3>Recipients (filter: ${reportFilter})</h3>
      <table><thead><tr><th>Contact</th><th>Number</th><th>Status</th><th>Reason</th><th>Chat</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to export PDF'); return; }
    w.document.write(html); w.document.close();
  };

  const title = report ? `Report — ${report.campaign.name}` : (campaignName ? `Report — ${campaignName}` : 'Report');

  return (
    <Modal isOpen={!!campaignId} onClose={onClose} title={title} size="lg">
      {reportLoading ? (
        <div className="py-10 text-center text-gray-400">Loading report…</div>
      ) : report && (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <button onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={exportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[
              { key: 'all' as const, label: 'Total', value: report.counts.total, color: 'text-gray-900' },
              { key: 'sent' as const, label: 'Sent (not delivered)', value: report.counts.sent, color: 'text-blue-600' },
              { key: 'delivered' as const, label: 'Delivered', value: report.counts.deliveredTotal, color: 'text-emerald-600' },
              { key: 'read' as const, label: 'Read', value: report.counts.read, color: 'text-indigo-600' },
              { key: 'failed' as const, label: 'Failed', value: report.counts.failed, color: 'text-red-600' },
              { key: 'replied' as const, label: 'Replied', value: report.counts.replied ?? 0, color: 'text-amber-600' },
            ].map(s => (
              <button key={s.key} onClick={() => setReportFilter(s.key)}
                className={`rounded-xl border p-3 text-left transition-colors ${reportFilter === s.key ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-gray-500 leading-tight">{s.label}</div>
              </button>
            ))}
          </div>

          {report.buttons && report.buttons.length > 0 && (
            <div className="border rounded-lg divide-y divide-gray-100">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 rounded-t-lg">Button clicks — click a button to see who clicked</div>
              {report.buttons.map((b) => (
                <div key={b.label}>
                  <button onClick={() => setOpenBtn(openBtn === b.label ? null : b.label)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50">
                    <span className="flex items-center gap-2 text-gray-800">
                      <ChevronDown className={`w-4 h-4 transition-transform ${openBtn === b.label ? 'rotate-180' : ''}`} />
                      {b.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{b.count} clicked</span>
                  </button>
                  {openBtn === b.label && (
                    <div className="px-3 pb-2">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100">
                          {b.contacts.map((ct, i) => (
                            <tr key={i}><td className="py-1 text-gray-900">{ct.name || '-'}</td><td className="py-1 text-gray-500">{ct.phone}</td></tr>
                          ))}
                          {b.contacts.length === 0 && <tr><td className="py-1 text-gray-400">—</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <CampaignReportAnalytics counts={report.counts} recipients={report.recipients} />

          {resendAudience && resendCount > 0 && (
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg px-4 py-2 border ${resendAudience === 'failed' ? 'bg-red-50 border-red-100' : 'bg-indigo-50 border-indigo-100'}`}>
              <span className={`text-sm ${resendAudience === 'failed' ? 'text-red-700' : 'text-indigo-700'}`}>
                {resendAudience === 'failed'
                  ? `${resendCount} message(s) failed.`
                  : `${resendCount} "${resendAudience}" recipient(s) — retarget them with a template.`}
              </span>
              <div className="flex items-center gap-2">
                <select value={resendTemplateId} onChange={e => setResendTemplateId(e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white max-w-[200px]">
                  <option value="">Same campaign template</option>
                  {templates.map(t => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
                <button onClick={handleResend} disabled={resending}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-sm disabled:opacity-50 whitespace-nowrap ${resendAudience === 'failed' ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                  <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} /> {resendAudience === 'failed' ? 'Resend to failed' : `Send to ${resendAudience}`}
                </button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-400 -mt-2">Tip: click a category above (Sent / Delivered / Read / Failed) to resend or retarget the template to just those recipients.</p>

          <div className="max-h-80 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Number</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Reason (if failed)</th>
                  <th className="px-3 py-2 font-medium">Chat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.recipients
                  .filter(matchesFilter)
                  .map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-900">{r.name || '-'}</td>
                      <td className="px-3 py-2 text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.replied ? 'bg-amber-100 text-amber-700' :
                          r.status === 'read' ? 'bg-indigo-100 text-indigo-700' :
                          r.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'}`}>{dispStatus(r)}</span>
                      </td>
                      <td className="px-3 py-2 text-red-500 text-xs">{r.error || ''}</td>
                      <td className="px-3 py-2">
                        {chatHref(r) && (
                          <a href={chatHref(r)} target="_blank" rel="noopener noreferrer" title="Open chat"
                            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                {report.recipients.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">No recipient records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">Delivered/Read update as WhatsApp confirms them — reopen the report to refresh. Failed rows show WhatsApp&apos;s error reason.</p>
        </div>
      )}
    </Modal>
  );
}
