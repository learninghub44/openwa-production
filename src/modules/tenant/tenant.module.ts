import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [
    // Tenant records live in the `main` SQLite DB alongside api_keys/audit_logs
    TypeOrmModule.forFeature([Tenant], 'main'),
    SessionModule,
  ],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
