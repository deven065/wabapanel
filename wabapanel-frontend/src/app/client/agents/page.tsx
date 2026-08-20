'use client';
import React, { useState, useEffect } from 'react';
import { Trash2, Users, UserPlus, ShieldCheck, LogIn } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { teamApi } from '@/lib/api';
import { PERMISSION_TREE } from '@/components/layout/ClientSidebar';
import { ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface Agent { _id: string; name: string; email: string; phone?: string; role: string; status: string; avatar?: string; lastActive?: string; conversationsHandled?: number; permissions?: string[]; allowedChannels?: string[]; inboxScope?: string; }

// Expandable permission tree: check a section to grant the whole menu, or expand
// it to grant only specific sub-pages.
function PermTree({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState<string[]>([]);
  const toggleModule = (key: string) => {
    if (value.includes(key)) onChange(value.filter(x => x !== key));
    else {
      const childHrefs = (PERMISSION_TREE.find(s => s.moduleKey === key)?.children || []).map(c => c.href);
      onChange([...value.filter(x => !childHrefs.includes(x) && x !== key), key]);
    }
  };
  const toggleChild = (href: string) =>
    onChange(value.includes(href) ? value.filter(x => x !== href) : [...value, href]);
  return (
    <div className="space-y-1">
      {PERMISSION_TREE.map(sec => {
        const secChecked = value.includes(sec.moduleKey);
        const childGranted = sec.children.some(c => value.includes(c.href));
        const expanded = open.includes(sec.label);
        return (
          <div key={sec.label} className="border rounded-lg bg-white">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <input type="checkbox" checked={secChecked}
                ref={el => { if (el) el.indeterminate = !secChecked && childGranted; }}
                className="w-3.5 h-3.5 accent-indigo-600" onChange={() => toggleModule(sec.moduleKey)} />
              <span className="text-xs text-gray-700 flex-1 cursor-pointer" onClick={() => toggleModule(sec.moduleKey)}>{sec.label}</span>
              {sec.children.length > 0 && (
                <button type="button" onClick={() => setOpen(o => o.includes(sec.label) ? o.filter(x => x !== sec.label) : [...o, sec.label])}
                  className="p-0.5 text-gray-400 hover:text-gray-600">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {expanded && sec.children.length > 0 && (
              <div className="pl-7 pr-2 pb-2 grid grid-cols-1 gap-1">
                {sec.children.map(c => (
                  <label key={c.href} className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={secChecked || value.includes(c.href)} disabled={secChecked}
                      className="w-3 h-3 accent-indigo-600" onChange={() => toggleChild(c.href)} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CHANNEL_OPTIONS = [
  { key: 'whatsapp', label: 'WhatsApp (Cloud API)' },
  { key: 'whatsapp_qr', label: 'WhatsApp (QR)' },
  { key: 'facebook', label: 'Facebook Messenger' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'telegram', label: 'Telegram Bot' },
  { key: 'telegram_personal', label: 'Telegram Personal' },
  { key: 'email', label: 'Email' },
];

interface Perf { _id: string; name: string; email: string; role: string; assignedChats: number; resolvedChats: number; messagesSent: number; avgResponseMins: number | null; }
interface Team { _id: string; name: string; members: Agent[]; description?: string; }

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: '', email: '', password: '', role: 'agent' });
  const [agentPerms, setAgentPerms] = useState<string[]>([]);
  const [agentChans, setAgentChans] = useState<string[]>([]);
  const [agentScope, setAgentScope] = useState<string>('all');
  const [permAgent, setPermAgent] = useState<Agent | null>(null);
  const [permEdit, setPermEdit] = useState<string[]>([]);
  const [chanEdit, setChanEdit] = useState<string[]>([]);
  const [scopeEdit, setScopeEdit] = useState<string>('all');
  const [teamForm, setTeamForm] = useState({ name: '', description: '', members: [] as string[] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([teamApi.listAgents(), teamApi.list()]).then(([agRes, tmRes]) => {
      setAgents(agRes.data.data || []);
      setTeams(tmRes.data.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
    teamApi.performance().then(r => setPerf(r.data.data || [])).catch(() => {});
  }, []);

  const handleAddAgent = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      await teamApi.addAgent({ ...agentForm, permissions: agentPerms, allowedChannels: agentChans, inboxScope: agentScope });
      toast.success('Agent added');
      setShowAgentModal(false);
      setAgentForm({ name: '', email: '', password: '', role: 'agent' });
      setAgentPerms([]); setAgentChans([]); setAgentScope('all');
      teamApi.listAgents().then(r => setAgents(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTeam = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await teamApi.create(teamForm);
      toast.success('Team created');
      setShowTeamModal(false);
      teamApi.list().then(r => setTeams(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', title: 'Agent', render: (a: Agent) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-semibold text-sm">{a.name?.charAt(0)}</div>
        <div>
          <p className="font-medium text-gray-900">{a.name}</p>
          <p className="text-xs text-gray-400">{a.email}</p>
        </div>
      </div>
    )},
    { key: 'role', title: 'Role', render: (a: Agent) => <Badge variant={a.role === 'admin' ? 'info' : 'default'}>{a.role}</Badge> },
    { key: 'status', title: 'Status', render: (a: Agent) => (
      <Badge variant={a.status === 'active' ? 'success' : 'default'}>{a.status || 'active'}</Badge>
    )},
    { key: 'conversations', title: 'Conversations', render: (a: Agent) => a.conversationsHandled || 0 },
    { key: 'permissions', title: 'Access', render: (a: Agent) => (
      <span className="text-xs text-gray-500">{(a.permissions?.length || 0) > 0 ? `${a.permissions!.length} modules` : 'Full access'}</span>
    )},
    { key: 'actions', title: '', render: (a: Agent) => (
      <div className="flex gap-1">
        <button title="Permissions — control which modules this agent can access" onClick={() => { setPermAgent(a); setPermEdit(a.permissions || []); setChanEdit(a.allowedChannels || []); setScopeEdit(a.inboxScope || 'all'); }}
          className="p-1 hover:bg-indigo-50 rounded"><ShieldCheck className="w-4 h-4 text-indigo-500" /></button>
        <button title="Login as this agent" onClick={async () => {
          try {
            const res = await teamApi.loginAsAgent(a._id);
            const { token, user } = res.data.data;
            window.open(`/auth/login?token=${token}&name=${encodeURIComponent(user.name)}`, '_blank');
            toast.success(`Logged in as ${a.name}`);
          } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(error.response?.data?.message || 'Failed to login as agent');
          }
        }} className="p-1 hover:bg-emerald-50 rounded"><LogIn className="w-4 h-4 text-emerald-500" /></button>
        <button onClick={async () => {
          if (!confirm('Delete this agent account? They will no longer be able to log in.')) return;
          try {
            await teamApi.removeAgent(a._id);
            toast.success('Agent deleted');
            teamApi.listAgents().then(r => setAgents(r.data.data || []));
          } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(error.response?.data?.message || 'Failed to delete agent');
          }
        }}
          className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents & Teams</h1>
          <p className="text-gray-500 text-sm mt-1">Manage team members</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Users className="w-4 h-4" />} onClick={() => setShowTeamModal(true)}>New Team</Button>
          <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setAgentForm({ name: '', email: '', password: '', role: 'agent' }); setAgentPerms([]); setAgentChans([]); setAgentScope('all'); setShowAgentModal(true); }}>Add Agent</Button>
        </div>
      </div>

      {/* Teams */}
      {teams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <Card key={team._id}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{team.name}</h3>
                  <p className="text-xs text-gray-500">{team.members?.length || 0} members</p>
                </div>
              </div>
              <div className="flex -space-x-2">
                {(team.members || []).slice(0, 5).map((m, i) => (
                  <div key={i} className="w-7 h-7 bg-gray-200 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium">{m.name?.charAt(0)}</div>
                ))}
                {(team.members?.length || 0) > 5 && <div className="w-7 h-7 bg-gray-100 rounded-full border-2 border-white flex items-center justify-center text-xs">+{team.members.length - 5}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Agents Table */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">All Agents</h3>
        <Table columns={columns} data={agents} loading={loading} emptyText="No agents added yet" />
      </Card>

      {/* Agent Performance */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Agent Performance</h3>
        <p className="text-xs text-gray-400 mb-4">Last 30 days — assigned chats, resolved chats, messages sent, and average reply time</p>
        <Table
          columns={[
            { key: 'name', title: 'Agent', render: (p: Perf) => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold text-xs">{p.name?.charAt(0)}</div>
                <span className="font-medium text-gray-900">{p.name}</span>
              </div>
            )},
            { key: 'assignedChats', title: 'Assigned Chats', render: (p: Perf) => p.assignedChats },
            { key: 'resolvedChats', title: 'Resolved (30d)', render: (p: Perf) => p.resolvedChats },
            { key: 'messagesSent', title: 'Messages Sent (30d)', render: (p: Perf) => p.messagesSent },
            { key: 'avgResponseMins', title: 'Avg Reply Time', render: (p: Perf) => p.avgResponseMins == null ? '—' : p.avgResponseMins < 60 ? `${p.avgResponseMins} min` : `${Math.round(p.avgResponseMins / 6) / 10} hr` },
          ]}
          data={perf}
          loading={loading}
          emptyText="No agent activity yet"
        />
      </Card>

      {/* Add Agent Modal */}
      <Modal isOpen={showAgentModal} onClose={() => setShowAgentModal(false)} title="Add Agent">
        <div className="space-y-4">
          <Input label="Name" value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} required />
          <Input label="Email" type="email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} required />
          <Input label="Password" type="password" value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} required />
          {agentForm.role === 'agent' && (
            <div className="border rounded-lg p-3 bg-indigo-50/40 border-indigo-100">
              <p className="text-xs font-medium text-gray-700 mb-1">Module Access (optional)</p>
              <p className="text-[11px] text-gray-400 mb-2">Tick a menu for full access, or expand it (›) to allow only specific sub-pages. Leave all unchecked for full access.</p>
              <div className="max-h-72 overflow-y-auto pr-1">
                <PermTree value={agentPerms} onChange={setAgentPerms} />
              </div>
            </div>
          )}
          {agentForm.role === 'agent' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Channels this agent can see</p>
              <p className="text-xs text-gray-400 mb-2">Leave all unchecked to allow every channel.</p>
              <div className="grid grid-cols-2 gap-2">
                {CHANNEL_OPTIONS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
                    <input type="checkbox" checked={agentChans.includes(c.key)} className="w-4 h-4 accent-indigo-600"
                      onChange={() => setAgentChans(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          {agentForm.role === 'agent' && (
            <Select label="Chat visibility" value={agentScope} onChange={(e) => setAgentScope(e.target.value)}
              options={[{ value: 'all', label: 'All chats' }, { value: 'assigned', label: 'Only chats assigned to this agent' }]} />
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowAgentModal(false)}>Cancel</Button>
            <Button onClick={handleAddAgent}>Add Agent</Button>
          </div>
        </div>
      </Modal>

      {/* Agent Permissions Modal */}
      <Modal isOpen={!!permAgent} onClose={() => setPermAgent(null)} title={`Permissions — ${permAgent?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Tick a menu for full access, or expand it (›) to allow only specific sub-pages. If nothing is selected, the agent has full access to all modules.</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            <PermTree value={permEdit} onChange={setPermEdit} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Channels this agent can see</p>
            <p className="text-xs text-gray-400 mb-2">Leave all unchecked to allow every channel.</p>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_OPTIONS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
                  <input type="checkbox" checked={chanEdit.includes(c.key)} className="w-4 h-4 accent-indigo-600"
                    onChange={() => setChanEdit(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <Select label="Chat visibility" value={scopeEdit} onChange={(e) => setScopeEdit(e.target.value)}
            options={[{ value: 'all', label: 'All chats' }, { value: 'assigned', label: 'Only chats assigned to this agent' }]} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPermAgent(null)}>Cancel</Button>
            <Button onClick={async () => {
              if (!permAgent) return;
              try {
                await teamApi.updateAgent(permAgent._id, { permissions: permEdit, allowedChannels: chanEdit, inboxScope: scopeEdit });
                toast.success('Permissions updated — the agent will see the changes on next login or page refresh');
                setPermAgent(null);
                teamApi.listAgents().then(r => setAgents(r.data.data || []));
              } catch { toast.error('Failed to update permissions'); }
            }}>Save Permissions</Button>
          </div>
        </div>
      </Modal>

      {/* Create Team Modal */}
      <Modal isOpen={showTeamModal} onClose={() => setShowTeamModal(false)} title="Create Team">
        <div className="space-y-4">
          <Input label="Team Name" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required />
          <Input label="Description" value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} />
          {agents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Members</label>
              <div className="flex flex-wrap gap-2">
                {agents.map(a => (
                  <button key={a._id} onClick={() => setTeamForm({ ...teamForm, members: teamForm.members.includes(a._id) ? teamForm.members.filter(x => x !== a._id) : [...teamForm.members, a._id] })}
                    className={`px-3 py-1 text-xs rounded-full border ${teamForm.members.includes(a._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200'}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowTeamModal(false)}>Cancel</Button>
            <Button onClick={handleCreateTeam}>Create Team</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
