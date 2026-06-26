import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionsTable1782100000000 implements MigrationInterface {
  name = 'CreateSubscriptionsTable1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id"                        VARCHAR(36)  PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
        "tenantId"                  VARCHAR(36)  NOT NULL,
        "plan"                      VARCHAR(20)  NOT NULL DEFAULT 'starter',
        "status"                    VARCHAR(20)  NOT NULL DEFAULT 'pending',
        "paystackCustomerCode"      VARCHAR(100),
        "paystackSubscriptionCode"  VARCHAR(100),
        "paystackPlanCode"          VARCHAR(100),
        "lastPaymentReference"      VARCHAR(100),
        "lastAmountKes"             INTEGER,
        "currentPeriodEnd"          DATETIME,
        "gracePeriodEnd"            DATETIME,
        "activatedAt"               DATETIME,
        "cancelledAt"               DATETIME,
        "createdAt"                 DATETIME    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        "updatedAt"                 DATETIME    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_tenantId" ON "subscriptions" ("tenantId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_paystackSubscriptionCode"
        ON "subscriptions" ("paystackSubscriptionCode")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_paystackCustomerCode"
        ON "subscriptions" ("paystackCustomerCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
  }
}
