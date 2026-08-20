"use client";
import React, { useState, useEffect } from "react";
import { Activity, Database, Download, Trash2, RefreshCw, AlertTriangle, HeartPulse, Lightbulb, Globe } from "lucide-react";
import { platformApi } from "@/lib/api";
import toast from "react-hot-toast";

interface Health {
  server: { uptime: number; loadAvg: number[]; totalMem: number; freeMem: number; cpus: number; nodeVersion: string };
  db: { state: string };
  disk: { total: string; used: string; available: string; usedPercent: string } | null;
  pm2: { name: string; status: string; uptime: number; restarts: number; memory: number; cpu: number }[];
}
interface Backup { name: string; size: number; createdAt: string; }
interface HealthReport {
  generated: string;
  version: string;
  overall_score: number;
  scores: Record<string, number>;
  metrics: Record<string, string>;
  critical: string[];
  warnings: string[];
  recommendations: string[];
}

const fmtBytes = (n: number) => n > 1e9 ? (n / 1e9).toFixed(2) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : (n / 1e3).toFixed(0) + " KB";
const fmtUptime = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

const scoreColor = (n: number) => n >= 90 ? "text-emerald-600" : n >= 75 ? "text-amber-600" : "text-red-600";
const scoreBar = (n: number) => n >= 90 ? "bg-emerald-500" : n >= 75 ? "bg-amber-500" : "bg-red-500";
const CAT_LABELS: Record<string, string> = { cpu: "CPU", memory: "Memory", disk: "Disk", network: "Network", security: "Security", services: "Services", website: "Website", database: "Database" };
const METRIC_GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: "System", keys: [["sys.hostname", "Hostname"], ["sys.os", "OS"], ["sys.distro", "Distribution"], ["sys.kernel", "Kernel"], ["sys.arch", "Architecture"], ["sys.timezone", "Timezone"], ["sys.time", "Server time"], ["sys.uptime", "Uptime"], ["sys.boot", "Last boot"], ["sys.users", "Logged-in users"], ["env.type", "Environment"], ["env.virtualization", "Virtualization"], ["env.cloud", "Cloud"], ["env.panel", "Control panel"], ["env.hosting", "Hosting"]] },
  { title: "CPU", keys: [["cpu.model", "Model"], ["cpu.vendor", "Vendor"], ["cpu.sockets", "Sockets"], ["cpu.cores", "Cores"], ["cpu.threads", "Threads"], ["cpu.usage", "Usage"], ["cpu.load", "Load avg"], ["cpu.freq", "Frequency"], ["cpu.temp", "Temperature"], ["cpu.top", "Top processes"]] },
  { title: "Memory", keys: [["mem.total", "Total"], ["mem.used", "Used"], ["mem.free", "Free"], ["mem.available", "Available"], ["mem.cached", "Cached"], ["mem.buffers", "Buffers"], ["mem.usage", "Usage"], ["mem.swap_total", "Swap total"], ["mem.swap_used", "Swap used"], ["mem.swap_free", "Swap free"]] },
  { title: "Storage", keys: [["disk.total", "Total"], ["disk.used", "Used"], ["disk.free", "Free"], ["disk.usage", "Usage"], ["disk.worst_pct", "Worst mount"], ["disk.inodes", "Inodes"], ["disk.type", "Type"], ["disk.smart", "SMART"], ["disk.raid", "RAID"], ["disk.io", "I/O"], ["disk.mounts", "Mounts"]] },
  { title: "Network", keys: [["net.public_ip", "Public IP"], ["net.private_ip", "Private IP"], ["net.isp", "ISP"], ["net.gateway", "Gateway"], ["net.dns", "DNS"], ["net.connections", "Active conns"], ["net.listen", "Listening ports"], ["net.ping", "Ping"], ["net.loss", "Packet loss"], ["net.speed", "Speed"]] },
  { title: "Security", keys: [["sec.firewall", "Firewall"], ["sec.fail2ban", "Fail2Ban"], ["sec.mac", "SELinux/AppArmor"], ["sec.ssh_port", "SSH port"], ["sec.root_login", "Root login"], ["sec.failed_logins", "Failed SSH (24h)"], ["sec.world_writable", "World-writable"]] },
  { title: "Services", keys: [["svc.report", "Detected"], ["svc.installed", "Installed"], ["svc.down", "Down"], ["svc.node", "Node.js"]] },
  { title: "Software", keys: [["sw.php", "PHP"], ["sw.python", "Python"], ["sw.node", "Node.js"], ["sw.java", "Java"], ["sw.docker", "Docker"], ["sw.git", "Git"], ["sw.composer", "Composer"], ["sw.npm", "npm"]] },
  { title: "Databases", keys: [["db.report", "Status"]] },
  { title: "Containers", keys: [["docker.running", "Running"], ["docker.stopped", "Stopped"], ["docker.images", "Images"], ["docker.volumes", "Volumes"], ["docker.unhealthy", "Unhealthy"], ["k8s.nodes", "K8s nodes"], ["k8s.pods", "K8s pods"]] },
  { title: "Recent Log Errors", keys: [["log.system", "System"], ["log.kernel", "Kernel"], ["log.disk", "Disk"], ["log.nginx", "Nginx"], ["log.apache", "Apache"]] },
];
const hasVal = (v?: string) => !!v && v !== "n/a" && !/^n\/a\b/.test(v) && v.trim() !== "";

