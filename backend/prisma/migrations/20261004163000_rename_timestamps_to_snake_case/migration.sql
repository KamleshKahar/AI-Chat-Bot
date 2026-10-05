-- Rename the audit timestamp columns to snake_case so every column in the
-- schema follows one convention. Prisma's drift detection wanted to DROP and
-- re-ADD these columns (losing the existing rows' timestamps), so the rename is
-- written out by hand instead.

ALTER TABLE `company_profile`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `users`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `categories`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `products`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `customers`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `invoices`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `payments`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `stock_movements`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `ledger_entries`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `audit_log`
  CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);