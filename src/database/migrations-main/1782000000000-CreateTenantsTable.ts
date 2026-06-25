import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantsTable1782000000000 implements MigrationInterface {
  name = 'CreateTenantsTable1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id"        VARCHAR(36) PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "name"      VARCHAR(100) NOT NULL,
        "slug"      VARCHAR(100) NOT NULL,
        "plan"      VARCHAR(20)  NOT NULL DEFAULT 'starter',
        "isActive"  BOOLEAN      NOT NULL DEFAULT 1,
        "email"     VARCHAR(255),
        "metadata"  TEXT,
        "createdAt" DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenants_slug" ON "tenants" ("slug")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenants_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}

