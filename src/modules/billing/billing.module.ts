import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PaystackService } from './paystack.service';
import { TenantModule } from '../tenant/tenant.module';
import { SessionModule } from '../session/session.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Tenant], 'main'),
    TenantModule,
    SessionModule,
    AuthModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, PaystackService],
  exports: [BillingService],
})
export class BillingModule {}
