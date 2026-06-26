import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { BillingPlan, PLAN_PRICES_KES } from './entities/subscription.entity';

export interface PaystackInitResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger('PaystackService');
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY is not set — billing will not work');
    }
  }

  /** Verify Paystack webhook signature */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const hash = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }

  /** Create or fetch a Paystack customer */
  async upsertCustomer(email: string, name: string): Promise<string> {
    const res = await this.post<{ customer_code: string }>('/customer', { email, first_name: name });
    return res.customer_code;
  }

  /**
   * Initialize a one-time charge that also sets up a recurring subscription.
   * We use Paystack's transaction/initialize which supports plan codes for auto-recurring.
   */
  async initializeTransaction(opts: {
    email: string;
    plan: BillingPlan;
    planCode: string;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<PaystackInitResponse> {
    const amountKobo = PLAN_PRICES_KES[opts.plan] * 100; // Paystack uses kobo (1 KES = 100 kobo)

    const res = await this.post<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', {
      email: opts.email,
      amount: amountKobo,
      plan: opts.planCode,
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      currency: 'KES',
      metadata: opts.metadata,
    });

    return {
      authorizationUrl: res.authorization_url,
      accessCode: res.access_code,
      reference: res.reference,
    };
  }

  /** Verify a transaction by reference */
  async verifyTransaction(reference: string): Promise<{
    status: string;
    amount: number;
    customerCode: string;
    subscriptionCode: string | null;
    paidAt: string;
  }> {
    const res = await this.get<{
      status: string;
      amount: number;
      paid_at: string;
      customer: { customer_code: string };
      subscription: { subscription_code: string } | null;
    }>(`/transaction/verify/${reference}`);

    return {
      status: res.status,
      amount: res.amount,
      customerCode: res.customer?.customer_code,
      subscriptionCode: res.subscription?.subscription_code ?? null,
      paidAt: res.paid_at,
    };
  }

  /** Get the Paystack plan code for a given plan tier.
   *  Plans must be pre-created in your Paystack dashboard and their codes
   *  stored in env vars: PAYSTACK_PLAN_STARTER, PAYSTACK_PLAN_GROWTH, etc.
   */
  getPlanCode(plan: BillingPlan): string {
    const key = `PAYSTACK_PLAN_${plan.toUpperCase()}`;
    const code = this.configService.get<string>(key, '');
    if (!code) {
      throw new BadRequestException(
        `Paystack plan code for '${plan}' is not configured. Set ${key} in your environment.`,
      );
    }
    return code;
  }

  /** Generate a unique payment reference */
  generateReference(prefix = 'zetu'): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${ts}_${rand}`.toUpperCase();
  }

  // ── Private HTTP helpers ──────────────────────────────────────────────────

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json() as { status: boolean; message: string; data: T };
    if (!json.status) {
      this.logger.error(`Paystack POST ${path} failed: ${json.message}`);
      throw new BadRequestException(`Paystack error: ${json.message}`);
    }
    return json.data;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });

    const json = await res.json() as { status: boolean; message: string; data: T };
    if (!json.status) {
      this.logger.error(`Paystack GET ${path} failed: ${json.message}`);
      throw new BadRequestException(`Paystack error: ${json.message}`);
    }
    return json.data;
  }
}
