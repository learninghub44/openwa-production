import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantPlan } from './entities/tenant.entity';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  TenantProvisionedResponseDto,
} from './dto';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../session/session.service';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { createLogger } from '../../common/services/logger.service';

@Injectable()
export class TenantService {
  private readonly logger = createLogger('TenantService');

  constructor(
    @InjectRepository(Tenant, 'main')
    private readonly tenantRepository: Repository<Tenant>,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  // ── Provision ────────────────────────────────────────────────────────────────

  /**
   * Fully automated tenant provisioning in one call:
   *  1. Create tenant record
   *  2. Create WhatsApp session named after the slug
   *  3. Create a scoped OPERATOR API key locked to that session
   *  4. Optionally auto-start the session (so it immediately shows a QR)
   */
  async provision(dto: CreateTenantDto, baseUrl: string): Promise<TenantProvisionedResponseDto> {
    // 1. Guard: slug must be unique
    const existing = await this.tenantRepository.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Tenant with slug '${dto.slug}' already exists`);
    }

    // 2. Create tenant
    const tenant = this.tenantRepository.create({
      name: dto.name,
      slug: dto.slug,
      plan: dto.plan ?? TenantPlan.STARTER,
      email: dto.email ?? null,
      metadata: dto.metadata ?? null,
      isActive: true,
    });
    const savedTenant = await this.tenantRepository.save(tenant);
    this.logger.log(`Tenant created: ${savedTenant.slug}`, { tenantId: savedTenant.id });

    // 3. Create WhatsApp session (name = slug for easy identification)
    let session: Awaited<ReturnType<SessionService['create']>>;
    try {
      session = await this.sessionService.create({
        name: dto.slug,
        config: {
          tenantId: savedTenant.id,
          tenantSlug: savedTenant.slug,
          autoReconnect: true,
          maxReconnectAttempts: 10,
          reconnectBaseDelay: 5000,
        },
      });
    } catch (err: unknown) {
      // Roll back tenant if session creation fails
      await this.tenantRepository.remove(savedTenant);
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Session creation failed (tenant rolled back): ${msg}`);
    }
    this.logger.log(`Session created for tenant: ${savedTenant.slug}`, { sessionId: session.id });

    // 4. Create scoped API key locked to this session only
    const keyName = dto.apiKeyName ?? `${dto.slug}-key`;
    const { apiKey, rawKey } = await this.authService.createApiKey({
      name: keyName,
      role: ApiKeyRole.OPERATOR,
      allowedSessions: [session.id],
    });
    this.logger.log(`API key created for tenant: ${savedTenant.slug}`, { keyId: apiKey.id });

    // 5. Auto-start the session (so QR is immediately available)
    const shouldStart = dto.autoStart !== false; // default true
    let sessionStarted = false;
    if (shouldStart) {
      try {
        await this.sessionService.start(session.id);
        sessionStarted = true;
        this.logger.log(`Session auto-started for tenant: ${savedTenant.slug}`, {
          sessionId: session.id,
        });
      } catch (err: unknown) {
        // Non-fatal — tenant + session + key are still usable, caller can start manually
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Auto-start failed for tenant ${savedTenant.slug}: ${msg}`, {
          sessionId: session.id,
        });
      }
    }

    const qrUrl = `${baseUrl}/api/sessions/${session.id}/qr`;

    return {
      ...this.toResponse(savedTenant),
      sessionId: session.id,
      apiKeyId: apiKey.id,
      apiKey: rawKey,
      qrUrl,
      sessionStarted,
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(): Promise<TenantResponseDto[]> {
    const tenants = await this.tenantRepository.find({ order: { createdAt: 'DESC' } });
    return tenants.map(t => this.toResponse(t));
  }

  async findOne(id: string): Promise<TenantResponseDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant '${id}' not found`);
    return this.toResponse(tenant);
  }

  async findBySlug(slug: string): Promise<TenantResponseDto> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant slug '${slug}' not found`);
    return this.toResponse(tenant);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantResponseDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant '${id}' not found`);

    Object.assign(tenant, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.metadata !== undefined && { metadata: dto.metadata }),
    });

    const saved = await this.tenantRepository.save(tenant);
    this.logger.log(`Tenant updated: ${saved.slug}`, { tenantId: saved.id });
    return this.toResponse(saved);
  }

  /**
   * Remove a tenant. Does NOT cascade-delete sessions/keys — those are
   * owned by the data DB and the admin should clean them separately via
   * the sessions/auth APIs. This avoids accidental data loss.
   */
  async remove(id: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant '${id}' not found`);
    await this.tenantRepository.remove(tenant);
    this.logger.log(`Tenant deleted: ${tenant.slug}`, { tenantId: id });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private toResponse(t: Tenant): TenantResponseDto {
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      isActive: t.isActive,
      email: t.email,
      metadata: t.metadata,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
