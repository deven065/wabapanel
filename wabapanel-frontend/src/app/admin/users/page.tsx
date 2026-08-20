'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Ban, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AdminUser { _id: string; name: string; email: string; role: string; status: string; plan?: { name: string }; phone?: string; createdAt: string; }

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', status: 'active' });

  const fetchUsers = async () => {
    try { const res = await adminApi.getUsers({ search }); setUsers(res.data.data || []); } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [search]);

  const handleSave = async () => {
    try {
      if (editUser) { await adminApi.updateUser(editUser._id, form); }
      else { await adminApi.createUser(form); }
      toast.success(editUser ? 'Updated' : 'Created');
      setShowModal(false); fetchUsers();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const handleToggleStatus = async (userId: string, current: string) => {
    const newStatus = current === 'active' ? 'suspended' : 'active';
    try { await adminApi.updateUser(userId, { status: newStatus }); toast.success('Status updated'); fetchUsers(); } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try { await adminApi.deleteUser(id); toast.success('Deleted'); fetchUsers(); } catch { toast.error('Failed'); }
  };

  const columns = [
    { key: 'user', title: 'User', render: (u: AdminUser) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-xs font-semibold text-emerald-600">{u.name?.charAt(0)}</div>
        <div><p className="font-medium text-sm">{u.name}</p><p className="text-xs text-gray-400">{u.email}</p></div>
      </div>
    )},
    { key: 'role', title: 'Role', render: (u: AdminUser) => (
      <Badge variant={u.role === 'super_admin' ? 'danger' : u.role === 'admin' ? 'warning' : 'info'}>{u.role}</Badge>
    )},
    { key: 'plan', title: 'Plan', render: (u: AdminUser) => u.plan?.name || 'Free' },
    { key: 'status', title: 'Status', render: (u: AdminUser) => (
      <Badge variant={u.status === 'active' ? 'success' : u.status === 'suspended' ? 'danger' : 'default'}>{u.status}</Badge>
    )},
    { key: 'date', title: 'Joined', render: (u: AdminUser) => new Date(u.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (u: AdminUser) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditUser(u); setForm({ name: u.name, email: u.email, password: '', role: u.role, status: u.status }); setShowModal(true); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
        <button onClick={() => handleToggleStatus(u._id, u.status)} className="p-1 hover:bg-gray-100 rounded" title={u.status === 'active' ? 'Suspend' : 'Activate'}>
          {u.status === 'active' ? <Ban className="w-4 h-4 text-yellow-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
        </button>
        <button onClick={() => handleDelete(u._id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff & Members</h1>
        <p className="text-sm mt-1">Add staff members and control what each role can access</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditUser(null); setForm({ name: '', email: '', password: '', role: 'user', status: 'active' }); setShowModal(true); }}>Add User</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" autoComplete="off" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <Table columns={columns} data={users} loading={loading} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editUser ? 'Edit User' : 'Add User'}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editUser} />
          {!editUser && <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            options={[{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }, { value: 'super_admin', label: 'Super Admin' }]} />
          <p className="-mt-2 text-[11px] text-gray-400">Agents are not platform staff — add them inside a workspace (Client panel → Agents).</p>
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'inactive', label: 'Inactive' }]} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>{editUser ? 'Update' : 'Create'}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
