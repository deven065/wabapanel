'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, FormInput, Copy, Eye, ArrowLeft, ClipboardList, X } from 'lucide-react';
import { formApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FormField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  options: string[];
  order: number;
}

interface FormSubmission {
  data: Record<string, string>;
  contact?: { name?: string; phone?: string };
  submittedAt: string;
}

interface FormItem {
  _id: string;
  name: string;
  description: string;
  fields: FormField[];
  submissions: FormSubmission[];
  status: string;
  submissionCount: number;
  createdAt: string;
  waFlow?: { flowId: string; status: string; error?: string };
}

const genId = () => `field_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

export default function FormsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editForm, setEditForm] = useState<FormItem | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const handlePublishFlow = async (id: string) => {
    setPublishingId(id);
    try {
      await formApi.publishFlow(id);
      toast.success('Published as WhatsApp Flow — you can now send it as a native form in chat');
      fetchForms();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Publish failed');
      fetchForms();
    }
    setPublishingId(null);
  };

  const [showResponses, setShowResponses] = useState<FormItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fields: [{ id: genId(), label: '', type: 'text', required: true, placeholder: '', options: [] as string[], order: 0 }] as FormField[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchForms = () => {
    formApi.list().then(r => setForms(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchForms(); }, []);

  const handleSave = async () => {
    if (submitting) return;
    if (!formData.name.trim()) { toast.error('Form name is required'); return; }
    if (formData.fields.length === 0) { toast.error('Add at least one field'); return; }
    if (formData.fields.some(f => !f.label.trim())) { toast.error('All fields must have a label'); return; }

    const payload = {
      ...formData,
      fields: formData.fields.map((f, i) => ({ ...f, id: f.id || genId(), order: i, options: (f.options || []).map(o => o.trim()).filter(Boolean) })),
    };

    setSubmitting(true);
    try {
      if (editForm) {
        await formApi.update(editForm._id, payload);
        toast.success('Form updated');
      } else {
        await formApi.create(payload);
        toast.success('Form created');
      }
      setShowModal(false);
      fetchForms();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const addField = () => {
    setFormData({
      ...formData,
      fields: [...formData.fields, { id: genId(), label: '', type: 'text', required: false, placeholder: '', options: [], order: formData.fields.length }],
    });
  };

  const removeField = (i: number) => {
    setFormData({ ...formData, fields: formData.fields.filter((_, idx) => idx !== i) });
  };

  const updateField = (i: number, updates: Partial<FormField>) => {
    const fields = [...formData.fields];
    fields[i] = { ...fields[i], ...updates };
    setFormData({ ...formData, fields });
  };

  const openNew = () => {
    setEditForm(null);
    setFormData({
      name: '', description: '',
      fields: [{ id: genId(), label: '', type: 'text', required: true, placeholder: '', options: [], order: 0 }],
    });
    setShowModal(true);
  };

  const openEdit = (f: FormItem) => {
    setEditForm(f);
    setFormData({
      name: f.name, description: f.description || '',
      fields: (f.fields || []).map((field, i) => ({ ...field, id: field.id || genId(), order: field.order || i })),
    });
    setShowModal(true);
  };

  const openResponses = async (f: FormItem) => {
    try {
      const res = await formApi.get(f._id);
      setShowResponses(res.data.data);
    } catch {
      setShowResponses(f);
    }
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm('Delete this form?')) return;
    try { await formApi.delete(id); toast.success('Form deleted'); fetchForms(); }
    catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  const copyFormLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${id}`);
    toast.success('Form link copied!');
  };

  // Responses View
  if (showResponses) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowResponses(null)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{showResponses.name} — Responses</h1>
            <p className="text-sm text-gray-500">{showResponses.submissionCount || 0} total submissions</p>
          </div>
        </div>

        {(!showResponses.submissions || showResponses.submissions.length === 0) ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">No responses yet</h3>
            <p className="text-sm text-gray-400 mt-1">Share the form link to start collecting responses</p>
            <button onClick={() => copyFormLink(showResponses._id)} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              <Copy className="w-4 h-4 inline mr-1" /> Copy Form Link
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 text-left">#</th>
                    {showResponses.fields?.map(f => (
                      <th key={f.id} className="px-4 py-3 text-xs font-medium text-gray-500 text-left">{f.label}</th>
                    ))}
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 text-left">Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {showResponses.submissions.map((sub, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                      {showResponses.fields?.map(f => (
                        <td key={f.id} className="px-4 py-3 text-sm text-gray-900">{sub.data?.[f.label] || sub.data?.[f.id] || '-'}</td>
                      ))}
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(sub.submittedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = forms.length > 0 && selectedIds.length === forms.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : forms.map(f => f._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => formApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchForms();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Gen Forms</h1>
          <p className="text-gray-500 text-sm mt-1">Create forms to collect customer information via WhatsApp or web link</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> Create Form
        </button>
      </div>

      {!loading && forms.length > 0 && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${selectedIds.length ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" />
            Select all{selectedIds.length > 0 && <span className="text-red-700"> · {selectedIds.length} selected</span>}
          </label>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Clear</button>
              <button onClick={handleBulkDelete} disabled={submitting} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Delete selected</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <FormInput className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500">No forms created yet</h3>
          <p className="text-sm text-gray-400 mt-1">Create your first lead gen form to start collecting data</p>
          <button onClick={openNew} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
            <Plus className="w-4 h-4 inline mr-1" /> Create Form
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((f) => (
            <div key={f._id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-2 min-w-0">
                  <input type="checkbox" checked={selectedIds.includes(f._id)} onChange={() => toggleSelect(f._id)} className="mt-1 w-4 h-4 accent-red-500 cursor-pointer shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{f.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{f.fields?.length || 0} fields</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{f.status}</span>
              </div>
              {f.description && <p className="text-sm text-gray-500 mb-2">{f.description}</p>}
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <span>{f.submissionCount || 0} responses</span>
                <span>{new Date(f.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={() => openResponses(f)} className="p-1.5 hover:bg-emerald-50 rounded text-emerald-600" title="View Responses"><Eye className="w-4 h-4" /></button>
                <button onClick={() => openEdit(f)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => copyFormLink(f._id)} className="p-1.5 hover:bg-gray-100 rounded" title="Copy Link"><Copy className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => handleDelete(f._id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
                <button onClick={() => handlePublishFlow(f._id)} disabled={publishingId === f._id}
                  className={`ml-auto text-[11px] px-2 py-1 rounded-lg border font-medium ${f.waFlow?.status === 'published' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  title={f.waFlow?.status === 'published' ? 'Re-publish updated fields to WhatsApp' : 'Publish as native WhatsApp Flow (form opens inside WhatsApp)'}>
                  {publishingId === f._id ? 'Publishing...' : f.waFlow?.status === 'published' ? 'WhatsApp Flow ✓' : 'Publish to WhatsApp'}
                </button>
              </div>
              {f.waFlow?.status === 'failed' && f.waFlow?.error && <p className="text-[11px] text-red-500 mt-2">{f.waFlow.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-900">{editForm ? 'Edit Form' : 'Create Lead Gen Form'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Form Name *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Customer Inquiry Form" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Brief description" />
                </div>
              </div>

              {/* Fields */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-gray-700">Form Fields</label>
                  <button onClick={addField} className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-2 py-1 border border-emerald-200 rounded-lg">
                    <Plus className="w-3 h-3" /> Add Field
                  </button>
                </div>
                {formData.fields.map((field, i) => (
                  <div key={field.id} className="flex gap-2 mb-3 items-start p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Field label (e.g. Full Name)" value={field.label} onChange={(e) => updateField(i, { label: e.target.value })}
                        className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                      <select value={field.type} onChange={(e) => updateField(i, { type: e.target.value })}
                        className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="number">Number</option>
                        <option value="textarea">Textarea</option>
                        <option value="select">Dropdown</option>
                        <option value="radio">Radio</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="date">Date</option>
                        <option value="file">File Upload</option>
                      </select>
                      <input type="text" placeholder="Placeholder text" value={field.placeholder} onChange={(e) => updateField(i, { placeholder: e.target.value })}
                        className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                    </div>
                    {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                      <div className="mt-2 space-y-1.5">
                        <label className="block text-xs font-medium text-gray-600">Options (choices shown in the {field.type === 'select' ? 'dropdown' : field.type})</label>
                        {(field.options || []).map((opt, oi) => (
                          <div key={oi} className="flex gap-2 items-center">
                            <input type="text" value={opt} placeholder={`Option ${oi + 1} (e.g. Dr. Sharma)`}
                              onChange={(e) => { const opts = [...(field.options || [])]; opts[oi] = e.target.value; updateField(i, { options: opts }); }}
                              className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                            <button onClick={() => updateField(i, { options: (field.options || []).filter((_, x) => x !== oi) })}
                              className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button onClick={() => updateField(i, { options: [...(field.options || []), ''] })}
                          className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-2 py-1 border border-emerald-200 rounded-lg">
                          <Plus className="w-3 h-3" /> Add Option
                        </button>
                      </div>
                    )}
                    </div>
                    <label className="flex items-center gap-1 text-xs mt-2 whitespace-nowrap">
                      <input type="checkbox" checked={field.required} onChange={(e) => updateField(i, { required: e.target.checked })} className="rounded text-emerald-600" />
                      Required
                    </label>
                    <button onClick={() => removeField(i)} className="p-1 text-red-400 hover:text-red-600 mt-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-semibold text-gray-700 mb-3">Form Preview</label>
                <div className="bg-white border rounded-lg p-4 max-w-sm space-y-3">
                  <h4 className="font-semibold text-gray-900">{formData.name || 'Form Name'}</h4>
                  {formData.description && <p className="text-xs text-gray-500">{formData.description}</p>}
                  {formData.fields.map((f, i) => (
                    <div key={i}>
                      <label className="text-xs font-medium text-gray-600">{f.label || 'Field'}{f.required && ' *'}</label>
                      <div className="mt-1 px-2 py-1.5 border rounded text-xs text-gray-400 bg-gray-50">{f.placeholder || f.type}</div>
                    </div>
                  ))}
                  <button className="w-full py-2 bg-emerald-600 text-white text-sm rounded-lg">Submit</button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{editForm ? 'Update Form' : 'Create Form'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
