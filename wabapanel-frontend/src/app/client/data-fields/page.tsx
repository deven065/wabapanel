"use client";
import toast from 'react-hot-toast';
import React, { useState, useEffect } from "react";
import { dataFieldApi } from "@/lib/api";

interface DataField {
  _id: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  defaultValue: string;
  isActive: boolean;
}

export default function DataFieldsPage() {
  const [fields, setFields] = useState<DataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState<DataField | null>(null);
  const [form, setForm] = useState({ label: "", type: "text", options: "", required: false, defaultValue: "" });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchFields = async () => {
    try {
      const res = await dataFieldApi.list();
      setFields(res.data.data || []);
    } catch { /* empty */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchFields(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    if (submitting) return;
    setSubmitting(true);

    e.preventDefault();
    const payload = { ...form, options: form.type === "dropdown" ? form.options.split(",").map(o => o.trim()).filter(Boolean) : [] };
    try {
      if (editingField) {
        await dataFieldApi.update(editingField._id, payload);
      } else {
        await dataFieldApi.create(payload);
      }
      setShowForm(false);
      setEditingField(null);
      setForm({ label: "", type: "text", options: "", required: false, defaultValue: "" });
      fetchFields();
      toast.success(editingField ? 'Field updated' : 'Field created');
    } catch { toast.error('Failed to save'); } finally { setSubmitting(false); }
  };

  const handleEdit = (field: DataField) => {
    setEditingField(field);
    setForm({ label: field.label, type: field.type, options: field.options.join(", "), required: field.required, defaultValue: field.defaultValue });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);

    if (!confirm("Are you sure you want to delete this field?")) { setSubmitting(false); return; }
    try { await dataFieldApi.delete(id); fetchFields(); toast.success('Field deleted'); }
    catch { toast.error('Delete failed'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const allSelected = fields.length > 0 && selectedIds.length === fields.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : fields.map(f => f._id));

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm('Delete ' + selectedIds.length + ' selected items?')) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => dataFieldApi.delete(id)));
      toast.success(selectedIds.length + ' items deleted');
      setSelectedIds([]);
      fetchFields();
    } catch { toast.error('Failed to delete some items'); } finally { setSubmitting(false); }
  };

  return (
    <div className="p-6">
      <div className="page-hero flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Fields</h1>
          <p className="text-sm text-gray-500 mt-1">Manage custom contact data fields</p>
        </div>
        <button onClick={() => { setEditingField(null); setForm({ label: "", type: "text", options: "", required: false, defaultValue: "" }); setShowForm(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Field
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editingField ? "Edit Field" : "Add New Field"}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
              <input type="text" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="e.g. Company Name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="dropdown">Dropdown</option>
                <option value="checkbox">Checkbox</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="url">URL</option>
              </select>
            </div>
            {form.type === "dropdown" && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Options (comma separated)</label>
                <input type="text" value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Option 1, Option 2, Option 3" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Value</label>
              <input type="text" value={form.defaultValue} onChange={e => setForm({ ...form, defaultValue: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex items-center pt-6">
              <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} className="h-4 w-4 text-emerald-600 rounded" />
              <label className="ml-2 text-sm text-gray-700">Required field</label>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{editingField ? "Update" : "Create"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingField(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg px-4 py-2.5 border mb-4 bg-red-50 border-red-200">
          <span className="text-sm font-medium text-red-700">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Clear</button>
            <button onClick={handleBulkDelete} disabled={submitting} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Delete selected</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {fields.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No custom fields yet. Click &quot;Add Field&quot; to create one.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="px-6 py-3 text-left w-10"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-red-500 cursor-pointer" /></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Required</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Options</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
              {fields.map(f => (
                <tr key={f._id} className={`hover:bg-gray-50 ${selectedIds.includes(f._id) ? 'bg-red-50/50' : ''}`}>
                  <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(f._id)} onChange={() => toggleSelect(f._id)} className="w-4 h-4 accent-red-500 cursor-pointer" /></td>
                  <td className="px-6 py-4 font-medium text-gray-900">{f.label}</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{f.type}</span></td>
                  <td className="px-6 py-4">{f.required ? <span className="text-emerald-600 font-medium">Yes</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{f.options?.length ? f.options.join(", ") : "-"}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleEdit(f)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                    <button onClick={() => handleDelete(f._id)} className="text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
