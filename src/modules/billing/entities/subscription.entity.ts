import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SubscriptionStatus {
  PENDING   = 'pending',    // payment not yet completed
  ACTIVE    = 'active',     // paid and within period
  GRACE     = 'grace',      // payment failed, 3-day grace window
  SUSPENDED = 'suspended',  // grace expired, session blocked
  CANCELLED = 'cancelled',  // explicitly cancelled
}

export enum BillingPlan {
  STARTER    = 'starter',
  GROWTH     = 'growth',
  PRO        = 'pro',
  ENTERPRISE = 'enterprise',
}

export const PLAN_PRICES_KES: Record<BillingPlan, number> = {
  [BillingPlan.STARTER]:    1500,
  [BillingPlan.GROWTH]:     3500,
  [BillingPlan.PRO]:        7000,
  [BillingPlan.ENTERPRISE]: 15000,
};

export const PLAN_LIMITS: Record<BillingPlan, { sessions: number; messagesPerDay: number }> = {
  [BillingPlan.STARTER]:    { sessions: 1,         messagesPerDay: 500 },
  [BillingPlan.GROWTH]:     { sessions: 3,         messagesPerDay: 2000 },
  [BillingPlan.PRO]:        { sessions: 10,        messagesPerDay: -1 },   // -1 = unlimited
  [BillingPlan.ENTERPRISE]: { sessions: -1,        messagesPerDay: -1 },
};

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Foreign key to tenants.id */
  @Index()
  @Column({ type: 'varchar', length: 36 })
  tenantId: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: BillingPlan.STARTER,
  })
  plan: BillingPlan;

  @Column({
    type: 'varchar',
    length: 20,
    default: SubscriptionStatus.PENDING,
  })
  status: SubscriptionStatus;

  // ── Paystack refs ───────────────────────────────────────────────────────────

  /** Paystack customer code, e.g. CUS_xxxxx */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paystackCustomerCode: string | null;

  /** Paystack subscription code for recurring billing, e.g. SUB_xxxxx */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paystackSubscriptionCode: string | null;

  /** Paystack plan code, e.g. PLN_xxxxx */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paystackPlanCode: string | null;

  /** The reference of the most recent successful charge */
  @Column({ type: 'varchar', length: 100, nullable: true })
  lastPaymentReference: string | null;

  /** Amount actually charged in KES (kobo / smallest unit from Paystack ÷ 100) */
  @Column({ type: 'int', nullable: true })
  lastAmountKes: number | null;

  // ── Dates ───────────────────────────────────────────────────────────────────

  /** When the current paid period ends */
  @Column({ type: 'datetime', nullable: true })
  currentPeriodEnd: Date | null;

  /** 3-day buffer after period end before hard suspension */
  @Column({ type: 'datetime', nullable: true })
  gracePeriodEnd: Date | null;

  /** When the subscription was first activated */
  @Column({ type: 'datetime', nullable: true })
  activatedAt: Date | null;

  /** When it was cancelled */
  @Column({ type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
