'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/stores/authStore';
import { eventApi, predefinedActionApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface PredefinedAction {
  _id: string;
  name: string;
  description: string;
  trigger: string;
  actions: { type: string; value: string; delay: number }[];
  isActive: boolean;
  executionCount: number;
}

interface EventItem {
  _id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  triggerConfig: { webhookUrl: string; schedule: string; eventName: string };
  filters: { tags: string[]; segments: string[] };
  actions: { type: string; config: { value?: string } }[];
  stats: { triggered: number };
  createdAt: string;
}

export default function EventsPage() {
  const { currentWorkspace } = useAuthStore();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<EventItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    eventName: 'message_received',
    status: 'active',
    actionType: 'add_tag',
    actionValue: '',
  });
  const [paItems, setPaItems] = useState<PredefinedAction[]>([]);
  const [paModal, setPaModal] = useState(false);
  const [paEdit, setPaEdit] = useState<PredefinedAction | null>(null);
  const [paForm, setPaForm] = useState({ name: '', description: '', trigger: 'manual', actionType: 'send_message', actionValue: '' });

  const paTriggerLabels: Record<string, string> = {
    manual: 'Manual (Run button)',
    on_message: 'On Message',
    on_subscribe: 'On Subscribe (START reply)',
    on_order: 'On Order',
    on_payment: 'On Payment',
  };
  const paActionLabels: Record<string, string> = {
    send_message: 'Send WhatsApp Message',
    send_template: 'Send Template',
    add_tag: 'Add Tag',
    remove_tag: 'Remove Tag',
    assign_agent: 'Assign Agent',
  };

  const fetchPa = () => {
    predefinedActionApi.list().then((r) => setPaItems(r.data.data || [])).catch(() => {});
  };

  const handlePaSave = async () => {
    if (!paForm.name.trim()) { toast.error('Name is required'); return; }
    if (!paForm.actionValue.trim()) { toast.error('Action value is required'); return; }
    const payload = {
      name: paForm.name,
      description: paForm.description,
      trigger: paForm.trigger,
      actions: [{ type: paForm.actionType, value: paForm.actionValue, delay: 0 }],
    };
    try {
      if (paEdit) await predefinedActionApi.update(paEdit._id, payload);
      else await predefinedActionApi.create(payload);
      toast.success(paEdit ? 'Updated' : 'Created');
      setPaModal(false); setPaEdit(null); fetchPa();
    } catch { toast.error('Failed'); }
  };

  const handlePaRun = async (a: PredefinedAction) => {
    const phone = prompt('Run this action on which contact? Enter phone number (with country code):');
    if (!phone) return;
    try {
      const res = await predefinedActionApi.run(a._id, { phone });
      toast.success(res.data.message || 'Executed');
      fetchPa();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to run');
    }
  };

  const eventTypeMap: Record<string, string> = {
    message_received: 'message_event',
    contact_created: 'contact_event',
    order_placed: 'system',
    payment_received: 'system',
    webhook: 'webhook',
  };
  const eventLabels: Record<string, string> = {
    message_received: 'Message Received',
    contact_created: 'New Contact Created',
    order_placed: 'Order Placed',
    payment_received: 'Payment Received',
    webhook: 'Incoming Webhook (from another system)',
  };
  const actionLabels: Record<string, string> = {
    send_message: 'Send WhatsApp Message',
    send_template: 'Send Template',
    add_tag: 'Add Tag',
    remove_tag: 'Remove Tag',
  };

  const fetchEvents = () => {
    if (!currentWorkspace) return;
    eventApi
      .getEvents()
      .then((r) => setEvents(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvents();
    fetchPa();
  }, [currentWorkspace]);

  const handleSave = async () => {
    if (!form.actionValue.trim()) { toast.error('Action value is required (message text / template name / tag name)'); return; }
    const payload = {
      name: form.name,
      description: form.description,
      status: form.status,
      type: eventTypeMap[form.eventName] || 'custom',
      triggerConfig: { eventName: form.eventName === 'webhook' ? '' : form.eventName },
      actions: [{ type: form.actionType, config: { value: form.actionValue } }],
    };
    try {
      if (editItem) {
        await eventApi.updateEvent(editItem._id, payload);
      } else {
        await eventApi.createEvent(payload);
      }
      toast.success(editItem ? 'Updated' : 'Created');
      setShowModal(false);
      setEditItem(null);
      fetchEvents();
    } catch {
      toast.error('Failed');
    }
  };

  const toggleStatus = async (e: EventItem) => {
    try {
      await eventApi.updateEvent(e._id, {
        status: e.status === 'active' ? 'inactive' : 'active',
      });
      fetchEvents();
    } catch {
      toast.error('Failed');
    }
  };

  const columns = [
    {
      key: 'name',
      title: 'Event Name',
      render: (e: EventItem) => (
        <div>
          <span className="font-medium">{e.name}</span>
          {e.description && (
            <p className="text-xs text-gray-400 mt-0.5">{e.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      title: 'When',
      render: (e: EventItem) => (
        <Badge variant="info">{eventLabels[e.triggerConfig?.eventName] || (e.type === 'webhook' ? eventLabels.webhook : e.type)}</Badge>
      ),
    },
    {
      key: 'action',
      title: 'Then',
      render: (e: EventItem) => (
        <span className="text-sm text-gray-600">
          {(e.actions || []).map((a) => `${actionLabels[a.type] || a.type}: ${a.config?.value || ''}`).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'triggered',
      title: 'Triggered',
      render: (e: EventItem) => (
        <span className="text-sm">{e.stats?.triggered || 0}</span>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (e: EventItem) => (
        <button
          onClick={() => toggleStatus(e)}
          className="flex items-center gap-1"
        >
          {e.status === 'active' ? (
            <ToggleRight className="w-5 h-5 text-emerald-600" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-gray-400" />
          )}
          <span className="text-xs">{e.status}</span>
        </button>
      ),
    },
    {
      key: 'actions',
      title: '',
      render: (e: EventItem) => (
        <div className="flex gap-1">
          <button
            onClick={() => {
              setEditItem(e);
              setForm({
                name: e.name,
                description: e.description || '',
                eventName: e.type === 'webhook' ? 'webhook' : (e.triggerConfig?.eventName || 'message_received'),
                status: e.status,
                actionType: e.actions?.[0]?.type || 'add_tag',
                actionValue: e.actions?.[0]?.config?.value || '',
              });
              setShowModal(true);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this event?'))
                eventApi.deleteEvent(e._id).then(() => { fetchEvents(); toast.success('Event deleted'); }).catch(() => toast.error('Delete failed'));
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
          <h1 className="text-2xl font-bold text-gray-900">Event Triggers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure automatic actions based on events
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditItem(null);
            setForm({
              name: '',
              description: '',
              eventName: 'message_received',
              status: 'active',
              actionType: 'add_tag',
              actionValue: '',
            });
            setShowModal(true);
          }}
        >
          Add Event
        </Button>
      </div>

      <Table columns={columns} data={events} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => eventApi.deleteEvent(id).catch(() => null))); fetchEvents(); }} />

      {/* Predefined Actions (merged from /client/predefined-actions) */}
      <div className="flex items-center justify-between mt-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Predefined Actions</h2>
          <p className="text-sm text-gray-500 mt-0.5">Reusable actions — run manually on any contact or trigger on message/subscribe/order/payment</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} variant="secondary" onClick={() => { setPaEdit(null); setPaForm({ name: '', description: '', trigger: 'manual', actionType: 'send_message', actionValue: '' }); setPaModal(true); }}>Add Action</Button>
      </div>
      <div className="space-y-3">
        {paItems.length === 0 ? (
          <div className="bg-white rounded-xl border p-6 text-center text-sm text-gray-400">No predefined actions yet.</div>
        ) : paItems.map((a) => (
          <div key={a._id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={async () => { try { await predefinedActionApi.update(a._id, { isActive: !a.isActive }); fetchPa(); toast.success(a.isActive ? 'Action disabled' : 'Action enabled'); } catch { toast.error('Update failed'); } }} className="shrink-0">
                {a.isActive ? <ToggleRight className="w-6 h-6 text-emerald-600" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
              </button>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{a.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  <Badge variant="info">{paTriggerLabels[a.trigger] || a.trigger}</Badge>
                  <span className="ml-2">{(a.actions || []).map((x) => `${paActionLabels[x.type] || x.type}: ${x.value || ''}`).join(', ')}</span>
                  <span className="ml-2 text-gray-400">· Run {a.executionCount || 0} times</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => handlePaRun(a)} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs hover:bg-emerald-100 flex items-center gap-1" title="Run now on a contact"><Play className="w-3 h-3" /> Run</button>
              <button onClick={() => { setPaEdit(a); setPaForm({ name: a.name, description: a.description || '', trigger: a.trigger || 'manual', actionType: a.actions?.[0]?.type || 'send_message', actionValue: a.actions?.[0]?.value || '' }); setPaModal(true); }} className="p-1.5 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
              <button onClick={() => { if (confirm('Delete this action?')) predefinedActionApi.delete(a._id).then(() => { fetchPa(); toast.success('Action deleted'); }).catch(() => toast.error('Delete failed')); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={paModal} onClose={() => { setPaModal(false); setPaEdit(null); }} title={paEdit ? 'Edit Predefined Action' : 'Add Predefined Action'}>
        <div className="space-y-4">
          <Input label="Name" value={paForm.name} onChange={(e) => setPaForm({ ...paForm, name: e.target.value })} required />
          <Input label="Description" value={paForm.description} onChange={(e) => setPaForm({ ...paForm, description: e.target.value })} placeholder="Optional description" />
          <Select label="Trigger" value={paForm.trigger} onChange={(e) => setPaForm({ ...paForm, trigger: e.target.value })}
            options={[
              { value: 'manual', label: 'Manual (run yourself with the Run button)' },
              { value: 'on_message', label: 'On Message (max once per customer / 24 hrs)' },
              { value: 'on_subscribe', label: 'On Subscribe (customer replies START)' },
              { value: 'on_order', label: 'On Order (new order created)' },
              { value: 'on_payment', label: 'On Payment (order marked paid)' },
            ]} />
          <Select label="Action" value={paForm.actionType} onChange={(e) => setPaForm({ ...paForm, actionType: e.target.value })}
            options={[
              { value: 'send_message', label: 'Send WhatsApp Message' },
              { value: 'send_template', label: 'Send Template' },
              { value: 'add_tag', label: 'Add Tag' },
              { value: 'remove_tag', label: 'Remove Tag' },
              { value: 'assign_agent', label: 'Assign Agent' },
            ]} />
          <Input
            label={paForm.actionType === 'send_message' ? 'Message text' : paForm.actionType === 'send_template' ? 'Template name (must be approved)' : paForm.actionType === 'assign_agent' ? 'Agent email or name' : 'Tag name'}
            value={paForm.actionValue} onChange={(e) => setPaForm({ ...paForm, actionValue: e.target.value })}
            placeholder={paForm.actionType === 'send_message' ? 'e.g. Thank you for your order!' : paForm.actionType === 'send_template' ? 'e.g. kkhs_lead_followup' : paForm.actionType === 'assign_agent' ? 'e.g. agent@company.com' : 'e.g. Hot Lead'} required />
          <div className="flex gap-2 pt-2">
            <Button onClick={handlePaSave}>{paEdit ? 'Update' : 'Create'}</Button>
            <Button variant="secondary" onClick={() => { setPaModal(false); setPaEdit(null); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditItem(null);
        }}
        title={editItem ? 'Edit Event' : 'Add Event'}
      >
        <div className="space-y-4">
          <Input
            label="Event Name"
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
          <Select
            label="When (trigger)"
            value={form.eventName}
            onChange={(e) => setForm({ ...form, eventName: e.target.value })}
            options={[
              { value: 'message_received', label: 'Message Received (first message per customer / 24 hrs)' },
              { value: 'contact_created', label: 'New Contact Created' },
              { value: 'order_placed', label: 'Order Placed' },
              { value: 'payment_received', label: 'Payment Received' },
              { value: 'webhook', label: 'Incoming Webhook (from another system)' },
            ]}
          />
          <Select
            label="Then (action)"
            value={form.actionType}
            onChange={(e) => setForm({ ...form, actionType: e.target.value })}
            options={[
              { value: 'add_tag', label: 'Add Tag to contact' },
              { value: 'remove_tag', label: 'Remove Tag from contact' },
              { value: 'send_message', label: 'Send WhatsApp Message to contact' },
              { value: 'send_template', label: 'Send Template to contact' },
            ]}
          />
          <Input
            label={form.actionType === 'send_message' ? 'Message text' : form.actionType === 'send_template' ? 'Template name (must be approved)' : 'Tag name'}
            value={form.actionValue}
            onChange={(e) => setForm({ ...form, actionValue: e.target.value })}
            placeholder={form.actionType === 'send_message' ? 'e.g. Thank you for your order!' : form.actionType === 'send_template' ? 'e.g. kkhs_lead_followup' : 'e.g. Hot Lead'}
            required
          />
          {form.eventName === 'webhook' && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
              {editItem
                ? <>Webhook URL: <code className="break-all">{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/events/hook/${editItem._id}`}</code> — POST with JSON body {'{ "phone": "91XXXXXXXXXX" }'}</>
                : 'Save first — the webhook URL will then appear when you edit this event.'}
            </p>
          )}
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
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
