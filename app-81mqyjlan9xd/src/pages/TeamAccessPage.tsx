import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ADMIN_SECRET = import.meta.env.VITE_MANAGE_ACCESS_SECRET;
const ADMIN_PAGE_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "admin2024";
const ADMIN_STORAGE_KEY = "admin_access_granted";

interface AccessCode {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

async function callManageAccess(action: string, payload?: object) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_SECRET,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "Request failed");
  return json;
}

function generateCode(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, "").slice(0, 6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}-${rand}`;
}

export default function TeamAccessPage() {
  const [adminGranted, setAdminGranted] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState(false);

  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(ADMIN_STORAGE_KEY) === "true") setAdminGranted(true);
  }, []);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await callManageAccess("list");
      setCodes(data || []);
    } catch (e: any) {
      alert("Failed to load: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminGranted) loadCodes();
  }, [adminGranted, loadCodes]);

  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (adminInput === ADMIN_PAGE_PASSWORD) {
      sessionStorage.setItem(ADMIN_STORAGE_KEY, "true");
      setAdminGranted(true);
    } else {
      setAdminError(true);
      setAdminInput("");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await callManageAccess("add", { name: newName.trim(), code: newCode.trim() || generateCode(newName) });
      setNewName("");
      setNewCode("");
      await loadCodes();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(item: AccessCode) {
    setActionId(item.id);
    try {
      await callManageAccess(item.is_active ? "revoke" : "restore", { id: item.id });
      await loadCodes();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(item: AccessCode) {
    if (!confirm(`Delete "${item.name}" permanently?`)) return;
    setActionId(item.id);
    try {
      await callManageAccess("delete", { id: item.id });
      await loadCodes();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setActionId(null);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!adminGranted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-sm px-8 py-10 bg-slate-900 rounded-2xl border border-slate-800">
          <h1 className="text-white text-xl font-semibold text-center mb-6">Team Access — Admin</h1>
          <form onSubmit={handleAdminLogin} className="space-y-3">
            <input
              type="password"
              value={adminInput}
              onChange={(e) => { setAdminInput(e.target.value); setAdminError(false); }}
              placeholder="Admin password"
              autoFocus
              className={`w-full px-4 py-3 rounded-xl bg-slate-800 text-white placeholder-slate-500 border outline-none transition-all text-center tracking-widest
                ${adminError ? "border-red-500" : "border-slate-700 focus:border-slate-500"}`}
            />
            {adminError && <p className="text-red-400 text-sm text-center">Incorrect password.</p>}
            <button type="submit" className="w-full py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 transition-colors">
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  const active = codes.filter(c => c.is_active);
  const revoked = codes.filter(c => !c.is_active);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Team Access</h1>
            <p className="text-slate-400 text-sm mt-1">{active.length} active · {revoked.length} revoked</p>
          </div>
          <button onClick={loadCodes} className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors">
            Refresh
          </button>
        </div>

        {/* Add member */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 mb-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Add team member</h2>
          <form onSubmit={handleAdd} className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Priya)"
              className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-slate-800 text-white placeholder-slate-500 border border-slate-700 focus:border-slate-500 outline-none text-sm"
            />
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Code (auto-generated if blank)"
              className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl bg-slate-800 text-white placeholder-slate-500 border border-slate-700 focus:border-slate-500 outline-none text-sm font-mono"
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="px-5 py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </form>
        </div>

        {/* Active members */}
        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading…</div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Active ({active.length})</h2>
                <div className="space-y-2">
                  {active.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-900 rounded-xl border border-slate-800 px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-white">{item.name}</p>
                        <button
                          onClick={() => copyCode(item.code)}
                          className="font-mono text-xs text-slate-400 hover:text-white transition-colors mt-0.5 text-left"
                        >
                          {copied === item.code ? "✓ Copied!" : item.code}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Active</span>
                        <button
                          onClick={() => handleToggle(item)}
                          disabled={actionId === item.id}
                          className="text-xs text-amber-400 hover:text-amber-300 border border-amber-400/30 hover:border-amber-400/60 px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {actionId === item.id ? "…" : "Revoke"}
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={actionId === item.id}
                          className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {revoked.length > 0 && (
              <div>
                <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Revoked ({revoked.length})</h2>
                <div className="space-y-2">
                  {revoked.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-900/50 rounded-xl border border-slate-800/50 px-4 py-3 gap-3 opacity-60">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-slate-400">{item.name}</p>
                        <p className="font-mono text-xs text-slate-600 mt-0.5">{item.code}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">Revoked</span>
                        <button
                          onClick={() => handleToggle(item)}
                          disabled={actionId === item.id}
                          className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {actionId === item.id ? "…" : "Restore"}
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={actionId === item.id}
                          className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {codes.length === 0 && (
              <div className="text-center text-slate-600 py-16">
                <p className="text-lg mb-2">No access codes yet</p>
                <p className="text-sm">Add your first team member above.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
