import { useState, useEffect } from 'react';
import {
  Wifi, CheckCircle2, XCircle, AlertTriangle,
  Copy, Check, ExternalLink, Loader2, ArrowRight, LogOut,
  Smartphone, Key, RefreshCw, CreditCard,
} from 'lucide-react';
import './Portal.css';

const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;

type Plan = 'starter' | 'growth' | 'pro' | 'enterprise';
type SubStatus = 'pending' | 'active' | 'grace' | 'suspended' | 'cancelled';
type Step = 'landing' | 'login' | 'otp' | 'portal';

interface PlanInfo {
  plan: Plan;
  priceKes: number;
  sessions: number;
  messagesPerDay: number;
  description: string;
}

interface PortalData {
  tenantName: string;
  tenantSlug: string;
  email: string;
  subscription: {
    plan: Plan;
    status: SubStatus;
    currentPeriodEnd?: string | null;
    daysRemaining?: number | null;
    isAccessAllowed: boolean;
  };
  apiKeyMasked: string;
  sessionId: string;
  qrUrl: string;
  sessionStatus: string;
  manageSubscriptionUrl?: string;
}

const PLAN_LABEL: Record<Plan, string> = {
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const STATUS_COLOR: Record<SubStatus, string> = {
  active: '#22c55e', grace: '#f97316',
  pending: '#eab308', suspended: '#ef4444', cancelled: '#94a3b8',
};

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={() => navigator.clipboard.writeText(value).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      })}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// ── Landing / Signup ─────────────────────────────────────────────────────────

