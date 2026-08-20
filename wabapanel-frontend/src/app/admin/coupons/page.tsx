"use client";
import React, { useState, useEffect } from "react";
import { Ticket, Plus, Trash2 } from "lucide-react";
import { platformApi, adminApi } from "@/lib/api";
import toast from "react-hot-toast";

interface Coupon { _id: string; code: string; description: string; discountType: string; discountValue: number; maxUses: number; usedCount: number; expiresAt?: string; isActive: boolean; createdAt: string; applicablePlans?: string[]; }
interface PlanLite { _id: string; name: string; }

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [form, setForm] = useState<{ code: string; description: string; discountType: string; discountValue: number; maxUses: number; expiresAt: string; applicablePlans: string[] }>({ code: "", description: "", discountType: "percent", discountValue: 10, maxUses: 0, expiresAt: "", applicablePlans: [] });

  const load = () => platformApi.adminCoupons().then(r => setCoupons(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); adminApi.getPlans().then(r => setPlans(r.data.data || [])).catch(() => {}); }, []);
  const planName = (id: string) => plans.find(p => p._id === id)?.name || "";
  const togglePlan = (id: string) => setForm(f => ({ ...f, applicablePlans: f.applicablePlans.includes(id) ? f.applicablePlans.filter(x => x !== id) : [...f.applicablePlans, id] }));

  const save = async () => {
    if (!form.code || !form.discountValue) { toast.error("Code and discount value are required"); return; }
    setSaving(true);
    try {
      await platformApi.adminCreateCoupon({ ...form, expiresAt: form.expiresAt || null });
      toast.success("Coupon created");
      setShowForm(false);
      setForm({ code: "", description: "", discountType: "percent", discountValue: 10, maxUses: 0, expiresAt: "", applicablePlans: [] });
      load();
    } catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed"); }
    finally { setSaving(false); }
  };

  const toggle = async (c: Coupon) => { try { await platformApi.adminUpdateCoupon(c._id, { isActive: !c.isActive }); load(); } catch { toast.error("Failed"); } };
  const remove = async (id: string) => { if (!confirm("Delete this coupon?")) return; try { await platformApi.adminDeleteCoupon(id); toast.success("Deleted"); load(); } catch { toast.error("Failed"); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Coupons</h1><p className="text-sm text-gray-500 mt-1">Discount codes customers can apply when buying a plan</p></div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> New Coupon</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Create Coupon</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs text-gray-500 block mb-1">Code *</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Discount Type</label><select value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="percent">Percent (%)</option><option value="flat">Flat Amount (Rs.)</option></select></div>
            <div><label className="text-xs text-gray-500 block mb-1">Discount Value *</label><input type="number" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Max Uses (0 = unlimited)</label><input type="number" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Expires At</label><input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500 block mb-1">Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="New user welcome offer" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Applies to plans</label>
            <p className="text-xs text-gray-400 mb-2">Select specific plans, or leave all unchecked to apply this coupon to <b>all plans</b>.</p>
            <div className="flex flex-wrap gap-2">
              {plans.length === 0 ? <span className="text-xs text-gray-400">No plans found</span> : plans.map(p => (
                <button type="button" key={p._id} onClick={() => togglePlan(p._id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${form.applicablePlans.includes(p._id) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{p.name}</button>
              ))}
            </div>
            <p className="text-xs mt-2 text-gray-500">{form.applicablePlans.length === 0 ? "This coupon will work on ALL plans." : `Only for: ${form.applicablePlans.map(planName).join(", ")}`}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{saving ? "Saving..." : "Create"}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="text-center py-10 text-gray-400 text-sm">Loading...</div> : coupons.length === 0 ? (
          <div className="text-center py-10"><Ticket className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">No coupons yet</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Discount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Applies to</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Uses</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Expires</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr></thead>
            <tbody className="divide-y">
              {coupons.map(c => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold">{c.code}<br/><span className="text-xs text-gray-400 font-sans font-normal">{c.description}</span></td>
                  <td className="px-4 py-3">{c.discountType === "percent" ? `${c.discountValue}%` : `Rs.${c.discountValue}`}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{!c.applicablePlans || c.applicablePlans.length === 0 ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">All plans</span> : c.applicablePlans.map(planName).filter(Boolean).join(", ")}</td>
                  <td className="px-4 py-3 text-center">{c.usedCount}{c.maxUses > 0 ? ` / ${c.maxUses}` : ""}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggle(c)} className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{c.isActive ? "Active" : "Inactive"}</button>
                  </td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(c._id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
