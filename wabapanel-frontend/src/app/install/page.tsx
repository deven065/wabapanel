'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

type Step = 0 | 1 | 2 | 3;

export default function InstallPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [siteName, setSiteName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    fetch(`${API}/install/status`)
      .then((r) => r.json())
      .then((d) => setInstalled(!!d.installed))
      .catch(() => setInstalled(false))
      .finally(() => setLoading(false));
  }, []);

  const next = () => {
    setError('');
    if (step === 1 && !siteName.trim()) return setError('Please enter your platform / site name.');
    if (step === 2) {
      if (!adminName.trim()) return setError('Please enter the admin name.');
      if (!/^\S+@\S+\.\S+$/.test(adminEmail)) return setError('Please enter a valid admin email.');
      if (adminPassword.length < 6) return setError('Password must be at least 6 characters.');
      if (adminPassword !== confirmPassword) return setError('Passwords do not match.');
    }
    setStep((s) => (Math.min(3, s + 1) as Step));
  };
  const back = () => { setError(''); setStep((s) => (Math.max(0, s - 1) as Step)); };

  const finish = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/install/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName, adminName, adminEmail, adminPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Installation failed.');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Installation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  if (installed && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Already Installed</h1>
          <p className="text-gray-600 text-sm mb-6">This platform is already set up. For security, the installer is disabled. Delete <code className="bg-gray-100 px-1 rounded">installed.lock</code> on the server to run it again.</p>
          <button onClick={() => router.push('/auth/login')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg">Go to Login</button>
        </div>
      </div>
    );
  }

  const steps = ['Welcome', 'Site', 'Admin', 'Finish'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Progress */}
        <div className="flex">
          {steps.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 ${i <= step ? 'bg-emerald-500' : 'bg-gray-200'}`} />
          ))}
        </div>
        <div className="p-8">
          {done ? (
            <div className="text-center">
              <div className="text-5xl mb-3">🎉</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">All Set!</h1>
              <p className="text-gray-600 text-sm mb-6">Your platform is installed and ready. Log in with the admin account you just created.</p>
              <button onClick={() => router.push('/auth/login')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg">Go to Login</button>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">Step {step + 1} of 4 · {steps[step]}</p>

              {step === 0 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to the Installer</h1>
                  <p className="text-gray-600 text-sm mb-4">This quick wizard finishes setting up your platform. Before continuing, make sure the server was prepared (Node.js, MongoDB and the app are running — the <code className="bg-gray-100 px-1 rounded">install.sh</code> script does this automatically).</p>
                  <ul className="text-sm text-gray-700 space-y-2 mb-2">
                    <li className="flex gap-2"><span className="text-emerald-500">●</span> Set your platform name &amp; branding</li>
                    <li className="flex gap-2"><span className="text-emerald-500">●</span> Create your super-admin account</li>
                    <li className="flex gap-2"><span className="text-emerald-500">●</span> Seed default plans &amp; settings</li>
                  </ul>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Site Details</h1>
                  <p className="text-gray-600 text-sm mb-4">The name shown across the whole platform (you can change it later under Branding).</p>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Platform / Site name</label>
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. My Business Suite" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                </div>
              )}

              {step === 2 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Account</h1>
                  <p className="text-gray-600 text-sm mb-4">Your super-admin login. Keep these credentials safe.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                      <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Your name" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@yourdomain.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="At least 6 characters" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Review &amp; Finish</h1>
                  <p className="text-gray-600 text-sm mb-4">Confirm the details below, then finish the installation.</p>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-gray-500">Site name</span><span className="font-medium text-gray-900">{siteName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Admin name</span><span className="font-medium text-gray-900">{adminName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Admin email</span><span className="font-medium text-gray-900">{adminEmail}</span></div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

              <div className="flex gap-3 mt-6">
                {step > 0 && <button onClick={back} disabled={submitting} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">Back</button>}
                {step < 3 && <button onClick={next} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg">Continue</button>}
                {step === 3 && <button onClick={finish} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-60">{submitting ? 'Installing…' : 'Finish Installation'}</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
