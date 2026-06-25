import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantService } from './tenant.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  TenantProvisionedResponseDto,
} from './dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('tenants')
@Controller('tenants')
@RequireRole(ApiKeyRole.ADMIN)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @ApiOperation({
    summary: 'Provision a new tenant (ADMIN)',
    description:
      'Creates tenant + WhatsApp session + scoped API key in one atomic call. ' +
      'Returns the raw API key (shown once) and the QR URL for WhatsApp linking.',
  })
  @ApiResponse({ status: 201, description: 'Tenant provisioned', type: TenantProvisionedResponseDto })
  @ApiResponse({ status: 409, description: 'Slug already taken' })
  async provision(
    @Body() dto: CreateTenantDto,
    @Req() req: Request,
  ): Promise<TenantProvisionedResponseDto> {
    const baseUrl = this.resolveBaseUrl(req);
    return this.tenantService.provision(dto, baseUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants (ADMIN)' })
  @ApiResponse({ status: 200, type: [TenantResponseDto] })
  async findAll(): Promise<TenantResponseDto[]> {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Get tenant by ID (ADMIN)' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string): Promise<TenantResponseDto> {
    return this.tenantService.findOne(id);
  }

  @Get('by-slug/:slug')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOperation({ summary: 'Get tenant by slug (ADMIN)' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findBySlug(@Param('slug') slug: string): Promise<TenantResponseDto> {
    return this.tenantService.findBySlug(slug);
  }

  @Put(':id')
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Update tenant (ADMIN)' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Delete tenant record (ADMIN) — sessions/keys must be cleaned separately' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.tenantService.remove(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private resolveBaseUrl(req: Request): string {
    if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol ?? 'http';
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost';
    return `${proto}://${host}`;
  }
}
