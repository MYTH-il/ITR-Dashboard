import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { formatApiError } from "@/lib/api";

const BG_URL = "https://images.unsplash.com/photo-1600531529272-023c4b821f14?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBnbGFzcyUyMG9mZmljZSUyMGJ1aWxkaW5nJTIwYXJjaGl0ZWN0dXJlfGVufDB8fHx8MTc4MjM3NTIzN3ww&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (e) {
      setError(formatApiError(e?.response?.data?.detail) || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="hidden md:block w-1/2 relative">
        <img src={BG_URL} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-slate-900/70 to-emerald-900/70" />
        <div className="relative h-full flex flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center font-bold" style={{ fontFamily: "Outfit" }}>IT</div>
            <div className="font-semibold tracking-tight text-lg" style={{ fontFamily: "Outfit" }}>TaxOps Console</div>
          </div>
          <div className="space-y-4 max-w-md">
            <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-200">Income Tax Operations</div>
            <h1 className="text-4xl font-semibold tracking-tight leading-tight" style={{ fontFamily: "Outfit" }}>
              Run your ITR practice with control room precision.
            </h1>
            <p className="text-white/70 text-sm leading-relaxed">
              Track returns across 15 workflow stages, monitor SLA breaches in real time, and coordinate your team from a single live dashboard.
            </p>
          </div>
          <div className="text-xs text-white/50">© {new Date().getFullYear()} TaxOps</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-2 text-emerald-800 mb-3">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-[11px] uppercase tracking-[0.18em] font-semibold">Secure Sign In</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to your ITR operations console</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Email</Label>
              <Input
                data-testid="login-email-input"
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Password</Label>
              <Input
                data-testid="login-password-input"
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            {error && (
              <div data-testid="login-error" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>
            )}

            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-emerald-800 hover:bg-emerald-900 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
