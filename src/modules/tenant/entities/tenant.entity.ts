import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TenantPlan {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable business name */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** URL-safe unique identifier, e.g. "acme-corp" */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: TenantPlan.STARTER,
  })
  plan: TenantPlan;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Contact email for the tenant owner */
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** Optional metadata (billing refs, notes, etc.) */
  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
