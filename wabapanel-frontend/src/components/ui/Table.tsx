'use client';
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface Column<T> {
  key: string;
  title: string | React.ReactNode;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: { page: number; totalPages: number; total: number; onPageChange: (page: number) => void };
  onRowClick?: (item: T) => void;
  emptyText?: string;
  onBulkDelete?: (ids: string[]) => void | Promise<void>;
}

export default function Table<T extends { _id?: string }>({
  columns, data, loading, pagination, onRowClick, emptyText = 'No data found', onBulkDelete,
}: TableProps<T>) {
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const ids = data.map((d) => d._id).filter(Boolean) as string[];

  useEffect(() => {
    setSelected((prev) => prev.filter((id) => ids.includes(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = ids.length > 0 && selected.length === ids.length;
  const toggleAll = () => setSelected(allSelected ? [] : ids);

  const handleBulkDelete = async () => {
    if (!onBulkDelete || !selected.length || deleting) return;
    if (!confirm(`Delete ${selected.length} selected item(s)?`)) return;
    setDeleting(true);
    const n = selected.length;
    try { await onBulkDelete(selected); setSelected([]); toast.success(`${n} item(s) deleted`); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-500 mt-2">Loading...</p>
      </div>
    );
  }

  const selectable = !!onBulkDelete;

  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-100 shadow-sm overflow-hidden">
      {selectable && selected.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-200">
          <span className="text-sm text-emerald-800 font-medium">{selected.length} selected</span>
          <div className="flex items-center gap-3">
            <button onClick={toggleAll} className="text-sm text-emerald-700 font-medium hover:underline">
              {allSelected ? 'Clear All' : 'Select All'}
            </button>
            <button onClick={handleBulkDelete} disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">{emptyText}</td></tr>
            ) : (
              data.map((item, i) => (
                <tr
                  key={item._id || i}
                  className={`border-b border-gray-50 transition-colors hover:bg-gray-50/60 ${onRowClick ? 'cursor-pointer' : ''} ${item._id && selected.includes(item._id) ? 'bg-emerald-50/50' : ''}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {selectable && (
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      {item._id && (
                        <input type="checkbox" checked={selected.includes(item._id)} onChange={() => toggle(item._id as string)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                      )}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-700">
                      {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} items)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
