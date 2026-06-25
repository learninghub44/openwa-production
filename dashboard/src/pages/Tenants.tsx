import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { tenantApi, type Tenant, type TenantProvisionedResponse, type CreateTenantPayload, type TenantPlan } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './Tenants.css';

const PLANS: TenantPlan[] = ['free', 'starter', 'pro', 'enterprise'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy} title="Copy">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ── Provision modal ───────────────────────────────────────────────────────────

interface ProvisionModalProps {
  onClose: () => void;
  onProvisioned: (tenant: Tenant) => void;
}

function ProvisionModal({ onClose, onProvisioned }: ProvisionModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<CreateTenantPayload>({
    name: '',
    slug: '',
    plan: 'starter',
    email: '',
    autoStart: true,
  });
  const [slugManual, setSlugManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TenantProvisionedResponse | null>(null);

  const set = (key: keyof CreateTenantPayload, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleNameChange = (value: string) => {
    set('name', value);
    if (!slugManual) set('slug', toSlug(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugManual(true);
    set('slug', toSlug(value));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Missing fields', 'Name and slug are required.');
      return;
    }
    setLoading(true);
    try {
      const payload: CreateTenantPayload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        plan: form.plan,
        autoStart: true,
        ...(form.email?.trim() && { email: form.email.trim() }),
      };
      const provisioned = await tenantApi.provision(payload);
      setResult(provisioned);
      onProvisioned(provisioned);
      toast.success('Tenant provisioned!', `${provisioned.name} is ready.`);
    } catch (err) {
      toast.error('Provisioning failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h2>{result ? '✅ Tenant Provisioned' : 'Provision New Tenant'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {result ? (
            /* ── Success view ── */
            <div className="provision-success">
              <div className="success-icon"><CheckCircle2 size={28} /></div>
              <h3>{result.name} is live</h3>
              <p>Session created and QR ready. Share the details below with your client.</p>

              <div className="warning-box">
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><strong>Save the API key now.</strong> It will never be shown again.</span>
              </div>

              <div className="provision-details">
                <div className="detail-row">
                  <span className="detail-label">API Key</span>
                  <div className="detail-value">
                    <code>{result.apiKey}</code>
                    <CopyButton value={result.apiKey} />
                  </div>
                </div>

                <div className="detail-row">
                  <span className="detail-label">QR Code URL (client scans this)</span>
                  <div className="detail-value">
                    <code style={{ fontSize: '0.78rem' }}>{result.qrUrl}</code>
                    <CopyButton value={result.qrUrl} />
                  </div>
                  <a href={result.qrUrl} target="_blank" rel="noreferrer" className="qr-link" style={{ marginTop: 4 }}>
                    <ExternalLink size={13} /> Open QR in new tab
                  </a>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Session ID</span>
                  <div className="detail-value">
                    <code>{result.sessionId}</code>
                    <CopyButton value={result.sessionId} />
                  </div>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Session auto-started</span>
                  <div className="detail-value">
                    <code>{result.sessionStarted ? '✅ Yes — QR is ready to scan' : '⚠️ No — start manually in Sessions'}</code>
                  </div>
                </div>
              </div>

              <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
                <button className="btn-submit" onClick={onClose}>Done</button>
              </div>
            </div>
          ) : (
            /* ── Provision form ── */
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Business Name <span className="required">*</span></label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Slug <span className="required">*</span></label>
                  <input
                    type="text"
                    placeholder="acme-corp"
                    value={form.slug}
                    onChange={e => handleSlugChange(e.target.value)}
                  />
                  <span className="form-hint">Used as session name · lowercase, hyphens only</span>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Contact Email</label>
                  <input
                    type="email"
                    placeholder="client@example.com"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Plan</label>
                  <select value={form.plan} onChange={e => set('plan', e.target.value as TenantPlan)}>
                    {PLANS.map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={loading || !form.name || !form.slug}>
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Provisioning…</> : <><Plus size={15} /> Provision Tenant</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ tenant, onClose, onDeleted }: { tenant: Tenant; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await tenantApi.remove(tenant.id);
      toast.success('Tenant deleted', `${tenant.name} has been removed.`);
      onDeleted();
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <h2>Delete Tenant</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Delete <strong>{tenant.name}</strong> (<code>{tenant.slug}</code>)?
            The tenant record will be removed. Sessions and API keys must be cleaned separately.
          </p>
          <div className="form-actions">
            <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              className="btn-submit"
              style={{ background: '#dc2626' }}
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Tenants() {
  useDocumentTitle('Tenants');
  const toast = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProvision, setShowProvision] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      const data = await tenantApi.list();
      setTenants(data);
    } catch (err) {
      toast.error('Failed to load tenants', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchTenants(); }, [fetchTenants]);

  const handleProvisioned = (provisioned: Tenant) => {
    setTenants(prev => [provisioned, ...prev]);
  };

  const handleToggleActive = async (tenant: Tenant) => {
    setTogglingId(tenant.id);
    try {
      const updated = await tenantApi.update(tenant.id, { isActive: !tenant.isActive });
      setTenants(prev => prev.map(t => (t.id === tenant.id ? updated : t)));
      toast.success(
        updated.isActive ? 'Tenant activated' : 'Tenant deactivated',
        updated.name,
      );
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleted = () => {
    if (deleteTarget) {
      setTenants(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  // Stats
  const total  = tenants.length;
  const active = tenants.filter(t => t.isActive).length;
  const planCounts = PLANS.reduce<Record<string, number>>((acc, p) => {
    acc[p] = tenants.filter(t => t.plan === p).length;
    return acc;
  }, {});

  return (
    <div className="tenants-page">
      <div className="header-content">
        <PageHeader
          title="Tenants"
          subtitle="Provision and manage multi-tenant WhatsApp sessions"
          badge={<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{total} total</span>}
        />
        <button className="btn-primary" onClick={() => setShowProvision(true)}>
          <Plus size={17} /> Provision Tenant
        </button>
      </div>

      {/* Stats */}
      <div className="tenants-stats">
        <div className="tenants-stat-card">
          <div className="stat-label">Total Tenants</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="tenants-stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value" style={{ color: '#16a34a' }}>{active}</div>
        </div>
        <div className="tenants-stat-card">
          <div className="stat-label">Pro / Enterprise</div>
          <div className="stat-value">{(planCounts.pro ?? 0) + (planCounts.enterprise ?? 0)}</div>
        </div>
        <div className="tenants-stat-card">
          <div className="stat-label">Inactive</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{total - active}</div>
        </div>
      </div>

      {/* Table */}
      <div className="tenants-table-container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1rem', display: 'block' }} />
            Loading tenants…
          </div>
        ) : tenants.length === 0 ? (
          <div className="tenants-empty">
            <Users className="empty-icon" />
            <h3>No tenants yet</h3>
            <p>Click <strong>Provision Tenant</strong> to onboard your first client automatically.</p>
          </div>
        ) : (
          <table className="tenants-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Slug</th>
                <th>Plan</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr key={tenant.id}>
                  <td><span className="tenant-name">{tenant.name}</span></td>
                  <td><span className="tenant-slug">{tenant.slug}</span></td>
                  <td><span className={`plan-badge ${tenant.plan}`}>{tenant.plan}</span></td>
                  <td><span className="tenant-email">{tenant.email ?? '—'}</span></td>
                  <td>
                    <span className={`status-badge ${tenant.isActive ? 'active' : 'inactive'}`}>
                      <span className="status-dot" />
                      {tenant.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="tenant-actions">
                      <button
                        className="btn-icon"
                        title={tenant.isActive ? 'Deactivate' : 'Activate'}
                        onClick={() => void handleToggleActive(tenant)}
                        disabled={togglingId === tenant.id}
                      >
                        {togglingId === tenant.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : tenant.isActive
                            ? <ToggleRight size={16} style={{ color: '#16a34a' }} />
                            : <ToggleLeft size={16} />
                        }
                      </button>
                      <button
                        className="btn-icon danger"
                        title="Delete tenant"
                        onClick={() => setDeleteTarget(tenant)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showProvision && (
        <ProvisionModal
          onClose={() => setShowProvision(false)}
          onProvisioned={handleProvisioned}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          tenant={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
