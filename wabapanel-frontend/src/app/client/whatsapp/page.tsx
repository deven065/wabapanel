'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Wifi, Settings, CheckCircle, Copy, RefreshCw, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { workspaceApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export default function WhatsAppPage() {
  const { currentWorkspace } = useAuthStore();
  const wa = currentWorkspace?.whatsapp;
  const [method, setMethod] = useState<'embedded' | 'qr' | 'manual'>('manual');
  const [manualForm, setManualForm] = useState({
    wabaId: wa?.wabaId || '', phoneNumberId: wa?.phoneNumberId || '',
    businessAccountId: wa?.businessAccountId || '', accessToken: wa?.accessToken || '',
  });
  const [saving, setSaving] = useState(false);
  const [extraNumbers, setExtraNumbers] = useState<{ phoneNumberId: string; phoneNumber: string; displayName: string; accessToken?: string; wabaId?: string }[]>(wa?.extraNumbers || []);
  const [newNum, setNewNum] = useState({ phoneNumberId: '', phoneNumber: '', displayName: '', accessToken: '', wabaId: '' });
  const [diffWaba, setDiffWaba] = useState(false);
  const [numSaving, setNumSaving] = useState(false);
  const [payCfg, setPayCfg] = useState((wa as unknown as { paymentConfiguration?: string })?.paymentConfiguration || '');
  const [payCfgSaving, setPayCfgSaving] = useState(false);
  const savePayCfg = async () => {
    if (!currentWorkspace?._id) return;
    setPayCfgSaving(true);
    try {
      await workspaceApi.updateWhatsApp(currentWorkspace._id, { paymentConfiguration: payCfg.trim() });
      toast.success('WhatsApp Pay configuration saved');
    } catch { toast.error('Failed to save'); }
    setPayCfgSaving(false);
  };
  const [refreshing, setRefreshing] = useState(false);
  interface WaHealth {
    tokenValid: boolean;
    phone: { display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string; platform_type?: string; name_status?: string; messaging_limit_tier?: string; status?: string; throughput?: { level?: string } } | null;
    waba: { name?: string; account_review_status?: string; business_verification_status?: string; country?: string; ownership_type?: string } | null;
    errors: string[];
  }
  const [health, setHealth] = useState<WaHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const loadHealth = async () => {
    if (!currentWorkspace?._id) return;
    setHealthLoading(true);
    try {
      const r = await workspaceApi.getWhatsAppHealth(currentWorkspace._id);
      setHealth(r.data.data);
    } catch { setHealth(null); }
    setHealthLoading(false);
  };

  useEffect(() => {
    if (wa?.isConnected && currentWorkspace?._id) loadHealth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa?.isConnected, currentWorkspace?._id]);

  const limitLabel = (tier?: string) => {
    if (!tier) return 'Unknown';
    const map: Record<string, string> = {
      TIER_50: '50 / 24hr', TIER_250: '250 / 24hr', TIER_1K: '1,000 / 24hr',
      TIER_10K: '10,000 / 24hr', TIER_100K: '100,000 / 24hr', TIER_UNLIMITED: 'Unlimited',
      TIER_NOT_SET: 'Not set (new number)',
    };
    return map[tier] || tier;
  };

  const handleRefreshDetails = async () => {
    if (!currentWorkspace?._id) return;
    setRefreshing(true);
    try {
      const res = await workspaceApi.refreshWhatsAppDetails(currentWorkspace._id);
      const updatedWs = res.data.data;
      if (updatedWs) {
        useAuthStore.setState({ currentWorkspace: updatedWs });
        toast.success('Details refreshed from Meta');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to refresh — check if your Access Token is still valid');
    }
    setRefreshing(false);
  };

  // Auto-refresh if display name or phone number is missing
  useEffect(() => {
    if (wa?.isConnected && (!wa.displayName || !wa.phoneNumber) && currentWorkspace?._id) {
      handleRefreshDetails();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wa?.isConnected, currentWorkspace?._id]);

  const saveExtraNumbers = async (list: { phoneNumberId: string; phoneNumber: string; displayName: string; accessToken?: string; wabaId?: string }[]) => {
    if (!currentWorkspace?._id) return;
    setNumSaving(true);
    try {
      await workspaceApi.updateWhatsApp(currentWorkspace._id, { extraNumbers: list });
      setExtraNumbers(list);
      toast.success('Numbers updated');
    } catch { toast.error('Failed to save'); }
    setNumSaving(false);
  };

  const addExtraNumber = () => {
    if (!newNum.phoneNumberId.trim()) { toast.error('Phone Number ID required'); return; }
    if (diffWaba && (!newNum.accessToken.trim() || !newNum.wabaId.trim())) {
      toast.error('For a different WABA, Access Token and WABA ID are required'); return;
    }
    const entry = {
      phoneNumberId: newNum.phoneNumberId.trim(),
      phoneNumber: newNum.phoneNumber.trim(),
      displayName: newNum.displayName.trim(),
      accessToken: diffWaba ? newNum.accessToken.trim() : '',
      wabaId: diffWaba ? newNum.wabaId.trim() : '',
    };
    saveExtraNumbers([...extraNumbers, entry]);
    setNewNum({ phoneNumberId: '', phoneNumber: '', displayName: '', accessToken: '', wabaId: '' });
    setDiffWaba(false);
  };

  const [submitting, setSubmitting] = useState(false);
  const [signupConfig, setSignupConfig] = useState<{ enableEmbeddedSignup: boolean; enableManualSignup: boolean; enableCoexistence: boolean; appId: string; configId: string; webhookUrl: string; webhookVerifyToken: string }>({
    enableEmbeddedSignup: false, enableManualSignup: true, enableCoexistence: false, appId: '', configId: '', webhookUrl: '', webhookVerifyToken: '',
  });
  // Captured from Embedded Signup session logging (postMessage) — most reliable WABA/phone IDs
  const sessionInfoRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Embedded Signup session logging: listen for the WABA/phone IDs Meta posts back
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.data) {
          sessionInfoRef.current = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id };
        }
      } catch { /* non-JSON messages are ignored */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!currentWorkspace?._id) return;
    workspaceApi.getWhatsAppSignupConfig(currentWorkspace._id).then(r => {
      const cfg = r.data.data || {};
      setSignupConfig({
        enableEmbeddedSignup: cfg.enableEmbeddedSignup || false,
        enableManualSignup: cfg.enableManualSignup !== false,
        enableCoexistence: cfg.enableCoexistence || false,
        appId: cfg.appId || '',
        configId: cfg.configId || '',
        webhookUrl: cfg.webhookUrl || '',
        webhookVerifyToken: cfg.webhookVerifyToken || '',
      });
      // Auto-select first available method
      if (cfg.enableEmbeddedSignup) setMethod('embedded');
      else if (cfg.enableManualSignup !== false) setMethod('manual');
    }).catch(() => {});
  }, [currentWorkspace?._id]);

  const handleManualConnect = async () => {
    if (submitting) return;
    if (!currentWorkspace?._id) {
      toast.error('Workspace not loaded. Please refresh the page and try again.');
      return;
    }
    setSaving(true);
    setSubmitting(true);
    try {
      const saveRes = await workspaceApi.updateWhatsApp(currentWorkspace._id, {
        ...manualForm, connectionMethod: 'manual', isConnected: true,
      });
      toast.success('WhatsApp connected successfully!');
      // Update store with new workspace data
      const updatedWs = saveRes.data.data;
      if (updatedWs) {
        useAuthStore.setState({ currentWorkspace: updatedWs });
      }
      window.location.reload();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
    setSaving(false);
  };

  const handleDisconnect = async () => {
    if (submitting) return;
    setSubmitting(true);

    if (!currentWorkspace || !confirm('Disconnect WhatsApp?')) return;
    try {
      await workspaceApi.updateWhatsApp(currentWorkspace._id, { isConnected: false, connectionMethod: '' });
      toast.success('Disconnected');
      window.location.reload();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  // Launch WhatsApp Embedded Signup. coexistence=true onboards an existing
  // WhatsApp Business App number (usable on both the app and Cloud API).
  const launchSignup = (coexistence: boolean) => {
    if (!signupConfig.appId) { toast.error('Meta App ID not configured by admin'); return; }
    sessionInfoRef.current = {};
    const launchFBLogin = () => {
      const FB = (window as unknown as { FB?: { login: (cb: (r: { authResponse?: { code?: string } }) => void, opts: object) => void } }).FB;
      if (!FB) { toast.error('Facebook SDK failed to load. Please disable ad-blockers and try again.'); return; }
      FB.login((response) => {
        const code = response.authResponse?.code;
        if (!code) { toast.error('Facebook login cancelled or failed'); return; }
        setSaving(true);
        workspaceApi.embeddedSignup(currentWorkspace!._id, {
          code, coexistence,
          wabaId: sessionInfoRef.current.wabaId,
          phoneNumberId: sessionInfoRef.current.phoneNumberId,
        }).then((res) => {
          toast.success(coexistence ? 'WhatsApp Business App number connected!' : 'WhatsApp connected via Embedded Signup!');
          const updatedWs = res.data.data;
          if (updatedWs) useAuthStore.setState({ currentWorkspace: { ...currentWorkspace, whatsapp: { ...currentWorkspace?.whatsapp, isConnected: true, connectionMethod: coexistence ? 'coexistence' : 'embedded', ...updatedWs } } as typeof currentWorkspace });
          window.location.reload();
        }).catch((err: unknown) => {
          const error = err as { response?: { data?: { message?: string } } };
          toast.error(error.response?.data?.message || 'Embedded signup failed');
        }).finally(() => setSaving(false));
      }, {
        config_id: signupConfig.configId || undefined,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          // Coexistence requires the business-app onboarding flow + session logging (v3)
          featureType: coexistence ? 'whatsapp_business_app_onboarding' : 'only_waba_sharing',
          sessionInfoVersion: coexistence ? 3 : 2,
        },
      });
    };
    if ((window as unknown as { FB?: object }).FB) { launchFBLogin(); return; }
    (window as unknown as { fbAsyncInit?: () => void }).fbAsyncInit = () => {
      const FB = (window as unknown as { FB: { init: (o: object) => void } }).FB;
      FB.init({ appId: signupConfig.appId, cookie: true, xfbml: true, version: 'v21.0' });
      launchFBLogin();
    };
    const s = document.createElement('script'); s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; document.body.appendChild(s);
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Connection</h1>
          <p className="text-gray-500 text-sm mt-1">Connect your WhatsApp Business Account</p>
        </div>
        {wa?.isConnected && (
          <Button variant="danger" onClick={handleDisconnect}>Disconnect</Button>
        )}
      </div>

      {wa?.isConnected ? (
        <>
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Wifi className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Connected <CheckCircle className="w-5 h-5 text-emerald-500" />
              </h3>
              <p className="text-sm text-gray-500">via {wa.connectionMethod || 'Manual'}</p>
            </div>
          </div>
          {(!wa.displayName || !wa.phoneNumber) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-700">Display Name / Phone Number not available — your Access Token may have expired. Update your token or click Refresh.</p>
            </div>
          )}
          <div className="flex justify-end mb-3">
            <button onClick={handleRefreshDetails} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing...' : 'Refresh Details'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Display Name</p>
              <p className="font-medium">{wa.displayName || '-'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Phone Number</p>
              <p className="font-medium">{wa.phoneNumber || '-'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">WABA ID</p>
              <p className="font-medium font-mono text-sm">{wa.wabaId || '-'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Quality Rating</p>
              <Badge variant={wa.qualityRating === 'GREEN' ? 'success' : wa.qualityRating === 'YELLOW' ? 'warning' : 'default'}>
                {wa.qualityRating || 'N/A'}
              </Badge>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Phone Number ID</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm">{wa.phoneNumberId || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(wa.phoneNumberId || ''); toast.success('Copied'); }}>
                  <Copy className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Business Account ID</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm">{wa.businessAccountId || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(wa.businessAccountId || ''); toast.success('Copied'); }}>
                  <Copy className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">WhatsApp Pay (in-chat payments)</h3>
          <p className="text-sm text-gray-500 mb-3">Let customers pay inside WhatsApp (UPI) without leaving the chat. Create a Payment Configuration in WhatsApp Manager (link Razorpay, PayU or your UPI VPA), then enter its name here. India only.</p>
          <div className="flex gap-2">
            <Input placeholder="Payment configuration name (from WhatsApp Manager)" value={payCfg} onChange={(e) => setPayCfg(e.target.value)} className="flex-1" />
            <Button onClick={savePayCfg} loading={payCfgSaving}>Save</Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600" /> API Health & Limits</h3>
            <button onClick={loadHealth} disabled={healthLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} /> {healthLoading ? 'Checking...' : 'Check Now'}
            </button>
          </div>
          {healthLoading && !health ? (
            <p className="text-sm text-gray-400">Checking with Meta...</p>
          ) : !health ? (
            <p className="text-sm text-gray-400">Click &quot;Check Now&quot; to fetch live status from Meta</p>
          ) : (
            <>
              {!health.tokenValid && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700">Access Token expired or invalid — messages will fail. Update your token above.</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Token Status</p>
                  <Badge variant={health.tokenValid ? 'success' : 'danger'}>{health.tokenValid ? 'Valid' : 'Invalid / Expired'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Messaging Limit</p>
                  <p className="font-semibold text-sm">{limitLabel(health.phone?.messaging_limit_tier)}</p>
                  <p className="text-[10px] text-gray-400">unique customers / 24hr (marketing)</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Quality Rating</p>
                  <Badge variant={health.phone?.quality_rating === 'GREEN' ? 'success' : health.phone?.quality_rating === 'YELLOW' ? 'warning' : health.phone?.quality_rating === 'RED' ? 'danger' : 'default'}>
                    {health.phone?.quality_rating || 'N/A'}
                  </Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Phone Verification</p>
                  <Badge variant={health.phone?.code_verification_status === 'VERIFIED' ? 'success' : 'warning'}>
                    {health.phone?.code_verification_status || 'N/A'}
                  </Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Display Name Status</p>
                  <Badge variant={health.phone?.name_status === 'APPROVED' ? 'success' : 'default'}>{health.phone?.name_status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Number Status</p>
                  <Badge variant={health.phone?.status === 'CONNECTED' ? 'success' : 'default'}>{health.phone?.status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Throughput</p>
                  <p className="font-semibold text-sm">{health.phone?.throughput?.level || 'N/A'}</p>
                  <p className="text-[10px] text-gray-400">messages per second capacity</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">WABA Review</p>
                  <Badge variant={health.waba?.account_review_status === 'APPROVED' ? 'success' : 'warning'}>{health.waba?.account_review_status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Business Verification</p>
                  <Badge variant={health.waba?.business_verification_status === 'verified' ? 'success' : 'default'}>{health.waba?.business_verification_status || 'N/A'}</Badge>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Platform</p>
                  <p className="font-semibold text-sm">{health.phone?.platform_type || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Country</p>
                  <p className="font-semibold text-sm">{health.waba?.country || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">WABA Name</p>
                  <p className="font-semibold text-sm truncate">{health.waba?.name || 'N/A'}</p>
                </div>
              </div>
              {health.errors.length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  {health.errors.map((e, i) => <p key={i} className="text-xs text-amber-700">{e}</p>)}
                </div>
              )}
            </>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-1">Additional Numbers</h3>
          <p className="text-sm text-gray-500 mb-4">Add unlimited WhatsApp numbers — from the same WABA, or from a different WABA (tick the box and give that number&apos;s own Access Token + WABA ID). Incoming chats on any number land in the same inbox, and replies automatically go from the number the customer messaged.</p>
          <div className="space-y-2 mb-4">
            {extraNumbers.length === 0 && <p className="text-sm text-gray-400">No additional numbers yet</p>}
            {extraNumbers.map((n, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium">{n.displayName || n.phoneNumber || 'Number ' + (i + 2)}{n.accessToken ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 align-middle">Different WABA</span> : null}</p>
                  <p className="text-xs text-gray-500 font-mono">{n.phoneNumberId}{n.phoneNumber ? ' · ' + n.phoneNumber : ''}</p>
                </div>
                <button onClick={() => saveExtraNumbers(extraNumbers.filter((_, j) => j !== i))} disabled={numSaving}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Remove</button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input label="Phone Number ID" value={newNum.phoneNumberId} onChange={(e) => setNewNum({ ...newNum, phoneNumberId: e.target.value })} placeholder="From Meta dashboard" />
            <Input label="Phone Number" value={newNum.phoneNumber} onChange={(e) => setNewNum({ ...newNum, phoneNumber: e.target.value })} placeholder="+91..." />
            <Input label="Label (optional)" value={newNum.displayName} onChange={(e) => setNewNum({ ...newNum, displayName: e.target.value })} placeholder="Sales / Support" />
            <div className="flex items-end"><Button onClick={addExtraNumber} disabled={numSaving}>{numSaving ? 'Saving...' : 'Add Number'}</Button></div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={diffWaba} onChange={(e) => setDiffWaba(e.target.checked)} />
            This number belongs to a different WhatsApp Business Account (different access token)
          </label>
          {diffWaba && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <Input label="Access Token (of that WABA)" value={newNum.accessToken} onChange={(e) => setNewNum({ ...newNum, accessToken: e.target.value })} placeholder="EAAG..." />
              <Input label="WABA ID (of that WABA)" value={newNum.wabaId} onChange={(e) => setNewNum({ ...newNum, wabaId: e.target.value })} placeholder="From Meta dashboard" />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Same WABA: just the Phone Number ID is enough — the webhook is already shared. Different WABA: tick the box and provide that number&apos;s own Access Token + WABA ID; the panel auto-subscribes its webhook so its chats also arrive here.</p>
        </Card>

        {/* Webhook Configuration - vendor needs this to configure in Meta Developer Portal */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Webhook Configuration</h3>
          <p className="text-gray-500 text-sm mb-4">Configure these details in your Meta Developer Portal (App Dashboard → WhatsApp → Configuration) to receive incoming messages.</p>
          <div className="space-y-4 max-w-2xl">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">Callback URL</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm text-gray-900 break-all">{signupConfig.webhookUrl || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(signupConfig.webhookUrl || ''); toast.success('Copied!'); }}
                  className="shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded transition-colors">
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">Verify Token</p>
              <div className="flex items-center gap-2">
                <p className="font-medium font-mono text-sm text-gray-900">{signupConfig.webhookVerifyToken || '-'}</p>
                <button onClick={() => { navigator.clipboard.writeText(signupConfig.webhookVerifyToken || ''); toast.success('Copied!'); }}
                  className="shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded transition-colors">
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                </button>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">Subscribe to <strong>messages</strong> webhook field in Meta Developer Portal to receive incoming WhatsApp messages.</p>
            </div>
          </div>
        </Card>
        </>
      ) : (
        <div>
          {/* Show available signup methods based on admin configuration */}
          {!signupConfig.enableEmbeddedSignup && !signupConfig.enableManualSignup ? (
            <Card>
              <div className="text-center py-8">
                <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Signup Method Available</h3>
                <p className="text-gray-500 text-sm">Please contact your administrator to enable a WhatsApp signup method.</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex gap-3 mb-6">
                {signupConfig.enableEmbeddedSignup && (
                  <button onClick={() => setMethod('embedded')}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${method === 'embedded' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2 mb-1"><Settings className="w-4 h-4" /><span className="font-medium text-sm">Embedded Signup</span></div>
                    <p className="text-xs text-gray-500 mt-1">Connect via Facebook directly</p>
                  </button>
                )}
                {signupConfig.enableManualSignup && (
                  <button onClick={() => setMethod('manual')}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${method === 'manual' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2 mb-1"><Wifi className="w-4 h-4" /><span className="font-medium text-sm">Manual Setup</span></div>
                    <p className="text-xs text-gray-500 mt-1">Enter API credentials manually</p>
                  </button>
                )}
              </div>

              {method === 'embedded' && signupConfig.enableEmbeddedSignup && (
                <Card>
                  <h3 className="text-lg font-semibold mb-4">Embedded Signup</h3>
                  <p className="text-gray-500 text-sm mb-4">Connect your WhatsApp Business Account through Facebook. Click the button below — a Facebook popup will open where you can authorize access.</p>
                  <Button loading={saving} onClick={() => launchSignup(false)}>Launch Facebook Signup</Button>
                  <p className="text-xs text-gray-400 mt-3">A Facebook popup will open. Sign in with your Facebook account that has access to the WhatsApp Business Account you want to connect.</p>

                  {signupConfig.enableCoexistence && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-800 mb-1">Already using WhatsApp Business App?</h4>
                      <p className="text-gray-500 text-sm mb-4">Connect a number that is currently running in the WhatsApp Business App. You can keep using it on your phone <strong>and</strong> the panel at the same time — chats stay in sync. No need to delete the number.</p>
                      <Button variant="secondary" loading={saving} onClick={() => launchSignup(true)}>Connect WhatsApp Business App Number</Button>
                      <p className="text-xs text-gray-400 mt-3">During signup, choose your existing WhatsApp Business App number and enter the verification code shown in the app.</p>
                    </div>
                  )}
                </Card>
              )}

              {method === 'manual' && signupConfig.enableManualSignup && (
                <Card>
                  <h3 className="text-lg font-semibold mb-4">Manual Configuration</h3>
                  <p className="text-gray-500 text-sm mb-4">Enter your WhatsApp Business API credentials from Meta Business Suite.</p>
                  <div className="space-y-4 max-w-lg">
                    <Input label="WABA ID" value={manualForm.wabaId} onChange={(e) => setManualForm({ ...manualForm, wabaId: e.target.value })} placeholder="e.g. 3537291816411935" />
                    <Input label="Phone Number ID" value={manualForm.phoneNumberId} onChange={(e) => setManualForm({ ...manualForm, phoneNumberId: e.target.value })} />
                    <Input label="Business Account ID" value={manualForm.businessAccountId} onChange={(e) => setManualForm({ ...manualForm, businessAccountId: e.target.value })} />
                    <Input label="Access Token" type="password" value={manualForm.accessToken} onChange={(e) => setManualForm({ ...manualForm, accessToken: e.target.value })} />
                    <Button onClick={handleManualConnect} loading={saving}>Connect WhatsApp</Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