export default function AdminSystemPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [maint, setMaint] = useState({ isEnabled: false, message: "" });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [savingMaint, setSavingMaint] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [repLoading, setRepLoading] = useState(true);
  const [repErr, setRepErr] = useState("");

  const load = () => {
    Promise.all([
      platformApi.adminHealth().then(r => setHealth(r.data.data)).catch(() => {}),
      platformApi.adminBackups().then(r => setBackups(r.data.data || [])).catch(() => {}),
      platformApi.adminMaintenance().then(r => setMaint({ isEnabled: !!r.data.data.isEnabled, message: r.data.data.message || "" })).catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  const loadReport = (force = false) => {
    setRepLoading(true); setRepErr("");
    platformApi.adminHealthReport(force)
      .then(r => setReport(r.data.data))
      .catch((e: unknown) => setRepErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Health scan failed"))
      .finally(() => setRepLoading(false));
  };

  useEffect(() => { load(); loadReport(false); }, []);

  const runBackup = async () => {
    setRunning(true);
    try { const r = await platformApi.adminRunBackup(); toast.success(r.data.message || "Backup created"); load(); }
    catch (e: unknown) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Backup failed"); }
    finally { setRunning(false); }
  };

  const download = async (name: string) => {
    try {
      const r = await platformApi.adminDownloadBackup(name);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Download failed"); }
  };

  const removeBackup = async (name: string) => {
    if (!confirm("Delete this backup?")) return;
    try { await platformApi.adminDeleteBackup(name); toast.success("Deleted"); load(); } catch { toast.error("Failed"); }
  };

  const saveMaint = async (enabled: boolean) => {
    setSavingMaint(true);
    try {
      await platformApi.adminSetMaintenance({ isEnabled: enabled, message: maint.message });
      setMaint(m => ({ ...m, isEnabled: enabled }));
      toast.success(enabled ? "Maintenance mode enabled — vendor panels are now blocked" : "Maintenance mode disabled");
    } catch { toast.error("Failed"); }
    finally { setSavingMaint(false); }
  };

  const memUsedPct = health ? Math.round(((health.server.totalMem - health.server.freeMem) / health.server.totalMem) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">System Health</h1><p className="text-sm text-gray-500 mt-1">Server status, database backups, and maintenance mode</p></div>
        <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      {/* Comprehensive server health report */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2"><HeartPulse className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">Server Health Report</h2>{report && <span className="text-xs text-gray-400">generated {report.generated}</span>}</div>
          <button onClick={() => loadReport(true)} disabled={repLoading} className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${repLoading ? "animate-spin" : ""}`} /> {repLoading ? "Scanning..." : "Re-scan"}</button>
        </div>

        {repLoading && !report ? (
          <div className="text-center py-10 text-gray-400 text-sm">Running health scan… (this can take ~15s)</div>
        ) : repErr && !report ? (
          <div className="text-center py-10 text-red-500 text-sm">{repErr}</div>
        ) : report ? (
          <div className="p-4 space-y-5">
            {/* Overall score + category scores */}
            <div className="flex flex-col md:flex-row gap-5 items-center">
              <div className="flex flex-col items-center justify-center shrink-0 w-40 h-40 rounded-full border-8 border-gray-100">
                <span className={`text-4xl font-extrabold ${scoreColor(report.overall_score)}`}>{report.overall_score}</span>
                <span className="text-xs text-gray-400 mt-1">/ 100</span>
                <span className={`text-xs font-medium mt-1 ${scoreColor(report.overall_score)}`}>{report.overall_score >= 90 ? "HEALTHY" : report.overall_score >= 75 ? "WARNING" : "CRITICAL"}</span>
              </div>
              <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.keys(CAT_LABELS).map(k => (
                  <div key={k} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between"><span className="text-xs text-gray-500">{CAT_LABELS[k]}</span><span className={`text-sm font-bold ${scoreColor(report.scores[k] ?? 0)}`}>{report.scores[k] ?? "—"}</span></div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${scoreBar(report.scores[k] ?? 0)}`} style={{ width: `${report.scores[k] ?? 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical + warnings */}
            {(report.critical.length > 0 || report.warnings.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-red-200 rounded-lg p-3 bg-red-50/40">
                  <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> Critical Issues ({report.critical.length})</p>
                  {report.critical.length === 0 ? <p className="text-xs text-gray-400">None</p> : <ul className="space-y-1">{report.critical.map((c, i) => <li key={i} className="text-xs text-red-700">• {c}</li>)}</ul>}
                </div>
                <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/40">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> Warnings ({report.warnings.length})</p>
                  {report.warnings.length === 0 ? <p className="text-xs text-gray-400">None</p> : <ul className="space-y-1">{report.warnings.map((w, i) => <li key={i} className="text-xs text-amber-700">• {w}</li>)}</ul>}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="border rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2"><Lightbulb className="w-3.5 h-3.5 text-emerald-600" /> Recommendations</p>
                <ul className="space-y-1.5">{report.recommendations.map((r, i) => <li key={i} className="text-xs text-gray-600 leading-relaxed">• {r}</li>)}</ul>
              </div>
            )}

            {/* Websites */}
            {(() => {
              const rows = Object.keys(report.metrics).filter(k => /^web\.row\.\d+$/.test(k)).sort().map(k => report.metrics[k].split("|"));
              if (rows.length === 0) return null;
              return (
                <div className="border rounded-lg overflow-hidden">
                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50"><Globe className="w-3.5 h-3.5 text-emerald-600" /> Websites</p>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b text-gray-500"><tr><th className="text-left px-3 py-1.5">URL</th><th className="text-left px-3 py-1.5">HTTP</th><th className="text-left px-3 py-1.5">Response</th><th className="text-left px-3 py-1.5">SSL expiry</th><th className="text-left px-3 py-1.5">Issuer</th><th className="text-left px-3 py-1.5">CDN</th></tr></thead>
                    <tbody className="divide-y">
                      {rows.map((c, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-medium break-all">{c[0]}</td>
                          <td className="px-3 py-1.5"><span className={/^2|3/.test(c[1]) ? "text-emerald-600" : "text-red-600"}>{c[1]}</span></td>
                          <td className="px-3 py-1.5 text-gray-600">{c[2]}</td>
                          <td className="px-3 py-1.5 text-gray-600">{c[3] && c[3] !== "n/a" ? `${c[3]} days` : "—"}</td>
                          <td className="px-3 py-1.5 text-gray-600">{c[4] || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-600">{c[5] && c[5] !== "none" ? c[5] : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Detailed metrics */}
            <div className="grid md:grid-cols-2 gap-4">
              {METRIC_GROUPS.map(g => {
                const rows = g.keys.filter(([k]) => hasVal(report.metrics[k]));
                if (rows.length === 0) return null;
                return (
                  <div key={g.title} className="border rounded-lg overflow-hidden">
                    <p className="text-xs font-semibold text-gray-700 px-3 py-2 border-b bg-gray-50">{g.title}</p>
                    <div className="divide-y">
                      {rows.map(([k, label]) => (
                        <div key={k} className="px-3 py-1.5 flex gap-3 text-xs">
                          <span className="text-gray-500 w-32 shrink-0">{label}</span>
                          <span className="text-gray-800 break-all whitespace-pre-wrap flex-1">{report.metrics[k]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <div className="text-center py-10 text-gray-400 text-sm">Loading...</div> : (
        <>
          {/* Health cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Server Uptime</p><p className="text-lg font-bold text-gray-900 mt-1">{health ? fmtUptime(health.server.uptime) : "—"}</p><p className="text-xs text-gray-400">Node {health?.server.nodeVersion}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Memory</p><p className="text-lg font-bold text-gray-900 mt-1">{memUsedPct}% used</p><p className="text-xs text-gray-400">{health ? fmtBytes(health.server.totalMem - health.server.freeMem) + " / " + fmtBytes(health.server.totalMem) : ""}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Disk</p><p className="text-lg font-bold text-gray-900 mt-1">{health?.disk?.usedPercent || "—"} used</p><p className="text-xs text-gray-400">{health?.disk ? `${health.disk.used} / ${health.disk.total} (${health.disk.available} free)` : ""}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Database</p><p className={`text-lg font-bold mt-1 ${health?.db.state === "connected" ? "text-emerald-600" : "text-red-600"}`}>{health?.db.state || "—"}</p><p className="text-xs text-gray-400">MongoDB</p></div>
          </div>

          {/* PM2 processes */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">Processes</h2></div>
            {(health?.pm2 || []).length === 0 ? <p className="text-sm text-gray-400 p-4">Process information unavailable</p> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-2 font-medium text-gray-600">Name</th><th className="text-left px-4 py-2 font-medium text-gray-600">Status</th><th className="text-left px-4 py-2 font-medium text-gray-600">Uptime</th><th className="text-left px-4 py-2 font-medium text-gray-600">Restarts</th><th className="text-left px-4 py-2 font-medium text-gray-600">Memory</th><th className="text-left px-4 py-2 font-medium text-gray-600">CPU</th></tr></thead>
                <tbody className="divide-y">
                  {health!.pm2.map(p => (
                    <tr key={p.name}>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{p.status}</span></td>
                      <td className="px-4 py-2 text-gray-600">{p.uptime ? fmtUptime((Date.now() - p.uptime) / 1000) : "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{p.restarts}</td>
                      <td className="px-4 py-2 text-gray-600">{p.memory ? fmtBytes(p.memory) : "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{p.cpu}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Backups */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2"><Database className="w-4 h-4 text-emerald-600" /><h2 className="text-sm font-semibold text-gray-800">Database Backups</h2><span className="text-xs text-gray-400">(auto daily, last 10 kept)</span></div>
              <button onClick={runBackup} disabled={running} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">{running ? "Running..." : "Backup Now"}</button>
            </div>
            {backups.length === 0 ? <p className="text-sm text-gray-400 p-4">No backups yet — click &quot;Backup Now&quot; to create the first one</p> : (
              <div className="divide-y">
                {backups.map(b => (
                  <div key={b.name} className="px-4 py-2.5 flex items-center justify-between">
                    <div><p className="text-sm font-medium text-gray-800">{b.name}</p><p className="text-xs text-gray-400">{fmtBytes(b.size)} · {new Date(b.createdAt).toLocaleString()}</p></div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => download(b.name)} className="text-gray-500 hover:text-emerald-600"><Download className="w-4 h-4" /></button>
                      <button onClick={() => removeBackup(b.name)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Maintenance mode */}
          <div className={`rounded-xl border p-5 ${maint.isEnabled ? "bg-amber-50 border-amber-300" : "bg-white"}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 mt-0.5 ${maint.isEnabled ? "text-amber-600" : "text-gray-400"}`} />
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Maintenance Mode</h2>
                  <p className="text-xs text-gray-500 mt-0.5">When enabled, vendor panels show a maintenance notice and their API access is blocked. The admin panel keeps working.</p>
                </div>
              </div>
              <button onClick={() => saveMaint(!maint.isEnabled)} disabled={savingMaint}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${maint.isEnabled ? "bg-amber-500" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${maint.isEnabled ? "left-6" : "left-0.5"}`} />
              </button>
            </div>
            <div className="mt-3">
              <label className="text-xs text-gray-500 block mb-1">Message shown to vendors</label>
              <div className="flex gap-2">
                <input value={maint.message} onChange={e => setMaint({ ...maint, message: e.target.value })} placeholder="We are currently under maintenance. Please check back later." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => saveMaint(maint.isEnabled)} disabled={savingMaint} className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Save</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
