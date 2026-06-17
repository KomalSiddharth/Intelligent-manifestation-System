import { useState, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FALLBACK_PASSWORD = import.meta.env.VITE_SITE_PASSWORD || "mitesh2024";
const STORAGE_KEY = "site_access_code";

async function validateCodeRemote(code: string): Promise<boolean> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_access_code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_code: code }),
    });
    if (!resp.ok) return false;
    return await resp.json() === true;
  } catch {
    return false;
  }
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) setGranted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);

    // Check DB first, fall back to env var password
    const valid = await validateCodeRemote(input.trim()) || input.trim() === FALLBACK_PASSWORD;

    setLoading(false);
    if (valid) {
      sessionStorage.setItem(STORAGE_KEY, input.trim());
      setGranted(true);
    } else {
      setError(true);
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 600);
    }
  }

  if (granted) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-sm px-8 py-10 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-white text-2xl font-semibold">Private Access</h1>
          <p className="text-slate-400 text-sm mt-1">Enter your access code to continue</p>
        </div>

        <form onSubmit={handleSubmit} className={shake ? "animate-shake" : ""}>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Access code"
            autoFocus
            disabled={loading}
            className={`w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-slate-400 border outline-none transition-all text-center text-lg tracking-widest disabled:opacity-50
              ${error ? "border-red-400 focus:border-red-400" : "border-white/20 focus:border-white/50"}`}
          />
          {error && (
            <p className="text-red-400 text-sm text-center mt-2">Invalid access code. Try again.</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" />
            ) : "Enter"}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
