import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { BillingPlan, SubscriptionStatus, PLAN_PRICES_KES, PLAN_LIMITS } from '../entities/subscription.entity';

// ── Request DTOs ─────────────────────────────────────────────────────────────

export class InitializePaymentDto {
  @ApiProperty({ description: 'Business / client name', example: 'Acme Corp' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Client email — used for Paystack and OTP login', example: 'client@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: BillingPlan, example: BillingPlan.STARTER })
  @IsEnum(BillingPlan)
  plan: BillingPlan;

  @ApiPropertyOptional({ description: 'Optional business slug; auto-generated if omitted' })
  @IsOptional()
  @IsString()
  slug?: string;
}

export class PortalLoginDto {
  @ApiProperty({ description: 'Email address the tenant signed up with' })
  @IsEmail()
  email: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit OTP' })
  @IsString()
  otp: string;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class PlanInfoDto {
  @ApiProperty({ enum: BillingPlan }) plan: BillingPlan;
  @ApiProperty() priceKes: number;
  @ApiProperty() sessions: number;
  @ApiProperty() messagesPerDay: number;
  @ApiProperty() description: string;
}

export class InitializePaymentResponseDto {
  @ApiProperty({ description: 'Paystack authorization URL to redirect / popup to' })
  authorizationUrl: string;

  @ApiProperty({ description: 'Paystack payment reference — store to verify later' })
  reference: string;

  @ApiProperty({ description: 'Pending subscription ID' })
  subscriptionId: string;
}

export class SubscriptionStatusDto {
  @ApiProperty() subscriptionId: string;
  @ApiProperty() tenantId: string;
  @ApiProperty({ enum: BillingPlan }) plan: BillingPlan;
  @ApiProperty({ enum: SubscriptionStatus }) status: SubscriptionStatus;
  @ApiPropertyOptional() currentPeriodEnd?: string | null;
  @ApiPropertyOptional() gracePeriodEnd?: string | null;
  @ApiProperty() isAccessAllowed: boolean;
  @ApiPropertyOptional() daysRemaining?: number | null;
}

export class PortalDataDto {
  @ApiProperty() tenantId: string;
  @ApiProperty() tenantName: string;
  @ApiProperty() tenantSlug: string;
  @ApiProperty() email: string;
  @ApiProperty({ type: SubscriptionStatusDto }) subscription: SubscriptionStatusDto;
  @ApiProperty({ description: 'API key (masked except prefix)' }) apiKeyMasked: string;
  @ApiProperty({ description: 'Session ID for WhatsApp QR' }) sessionId: string;
  @ApiProperty({ description: 'QR URL to scan' }) qrUrl: string;
  @ApiProperty({ description: 'Session status' }) sessionStatus: string;
  @ApiPropertyOptional({ description: 'Paystack manage subscription link' }) manageSubscriptionUrl?: string;
}

export class PlansResponseDto {
  @ApiProperty({ type: [PlanInfoDto] }) plans: PlanInfoDto[];
}

// ── Plan metadata helper ──────────────────────────────────────────────────────

const PLAN_DESCRIPTIONS: Record<BillingPlan, string> = {
  [BillingPlan.STARTER]:    '1 WhatsApp number, up to 500 messages/day. Perfect for small businesses.',
  [BillingPlan.GROWTH]:     '3 WhatsApp numbers, up to 2,000 messages/day. For growing teams.',
  [BillingPlan.PRO]:        '10 WhatsApp numbers, unlimited messages. Built for agencies.',
  [BillingPlan.ENTERPRISE]: 'Unlimited numbers & messages. Custom support included.',
};

export function buildPlanInfo(): PlanInfoDto[] {
  return Object.values(BillingPlan).map((plan) => {
    const limits = PLAN_LIMITS[plan];
    return {
      plan,
      priceKes: PLAN_PRICES_KES[plan],
      sessions: limits.sessions,
      messagesPerDay: limits.messagesPerDay,
      description: PLAN_DESCRIPTIONS[plan],
    };
  });
}
