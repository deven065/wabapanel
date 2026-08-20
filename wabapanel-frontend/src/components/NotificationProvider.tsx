'use client';
import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { pushApi } from '@/lib/api';

interface IncomingMsg {
  message?: { direction?: string; text?: string; type?: string };
  conversationId?: string;
}

function playTone() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const play = (freq: number, start: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    // WhatsApp-style two-note ding
    play(880, 0, 0.18, 0.25);
    play(1174.66, 0.12, 0.28, 0.22);
    setTimeout(() => ctx.close(), 1200);
  } catch { /* audio blocked */ }
}

export default function NotificationProvider() {
  const lastPlayed = useRef(0);

  useEffect(() => {
    const registerPush = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (Notification.permission !== 'granted') return;
        const reg = await navigator.serviceWorker.ready;
        const res = await pushApi.vapidPublicKey();
        const key = res.data?.data?.publicKey;
        if (!key) return;
        const rawKey = window.atob(key.replace(/-/g, '+').replace(/_/g, '/'));
        const appKey = new Uint8Array(rawKey.length);
        for (let i = 0; i < rawKey.length; i++) appKey[i] = rawKey.charCodeAt(i);
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }));
        const j = sub.toJSON();
        if (j.endpoint && j.keys && j.keys.p256dh && j.keys.auth) {
          await pushApi.subscribe({ endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
        }
      } catch { /* ignore */ }
    };
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(() => registerPush()).catch(() => {});
    } else {
      registerPush();
    }

    let detach: (() => void) | null = null;
    const attach = () => {
      const socket = getSocket();
      if (!socket) return false;

      const onNewMessage = (data: IncomingMsg) => {
        const msg = data?.message;
        if (!msg || msg.direction !== 'inbound') return;
        const now = Date.now();
        if (now - lastPlayed.current > 1500) {
          lastPlayed.current = now;
          playTone();
        }
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          const body = msg.text ? msg.text.slice(0, 120) : `New ${msg.type || 'message'} received`;
          try {
            const n = new Notification('New WhatsApp message', { body, icon: '/favicon.ico', tag: data.conversationId || 'wabapanel' });
            n.onclick = () => { window.focus(); window.location.href = '/client/chat?channel=whatsapp'; };
          } catch { /* ignore */ }
        }
      };

      const onCampaignFailed = (data: { name?: string; error?: string }) => {
        playTone();
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('Campaign failed', { body: `${data?.name || 'Campaign'}: ${data?.error || 'send failed'}`, icon: '/favicon.ico' }); } catch { /* ignore */ }
        }
      };

      const onReminder = (data: { text?: string; contact?: { name?: string; phone?: string } }) => {
        playTone();
        if ('Notification' in window && Notification.permission === 'granted') {
          const who = data?.contact?.name || data?.contact?.phone || 'customer';
          try {
            const n = new Notification('Reminder: ' + who, { body: data?.text || '', icon: '/favicon.ico' });
            n.onclick = () => { window.focus(); window.location.href = '/client/chat?channel=whatsapp'; };
          } catch { /* ignore */ }
        }
      };
      const onPaymentPaid = (data: { amount?: number }) => {
        playTone();
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification('Payment received', { body: `Payment link of \u20B9${data?.amount || ''} has been paid`, icon: '/favicon.ico' });
            n.onclick = () => { window.focus(); window.location.href = '/client/chat?channel=whatsapp'; };
          } catch { /* ignore */ }
        }
      };
      const onTicketUpdate = (data: { title?: string; body?: string; ticketNumber?: string }) => {
        playTone();
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(data?.title || 'Support ticket update', { body: `${data?.ticketNumber ? data.ticketNumber + ': ' : ''}${data?.body || ''}`, icon: '/favicon.ico' });
            n.onclick = () => { window.focus(); window.location.href = '/client/support'; };
          } catch { /* ignore */ }
        }
      };
      socket.on('support_ticket_update', onTicketUpdate);
      socket.on('payment_link_paid', onPaymentPaid);
      socket.on('reminder_due', onReminder);
      socket.on('new_message', onNewMessage);
      socket.on('campaign_failed', onCampaignFailed);
      detach = () => {
        socket.off('support_ticket_update', onTicketUpdate);
        socket.off('payment_link_paid', onPaymentPaid);
        socket.off('reminder_due', onReminder);
        socket.off('new_message', onNewMessage);
        socket.off('campaign_failed', onCampaignFailed);
      };
      return true;
    };

    if (!attach()) {
      const iv = setInterval(() => { if (attach()) clearInterval(iv); }, 1000);
      return () => { clearInterval(iv); if (detach) detach(); };
    }
    return () => { if (detach) detach(); };
  }, []);

  return null;
}
