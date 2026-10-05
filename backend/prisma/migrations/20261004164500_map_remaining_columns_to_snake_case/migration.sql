-- Map the remaining camelCase columns to snake_case so the whole schema follows
-- one convention and the hand-written raw SQL in src/repositories can reference
-- snake_case columns directly.

ALTER TABLE `invoices`
  CHANGE COLUMN `paymentMethod` `payment_method` ENUM('UPI','CASH','BANK_TRANSFER','CHEQUE','CREDIT_CARD','COD') NOT NULL DEFAULT 'UPI';

ALTER TABLE `company_profile`
  CHANGE COLUMN `bankName` `bank_name` VARCHAR(120) NULL,
  CHANGE COLUMN `bankAccount` `bank_account` VARCHAR(40) NULL,
  CHANGE COLUMN `ifscCode` `ifsc_code` VARCHAR(20) NULL,
  CHANGE COLUMN `upiId` `upi_id` VARCHAR(120) NULL,
  CHANGE COLUMN `invoicePrefix` `invoice_prefix` VARCHAR(10) NOT NULL DEFAULT 'INV',
  CHANGE COLUMN `invoiceTerms` `invoice_terms` TEXT NULL,
  CHANGE COLUMN `paymentTermDays` `payment_term_days` INT NOT NULL DEFAULT 15,
  CHANGE COLUMN `financialYearFrom` `financial_year_from` INT NOT NULL DEFAULT 4,
  CHANGE COLUMN `logoUrl` `logo_url` VARCHAR(255) NULL;