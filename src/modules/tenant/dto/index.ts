import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  MaxLength,
  MinLength,
  Matches,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { TenantPlan } from '../entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({ description: 'Business / client name', example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'URL-safe slug (letters, numbers, hyphens). Used as the session name.',
    example: 'acme-corp',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug may only contain lowercase letters, numbers, and hyphens' })
  slug: string;

  @ApiPropertyOptional({ enum: TenantPlan, default: TenantPlan.STARTER })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @ApiPropertyOptional({ example: 'client@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Free-form metadata (billing id, notes…)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** Label for the auto-created API key, defaults to "<slug>-key" */
  @ApiPropertyOptional({ example: 'acme-corp-key' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apiKeyName?: string;

  /** Whether to immediately start the WhatsApp session after creation */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: TenantPlan })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class TenantResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ enum: TenantPlan }) plan: TenantPlan;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional() email?: string | null;
  @ApiPropertyOptional() metadata?: Record<string, unknown> | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/** Returned only on POST /tenants — includes the raw API key (shown once) */
export class TenantProvisionedResponseDto extends TenantResponseDto {
  @ApiProperty({ description: 'WhatsApp session ID created for this tenant' })
  sessionId: string;

  @ApiProperty({ description: 'Scoped API key ID' })
  apiKeyId: string;

  @ApiProperty({ description: 'Raw API key — save this, it is shown ONCE', example: 'owa_k1_...' })
  apiKey: string;

  @ApiProperty({ description: 'QR code URL — share with tenant to scan WhatsApp' })
  qrUrl: string;

  @ApiProperty({ description: 'Whether the session was auto-started' })
  sessionStarted: boolean;
}
