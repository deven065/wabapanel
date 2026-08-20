'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Team {
  _id: string;
  name: string;
  description: string;
  members: { _id: string; name: string; email: string }[];
  createdAt: string;
}

export default function TeamsPage() {
  const { currentWorkspace } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchTeams = () => {
    if (!currentWorkspace) return;
    api
      .get('/teams')
      .then((r) => setTeams(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTeams();
  }, [currentWorkspace]);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      if (editItem) {
        await api.put(`/teams/${editItem._id}`, form);
      } else {
        await api.post('/teams', form);
      }
      toast.success(editItem ? 'Updated' : 'Created');
      setShowModal(false);
      setEditItem(null);
      fetchTeams();
    } catch {
      toast.error('Failed');
    } finally { setSubmitting(false); }
  };

  const columns = [
    {
      key: 'name',
      title: 'Team Name',
      render: (t: Team) => (
        <div>
          <span className="font-medium">{t.name}</span>
          {t.description && (
            <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'members',
      title: 'Members',
      render: (t: Team) => (
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm">{t.members?.length || 0}</span>
        </div>
      ),
    },
    {
      key: 'created',
      title: 'Created',
      render: (t: Team) => (
        <span className="text-sm text-gray-500">
          {new Date(t.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '',
      render: (t: Team) => (
        <div className="flex gap-1">
          <button
            onClick={() => {
              setEditItem(t);
              setForm({ name: t.name, description: t.description || '' });
              setShowModal(true);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this team?'))
                api.delete(`/teams/${t._id}`).then(() => { fetchTeams(); toast.success('Team deleted'); }).catch(() => toast.error('Delete failed'));
            }}
            className="p-1 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your teams and members
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditItem(null);
            setForm({ name: '', description: '' });
            setShowModal(true);
          }}
        >
          Create Team
        </Button>
      </div>

      <Table columns={columns} data={teams} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => api.delete(`/teams/${id}`).catch(() => null))); fetchTeams(); }} />

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditItem(null);
        }}
        title={editItem ? 'Edit Team' : 'Create Team'}
      >
        <div className="space-y-4">
          <Input
            label="Team Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional description"
          />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave}>
              {editItem ? 'Update' : 'Create'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setEditItem(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
