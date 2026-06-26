import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Headers,

  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { PaystackService, PaystackEvent } from './paystack.service';
import {
  InitializePaymentDto,
  InitializePaymentResponseDto,
  PortalDataDto,
  PlansResponseDto,
  PortalLoginDto,
  VerifyOtpDto,
  SubscriptionStatusDto,
} from './dto';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { createLogger } from '../../common/services/logger.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  private readonly logger = createLogger('BillingController');

  constructor(
    private readonly billingService: BillingService,
    private readonly paystackService: PaystackService,
  ) {}

  // ── Public: plan listing ──────────────────────────────────────────────────

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List available plans and pricing (public)' })
  @ApiResponse({ status: 200, type: PlansResponseDto })
  getPlans(): PlansResponseDto {
    return { plans: this.billingService.getPlans() };
  }

  // ── Public: payment initialization ───────────────────────────────────────

  @Post('initialize')
  @Public()
  @ApiOperation({
    summary: 'Start a new client subscription (public)',
    description:
      'Creates a pending tenant + subscription, then returns a Paystack authorization URL. ' +
      'Redirect the client to authorizationUrl — on success Paystack posts to /billing/webhook.',
  })
  @ApiResponse({ status: 201, type: InitializePaymentResponseDto })
  async initializePayment(
    @Body() dto: InitializePaymentDto,
    @Req() req: Request,
  ): Promise<InitializePaymentResponseDto> {
    const baseUrl = this.resolveBaseUrl(req);
    return this.billingService.initializePayment(dto, baseUrl);
  }

  // ── Public: Paystack webhook ──────────────────────────────────────────────

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack webhook receiver (public — Paystack only)',
    description: 'Verifies Paystack HMAC signature then processes the event.',
  })
  @ApiHeader({ name: 'x-paystack-signature', description: 'HMAC-SHA512 of raw body' })
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(req.body);

    if (!this.paystackService.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Paystack webhook signature mismatch — rejected');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = req.body as PaystackEvent;
    const baseUrl = this.resolveBaseUrl(req);

    // Process async; respond 200 immediately so Paystack doesn't retry
    void this.billingService.handleWebhook(event.event, event.data, baseUrl).catch((err: unknown) => {
      this.logger.error(`Webhook processing error: ${String(err)}`);
    });

    return { received: true };
  }

  // ── Public: client portal login ───────────────────────────────────────────

  @Post('portal/login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP for client portal (public)',
    description: 'Sends a 6-digit OTP to the tenant email. Always returns 200 to prevent email enumeration.',
  })
  async requestOtp(@Body() dto: PortalLoginDto): Promise<{ message: string }> {
    await this.billingService.sendPortalOtp(dto.email);
    return { message: 'If an account exists for this email, a login code has been sent.' };
  }

  @Post('portal/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and get portal access token (public)',
  })
  @ApiResponse({ status: 200, schema: { properties: { token: { type: 'string' } } } })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<{ token: string }> {
    const token = await this.billingService.verifyPortalOtp(dto.email, dto.otp);
    return { token };
  }

  // ── Public: client portal data ────────────────────────────────────────────

  @Get('portal/me')
  @Public()
  @ApiOperation({
    summary: 'Get client portal data (portal token required in Authorization header)',
  })
  @ApiHeader({ name: 'x-portal-token', description: 'Token from /billing/portal/verify' })
  @ApiResponse({ status: 200, type: PortalDataDto })
  async getPortalData(
    @Headers('x-portal-token') token: string,
    @Req() req: Request,
  ): Promise<PortalDataDto> {
    if (!token) throw new UnauthorizedException('Portal token required');
    const tenantId = this.billingService.verifyPortalToken(token);
    const baseUrl = this.resolveBaseUrl(req);
    return this.billingService.getPortalData(tenantId, baseUrl);
  }

  // Also allow callback with ?ref= to auto-verify after Paystack redirect
  @Get('portal/callback')
  @Public()
  @ApiOperation({ summary: 'Post-payment callback — verify payment and return subscription status' })
  async paymentCallback(
    @Query('sub') subscriptionId: string,
    @Req() req: Request,
  ): Promise<SubscriptionStatusDto> {
    if (!subscriptionId) throw new BadRequestException('Missing sub parameter');
    return this.billingService.getSubscriptionStatus(subscriptionId);
  }

  // ── Admin routes ──────────────────────────────────────────────────────────

  @Get('subscriptions')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'List all subscriptions (ADMIN)' })
  async listSubscriptions() {
    return this.billingService.listAllSubscriptions();
  }

  @Get('subscriptions/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiOperation({ summary: 'Get subscription status (ADMIN)' })
  async getSubscription(@Param('id') id: string): Promise<SubscriptionStatusDto> {
    return this.billingService.getSubscriptionStatus(id);
  }

  @Put('subscriptions/:id/extend')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiOperation({ summary: 'Manually extend subscription by N days (ADMIN)' })
  async extendSubscription(
    @Param('id') id: string,
    @Body() body: { days: number },
  ) {
    if (!body.days || body.days < 1) throw new BadRequestException('days must be >= 1');
    return this.billingService.adminExtend(id, body.days);
  }

  @Put('subscriptions/:id/suspend')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiOperation({ summary: 'Manually suspend a subscription (ADMIN)' })
  async suspendSubscription(@Param('id') id: string) {
    return this.billingService.adminSuspend(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private resolveBaseUrl(req: Request): string {
    if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol ?? 'http';
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost';
    return `${proto}://${host}`;
  }
}
