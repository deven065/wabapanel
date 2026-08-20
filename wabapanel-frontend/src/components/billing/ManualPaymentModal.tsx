'use client';
import React, { useState, useRef } from 'react';
import { Upload, Copy, Check } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { uploadApi } from '@/lib/api';
import toast from 'react-hot-toast';

export interface ManualInfo {
  upiId?: string;
  qrImageUrl?: string;
  accountDetails?: string;
  instructions?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  info: ManualInfo;
  submitting?: boolean;
  onConfirm: (reference: string, proofUrl: string) => void;
}

export default function ManualPaymentModal({ isOpen, onClose, amount, info, submitting, onConfirm }: Props) {
  const [reference, setReference] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'payment-proofs');
      const res = await uploadApi.uploadFile(fd);
      setProofUrl(res.data.data.url);
      toast.success('Screenshot uploaded');
    } catch {
      toast.error('Upload failed');
    }
    setUploading(false);
  };

  const copyUpi = () => {
    if (!info.upiId) return;
    navigator.clipboard.writeText(info.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const submit = () => {
    if (!reference.trim()) {
      toast.error('Please enter your Transaction / UTR ID');
      return;
    }
    if (!proofUrl) {
      toast.error('Please upload your payment screenshot');
      return;
    }
    onConfirm(reference.trim(), proofUrl);
  };

  const noDetails = !info.upiId && !info.qrImageUrl && !info.accountDetails;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Manual Payment · ₹${amount.toLocaleString()}`}>
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Step 1 — Pay ₹{amount.toLocaleString()} using the details below:</p>
          {noDetails && (
            <p className="text-sm text-amber-600">The admin hasn&apos;t set up payment details (UPI/QR) yet. Please contact the admin.</p>
          )}
          {info.qrImageUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={info.qrImageUrl} alt="Payment QR" className="w-44 h-44 object-contain border rounded-lg bg-white p-2" />
            </div>
          )}
          {info.upiId && (
            <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-gray-400">UPI ID</p>
                <p className="text-sm font-medium text-gray-800">{info.upiId}</p>
              </div>
              <button onClick={copyUpi} className="text-emerald-600 flex items-center gap-1 text-xs">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {info.accountDetails && (
            <div className="bg-white border rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400 mb-1">Bank / Account Details</p>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{info.accountDetails}</pre>
            </div>
          )}
          {info.instructions && (
            <p className="text-xs text-gray-500">{info.instructions}</p>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-800">Step 2 — After payment, fill in the details:</p>
          <Input
            label="Transaction / UTR ID"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. 4198XXXXXX21"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Screenshot</label>
            <div className="flex items-center gap-3">
              {proofUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proofUrl} alt="proof" className="w-16 h-16 object-cover border rounded-lg" />
              ) : (
                <div className="w-16 h-16 border rounded-lg flex items-center justify-center text-gray-300 text-[10px] text-center">No file</div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploading} icon={<Upload className="w-4 h-4" />}>
                {proofUrl ? 'Change' : 'Upload'}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500">After you submit, the admin will verify and credit your wallet / activate your plan.</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>Submit Request</Button>
        </div>
      </div>
    </Modal>
  );
}
