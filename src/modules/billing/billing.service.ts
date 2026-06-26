import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { Subscription, SubscriptionStatus, BillingPlan } from './entities/subscription.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { PaystackService } from './paystack.service';
import { TenantService } from '../tenant/tenant.service';
import { SessionService } from '../session/session.service';
import { AuthService } from '../auth/auth.service';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import {
  InitializePaymentDto,
  InitializePaymentResponseDto,
  SubscriptionStatusDto,
  PortalDataDto,
  buildPlanInfo,
  PlanInfoDto,
} from './dto';

// OTP store: email → { otp, expiresAt }
// In production you'd use Redis; in-process map is fine for single-instance Render deployments
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

@Injectable()
export class BillingService {
  private readonly logger = new Logger('BillingService');

  constructor(
    @InjectRepository(Subscription, 'main')
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Tenant, 'main')
    private readonly tenantRepo: Repository<Tenant>,
    private readonly paystackService: PaystackService,
    private readonly tenantService: TenantService,
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
  ) {}

  // ── Plans ──────────────────────────────────────────────────────────────────

  getPlans(): PlanInfoDto[] {
    return buildPlanInfo();
  }

  // ── Payment initialization ─────────────────────────────────────────────────

  async initializePayment(
    dto: InitializePaymentDto,
    baseUrl: string,
  ): Promise<InitializePaymentResponseDto> {
    // Auto-generate slug if not provided
    const slug = dto.slug
      ? dto.slug
      : `${dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${Date.now().toString(36)}`;

    // Check if tenant with this email already exists (prevent double-signup)
    const existingTenant = await this.tenantRepo.findOne({ where: { email: dto.email } });
    if (existingTenant) {
      const existingSub = await this.subscriptionRepo.findOne({
        where: { tenantId: existingTenant.id },
        order: { createdAt: 'DESC' },
      });
      if (existingSub && existingSub.status === SubscriptionStatus.ACTIVE) {
        throw new BadRequestException(
          'An active subscription already exists for this email. Log in at /portal to manage it.',
        );
      }
    }

    // Get Paystack plan code (must be pre-configured in env)
    const planCode = this.paystackService.getPlanCode(dto.plan);

    // Create a pending subscription record BEFORE hitting Paystack (idempotent on retry)
    let tenant = existingTenant;
    if (!tenant) {
      // Provision tenant with PENDING state — session + key created, but NOT started yet
      const provisioned = await this.tenantService.provision(
        {
          name: dto.name,
          slug,
          email: dto.email,
          plan: dto.plan as unknown as import('../tenant/entities/tenant.entity').TenantPlan,
          autoStart: false, // don't start until paid
        },
        baseUrl,
      );
      tenant = await this.tenantRepo.findOne({ where: { id: provisioned.id } }) as Tenant;
    }

    // Create subscription record
    const subscription = this.subscriptionRepo.create({
      tenantId: tenant.id,
      plan: dto.plan,
      status: SubscriptionStatus.PENDING,
    });
    const savedSub = await this.subscriptionRepo.save(subscription);

    // Generate payment reference
    const reference = this.paystackService.generateReference('ZETU');

    // Initialize Paystack transaction
    const paystackResult = await this.paystackService.initializeTransaction({
      email: dto.email,
      plan: dto.plan,
      planCode,
      reference,
      callbackUrl: `${baseUrl}/portal?ref=${reference}&sub=${savedSub.id}`,
      metadata: {
        tenantId: tenant.id,
        tenantSlug: slug,
        subscriptionId: savedSub.id,
        plan: dto.plan,
        custom_fields: [
          { display_name: 'Business Name', variable_name: 'business_name', value: dto.name },
          { display_name: 'Plan', variable_name: 'plan', value: dto.plan },
        ],
      },
    });

    this.logger.log(`Payment initialized for tenant ${tenant.id}, ref: ${reference}`);

    return {
      authorizationUrl: paystackResult.authorizationUrl,
      reference,
      subscriptionId: savedSub.id,
    };
  }

  // ── Paystack webhook handler ────────────────────────────────────────────────

  async handleWebhook(event: string, data: Record<string, unknown>, baseUrl: string): Promise<void> {
    this.logger.log(`Paystack webhook: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.onChargeSuccess(data, baseUrl);
        break;
      case 'subscription.create':
        await this.onSubscriptionCreate(data);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(data);
        break;
      case 'subscription.disable':
        await this.onSubscriptionDisable(data);
        break;
      default:
        this.logger.debug(`Unhandled Paystack event: ${event}`);
    }
  }

  private async onChargeSuccess(data: Record<string, unknown>, baseUrl: string): Promise<void> {
    const reference = data['reference'] as string;
    const metadata = data['metadata'] as Record<string, unknown> | undefined;
    const subscriptionId = metadata?.['subscriptionId'] as string | undefined;
    const tenantId = metadata?.['tenantId'] as string | undefined;

    if (!subscriptionId || !tenantId) {
      this.logger.warn('charge.success missing subscriptionId or tenantId in metadata');
      return;
    }

    const sub = await this.subscriptionRepo.findOne({ where: { id: subscriptionId } });
    if (!sub) {
      this.logger.warn(`Subscription ${subscriptionId} not found`);
      return;
    }

    const amountKes = Math.round((data['amount'] as number) / 100);
    const customer = data['customer'] as Record<string, unknown>;

    // Calculate period: 1 month from now
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const gracePeriodEnd = new Date(periodEnd);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);

    // Activate subscription
    sub.status = SubscriptionStatus.ACTIVE;
    sub.paystackCustomerCode = customer?.['customer_code'] as string ?? null;
    sub.lastPaymentReference = reference;
    sub.lastAmountKes = amountKes;
    sub.currentPeriodEnd = periodEnd;
    sub.gracePeriodEnd = gracePeriodEnd;
    sub.activatedAt = sub.activatedAt ?? new Date();
    await this.subscriptionRepo.save(sub);

    // Activate tenant
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (tenant) {
      tenant.isActive = true;
      await this.tenantRepo.save(tenant);
    }

    // Start the WhatsApp session now that payment is confirmed
    try {
      // Find the session for this tenant (named after the slug)
      if (tenant) {
        const sessions = await this.sessionService.findAll();
        const tenantSession = sessions.find(s =>
          s.name === tenant.slug || (s.config as Record<string, unknown>)?.['tenantId'] === tenantId,
        );
        if (tenantSession && tenantSession.status !== 'ready') {
          await this.sessionService.start(tenantSession.id);
          this.logger.log(`Session started for tenant ${tenant.slug} after payment`);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not auto-start session for tenant ${tenantId}: ${String(err)}`);
    }

    this.logger.log(`Subscription ${sub.id} activated for tenant ${tenantId}, paid KES ${amountKes}`);
  }

  private async onSubscriptionCreate(data: Record<string, unknown>): Promise<void> {
    const subscriptionCode = data['subscription_code'] as string;
    const customer = data['customer'] as Record<string, unknown>;
    const customerCode = customer?.['customer_code'] as string;

    if (!subscriptionCode || !customerCode) return;

    // Find subscription by customer code (set during charge.success)
    const sub = await this.subscriptionRepo.findOne({
      where: { paystackCustomerCode: customerCode },
      order: { createdAt: 'DESC' },
    });

    if (sub) {
      sub.paystackSubscriptionCode = subscriptionCode;
      await this.subscriptionRepo.save(sub);
      this.logger.log(`Subscription code ${subscriptionCode} linked to sub ${sub.id}`);
    }
  }

  private async onPaymentFailed(data: Record<string, unknown>): Promise<void> {
    const subscriptionCode = (data['subscription'] as Record<string, unknown>)?.['subscription_code'] as string;
    if (!subscriptionCode) return;

    const sub = await this.subscriptionRepo.findOne({
      where: { paystackSubscriptionCode: subscriptionCode },
    });

    if (!sub) return;

    // Move to grace period
    sub.status = SubscriptionStatus.GRACE;
    const grace = new Date();
    grace.setDate(grace.getDate() + 3);
    sub.gracePeriodEnd = grace;
    await this.subscriptionRepo.save(sub);

    this.logger.warn(`Payment failed for sub ${sub.id} — grace period until ${grace.toISOString()}`);
    // TODO: send email notification to tenant.email
  }

  private async onSubscriptionDisable(data: Record<string, unknown>): Promise<void> {
    const subscriptionCode = (data['data'] as Record<string, unknown>)?.['subscription_code'] as string ?? data['subscription_code'] as string;
    if (!subscriptionCode) return;

    const sub = await this.subscriptionRepo.findOne({
      where: { paystackSubscriptionCode: subscriptionCode },
    });

    if (!sub) return;

    sub.status = SubscriptionStatus.CANCELLED;
    sub.cancelledAt = new Date();
    await this.subscriptionRepo.save(sub);

    // Deactivate tenant
    await this.tenantRepo.update({ id: sub.tenantId }, { isActive: false });

    this.logger.log(`Subscription ${sub.id} cancelled`);
  }

  // ── Access check ──────────────────────────────────────────────────────────

  async checkAccess(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    const sub = await this.subscriptionRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    if (!sub) {
      return { allowed: false, reason: 'No subscription found' };
    }

    const now = new Date();

    switch (sub.status) {
      case SubscriptionStatus.ACTIVE:
        if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
          // Period expired but webhook hasn't fired yet — allow grace
          return { allowed: true };
        }
        return { allowed: true };

      case SubscriptionStatus.GRACE:
        if (sub.gracePeriodEnd && sub.gracePeriodEnd > now) {
          return { allowed: true, reason: 'Grace period active — please renew' };
        }
        // Grace expired — suspend
        sub.status = SubscriptionStatus.SUSPENDED;
        await this.subscriptionRepo.save(sub);
        await this.tenantRepo.update({ id: tenantId }, { isActive: false });
        return { allowed: false, reason: 'Grace period expired — subscription suspended' };

      case SubscriptionStatus.SUSPENDED:
        return { allowed: false, reason: 'Subscription suspended — renew to restore access' };

      case SubscriptionStatus.CANCELLED:
        return { allowed: false, reason: 'Subscription cancelled' };

      case SubscriptionStatus.PENDING:
        return { allowed: false, reason: 'Payment not yet completed' };

      default:
        return { allowed: false, reason: 'Unknown subscription state' };
    }
  }

  // ── OTP login for client portal ───────────────────────────────────────────

  async sendPortalOtp(email: string): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { email } });
    if (!tenant) {
      // Don't leak whether email exists — just silently succeed
      this.logger.debug(`OTP requested for unknown email: ${email}`);
      return;
    }

    const otp = randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email, { otp, expiresAt });

    // Log OTP for now (replace with email service: SendGrid, Resend, etc.)
    this.logger.log(`[PORTAL OTP] ${email} → ${otp} (expires in 10 min)`);

    // TODO: send via email — recommended: Resend.com or SendGrid
    // await emailService.send({ to: email, subject: 'Your Zetu login code', text: `Your code: ${otp}` });
  }

  async verifyPortalOtp(email: string, otp: string): Promise<string> {
    const record = otpStore.get(email);

    if (!record) {
      throw new UnauthorizedException('No OTP found. Please request a new one.');
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      throw new UnauthorizedException('OTP has expired. Please request a new one.');
    }

    if (record.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP.');
    }

    otpStore.delete(email);

    const tenant = await this.tenantRepo.findOne({ where: { email } });
    if (!tenant) {
      throw new NotFoundException('Account not found.');
    }

    // Return a signed portal token (simple JWT-like: base64 payload + HMAC is enough here)
    // For simplicity: return a signed string tenantId:timestamp:sig
    const payload = `${tenant.id}:${Date.now()}`;
    const sig = require('crypto')
      .createHmac('sha256', process.env.API_MASTER_KEY ?? 'fallback-secret')
      .update(payload)
      .digest('hex')
      .slice(0, 16);

    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
  }

  /** Verify portal token and return tenantId */
  verifyPortalToken(token: string): string {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) throw new UnauthorizedException('Invalid token');

    const payload = Buffer.from(payloadB64, 'base64url').toString();
    const expectedSig = require('crypto')
      .createHmac('sha256', process.env.API_MASTER_KEY ?? 'fallback-secret')
      .update(payload)
      .digest('hex')
      .slice(0, 16);

    if (sig !== expectedSig) throw new UnauthorizedException('Token signature invalid');

    const [tenantId, tsStr] = payload.split(':');
    const ts = parseInt(tsStr, 10);
    const AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (Date.now() - ts > AGE_MS) throw new UnauthorizedException('Token expired');

    return tenantId;
  }

  // ── Client portal data ────────────────────────────────────────────────────

  async getPortalData(tenantId: string, baseUrl: string): Promise<PortalDataDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const sub = await this.subscriptionRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    // Find the session for this tenant
    const sessions = await this.sessionService.findAll();
    const tenantSession = sessions.find(
      s => s.name === tenant.slug || (s.config as Record<string, unknown>)?.['tenantId'] === tenantId,
    );

    // Find the API key for this tenant (scoped to their session)
    let apiKeyMasked = '(not yet created)';
    if (tenantSession) {
      try {
        const keys = await this.authService.findAll();
        const tenantKey = keys.find(
          k => k.allowedSessions?.includes(tenantSession.id),
        );
        if (tenantKey) {
          apiKeyMasked = `${tenantKey.keyPrefix}${'•'.repeat(20)}`;
        }
      } catch {
        // Non-critical
      }
    }

    const access = sub ? await this.checkAccess(tenantId) : { allowed: false, reason: 'No subscription' };
    const now = new Date();
    const daysRemaining = sub?.currentPeriodEnd
      ? Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const subscriptionStatus: SubscriptionStatusDto = sub
      ? {
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          gracePeriodEnd: sub.gracePeriodEnd?.toISOString() ?? null,
          isAccessAllowed: access.allowed,
          daysRemaining,
        }
      : {
          subscriptionId: '',
          tenantId,
          plan: BillingPlan.STARTER,
          status: SubscriptionStatus.PENDING,
          isAccessAllowed: false,
          daysRemaining: null,
        };

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      email: tenant.email ?? '',
      subscription: subscriptionStatus,
      apiKeyMasked,
      sessionId: tenantSession?.id ?? '',
      qrUrl: tenantSession ? `${baseUrl}/api/sessions/${tenantSession.id}/qr` : '',
      sessionStatus: tenantSession?.status ?? 'not_found',
      manageSubscriptionUrl: sub?.paystackSubscriptionCode
        ? `https://paystack.com/manage/${sub.paystackSubscriptionCode}`
        : undefined,
    };
  }

  // ── Admin helpers ──────────────────────────────────────────────────────────

  async listAllSubscriptions(): Promise<(Subscription & { tenantName?: string; tenantEmail?: string })[]> {
    const subs = await this.subscriptionRepo.find({ order: { createdAt: 'DESC' } });
    const tenants = await this.tenantRepo.find();
    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    return subs.map(sub => {
      const tenant = tenantMap.get(sub.tenantId);
      return Object.assign(sub, {
        tenantName: tenant?.name,
        tenantEmail: tenant?.email ?? undefined,
      });
    });
  }

  async adminExtend(subscriptionId: string, days: number): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findOne({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');

    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    base.setDate(base.getDate() + days);
    sub.currentPeriodEnd = base;

    const grace = new Date(base);
    grace.setDate(grace.getDate() + 3);
    sub.gracePeriodEnd = grace;

    if (sub.status !== SubscriptionStatus.ACTIVE) {
      sub.status = SubscriptionStatus.ACTIVE;
      await this.tenantRepo.update({ id: sub.tenantId }, { isActive: true });
    }

    return this.subscriptionRepo.save(sub);
  }

  async adminSuspend(subscriptionId: string): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findOne({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');

    sub.status = SubscriptionStatus.SUSPENDED;
    await this.tenantRepo.update({ id: sub.tenantId }, { isActive: false });
    return this.subscriptionRepo.save(sub);
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatusDto> {
    const sub = await this.subscriptionRepo.findOne({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');

    const access = await this.checkAccess(sub.tenantId);
    const now = new Date();
    const daysRemaining = sub.currentPeriodEnd
      ? Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return {
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      gracePeriodEnd: sub.gracePeriodEnd?.toISOString() ?? null,
      isAccessAllowed: access.allowed,
      daysRemaining,
    };
  }
}
