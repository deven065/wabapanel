'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';

interface FormField {
  _id?: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormData {
  _id: string;
  name: string;
  description?: string;
  fields: FormField[];
  brandName?: string;
}

type FieldValue = string | string[];

export default function PublicFormPage() {
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api';
    axios.get(`${apiBase}/forms/${id}/public`)
      .then(res => {
        if (res.data.success) {
          setForm(res.data.data);
          const initial: Record<string, FieldValue> = {};
          res.data.data.fields.forEach((f: FormField) => {
            initial[f.label] = (f.type === 'checkbox' && (f.options || []).length) ? [] : '';
          });
          setValues(initial);
        } else {
          setError('Form not found or inactive');
        }
      })
      .catch(() => setError('Form not found or inactive'))
      .finally(() => setLoading(false));
  }, [id]);

  // Read a value as string (text/select/date/file store a string).
  const sv = (label: string): string => {
    const v = values[label];
    return typeof v === 'string' ? v : '';
  };

  const toggleCheckbox = (label: string, opt: string) => {
    setValues(v => {
      const cur = Array.isArray(v[label]) ? (v[label] as string[]) : [];
      const next = cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt];
      return { ...v, [label]: next };
    });
  };

  const handleFile = async (label: string, file?: File) => {
    if (!file) return;
    setUploading(u => ({ ...u, [label]: true }));
    setError('');
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api';
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${apiBase}/forms/${id}/upload`, fd);
      setValues(v => ({ ...v, [label]: res.data.data.url }));
    } catch {
      setError('File upload failed. Please try a different/smaller file.');
    } finally {
      setUploading(u => ({ ...u, [label]: false }));
    }
  };

  const isEmpty = (v: FieldValue | undefined) =>
    v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Validate required fields
    for (const field of form.fields) {
      if (field.required && isEmpty(values[field.label])) {
        setError(`Please fill in "${field.label}"`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api';
      await axios.post(`${apiBase}/forms/${id}/submit`, values);
      setSubmitted(true);
    } catch {
      setError('Failed to submit form. Please try again.');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Form Not Available</h2>
          <p className="text-gray-500">This form is either inactive or does not exist.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-500">Your response has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-emerald-600 rounded-t-xl p-6 text-white">
          <h1 className="text-2xl font-bold">{form?.name}</h1>
          {form?.description && <p className="mt-2 text-emerald-100">{form.description}</p>}
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-b-xl shadow-lg p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          {form?.fields.map((field, idx) => (
            <div key={idx}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              
              {field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'url' || field.type === 'number' ? (
                <input
                  type={field.type === 'phone' ? 'tel' : field.type}
                  value={sv(field.label)}
                  onChange={(e) => setValues({...values, [field.label]: e.target.value})}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  required={field.required}
                />
              ) : field.type === 'textarea' ? (
                <textarea
                  value={sv(field.label)}
                  onChange={(e) => setValues({...values, [field.label]: e.target.value})}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  required={field.required}
                />
              ) : field.type === 'select' || field.type === 'dropdown' ? (
                <select
                  value={sv(field.label)}
                  onChange={(e) => setValues({...values, [field.label]: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  required={field.required}
                >
                  <option value="">Select {field.label}</option>
                  {field.options?.map((opt, oi) => (
                    <option key={oi} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === 'date' ? (
                <input
                  type="date"
                  value={sv(field.label)}
                  onChange={(e) => setValues({...values, [field.label]: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  required={field.required}
                />
              ) : field.type === 'radio' ? (
                <div className="space-y-2 pt-1">
                  {field.options?.map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name={field.label}
                        value={opt}
                        checked={sv(field.label) === opt}
                        onChange={() => setValues({...values, [field.label]: opt})}
                        required={field.required}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : field.type === 'checkbox' || field.type === 'multi_select' ? (
                (field.options && field.options.length) ? (
                  <div className="space-y-2 pt-1">
                    {field.options.map((opt, oi) => (
                      <label key={oi} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          value={opt}
                          checked={Array.isArray(values[field.label]) && (values[field.label] as string[]).includes(opt)}
                          onChange={() => toggleCheckbox(field.label, opt)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={sv(field.label) === 'Yes'}
                      onChange={(e) => setValues({...values, [field.label]: e.target.checked ? 'Yes' : ''})}
                      required={field.required}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    {field.placeholder || 'Yes'}
                  </label>
                )
              ) : field.type === 'file' ? (
                <div>
                  <input
                    type="file"
                    onChange={(e) => handleFile(field.label, e.target.files?.[0])}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                  {uploading[field.label] && <p className="text-xs text-gray-400 mt-1">Uploading…</p>}
                  {!uploading[field.label] && sv(field.label) && (
                    <a
                      href={sv(field.label)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 mt-1 inline-block break-all"
                    >
                      Uploaded ✓ — view file
                    </a>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={sv(field.label)}
                  onChange={(e) => setValues({...values, [field.label]: e.target.value})}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  required={field.required}
                />
              )}
            </div>
          ))}
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
          
          {form?.brandName && (
            <p className="text-center text-xs text-gray-400 mt-4">
              Powered by {form.brandName}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
