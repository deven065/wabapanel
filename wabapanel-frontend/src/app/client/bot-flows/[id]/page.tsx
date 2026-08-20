'use client';
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save, Edit, Trash2, ChevronDown, MessageSquare, Image as ImageIcon, MousePointerClick, FileCode, Upload, Zap, ShoppingBag, Globe, HelpCircle, Clock, GitBranch } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { botFlowApi, templateApi, uploadApi, tagApi, teamApi, catalogApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface FlowButton { title: string; next: string }
// A `next` value can hold multiple node ids joined by '.' (node ids never contain dots)
const splitNext = (v: string) => (v || '').split('.').filter(Boolean);
const joinNext = (ids: string[]) => ids.join('.');
const toggleNext = (v: string, targetId: string) => {
  const ids = splitNext(v);
  return joinNext(ids.includes(targetId) ? ids.filter(x => x !== targetId) : [...ids, targetId]);
};
interface FlowRow { title: string; description: string; next: string }
interface FlowNode {
  id: string; name: string; type: 'text' | 'media' | 'interactive' | 'template' | 'action' | 'products' | 'webhook' | 'question' | 'delay' | 'condition';
  webhookUrl: string; webhookMethod: string; webhookBody: string; webhookHeaders: { key: string; value: string }[];
  answerVar: string; waitTimeoutHours: number; nextTimeout: string; delaySeconds: number; delayUnit: string;
  condField: string; condVarName: string; condOp: string; condValue: string; nextTrue: string; nextFalse: string;
  productIds: string[];
  actionType: string; actionTag: string; actionAgent: string; apptTitle: string; apptDaysAhead: number; apptTime: string;
  apptDuration: number; apptDayEnd: string; apptMode: string;
  payAmount: number; payDesc: string; payMethod: string; payUpiId: string;
  text: string; mediaType: string; mediaUrl: string; caption: string;
  header: string; headerType: string; headerMediaUrl: string; footer: string; mode: 'buttons' | 'list' | 'cta';
  ctaText: string; ctaUrl: string; ctas: { text: string; url: string }[];
  buttons: FlowButton[]; listButtonText: string; rows: FlowRow[];
  templateName: string; templateLanguage: string; next: string; x: number; y: number;
}
interface Flow { _id: string; name: string; triggerKeywords: string[]; isActive: boolean; startNode: string; startX: number; startY: number; nodes: FlowNode[] }
interface PortPos { x: number; y: number }
type ConnectFrom = { kind: 'start' } | { kind: 'next' | 'condT' | 'condF'; nodeId: string } | { kind: 'btn' | 'row'; nodeId: string; idx: number };

const NODE_TYPES = [
  { type: 'text', label: 'Simple Bot Reply', icon: <MessageSquare className="w-4 h-4" /> },
  { type: 'media', label: 'Media Bot Reply', icon: <ImageIcon className="w-4 h-4" /> },
  { type: 'interactive', label: 'Interactive Bot Reply', icon: <MousePointerClick className="w-4 h-4" /> },
  { type: 'template', label: 'Template Bot Reply', icon: <FileCode className="w-4 h-4" /> },
  { type: 'action', label: 'Action (Booking / Tag / Assign / AI)', icon: <Zap className="w-4 h-4" /> },
  { type: 'products', label: 'Products / Catalog', icon: <ShoppingBag className="w-4 h-4" /> },
  { type: 'webhook', label: 'Webhook (HTTP Request)', icon: <Globe className="w-4 h-4" /> },
  { type: 'question', label: 'Question (free-text reply)', icon: <HelpCircle className="w-4 h-4" /> },
  { type: 'delay', label: 'Delay (wait then continue)', icon: <Clock className="w-4 h-4" /> },
  { type: 'condition', label: 'Condition (if / else branch)', icon: <GitBranch className="w-4 h-4" /> },
] as const;

const newNode = (type: FlowNode['type'], x: number, y: number): FlowNode => ({
  id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name: '', type, text: '', mediaType: 'image', mediaUrl: '', caption: '',
  header: '', headerType: 'none', headerMediaUrl: '', footer: '', mode: 'buttons',
  ctaText: '', ctaUrl: '', ctas: [], buttons: [{ title: '', next: '' }],
  listButtonText: '', rows: [{ title: '', description: '', next: '' }],
  templateName: '', templateLanguage: 'en', next: '', x, y,
  actionType: 'book_appointment', actionTag: '', actionAgent: '', apptTitle: '', apptDaysAhead: 1, apptTime: '10:00',
  apptDuration: 30, apptDayEnd: '18:00', apptMode: 'auto', productIds: [],
  payAmount: 0, payDesc: '', payMethod: 'razorpay', payUpiId: '',
  webhookUrl: '', webhookMethod: 'POST', webhookBody: '{"phone": "{phone_number}", "name": "{full_name}"}', webhookHeaders: [],
  answerVar: '', waitTimeoutHours: 0, nextTimeout: '', delaySeconds: 30, delayUnit: 'seconds',
  condField: 'reply', condVarName: '', condOp: 'contains', condValue: '', nextTrue: '', nextFalse: '',
});

export default function BotFlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [startNode, setStartNode] = useState('');
  const [startPos, setStartPos] = useState({ x: 40, y: 60 });
  const [isActive, setIsActive] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [editing, setEditing] = useState<FlowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<{ _id: string; name: string; language?: string }[]>([]);
  const [tags, setTags] = useState<{ _id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ _id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ _id: string; name: string; price?: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [hits, setHits] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState(0);
  const [connectFrom, setConnectFrom] = useState<ConnectFrom | null>(null);
  const [ports, setPorts] = useState<Record<string, PortPos>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headerFileRef = useRef<HTMLInputElement>(null);
  const VARIABLES = ['{first_name}', '{last_name}', '{full_name}', '{phone_number}'];
  const dragRef = useRef<{ target: string; offX: number; offY: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) return;
    setDirty(true);
  }, [nodes, startNode, startPos, isActive]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const [leavePrompt, setLeavePrompt] = useState<'page' | 'modal' | null>(null);
  const editSnapRef = useRef<string>('');

  const goBack = () => {
    if (dirty) { setLeavePrompt('page'); return; }
    router.push('/client/bot-flows');
  };

  const requestCloseModal = () => {
    if (editing && JSON.stringify(editing) !== editSnapRef.current) { setLeavePrompt('modal'); return; }
    setEditing(null);
  };

  useEffect(() => {
    botFlowApi.get(id).then(r => {
      const f: Flow = r.data.data;
      setFlow(f);
      setNodes((f.nodes || []).map((n, i) => ({ ...n, x: n.x || 320 + (i % 3) * 300, y: n.y || 60 + Math.floor(i / 3) * 260 })));
      setStartNode(f.startNode || '');
      setStartPos({ x: f.startX || 40, y: f.startY || 60 });
      setIsActive(!!f.isActive);
      setHits((f as unknown as { nodeHits?: Record<string, number> }).nodeHits || {});
      setRuns((f as unknown as { runs?: number }).runs || 0);
      setTimeout(() => { loadedRef.current = true; }, 300);
    }).catch(() => { toast.error('Flow not found'); router.push('/client/bot-flows'); });
    templateApi.list().then(r => setTemplates(((r.data.data || []) as { _id: string; name: string; language?: string; status?: string }[]).filter(t => (t.status || '').toLowerCase() === 'approved'))).catch(() => {});
    tagApi.list().then(r => setTags(r.data.data || [])).catch(() => {});
    teamApi.listAgents().then(r => setAgents(r.data.data || [])).catch(() => {});
    catalogApi.getProducts().then(r => setProducts(((r.data.data || []) as { _id: string; name: string; price?: number }[])) ).catch(() => {});
  }, [id, router]);

  // Measure port positions relative to canvas
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cRect = canvas.getBoundingClientRect();
    const next: Record<string, PortPos> = {};
    canvas.querySelectorAll<HTMLElement>('[data-port]').forEach(el => {
      const r = el.getBoundingClientRect();
      next[el.dataset.port as string] = {
        x: r.left - cRect.left + r.width / 2 + canvas.scrollLeft,
        y: r.top - cRect.top + r.height / 2 + canvas.scrollTop,
      };
    });
    setPorts(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  }, [nodes, startPos, startNode, flow]);

  // Dragging
  const onDragStart = (e: React.MouseEvent, target: string) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cRect = canvas.getBoundingClientRect();
    const cur = target === 'start' ? startPos : nodes.find(n => n.id === target);
    if (!cur) return;
    dragRef.current = {
      target,
      offX: e.clientX - cRect.left + canvas.scrollLeft - cur.x,
      offY: e.clientY - cRect.top + canvas.scrollTop - cur.y,
    };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const x = Math.max(0, ev.clientX - cRect.left + canvas.scrollLeft - d.offX);
      const y = Math.max(0, ev.clientY - cRect.top + canvas.scrollTop - d.offY);
      if (d.target === 'start') setStartPos({ x, y });
      else setNodes(prev => prev.map(n => n.id === d.target ? { ...n, x, y } : n));
    };
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const handleSave = useCallback(async (active?: boolean, opts?: { silent?: boolean }) => {
    setSaving(true);
    try {
      await botFlowApi.update(id, { nodes, startNode, startX: startPos.x, startY: startPos.y, isActive: active !== undefined ? active : isActive });
      if (!opts?.silent) toast.success('Flow saved');
      setDirty(false);
      setAutoSaved(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      if (!opts?.silent) toast.error(e.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  }, [id, nodes, startNode, startPos, isActive]);

  // Auto-save: debounce ~1.5s after any change so work is never lost
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);
  useEffect(() => {
    if (!loadedRef.current || !dirty) return;
    const t = setTimeout(() => { handleSaveRef.current(undefined, { silent: true }); }, 1500);
    return () => clearTimeout(t);
  }, [nodes, startNode, startPos, isActive, dirty]);

  // Connect: click an output port, then click a card's input port
  const applyConnection = (targetId: string) => {
    if (!connectFrom) return;
    if (connectFrom.kind === 'start') { setStartNode(targetId); setConnectFrom(null); toast.success('Connected'); return; }
    if (targetId === connectFrom.nodeId) { setConnectFrom(null); return; }
    let removed = false;
    setNodes(prev => prev.map(n => {
      if (n.id !== connectFrom.nodeId) return n;
      if (connectFrom.kind === 'next') { removed = splitNext(n.next).includes(targetId); return { ...n, next: toggleNext(n.next, targetId) }; }
      if (connectFrom.kind === 'condT') { removed = splitNext(n.nextTrue).includes(targetId); return { ...n, nextTrue: toggleNext(n.nextTrue, targetId) }; }
      if (connectFrom.kind === 'condF') { removed = splitNext(n.nextFalse).includes(targetId); return { ...n, nextFalse: toggleNext(n.nextFalse, targetId) }; }
      if (connectFrom.kind === 'btn') { removed = splitNext(n.buttons[connectFrom.idx]?.next || '').includes(targetId); return { ...n, buttons: n.buttons.map((b, i) => i === connectFrom.idx ? { ...b, next: toggleNext(b.next, targetId) } : b) }; }
      if (connectFrom.kind === 'row') {
        removed = splitNext(n.rows[connectFrom.idx]?.next || '').includes(targetId);
        return { ...n, rows: n.rows.map((r, i) => i === connectFrom.idx && connectFrom.kind === 'row' ? { ...r, next: toggleNext(r.next, targetId) } : r) };
      }
      return n;
    }));
    setConnectFrom(null);
    toast.success(removed ? 'Connection removed' : 'Connected');
  };

  const outPortKey = (c: ConnectFrom) =>
    c.kind === 'start' ? 'out:start'
      : c.kind === 'btn' || c.kind === 'row' ? `out:${c.nodeId}:${c.kind}:${c.idx}`
      : `out:${c.nodeId}:${c.kind}`;
  const isConnecting = (c: ConnectFrom) => connectFrom && outPortKey(connectFrom) === outPortKey(c);

  const deleteNode = (nodeId: string) => {
    if (!confirm('Delete this bot reply?')) return;
    const drop = (v: string) => joinNext(splitNext(v).filter(x => x !== nodeId));
    setNodes(prev => prev.filter(n => n.id !== nodeId).map(n => ({
      ...n,
      next: drop(n.next),
      nextTrue: drop(n.nextTrue || ''),
      nextFalse: drop(n.nextFalse || ''),
      buttons: n.buttons.map(b => ({ ...b, next: drop(b.next) })),
      rows: n.rows.map(r => ({ ...r, next: drop(r.next) })),
    })));
    if (startNode === nodeId) setStartNode('');
  };

  useEffect(() => {
    if (editing) editSnapRef.current = editSnapRef.current || JSON.stringify(editing);
    else editSnapRef.current = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!editing]);

  const saveNode = () => {
    if (!editing) return;
    if (editing.type === 'text' && !editing.text) { toast.error('Reply text is required'); return; }
    if (editing.type === 'media' && !editing.mediaUrl) { toast.error('Upload or paste a media URL'); return; }
    if (editing.type === 'template' && !editing.templateName) { toast.error('Select a template'); return; }
    if (editing.type === 'products' && !(editing.productIds || []).length) { toast.error('Select at least one product'); return; }
    if (editing.type === 'action' && editing.actionType === 'add_tag' && !editing.actionTag) { toast.error('Select a tag'); return; }
    if (editing.type === 'action' && editing.actionType === 'send_payment' && !(editing.payAmount > 0)) { toast.error('Enter amount'); return; }
    if (editing.type === 'action' && editing.actionType === 'send_payment' && editing.payMethod === 'upi' && !editing.payUpiId) { toast.error('Enter UPI ID'); return; }
    if (editing.type === 'action' && editing.actionType === 'assign_agent' && !editing.actionAgent) { toast.error('Select an agent'); return; }
    if (editing.type === 'webhook' && !editing.webhookUrl) { toast.error('Webhook URL is required'); return; }
    if (editing.type === 'question' && !editing.text) { toast.error('Question text is required'); return; }
    if (editing.type === 'delay' && !(editing.delaySeconds > 0)) { toast.error('Enter delay seconds'); return; }
    if (editing.type === 'condition' && (editing.condOp !== 'exists' || editing.condField === 'tag') && !editing.condValue) { toast.error('Enter the value to check'); return; }
    if (editing.type === 'condition' && editing.condField === 'variable' && !editing.condVarName) { toast.error('Enter the variable name'); return; }
    if (editing.type === 'interactive') {
      if (!editing.text) { toast.error('Body text is required'); return; }
      if (editing.mode === 'buttons' && !editing.buttons.some(b => b.title)) { toast.error('Add at least one button'); return; }
      if (editing.mode === 'list' && !editing.rows.some(r => r.title)) { toast.error('Add at least one list item'); return; }
      if (editing.mode === 'cta' && !editing.ctas.some(c => c.url)) { toast.error('CTA URL is required'); return; }
    }
    const isNew = !nodes.some(n => n.id === editing.id);
    setNodes(prev => isNew ? [...prev, editing] : prev.map(n => n.id === editing.id ? editing : n));
    if (isNew && !nodes.length && !startNode) setStartNode(editing.id);
    setEditing(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'mediaUrl' | 'headerMediaUrl' = 'mediaUrl') => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', editing.mediaType === 'sticker' ? 'stickers' : 'bot-flows');
      const res = await uploadApi.uploadFile(fd);
      setEditing({ ...editing, [field]: res.data.data.url });
      toast.success('Uploaded');
    } catch { toast.error('Upload failed'); }
    setUploading(false);
  };

  const VarChips = ({ onInsert }: { onInsert: (v: string) => void }) => (
    <div className="-mt-2 space-y-1">
      <div className="flex flex-wrap gap-1">
        {VARIABLES.map(v => (
          <button key={v} type="button" onClick={() => onInsert(v)}
            className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-100">{v}</button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">🌐 Multi-language: write your text as <span className="font-mono">[hi] Hindi message [en] English message</span> — the customer&apos;s language is auto-detected and the matching version is sent.</p>
    </div>
  );

  const openEdit = (n: FlowNode) => {
    const c: FlowNode = JSON.parse(JSON.stringify(n));
    if (!c.ctas) c.ctas = [];
    if (c.ctaUrl && !c.ctas.length) { c.ctas = [{ text: c.ctaText || '', url: c.ctaUrl }]; c.ctaText = ''; c.ctaUrl = ''; }
    setEditing(c);
  };

  const nodeLabel = (n: FlowNode) => n.name || (n.type === 'template' ? n.templateName : (n.text || n.caption || 'Untitled').slice(0, 28)) || 'Untitled';

  // Multi-target picker: shows connected replies as removable chips + a select to add more
  const MultiNextPicker = ({ value, onChange, excludeId, className }: { value: string; onChange: (v: string) => void; excludeId?: string; className?: string }) => {
    const ids = splitNext(value);
    const available = nodes.filter(n => n.id !== excludeId && !ids.includes(n.id));
    return (
      <div className={`space-y-1 ${className || ''}`}>
        {ids.map(idv => {
          const n = nodes.find(x => x.id === idv);
          return (
            <span key={idv} className="flex items-center justify-between gap-1 text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
              <span className="truncate">{n ? nodeLabel(n) : idv}</span>
              <button type="button" onClick={() => onChange(joinNext(ids.filter(x => x !== idv)))} className="text-emerald-400 hover:text-red-500 font-bold shrink-0">×</button>
            </span>
          );
        })}
        <select value="" onChange={e => { if (e.target.value) onChange(joinNext([...ids, e.target.value])); }}
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-500">
          <option value="">{ids.length ? '+ also send…' : '— none —'}</option>
          {available.map(n => <option key={n.id} value={n.id}>{nodeLabel(n)}</option>)}
        </select>
      </div>
    );
  };

  // Build edges (each output can connect to multiple targets)
  const edges: { from: string; to: string }[] = [];
  const pushEdges = (from: string, next: string) => splitNext(next).forEach(t => edges.push({ from, to: `in:${t}` }));
  if (startNode) edges.push({ from: 'out:start', to: `in:${startNode}` });
  nodes.forEach(n => {
    pushEdges(`out:${n.id}:next`, n.next);
    if (n.type === 'condition') { pushEdges(`out:${n.id}:condT`, n.nextTrue || ''); pushEdges(`out:${n.id}:condF`, n.nextFalse || ''); }
    if (n.type === 'interactive') {
      if (n.mode === 'buttons') n.buttons.forEach((b, i) => { if (b.title) pushEdges(`out:${n.id}:btn:${i}`, b.next); });
      else if (n.mode === 'list') n.rows.forEach((r, i) => { if (r.title) pushEdges(`out:${n.id}:row:${i}`, r.next); });
    }
    if (n.type === 'template') n.buttons.forEach((b, i) => { if (b.title) pushEdges(`out:${n.id}:btn:${i}`, b.next); });
  });

  const outCount = (c: ConnectFrom) => {
    if (c.kind === 'start') return startNode ? 1 : 0;
    const n = nodes.find(x => x.id === c.nodeId);
    if (!n) return 0;
    if (c.kind === 'next') return splitNext(n.next).length;
    if (c.kind === 'condT') return splitNext(n.nextTrue || '').length;
    if (c.kind === 'condF') return splitNext(n.nextFalse || '').length;
    if (c.kind === 'btn') return splitNext(n.buttons[c.idx]?.next || '').length;
    if (c.kind === 'row') return splitNext(n.rows[c.idx]?.next || '').length;
    return 0;
  };

  const OutPort = ({ c }: { c: ConnectFrom }) => {
    const count = outCount(c);
    return (
      <span className="relative inline-flex flex-shrink-0">
        <button
          data-port={outPortKey(c)}
          onClick={(e) => { e.stopPropagation(); setConnectFrom(isConnecting(c) ? null : c); }}
          title="Click, then click the ● on the left of another card to connect. Click a connected card again to remove that connection. One button can connect to multiple cards."
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition ${isConnecting(c) ? 'bg-amber-400 border-amber-500 animate-pulse' : 'bg-emerald-500 border-emerald-600 hover:scale-125'}`}
        />
        {count > 1 && <span className="absolute -top-2 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">{count}</span>}
      </span>
    );
  };

  const InPort = ({ nodeId }: { nodeId: string }) => (
    <button
      data-port={`in:${nodeId}`}
      onClick={(e) => { e.stopPropagation(); if (connectFrom) applyConnection(nodeId); }}
      className={`absolute -left-2 top-4 w-4 h-4 rounded-full border-2 ${connectFrom ? 'bg-amber-300 border-amber-500 animate-pulse cursor-pointer scale-125' : 'bg-gray-300 border-gray-400'}`}
      title={connectFrom ? 'Click to connect here' : 'Input'}
    />
  );

  if (!flow) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{flow.name}</h1>
            <p className="text-xs text-gray-500">Drag cards to arrange • click a green ● then a card&apos;s left ● to connect{runs > 0 && <span className="ml-2 text-indigo-600 font-semibold">• {runs} runs</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <div onClick={() => { setIsActive(!isActive); handleSave(!isActive); }}
              className={`w-10 h-5 rounded-full relative transition ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${isActive ? 'left-5' : 'left-0.5'}`} />
            </div>
            Status
          </label>
          <div className="relative">
            <Button variant="outline" onClick={() => setAddMenu(!addMenu)} icon={<Plus className="w-4 h-4" />}>Add New Bot Reply <ChevronDown className="w-3.5 h-3.5 ml-1" /></Button>
            {addMenu && (
              <div className="absolute right-0 top-11 z-30 bg-white border rounded-lg shadow-lg py-1 w-56">
                {NODE_TYPES.map(t => (
                  <button key={t.type} onClick={() => {
                    const c = canvasRef.current;
                    setEditing(newNode(t.type, (c?.scrollLeft || 0) + 340 + (nodes.length % 3) * 40, (c?.scrollTop || 0) + 80 + (nodes.length % 4) * 60));
                    setAddMenu(false);
                  }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left">{t.icon} {t.label}</button>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-500 min-w-[92px] text-right">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : autoSaved ? 'All changes saved' : ''}
          </span>
          <Button onClick={() => handleSave()} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>
        </div>
      </div>

      <div ref={canvasRef} onClick={() => setConnectFrom(null)}
        className="relative bg-white border border-gray-200 rounded-xl overflow-auto"
        style={{ height: 'calc(100vh - 210px)', backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        <div className="relative" style={{ width: 3000, height: 2000 }}>
          <svg className="absolute inset-0 pointer-events-none" width={3000} height={2000}>
            {edges.map((e, i) => {
              const a = ports[e.from]; const b = ports[e.to];
              if (!a || !b) return null;
              const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
              return <path key={i} d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                stroke="#15803d" strokeWidth="2.5" fill="none" />;
            })}
          </svg>

          {/* Start node */}
          <div className="absolute bg-white border border-gray-300 rounded-lg shadow-md w-64 select-none" style={{ left: startPos.x, top: startPos.y }}>
            <div onMouseDown={(e) => onDragStart(e, 'start')} className="bg-gray-100 border-b border-gray-200 px-3 py-2 rounded-t-lg cursor-move">
              <p className="text-sm font-bold text-gray-800">Start →</p>
            </div>
            <div className="px-3 py-3 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 text-right flex-1">{(flow.triggerKeywords || []).join(', ') || 'trigger keywords'}</p>
              <OutPort c={{ kind: 'start' }} />
            </div>
          </div>

          {/* Reply nodes */}
          {nodes.map(n => (
            <div key={n.id} className="absolute bg-white border border-gray-300 rounded-lg shadow-md w-64 select-none" style={{ left: n.x, top: n.y }}>
              <InPort nodeId={n.id} />
              <div onMouseDown={(e) => onDragStart(e, n.id)} className="bg-gray-100 border-b border-gray-200 px-3 py-2 rounded-t-lg cursor-move flex items-center justify-between">
                <p className="text-sm font-bold text-gray-800 truncate">{nodeLabel(n)}</p>
                <span className="text-[10px] text-gray-400 uppercase shrink-0">{hits[n.id] ? <span className="text-indigo-600 font-bold normal-case mr-1">👆{hits[n.id]}</span> : null}{n.type}</span>
              </div>
              <div className="px-3 py-2 flex gap-1">
                <button onClick={() => openEdit(n)} className="flex items-center gap-1 text-[11px] px-2 py-1 bg-gray-800 text-white rounded"><Edit className="w-3 h-3" /> Edit</button>
                <button onClick={() => deleteNode(n.id)} className="flex items-center gap-1 text-[11px] px-2 py-1 bg-red-500 text-white rounded"><Trash2 className="w-3 h-3" /> Delete</button>
              </div>
              <div className="px-3 pb-3 space-y-1.5">
                {n.type === 'media' && <p className="text-[11px] text-gray-400 truncate">{n.mediaType}: {n.mediaUrl}</p>}
                {n.type === 'template' && <p className="text-[11px] text-gray-400 truncate">Template: {n.templateName}</p>}
                {n.type === 'products' && <p className="text-[11px] text-pink-500 font-medium">🛍 {(n.productIds || []).length} products list</p>}
                {n.type === 'action' && (
                  <p className="text-[11px] text-indigo-500 font-medium">
                    ⚡ {n.actionType === 'book_appointment' ? `Book appointment${n.apptTitle ? `: ${n.apptTitle}` : ''}`
                      : n.actionType === 'add_tag' ? `Add tag: ${tags.find(t => t._id === n.actionTag)?.name || ''}`
                      : n.actionType === 'assign_agent' ? `Assign: ${agents.find(a => a._id === n.actionAgent)?.name || ''}`
                      : n.actionType === 'send_payment' ? `💳 Payment link: ₹${n.payAmount || 0}`
                      : n.actionType === 'ai_on' ? 'Turn AI ON' : 'Turn AI OFF'}
                  </p>
                )}
                {n.type === 'webhook' && <p className="text-[11px] text-cyan-600 font-medium truncate">🌐 {n.webhookMethod || 'POST'} {n.webhookUrl}</p>}
                {n.type === 'question' && <p className="text-[11px] text-purple-600 font-medium line-clamp-2 whitespace-pre-wrap">❓ {n.text}{n.answerVar ? ` → {${n.answerVar}}` : ''}</p>}
                {n.type === 'delay' && <p className="text-[11px] text-orange-500 font-medium">⏱ Wait {n.delaySeconds || 0} {n.delayUnit || 'seconds'}, then continue</p>}
                {n.type === 'condition' && (
                  <>
                    <p className="text-[11px] text-rose-600 font-medium">🔀 If {n.condField === 'tag' ? `has tag "${n.condValue}"` : `${n.condField === 'variable' ? `{${n.condVarName}}` : 'last reply'} ${n.condOp} ${n.condOp === 'exists' ? '' : `"${n.condValue}"`}`}</p>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-emerald-700 text-right">✔ Yes / True</span>
                      <OutPort c={{ kind: 'condT', nodeId: n.id }} />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-red-600 text-right">✖ No / False</span>
                      <OutPort c={{ kind: 'condF', nodeId: n.id }} />
                    </div>
                  </>
                )}
                {(n.type === 'text' || n.type === 'interactive') && <p className="text-[11px] text-gray-400 line-clamp-2 whitespace-pre-wrap">{n.text}</p>}
                {n.type === 'interactive' && [...(n.ctaUrl ? [{ text: n.ctaText, url: n.ctaUrl }] : []), ...(n.ctas || []).filter(c => c.url)].map((c, i) => (
                  <div key={`cta${i}`} className="flex justify-end">
                    <span className="inline-flex items-center gap-1 text-[11px] px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full font-medium" title={c.url}>🔗 {c.text || 'Open'}</span>
                  </div>
                ))}
                {n.type === 'interactive' && n.mode !== 'cta' && (n.mode === 'buttons' ? n.buttons : n.rows).map((opt, i) => (
                  (opt as FlowButton | FlowRow).title ? (
                    <div key={i} className="flex items-center justify-end gap-2">
                      <span className="text-xs text-gray-700 text-right">{(opt as FlowButton).title}</span>
                      <OutPort c={{ kind: n.mode === 'buttons' ? 'btn' : 'row', nodeId: n.id, idx: i }} />
                    </div>
                  ) : null
                ))}
                {n.type === 'template' && n.buttons.map((b, i) => (
                  b.title ? (
                    <div key={i} className="flex items-center justify-end gap-2">
                      <span className="text-xs text-gray-700 text-right">{b.title}</span>
                      <OutPort c={{ kind: 'btn', nodeId: n.id, idx: i }} />
                    </div>
                  ) : null
                ))}
                {n.type !== 'condition' && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-dashed border-gray-100">
                    <span className="text-[10px] text-gray-400">{n.type === 'question' ? 'after answer →' : n.type === 'delay' ? 'after delay →' : 'then send →'}</span>
                    <OutPort c={{ kind: 'next', nodeId: n.id }} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {nodes.length === 0 && <p className="absolute left-[360px] top-[100px] text-sm text-gray-400">Click &quot;Add New Bot Reply&quot; to create the first message.</p>}
        </div>
      </div>

      <Modal isOpen={!!editing} onClose={requestCloseModal} guard={false} title={editing && nodes.some(n => n.id === editing.id) ? 'Edit Bot Reply' : 'Add Bot Reply'} size="lg">
        {editing && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <Input label="Name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Welcome message" />

            {editing.type === 'text' && (
              <>
                <Textarea label="Reply Text" rows={4} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder="Your message..." />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
              </>
            )}

            {editing.type === 'media' && (
              <>
                <Select label="Media Type" value={editing.mediaType} onChange={e => setEditing({ ...editing, mediaType: e.target.value })}
                  options={[{ value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }, { value: 'document', label: 'Document' }, { value: 'audio', label: 'Audio' }, { value: 'sticker', label: 'Sticker (WebP)' }]} />
                <div className="flex items-end gap-2">
                  <div className="flex-1"><Input label="Media URL" value={editing.mediaUrl} onChange={e => setEditing({ ...editing, mediaUrl: e.target.value })} placeholder="https://..." /></div>
                  <input ref={fileRef} type="file" className="hidden" onChange={e => handleUpload(e, 'mediaUrl')} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploading} icon={<Upload className="w-4 h-4" />}>Upload</Button>
                </div>
                <Textarea label="Caption (optional)" rows={2} value={editing.caption} onChange={e => setEditing({ ...editing, caption: e.target.value })} />
              </>
            )}

            {editing.type === 'products' && (
              <>
                <Textarea label="Body Text" rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder="Hamare products dekhein 👇" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select products (max 10) — when the customer taps a product in the list, its detail card is sent</label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                    {products.length === 0 && <p className="text-xs text-gray-400 p-3">No products yet — create products on the Catalog page first.</p>}
                    {products.map(p => (
                      <label key={p._id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={(editing.productIds || []).includes(p._id)}
                          onChange={e => {
                            const cur = editing.productIds || [];
                            setEditing({ ...editing, productIds: e.target.checked ? [...cur, p._id].slice(0, 10) : cur.filter(x => x !== p._id) });
                          }} />
                        <span className="flex-1">{p.name}</span>
                        {p.price ? <span className="text-xs text-gray-400">₹{p.price}</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {editing.type === 'action' && (
              <>
                <Select label="Action" value={editing.actionType} onChange={e => setEditing({ ...editing, actionType: e.target.value })}
                  options={[
                    { value: 'book_appointment', label: 'Book Appointment' },
                    { value: 'add_tag', label: 'Add Tag / Label to contact' },
                    { value: 'assign_agent', label: 'Assign chat to agent' },
                    { value: 'ai_on', label: 'Turn AI ON for this chat' },
                    { value: 'ai_off', label: 'Turn AI OFF for this chat' },
                    { value: 'send_payment', label: 'Send Payment Link (Razorpay / UPI)' },
                  ]} />
                {editing.actionType === 'book_appointment' && (
                  <>
                    <Input label="Appointment Title" value={editing.apptTitle} onChange={e => setEditing({ ...editing, apptTitle: e.target.value })} placeholder="e.g. Demo call" />
                    <Select label="Booking mode" value={editing.apptMode || 'auto'} onChange={e => setEditing({ ...editing, apptMode: e.target.value })}
                      options={[
                        { value: 'auto', label: 'Auto — next available slot is booked automatically' },
                        { value: 'choose', label: 'Customer picks — send a list of available slots' },
                      ]} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Days from today" type="number" value={String(editing.apptDaysAhead)} onChange={e => setEditing({ ...editing, apptDaysAhead: Number(e.target.value) || 0 })} />
                      <Select label="Duration" value={String(editing.apptDuration || 30)} onChange={e => setEditing({ ...editing, apptDuration: Number(e.target.value) })}
                        options={[{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '1 hour' }, { value: '90', label: '1.5 hour' }, { value: '120', label: '2 hour' }]} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Slots from (time)" type="time" value={editing.apptTime} onChange={e => setEditing({ ...editing, apptTime: e.target.value })} />
                      <Input label="Slots till (time)" type="time" value={editing.apptDayEnd || '18:00'} onChange={e => setEditing({ ...editing, apptDayEnd: e.target.value })} />
                    </div>
                    <p className="text-xs text-gray-500">Each customer gets the next available slot — if a time is already booked, the next free slot is used (or the next day if the day is full). Add {'{appointment_date}'} and {'{appointment_time}'} to the confirmation to include the customer&apos;s exact slot.</p>
                  </>
                )}
                {editing.actionType === 'add_tag' && (
                  <Select label="Tag / Label" value={editing.actionTag} onChange={e => setEditing({ ...editing, actionTag: e.target.value })}
                    options={[{ value: '', label: 'Select tag' }, ...tags.map(t => ({ value: t._id, label: t.name }))]} />
                )}
                {editing.actionType === 'send_payment' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Amount (₹)" type="number" value={String(editing.payAmount || '')} onChange={e => setEditing({ ...editing, payAmount: Number(e.target.value) || 0 })} placeholder="499" />
                      <Select label="Method" value={editing.payMethod || 'razorpay'} onChange={e => setEditing({ ...editing, payMethod: e.target.value })}
                        options={[{ value: 'razorpay', label: 'Razorpay link' }, { value: 'upi', label: 'UPI (direct)' }]} />
                    </div>
                    <Input label="Description (optional)" value={editing.payDesc} onChange={e => setEditing({ ...editing, payDesc: e.target.value })} placeholder="e.g. Course fees" />
                    {editing.payMethod === 'upi' && (
                      <Input label="UPI ID" value={editing.payUpiId} onChange={e => setEditing({ ...editing, payUpiId: e.target.value })} placeholder="yourname@upi" />
                    )}
                    <p className="text-xs text-gray-500">For Razorpay, connect your Key ID & Secret on the Integrations page. Add {'{payment_link}'} to the message to place the link there (leave empty to send the default payment message).</p>
                  </>
                )}
                {editing.actionType === 'assign_agent' && (
                  <Select label="Agent" value={editing.actionAgent} onChange={e => setEditing({ ...editing, actionAgent: e.target.value })}
                    options={[{ value: '', label: 'Select agent' }, ...agents.map(a => ({ value: a._id, label: a.name }))]} />
                )}
                <Textarea label="Confirmation message (optional)" rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder="e.g. Your booking is confirmed for {appointment_date} at {appointment_time} ✅" />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
                {editing.actionType === 'book_appointment' && (
                  <div className="flex flex-wrap gap-1.5 -mt-2">
                    {['{appointment_date}', '{appointment_time}'].map(v => (
                      <button key={v} type="button" onClick={() => setEditing({ ...editing, text: (editing.text || '') + v })}
                        className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full hover:bg-indigo-100">{v}</button>
                    ))}
                  </div>
                )}
              </>
            )}

            {editing.type === 'webhook' && (
              <>
                <Input label="Webhook URL" value={editing.webhookUrl} onChange={e => setEditing({ ...editing, webhookUrl: e.target.value })} placeholder="https://example.com/api/webhook" />
                <Select label="HTTP Method" value={editing.webhookMethod || 'POST'} onChange={e => setEditing({ ...editing, webhookMethod: e.target.value })}
                  options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }, { value: 'DELETE', label: 'DELETE' }]} />
                {(editing.webhookMethod || 'POST') !== 'GET' && (editing.webhookMethod || 'POST') !== 'DELETE' && (
                  <Textarea label="Request Body (JSON)" rows={4} value={editing.webhookBody} onChange={e => setEditing({ ...editing, webhookBody: e.target.value })} placeholder='{"phone": "{phone_number}", "name": "{full_name}"}' />
                )}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Custom Headers (optional)</label>
                  {(editing.webhookHeaders || []).map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={h.key} onChange={e => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.map((x, xi) => xi === i ? { ...x, key: e.target.value } : x) })}
                        placeholder="Header name" className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <input value={h.value} onChange={e => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x) })}
                        placeholder="Value" className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <button onClick={() => setEditing({ ...editing, webhookHeaders: editing.webhookHeaders.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, webhookHeaders: [...(editing.webhookHeaders || []), { key: '', value: '' }] })} className="text-xs text-emerald-600 font-medium">+ Add header</button>
                </div>
                <VarChips onInsert={v => setEditing({ ...editing, webhookBody: (editing.webhookBody || '') + v })} />
                <Textarea label="Confirmation message (optional)" rows={2} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder="Use {webhook_response} to include the API response" />
                <p className="text-xs text-gray-500">Leave blank to run the webhook silently (no WhatsApp message sent). Use {'{webhook_response}'} to include the response body.</p>
              </>
            )}

            {editing.type === 'question' && (
              <>
                <Textarea label="Question Text" rows={3} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder="e.g. Aapki location kya hai?" />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
                <Input label="Save answer as variable (optional)" value={editing.answerVar} onChange={e => setEditing({ ...editing, answerVar: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder="e.g. location" />
                <p className="text-xs text-gray-500">The flow pauses here and waits for the customer&apos;s typed reply (no buttons). The answer is saved to the contact{editing.answerVar ? <> as <span className="font-mono">{'{' + editing.answerVar + '}'}</span>, usable in later messages</> : null}, then the flow continues with &quot;then send →&quot;. You can also use <span className="font-mono">{'{last_reply}'}</span> in the next message.</p>
                <Input label="No-reply timeout (hours, 0 = wait indefinitely)" type="number" value={String(editing.waitTimeoutHours || '')} onChange={e => setEditing({ ...editing, waitTimeoutHours: Math.max(0, Number(e.target.value) || 0) })} placeholder="e.g. 24" />
                <Select label="If no reply within timeout, go to →" value={editing.nextTimeout || ''} onChange={e => setEditing({ ...editing, nextTimeout: e.target.value })}
                  options={[{ value: '', label: '— stop (no follow-up) —' }, ...nodes.filter(n => n.id !== editing.id).map(n => ({ value: n.id, label: n.name || (n.text || '').slice(0, 30) || n.type }))]} />
                <p className="text-xs text-gray-500">If the customer doesn&apos;t reply within the timeout, the flow jumps to the chosen card (used for follow-up / bump-up reminders). Set 0 hours to never time out.</p>
              </>
            )}

            {editing.type === 'delay' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Wait" type="number" value={String(editing.delaySeconds || '')} onChange={e => setEditing({ ...editing, delaySeconds: Math.max(0, Number(e.target.value) || 0) })} placeholder="30" />
                  <Select label="Unit" value={editing.delayUnit || 'seconds'} onChange={e => setEditing({ ...editing, delayUnit: e.target.value })}
                    options={[{ value: 'seconds', label: 'Seconds' }, { value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }, { value: 'days', label: 'Days' }]} />
                </div>
                <p className="text-xs text-gray-500">The flow waits this long before sending the next card. Delays over 1 hour are saved and resumed reliably even across restarts (used for day-wise bump-up reminders).</p>
              </>
            )}

            {editing.type === 'condition' && (
              <>
                <Select label="Check what?" value={editing.condField || 'reply'} onChange={e => setEditing({ ...editing, condField: e.target.value })}
                  options={[
                    { value: 'reply', label: "Customer's last reply text" },
                    { value: 'variable', label: 'A saved variable (from a Question card)' },
                    { value: 'tag', label: 'Contact has a tag' },
                  ]} />
                {editing.condField === 'variable' && (
                  <Input label="Variable name" value={editing.condVarName} onChange={e => setEditing({ ...editing, condVarName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} placeholder="e.g. location" />
                )}
                {editing.condField !== 'tag' && (
                  <Select label="Match type" value={editing.condOp || 'contains'} onChange={e => setEditing({ ...editing, condOp: e.target.value })}
                    options={[
                      { value: 'contains', label: 'Contains' },
                      { value: 'equals', label: 'Equals exactly' },
                      { value: 'exists', label: 'Is not empty (any value)' },
                    ]} />
                )}
                {(editing.condField === 'tag' || editing.condOp !== 'exists') && (
                  editing.condField === 'tag'
                    ? <Select label="Tag" value={editing.condValue} onChange={e => setEditing({ ...editing, condValue: e.target.value })}
                        options={[{ value: '', label: 'Select tag' }, ...tags.map(t => ({ value: t.name, label: t.name }))]} />
                    : <Input label="Value to check" value={editing.condValue} onChange={e => setEditing({ ...editing, condValue: e.target.value })} placeholder="e.g. yes" />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-emerald-700 mb-1">✔ If Yes / True → send</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextTrue || ''} onChange={v => setEditing({ ...editing, nextTrue: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-red-600 mb-1">✖ If No / False → send</label>
                    <MultiNextPicker excludeId={editing.id} value={editing.nextFalse || ''} onChange={v => setEditing({ ...editing, nextFalse: v })} />
                  </div>
                </div>
              </>
            )}

            {editing.type === 'template' && (
              <Select label="WhatsApp Template (paid)" value={editing.templateName}
                onChange={e => {
                  const t = templates.find(x => x.name === e.target.value);
                  setEditing({ ...editing, templateName: e.target.value, templateLanguage: t?.language || 'en' });
                }}
                options={[{ value: '', label: 'Select approved template' }, ...templates.map(t => ({ value: t.name, label: t.name }))]} />
            )}

            {editing.type === 'template' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Template Button Branches (optional)</label>
                <p className="text-xs text-gray-500 -mt-1">Type the template&apos;s button text exactly, and pick which reply to send when the customer taps it.</p>
                {editing.buttons.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={b.title} onChange={e => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) })}
                      placeholder={`Template button ${i + 1} text`} maxLength={25}
                      className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                    <span className="text-xs text-gray-400">→</span>
                    <MultiNextPicker className="w-44" excludeId={editing.id} value={b.next}
                      onChange={v => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, next: v } : x) })} />
                    {editing.buttons.length > 1 && <button onClick={() => setEditing({ ...editing, buttons: editing.buttons.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>}
                  </div>
                ))}
                {editing.buttons.length < 3 && <button onClick={() => setEditing({ ...editing, buttons: [...editing.buttons, { title: '', next: '' }] })} className="text-xs text-emerald-600 font-medium">+ Add button branch</button>}
              </div>
            )}

            {editing.type === 'interactive' && (
              <>
                <Textarea label="Body Text" rows={3} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} placeholder="Main message text" />
                <VarChips onInsert={v => setEditing({ ...editing, text: (editing.text || '') + v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Header Type (optional)" value={editing.headerType || 'none'} onChange={e => setEditing({ ...editing, headerType: e.target.value })}
                    options={[{ value: 'none', label: 'None' }, { value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }, { value: 'document', label: 'Document' }]} />
                  <Input label="Footer (optional)" value={editing.footer} onChange={e => setEditing({ ...editing, footer: e.target.value })} />
                </div>
                {editing.headerType === 'text' && (
                  <Input label="Header Text" value={editing.header} onChange={e => setEditing({ ...editing, header: e.target.value })} maxLength={60} />
                )}
                {['image', 'video', 'document'].includes(editing.headerType) && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><Input label={`Header ${editing.headerType} URL`} value={editing.headerMediaUrl} onChange={e => setEditing({ ...editing, headerMediaUrl: e.target.value })} placeholder="https://..." /></div>
                    <input ref={headerFileRef} type="file" className="hidden" onChange={e => handleUpload(e, 'headerMediaUrl')} />
                    <Button variant="outline" onClick={() => headerFileRef.current?.click()} loading={uploading} icon={<Upload className="w-4 h-4" />}>Upload</Button>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={editing.mode === 'buttons'} onChange={() => setEditing({ ...editing, mode: 'buttons' })} /> Reply Buttons (max 3)</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={editing.mode === 'list'} onChange={() => setEditing({ ...editing, mode: 'list' })} /> List Message (max 10)</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={editing.mode === 'cta'} onChange={() => setEditing({ ...editing, mode: 'cta' })} /> CTA URL Button</label>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{editing.mode === 'cta' ? 'URL Buttons' : 'URL Buttons (optional, sent with menu)'}</label>
                  {editing.ctas.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={c.text} onChange={e => setEditing({ ...editing, ctas: editing.ctas.map((x, xi) => xi === i ? { ...x, text: e.target.value } : x) })}
                        placeholder="Button text" maxLength={20} className="w-44 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <input value={c.url} onChange={e => setEditing({ ...editing, ctas: editing.ctas.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x) })}
                        placeholder="https://..." className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                      <button onClick={() => setEditing({ ...editing, ctas: editing.ctas.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditing({ ...editing, ctas: [...editing.ctas, { text: '', url: '' }] })} className="text-xs text-emerald-600 font-medium">+ Add URL button</button>
                  {editing.mode !== 'cta' && editing.ctas.length > 0 && <p className="text-xs text-gray-500">Each URL goes out as its own URL-button message right after the menu (WhatsApp allows only one URL button per message).</p>}
                </div>
                {editing.mode === 'buttons' && (
                  <div className="space-y-2">
                    {editing.buttons.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={b.title} onChange={e => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) })}
                          placeholder={`Button ${i + 1} text (max 20 chars)`} maxLength={20}
                          className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                        <span className="text-xs text-gray-400">→</span>
                        <MultiNextPicker className="w-44" excludeId={editing.id} value={b.next}
                          onChange={v => setEditing({ ...editing, buttons: editing.buttons.map((x, xi) => xi === i ? { ...x, next: v } : x) })} />
                        {editing.buttons.length > 1 && <button onClick={() => setEditing({ ...editing, buttons: editing.buttons.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>}
                      </div>
                    ))}
                    {editing.buttons.length < 3 && <button onClick={() => setEditing({ ...editing, buttons: [...editing.buttons, { title: '', next: '' }] })} className="text-xs text-emerald-600 font-medium">+ Add button</button>}
                  </div>
                )}
                {editing.mode === 'list' && (
                  <div className="space-y-2">
                    <Input label="List button text" value={editing.listButtonText} onChange={e => setEditing({ ...editing, listButtonText: e.target.value })} placeholder="Choose" />
                    {editing.rows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={r.title} onChange={e => setEditing({ ...editing, rows: editing.rows.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) })}
                          placeholder={`Item ${i + 1} title`} maxLength={24} className="w-36 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                        <input value={r.description} onChange={e => setEditing({ ...editing, rows: editing.rows.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x) })}
                          placeholder="Description (optional)" maxLength={72} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg" />
                        <span className="text-xs text-gray-400">→</span>
                        <MultiNextPicker className="w-40" excludeId={editing.id} value={r.next}
                          onChange={v => setEditing({ ...editing, rows: editing.rows.map((x, xi) => xi === i ? { ...x, next: v } : x) })} />
                        {editing.rows.length > 1 && <button onClick={() => setEditing({ ...editing, rows: editing.rows.filter((_, xi) => xi !== i) })}><Trash2 className="w-4 h-4 text-red-400" /></button>}
                      </div>
                    ))}
                    {editing.rows.length < 10 && <button onClick={() => setEditing({ ...editing, rows: [...editing.rows, { title: '', description: '', next: '' }] })} className="text-xs text-emerald-600 font-medium">+ Add list item</button>}
                  </div>
                )}
              </>
            )}

            {editing.type !== 'condition' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{editing.type === 'question' ? 'After the customer answers, send (optional — multiple allowed)' : editing.type === 'delay' ? 'After the delay, send (optional — multiple allowed)' : 'After sending, also send (optional — multiple allowed)'}</label>
                <MultiNextPicker excludeId={editing.id} value={editing.next} onChange={v => setEditing({ ...editing, next: v })} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={requestCloseModal}>Cancel</Button>
              <Button onClick={saveNode}>Save Reply</Button>
            </div>
          </div>
        )}
      </Modal>

      {leavePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setLeavePrompt(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[380px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">Unsaved changes</h3>
            <p className="text-sm text-gray-500 mt-1">Your changes have not been saved. What would you like to do?</p>
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={async () => {
                if (leavePrompt === 'modal') { setLeavePrompt(null); saveNode(); }
                else { setLeavePrompt(null); await handleSave(); router.push('/client/bot-flows'); }
              }}>Save{leavePrompt === 'page' ? ' & Exit' : ''}</Button>
              <Button variant="secondary" onClick={() => {
                setLeavePrompt(null);
                if (leavePrompt === 'modal') setEditing(null);
                else { setDirty(false); router.push('/client/bot-flows'); }
              }}>Discard changes{leavePrompt === 'page' ? ' & Exit' : ''}</Button>
              <Button variant="secondary" onClick={() => setLeavePrompt(null)}>Cancel — stay here</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
