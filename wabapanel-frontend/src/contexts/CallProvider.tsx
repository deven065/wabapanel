'use client';
import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Loader2, ShieldQuestion } from 'lucide-react';
import { aiCallingApi } from '@/lib/api';
import toast from 'react-hot-toast';

type CallStatus =
  | 'idle'
  | 'incoming'
  | 'requesting-mic'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'ended'
  | 'failed';

interface CallState {
  status: CallStatus;
  phone: string;
  name?: string;
  callId?: string;
  error?: string;
  permissionNeeded?: boolean;
  durationSec: number;
}

interface CallContextValue {
  startCall: (phone: string, name?: string, agentId?: string) => void;
  active: boolean;
}

interface IncomingCall { callId: string; from: string; offerSdp: string; }

const CallContext = createContext<CallContextValue | null>(null);

export const useCall = (): CallContextValue => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
};

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const TERMINAL: CallStatus[] = ['ended', 'failed', 'idle'];

interface ApiError {
  response?: { data?: { message?: string } };
}

export default function CallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CallState>({ status: 'idle', phone: '', durationSec: 0 });
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recCtxRef = useRef<AudioContext | null>(null);
  const directionRef = useRef<'in' | 'out'>('out');
  const incomingRef = useRef<IncomingCall | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch { /* noop */ } pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    answeredRef.current = false;
    setMuted(false);
  }, []);

  const endCall = useCallback(async (reason?: CallStatus, msg?: string) => {
    const callId = stateRef.current.callId;
    const wasLive = ['requesting-mic', 'connecting', 'ringing', 'connected'].includes(stateRef.current.status);
    // Finalize recording (if any) and upload it against this call.
    const mr = mediaRecRef.current;
    if (mr) {
      mediaRecRef.current = null;
      try {
        await new Promise<void>((resolve) => {
          mr.onstop = () => resolve();
          try { mr.stop(); } catch { resolve(); }
          setTimeout(resolve, 2000);
        });
      } catch { /* noop */ }
      try { recCtxRef.current?.close(); } catch { /* noop */ }
      recCtxRef.current = null;
      const blob = new Blob(recChunksRef.current, { type: 'audio/webm' });
      recChunksRef.current = [];
      if (callId && blob.size > 5000) {
        try { await aiCallingApi.uploadRecording(callId, blob); } catch { /* noop */ }
      }
    }
    cleanup();
    setState(prev => ({ ...prev, status: reason || 'ended', error: msg }));
    if (callId && wasLive) {
      try { await aiCallingApi.terminateCall(callId); } catch { /* already over */ }
    }
  }, [cleanup]);

  // Wait until ICE gathering finishes so we send a complete SDP (Meta accepts trickle too,
  // but a full SDP keeps backend signaling simple).
  const waitForIce = (pc: RTCPeerConnection): Promise<void> =>
    new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      // Safety timeout — don't hang forever waiting for ICE.
      setTimeout(resolve, 3000);
    });

  // Build a peer connection wired to the local mic stream + remote audio sink.
  const setupPeer = useCallback((stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (audioElRef.current) {
        audioElRef.current.srcObject = e.streams[0];
        audioElRef.current.play().catch(() => { /* autoplay */ });
      }
      // Record both sides of the call (mic + remote) for call history.
      try {
        if (!mediaRecRef.current) {
          const ctx = new AudioContext();
          recCtxRef.current = ctx;
          const dest = ctx.createMediaStreamDestination();
          ctx.createMediaStreamSource(stream).connect(dest);
          ctx.createMediaStreamSource(e.streams[0]).connect(dest);
          const mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
          recChunksRef.current = [];
          mr.ondataavailable = (ev) => { if (ev.data.size) recChunksRef.current.push(ev.data); };
          mr.start(1000);
          mediaRecRef.current = mr;
        }
      } catch { /* recording unsupported */ }
    };
    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState;
      if (cs === 'connected') {
        answeredRef.current = true;
        setState(prev => (prev.status === 'connected' ? prev : { ...prev, status: 'connected' }));
      } else if (cs === 'disconnected') {
        // 'disconnected' is transient — ICE may recover on its own.
        // Try an ICE restart; only end the call if it stays down for 10s.
        try { pc.restartIce(); } catch { /* noop */ }
        const dcTimer = setTimeout(() => {
          if (pc.connectionState !== 'connected' && !TERMINAL.includes(stateRef.current.status)) {
            endCall('failed', 'Connection lost');
          }
        }, 10000);
        const onRecover = () => {
          if (pc.connectionState === 'connected') { clearTimeout(dcTimer); pc.removeEventListener('connectionstatechange', onRecover); }
        };
        pc.addEventListener('connectionstatechange', onRecover);
      } else if (cs === 'failed' || cs === 'closed') {
        if (!TERMINAL.includes(stateRef.current.status)) endCall('failed', 'Connection lost');
      }
    };
    return pc;
  }, [endCall]);

  // Poll backend for call status (SDP answer for outbound, lifecycle for both).
  const startStatusPolling = useCallback((callId: string) => {
    if (pollRef.current) { clearInterval(pollRef.current); }
    pollRef.current = setInterval(async () => {
      try {
        const r = await aiCallingApi.getCallStatus(callId);
        const d = r.data.data as { status: string; answerSdp?: string; errorMessage?: string };

        // Only an OUTBOUND call applies a remote answer; inbound generates its own answer.
        if (directionRef.current === 'out' && d.answerSdp && pcRef.current && !pcRef.current.currentRemoteDescription) {
          await pcRef.current.setRemoteDescription({ type: 'answer', sdp: d.answerSdp });
        }

        if (d.status === 'accepted' || d.status === 'connecting') {
          // media negotiating; onconnectionstatechange flips to 'connected'
        } else if (d.status === 'completed' || d.status === 'terminated') {
          endCall('ended');
        } else if (d.status === 'failed' || d.status === 'rejected') {
          endCall('failed', d.errorMessage || (d.status === 'rejected' ? 'Call rejected' : 'Call failed'));
        } else if (d.status === 'ringing') {
          setState(prev => (prev.status === 'connected' ? prev : { ...prev, status: 'ringing' }));
        }
      } catch { /* transient */ }
    }, 1200);
  }, [endCall]);

  const startCall = useCallback(async (phone: string, name?: string, agentId?: string) => {
    if (!phone) { toast.error('No phone number'); return; }
    if (pcRef.current) { toast.error('A call is already in progress'); return; }

    directionRef.current = 'out';
    setState({ status: 'requesting-mic', phone, name, durationSec: 0, permissionNeeded: false });

    // 1. Mic permission
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setState(prev => ({ ...prev, status: 'failed', error: 'Microphone permission denied' }));
      return;
    }
    localStreamRef.current = stream;

    // 2. Peer connection
    const pc = setupPeer(stream);

    // 3. Offer
    setState(prev => ({ ...prev, status: 'connecting' }));
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await waitForIce(pc);

    // 4. Send offer to backend -> Meta /calls connect
    let callId: string;
    try {
      const r = await aiCallingApi.initiateCall({
        contactPhone: phone,
        agentId,
        sdp: pc.localDescription?.sdp,
      });
      callId = r.data.data?.callId;
      if (!callId) throw new Error('No call id');
    } catch (err) {
      const e = err as ApiError;
      const message = e.response?.data?.message || 'Call failed';
      cleanup();
      const permissionNeeded = /permission/i.test(message);
      setState(prev => ({ ...prev, status: 'failed', error: message, permissionNeeded }));
      return;
    }

    setState(prev => ({ ...prev, callId, status: 'ringing' }));

    // 5. Poll for SDP answer + status
    startStatusPolling(callId);
  }, [cleanup, setupPeer, startStatusPolling]);

  // Answer an inbound (customer-initiated) call: mic -> peer -> SDP answer -> backend.
  const acceptIncomingCall = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc || pcRef.current) return;

    directionRef.current = 'in';
    setState({ status: 'requesting-mic', phone: inc.from, name: inc.from, callId: inc.callId, durationSec: 0 });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setState(prev => ({ ...prev, status: 'failed', error: 'Microphone permission denied' }));
      return;
    }
    localStreamRef.current = stream;

    const pc = setupPeer(stream);
    setState(prev => ({ ...prev, status: 'connecting' }));
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: inc.offerSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      await aiCallingApi.acceptCall(inc.callId, pc.localDescription?.sdp || '');
    } catch (err) {
      const e = err as ApiError;
      cleanup();
      setState(prev => ({ ...prev, status: 'failed', error: e.response?.data?.message || 'Accept failed' }));
      return;
    }
    incomingRef.current = null;
    startStatusPolling(inc.callId);
  }, [cleanup, setupPeer, startStatusPolling]);

  const rejectIncomingCall = useCallback(async () => {
    const inc = incomingRef.current;
    incomingRef.current = null;
    cleanup();
    setState({ status: 'idle', phone: '', durationSec: 0 });
    if (inc) { try { await aiCallingApi.rejectCall(inc.callId); } catch { /* gone */ } }
  }, [cleanup]);

  // Track latest state for use inside event handlers without stale closures.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Poll for inbound calls whenever no call is actively in progress; show the
  // incoming-call card when one arrives (also works after a previous call ended).
  useEffect(() => {
    const busy: CallStatus[] = ['incoming', 'requesting-mic', 'connecting', 'ringing', 'connected'];
    const iv = setInterval(async () => {
      if (busy.includes(stateRef.current.status) || pcRef.current) return;
      try {
        const r = await aiCallingApi.getIncoming();
        const list = (r.data.data || []) as IncomingCall[];
        if (list.length && !pcRef.current) {
          const c = list[0];
          incomingRef.current = c;
          setState({ status: 'incoming', phone: c.from, name: c.from, callId: c.callId, durationSec: 0 });
        }
      } catch { /* transient */ }
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  // Ringtone for incoming calls (WebAudio, no asset needed)
  const ringCtxRef = useRef<{ ctx: AudioContext; iv: ReturnType<typeof setInterval> } | null>(null);
  useEffect(() => {
    const stopRing = () => {
      if (ringCtxRef.current) {
        clearInterval(ringCtxRef.current.iv);
        try { ringCtxRef.current.ctx.close(); } catch { /* noop */ }
        ringCtxRef.current = null;
      }
    };
    if (state.status === 'incoming' && !ringCtxRef.current) {
      try {
        const ctx = new AudioContext();
        const burst = () => {
          try {
            const t0 = ctx.currentTime;
            // Classic dual-tone phone ring (440+480 Hz), soft envelope.
            [440, 480].forEach(freq => {
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = 'sine';
              o.frequency.value = freq;
              g.gain.setValueAtTime(0.0001, t0);
              g.gain.linearRampToValueAtTime(0.12, t0 + 0.05);
              g.gain.setValueAtTime(0.12, t0 + 1.0);
              g.gain.linearRampToValueAtTime(0.0001, t0 + 1.2);
              o.connect(g); g.connect(ctx.destination);
              o.start(t0); o.stop(t0 + 1.25);
            });
          } catch { /* noop */ }
        };
        burst();
        const iv = setInterval(burst, 3000);
        ringCtxRef.current = { ctx, iv };
      } catch { /* noop */ }
    }
    if (state.status !== 'incoming') stopRing();
    return stopRing;
  }, [state.status]);

  // Connected-call duration timer
  useEffect(() => {
    if (state.status === 'connected' && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, durationSec: prev.durationSec + 1 }));
      }, 1000);
    }
    if (state.status !== 'connected' && timerRef.current) {
      clearInterval(timerRef.current); timerRef.current = null;
    }
  }, [state.status]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  const sendPermission = async () => {
    try {
      await aiCallingApi.requestPermission(state.phone);
      toast.success('Permission request sent. Once the customer accepts, you can call.');
      setState(prev => ({ ...prev, permissionNeeded: false }));
    } catch (err) {
      const e = err as ApiError;
      toast.error(e.response?.data?.message || 'Permission request failed');
    }
  };

  const closeCard = () => { cleanup(); setState({ status: 'idle', phone: '', durationSec: 0 }); };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const visible = state.status !== 'idle';

  const statusLabel: Record<CallStatus, string> = {
    idle: '',
    incoming: 'Incoming call...',
    'requesting-mic': 'Mic permission...',
    connecting: 'Connecting...',
    ringing: 'Ringing...',
    connected: fmt(state.durationSec),
    ended: 'Call ended',
    failed: state.error || 'Call failed',
  };

  const isLive = ['requesting-mic', 'connecting', 'ringing', 'connected'].includes(state.status);

  return (
    <CallContext.Provider value={{ startCall, active: isLive }}>
      {children}
      <audio ref={audioElRef} autoPlay />
      {visible && (
        <div className="fixed bottom-6 right-6 z-[100] w-80 bg-white rounded-2xl shadow-2xl border overflow-hidden">
          <div className={`p-5 ${state.status === 'connected' ? 'bg-emerald-600' : state.status === 'failed' ? 'bg-red-500' : state.status === 'incoming' ? 'bg-indigo-600' : 'bg-gray-800'} text-white`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full bg-white/20 flex items-center justify-center ${state.status === 'incoming' ? 'animate-pulse' : ''}`}>
                <Phone className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{state.name || state.phone}</p>
                <p className="text-sm text-white/80 flex items-center gap-1">
                  {isLive && state.status !== 'connected' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {statusLabel[state.status]}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 flex items-center justify-center gap-4">
            {state.status === 'incoming' ? (
              <>
                <button onClick={rejectIncomingCall}
                  className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  title="Reject">
                  <PhoneOff className="w-6 h-6" />
                </button>
                <button onClick={acceptIncomingCall}
                  className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600"
                  title="Accept">
                  <Phone className="w-6 h-6" />
                </button>
              </>
            ) : isLive ? (
              <>
                <button onClick={toggleMute}
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${muted ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600'} hover:bg-gray-200`}
                  title={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={() => endCall('ended')}
                  className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  title="End call">
                  <PhoneOff className="w-6 h-6" />
                </button>
              </>
            ) : (
              <div className="w-full space-y-2">
                {state.permissionNeeded && (
                  <button onClick={sendPermission}
                    className="w-full py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 flex items-center justify-center gap-2">
                    <ShieldQuestion className="w-4 h-4" /> Request Call Permission
                  </button>
                )}
                <button onClick={closeCard}
                  className="w-full py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}
