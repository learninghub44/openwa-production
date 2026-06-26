import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, RefreshCw, Ban, Calendar, CheckCircle2,
  Clock, AlertTriangle, XCircle, ChevronDown,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { API_BASE_URL } from '../services/api';
import './Billing.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubStatus = 'pending' | 'active' | 'grace' | 'suspended' | 'cancelled';
type Plan = 'starter' | 'growth' | 'pro' | 'enterprise';

interface AdminSubscription {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantEmail?: string;
  plan: Plan;
  status: SubStatus;
  currentPeriodEnd?: string | null;
  gracePeriodEnd?: string | null;
  lastAmountKes?: number | null;
  lastPaymentReference?: string | null;
  activatedAt?: string | null;
  createdAt: string;
}

const PLAN_BADGE: Record<Plan, string> = {
  starter: 'badge-starter',
  growth: 'badge-growth',
  pro: 'badge-pro',
  enterprise: 'badge-enterprise',
};

const STATUS_META: Record<SubStatus, { icon: typeof CheckCircle2; label: string; cls: string }> = {
  active:    { icon: CheckCircle2,  label: 'Active',    cls: 'status-active' },
  grace:     { icon: Clock,         label: 'Grace',     cls: 'status-grace' },
  pending:   { icon: AlertTriangle, label: 'Pending',   cls: 'status-pending' },
  suspended: { icon: XCircle,       label: 'Suspended', cls: 'status-suspended' },
  cancelled: { icon: Ban,           label: 'Cancelled', cls: 'status-cancelled' },
};

function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const apiKey = localStorage.getItem('apiKey') ?? '';
  return fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, ...opts?.headers },
  }).then(async r => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: r.statusText })) as { message?: string };
      throw new Error(err.message ?? r.statusText);
    }
    return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>);
  });
}

// ── Extend modal ──────────────────────────────────────────────────────────────

function ExtendModal({
  sub,
  onClose,
  onSuccess,
}: {
  sub: AdminSubscription;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handle = async () => {
    setLoading(true);
    try {
      await request(`/billing/subscriptions/${sub.id}/extend`, {
        method: 'PUT',
        body: JSON.stringify({ days }),
      });
      addToast({ type: 'success', message: `Extended by ${days} days` });
      onSuccess();
    } catch (e) {
      addToast({ type: 'error', message: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Extend Subscription</h3>
        <p className="modal-sub">{sub.tenantName} ({sub.tenantEmail})</p>
        <label className="form-label">Days to add</label>
        <div className="days-grid">
          {[7, 14, 30, 60, 90].map(d => (
            <button
              key={d}
              className={`day-btn ${days === d ? 'selected' : ''}`}
              onClick={() => setDays(d)}
            >{d}d</button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handle} disabled={loading}>
            {loading ? 'Extending…' : `Extend ${days} days`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Billing() {
  useDocumentTitle('Billing');
  const { addToast } = useToast();

  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [extendTarget, setExtendTarget] = useState<AdminSubscription | null>(null);
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request<AdminSubscription[]>('/billing/subscriptions');
      setSubs(data);
    } catch (e) {
      addToast({ type: 'error', message: `Failed to load subscriptions: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const suspend = async (sub: AdminSubscription) => {
    if (!confirm(`Suspend ${sub.tenantName ?? sub.id}? This will block their WhatsApp session.`)) return;
    try {
      await request(`/billing/subscriptions/${sub.id}/suspend`, { method: 'PUT' });
      addToast({ type: 'success', message: 'Subscription suspended' });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: String(e) });
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total:    subs.length,
    active:   subs.filter(s => s.status === 'active').length,
    grace:    subs.filter(s => s.status === 'grace').length,
    mrr:      subs
      .filter(s => s.status === 'active' || s.status === 'grace')
      .reduce((sum, s) => {
        const prices: Record<Plan, number> = { starter: 1500, growth: 3500, pro: 7000, enterprise: 15000 };
        return sum + (prices[s.plan] ?? 0);
      }, 0),
  };

  const visible = filter === 'all' ? subs : subs.filter(s => s.status === filter);

  return (
    <div className="billing-page">
      <PageHeader
        title="Billing"
        subtitle="Paystack subscriptions · KES pricing"
        icon={<CreditCard size={22} />}
        actions={
          <button className="btn-ghost icon-btn" onClick={load} title="Refresh">
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        }
      />

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <div className="billing-stats">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-card green">
          <span className="stat-value">{stats.active}</span>
          <span className="stat-label">Active</span>
        </div>
        <div className="stat-card orange">
          <span className="stat-value">{stats.grace}</span>
          <span className="stat-label">In Grace</span>
        </div>
        <div className="stat-card blue">
          <span className="stat-value">KES {stats.mrr.toLocaleString()}</span>
          <span className="stat-label">Est. MRR</span>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        {(['all', 'active', 'grace', 'pending', 'suspended', 'cancelled'] as const).map(f => (
          <button
            key={f}
            className={`filter-pill ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : STATUS_META[f as SubStatus]?.label ?? f}
            <span className="pill-count">
              {f === 'all' ? subs.length : subs.filter(s => s.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="loading-state">
          <RefreshCw size={28} className="spin muted" />
          <p>Loading subscriptions…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <CreditCard size={40} className="muted" />
          <p>{filter === 'all' ? 'No subscriptions yet.' : `No ${filter} subscriptions.`}</p>
        </div>
      ) : (
        <div className="sub-table-wrap">
          <table className="sub-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Period End</th>
                <th>Last Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(sub => {
                const { icon: Icon, label, cls } = STATUS_META[sub.status] ?? STATUS_META.pending;
                const periodEnd = sub.currentPeriodEnd
                  ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                  : '—';
                const daysLeft = sub.currentPeriodEnd
                  ? Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86400000)
                  : null;

                return (
                  <tr key={sub.id}>
                    <td>
                      <div className="client-cell">
                        <span className="client-name">{sub.tenantName ?? sub.tenantId.slice(0, 8)}</span>
                        {sub.tenantEmail && <span className="client-email">{sub.tenantEmail}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`plan-badge ${PLAN_BADGE[sub.plan] ?? ''}`}>
                        {sub.plan}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${cls}`}>
                        <Icon size={12} />
                        {label}
                      </span>
                    </td>
                    <td>
                      <div className="period-cell">
                        <span>{periodEnd}</span>
                        {daysLeft !== null && (
                          <span className={`days-chip ${daysLeft < 5 ? 'urgent' : ''}`}>
                            {daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {sub.lastAmountKes
                        ? `KES ${sub.lastAmountKes.toLocaleString()}`
                        : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="action-btn extend"
                          onClick={() => setExtendTarget(sub)}
                          title="Extend subscription"
                        >
                          <Calendar size={14} />
                          Extend
                        </button>
                        {sub.status !== 'suspended' && sub.status !== 'cancelled' && (
                          <button
                            className="action-btn suspend"
                            onClick={() => void suspend(sub)}
                            title="Suspend"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Extend modal ──────────────────────────────────────────────────── */}
      {extendTarget && (
        <ExtendModal
          sub={extendTarget}
          onClose={() => setExtendTarget(null)}
          onSuccess={() => { setExtendTarget(null); void load(); }}
        />
      )}
    </div>
  );
}
