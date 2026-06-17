import { useState, useEffect } from "react";

const SITE_PASSWORD = import.meta.env.VITE_SITE_PASSWORD || "mitesh2024";
const STORAGE_KEY = "site_access_granted";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "true") {
      setGranted(true);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input === SITE_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "true");
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
          <p className="text-slate-400 text-sm mt-1">Enter password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className={shake ? "animate-shake" : ""}>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className={`w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-slate-400 border outline-none transition-all text-center text-lg tracking-widest
              ${error ? "border-red-400 focus:border-red-400" : "border-white/20 focus:border-white/50"}`}
          />
          {error && (
            <p className="text-red-400 text-sm text-center mt-2">Incorrect password. Try again.</p>
          )}
          <button
            type="submit"
            className="mt-4 w-full py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 transition-colors"
          >
            Enter
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