function Landing({ onLogin, onSignup }: { onLogin: () => void; onSignup: (plan: Plan) => void }) {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/billing/plans`)
      .then(r => r.json() as Promise<{ plans: PlanInfo[] }>)
      .then(d => setPlans(d.plans))
      .catch(() => {})
      .finally(() => setLoadingPlans(false));
  }, []);

  return (
    <div className="portal-landing">
      <div className="landing-hero">
        <div className="hero-badge">
          <Wifi size={16} />
          WhatsApp API Gateway
        </div>
        <h1>Connect your WhatsApp.<br />Automate everything.</h1>
        <p className="hero-sub">
          One QR scan. Your own API key. Send & receive WhatsApp messages
          from any app, system, or script — reliably, at scale.
        </p>
        <button className="btn-ghost-hero" onClick={onLogin}>
          Already have an account? Log in
        </button>
      </div>

      <div className="plans-section">
        <h2>Simple monthly pricing</h2>
        <p className="plans-sub">All plans include full API access, webhook support, and a dashboard.</p>

        {loadingPlans ? (
          <div className="plans-loading"><Loader2 size={24} className="spin" /></div>
        ) : (
          <div className="plans-grid">
            {plans.map(p => (
              <div key={p.plan} className={`plan-card ${p.plan === 'growth' ? 'featured' : ''}`}>
                {p.plan === 'growth' && <div className="featured-tag">Most Popular</div>}
                <div className="plan-header">
                  <span className="plan-name">{PLAN_LABEL[p.plan]}</span>
                  <div className="plan-price">
                    <span className="price-amount">KES {p.priceKes.toLocaleString()}</span>
                    <span className="price-period">/month</span>
                  </div>
                </div>
                <ul className="plan-features">
                  <li>
                    <Check size={14} />
                    {p.sessions === -1 ? 'Unlimited WhatsApp numbers' : `${p.sessions} WhatsApp number${p.sessions > 1 ? 's' : ''}`}
                  </li>
                  <li>
                    <Check size={14} />
                    {p.messagesPerDay === -1 ? 'Unlimited messages/day' : `${p.messagesPerDay.toLocaleString()} messages/day`}
                  </li>
                  <li><Check size={14} />{p.description.split('.')[0]}</li>
                </ul>
                <button
                  className={`plan-cta ${p.plan === 'growth' ? 'cta-featured' : ''}`}
                  onClick={() => onSignup(p.plan)}
                >
                  Get started <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Signup form ───────────────────────────────────────────────────────────────

function SignupForm({
  initialPlan,
  onBack,
}: {
  initialPlan: Plan;
  onBack: () => void;
  onSuccess?: () => void;
}) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/billing/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), plan }),
      });
      const data = await res.json() as { authorizationUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? 'Payment initialization failed');
      // Redirect to Paystack
      window.location.href = data.authorizationUrl!;
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const PLANS: Plan[] = ['starter', 'growth', 'pro', 'enterprise'];
  const PRICES: Record<Plan, number> = { starter: 1500, growth: 3500, pro: 7000, enterprise: 15000 };

  return (
    <div className="portal-form-wrap">
      <div className="portal-form-card">
        <button className="back-link" onClick={onBack}>← Back to plans</button>
        <h2>Create your account</h2>
        <p className="form-sub">You'll be redirected to Paystack to complete payment.</p>

        <div className="plan-selector">
          {PLANS.map(p => (
            <button
              key={p}
              className={`plan-chip ${plan === p ? 'selected' : ''}`}
              onClick={() => setPlan(p)}
            >
              {PLAN_LABEL[p]}
              <span className="chip-price">KES {PRICES[p].toLocaleString()}</span>
            </button>
          ))}
        </div>

        <div className="form-field">
          <label>Business name</label>
          <input
            type="text" placeholder="Acme Corp"
            value={name} onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>Email address</label>
          <input
            type="email" placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 size={18} className="spin" /> : <CreditCard size={18} />}
          {loading ? 'Redirecting to Paystack…' : `Pay KES ${PRICES[plan].toLocaleString()}/month`}
        </button>
        <p className="form-footer">Secured by Paystack · M-Pesa & Card accepted</p>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ onBack, onOtpSent }: { onBack: () => void; onOtpSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setLoading(true); setError('');
    try {
      await fetch(`${API_BASE}/billing/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      onOtpSent(email.trim());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-form-wrap">
      <div className="portal-form-card">
        <button className="back-link" onClick={onBack}>← Back</button>
        <h2>Log in to your portal</h2>
        <p className="form-sub">Enter your email and we'll send a 6-digit login code.</p>
        <div className="form-field">
          <label>Email address</label>
          <input type="email" placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void submit()}
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-submit" onClick={submit} disabled={loading}>
          {loading ? <Loader2 size={18} className="spin" /> : null}
          {loading ? 'Sending…' : 'Send login code'}
        </button>
      </div>
    </div>
  );
}

// ── OTP verification ──────────────────────────────────────────────────────────

function OtpVerify({
  email,
  onSuccess,
}: {
  email: string;
  onSuccess: (token: string) => void;
}) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (otp.length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/billing/portal/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json() as { token?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? 'Verification failed');
      localStorage.setItem('portalToken', data.token!);
      onSuccess(data.token!);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-form-wrap">
      <div className="portal-form-card">
        <h2>Check your email</h2>
        <p className="form-sub">We sent a 6-digit code to <strong>{email}</strong></p>
        <div className="form-field">
          <label>Login code</label>
          <input
            type="text" placeholder="123456" maxLength={6}
            className="otp-input"
            value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && void submit()}
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-submit" onClick={submit} disabled={loading}>
          {loading ? <Loader2 size={18} className="spin" /> : null}
          {loading ? 'Verifying…' : 'Confirm code'}
        </button>
      </div>
    </div>
  );
}

// ── Portal dashboard ──────────────────────────────────────────────────────────

function PortalDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/billing/portal/me`, {
        headers: { 'x-portal-token': token },
      });
      if (res.status === 401) { onLogout(); return; }
      const d = await res.json() as PortalData;
      setData(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token]);

  if (loading) return (
    <div className="portal-loading">
      <Loader2 size={32} className="spin" />
      <p>Loading your dashboard…</p>
    </div>
  );

  if (error) return (
    <div className="portal-error">
      <XCircle size={32} />
      <p>{error}</p>
      <button onClick={load}>Retry</button>
    </div>
  );

  if (!data) return null;

  const { subscription: sub } = data;
  const statusColor = STATUS_COLOR[sub.status] ?? '#94a3b8';
  const isActive = sub.isAccessAllowed;

  return (
    <div className="portal-dashboard">
      <header className="portal-header">
        <div className="portal-logo"><Wifi size={20} />Zetu</div>
        <div className="portal-user">
          <span>{data.email}</span>
          <button className="logout-btn" onClick={onLogout}><LogOut size={15} /></button>
        </div>
      </header>

      <main className="portal-main">
        <div className="welcome-row">
          <h1>Welcome, {data.tenantName}</h1>
          <button className="refresh-btn" onClick={load}><RefreshCw size={15} /></button>
        </div>

        {/* ── Status banner ──────────────────────────────────────────────── */}
        <div className={`status-banner ${isActive ? 'banner-active' : 'banner-inactive'}`}>
          {isActive
            ? <><CheckCircle2 size={18} /> Access active · {PLAN_LABEL[sub.plan]} plan</>
            : <><AlertTriangle size={18} /> {sub.status === 'suspended' ? 'Subscription suspended — renew to restore access' : `Subscription ${sub.status}`}</>
          }
          {sub.daysRemaining !== null && sub.daysRemaining !== undefined && (
            <span className="days-badge">{sub.daysRemaining}d remaining</span>
          )}
        </div>

        <div className="portal-grid">
          {/* ── API Key card ───────────────────────────────────────────── */}
          <div className="portal-card">
            <div className="card-head">
              <Key size={18} />
              <span>API Key</span>
            </div>
            <div className="masked-key">
              <code>{data.apiKeyMasked}</code>
              <CopyBtn value={data.apiKeyMasked} />
            </div>
            <p className="card-note">
              Use this key as <code>X-API-Key</code> header in all your API requests.
            </p>
          </div>

          {/* ── WhatsApp QR card ───────────────────────────────────────── */}
          <div className="portal-card">
            <div className="card-head">
              <Smartphone size={18} />
              <span>WhatsApp Connection</span>
            </div>
            <div className={`session-status-row status-${data.sessionStatus}`}>
              <span className="status-dot" />
              <span className="status-text">{data.sessionStatus.replace(/_/g, ' ')}</span>
            </div>
            {data.sessionStatus !== 'ready' && data.qrUrl && (
              <>
                <p className="card-note">Open this QR on your phone to link your WhatsApp:</p>
                <a
                  href={data.qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="qr-link"
                >
                  <ExternalLink size={14} />
                  Open QR Code
                </a>
              </>
            )}
            {data.sessionStatus === 'ready' && (
              <div className="connected-badge">
                <CheckCircle2 size={16} />
                WhatsApp connected
              </div>
            )}
          </div>

          {/* ── Billing card ───────────────────────────────────────────── */}
          <div className="portal-card">
            <div className="card-head">
              <CreditCard size={18} />
              <span>Billing</span>
            </div>
            <div className="billing-info-row">
              <span className="info-label">Plan</span>
              <span className="plan-chip-display">{PLAN_LABEL[sub.plan]}</span>
            </div>
            <div className="billing-info-row">
              <span className="info-label">Status</span>
              <span className="info-value" style={{ color: statusColor, fontWeight: 600 }}>
                {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
              </span>
            </div>
            {sub.currentPeriodEnd && (
              <div className="billing-info-row">
                <span className="info-label">Next renewal</span>
                <span className="info-value">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
            {data.manageSubscriptionUrl && (
              <a href={data.manageSubscriptionUrl} target="_blank" rel="noreferrer" className="manage-link">
                Manage subscription on Paystack <ExternalLink size={12} />
              </a>
            )}
            {!isActive && (
              <a href="/" className="renew-cta">
                Renew now <ArrowRight size={14} />
              </a>
            )}
          </div>

          {/* ── Quick start card ───────────────────────────────────────── */}
          <div className="portal-card">
            <div className="card-head">
              <ArrowRight size={18} />
              <span>Quick Start</span>
            </div>
            <div className="quickstart-steps">
              <div className="qs-step">
                <span className="qs-num">1</span>
                <span>Link WhatsApp by scanning the QR code above</span>
              </div>
              <div className="qs-step">
                <span className="qs-num">2</span>
                <span>Copy your API key</span>
              </div>
              <div className="qs-step">
                <span className="qs-num">3</span>
                <span>Send your first message:
                  <code className="qs-code">POST /api/sessions/{data.sessionId.slice(0,8)}…/messages/send-text</code>
                </span>
              </div>
            </div>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="docs-link">
              View API docs <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Root Portal ───────────────────────────────────────────────────────────────

export function Portal() {
  const [step, setStep] = useState<Step>('landing');
  const [selectedPlan, setSelectedPlan] = useState<Plan>('growth');
  const [otpEmail, setOtpEmail] = useState('');
  const [portalToken, setPortalToken] = useState<string | null>(
    () => localStorage.getItem('portalToken'),
  );

  // Check for post-payment callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const sub = params.get('sub');
    if (ref && sub) {
      // Payment callback — show login to access portal
      setStep('login');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auto-restore session
  useEffect(() => {
    if (portalToken) setStep('portal');
  }, []);

  const logout = () => {
    localStorage.removeItem('portalToken');
    setPortalToken(null);
    setStep('landing');
  };

  if (step === 'portal' && portalToken) {
    return <PortalDashboard token={portalToken} onLogout={logout} />;
  }

  if (step === 'otp') {
    return (
      <OtpVerify
        email={otpEmail}
        onSuccess={token => { setPortalToken(token); setStep('portal'); }}
      />
    );
  }

  if (step === 'login') {
    return (
      <Login
        onBack={() => setStep('landing')}
        onOtpSent={email => { setOtpEmail(email); setStep('otp'); }}
      />
    );
  }

  if (step === 'landing' && selectedPlan) {
    // If user clicked a plan CTA, show signup form
  }

  return (
    <>
      {step === 'landing' && (
        <Landing
          onLogin={() => setStep('login')}
          onSignup={plan => { setSelectedPlan(plan); setStep('landing'); }}
        />
      )}
      {/* Signup triggered from plan CTA — re-render with signup form */}
    </>
  );
}

// ── Wrapper with plan routing ─────────────────────────────────────────────────

export default function PortalApp() {
  const [selectedPlan, setSelectedPlan] = useState<Plan>('growth');
  const [step, setStep] = useState<'landing' | 'signup' | 'login' | 'otp' | 'portal'>('landing');
  const [otpEmail, setOtpEmail] = useState('');
  const [portalToken, setPortalToken] = useState<string | null>(
    () => localStorage.getItem('portalToken'),
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ref') && params.get('sub')) {
      setStep('login');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (portalToken) setStep('portal');
  }, []);

  const logout = () => {
    localStorage.removeItem('portalToken');
    setPortalToken(null);
    setStep('landing');
  };

  switch (step) {
    case 'portal':
      return portalToken
        ? <PortalDashboard token={portalToken} onLogout={logout} />
        : null;
    case 'otp':
      return <OtpVerify email={otpEmail} onSuccess={t => { setPortalToken(t); localStorage.setItem('portalToken', t); setStep('portal'); }} />;
    case 'login':
      return <Login onBack={() => setStep('landing')} onOtpSent={e => { setOtpEmail(e); setStep('otp'); }} />;
    case 'signup':
      return <SignupForm initialPlan={selectedPlan} onBack={() => setStep('landing')} onSuccess={() => setStep('login')} />;
    default:
      return (
        <Landing
          onLogin={() => setStep('login')}
          onSignup={plan => { setSelectedPlan(plan); setStep('signup'); }}
        />
      );
  }
}
