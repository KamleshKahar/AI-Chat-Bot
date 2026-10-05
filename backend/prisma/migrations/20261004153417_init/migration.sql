-- CreateTable
CREATE TABLE `company_profile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(160) NOT NULL,
    `tagline` VARCHAR(255) NULL,
    `gstin` VARCHAR(15) NULL,
    `pan` VARCHAR(10) NULL,
    `email` VARCHAR(160) NULL,
    `phone` VARCHAR(40) NULL,
    `address` VARCHAR(255) NULL,
    `city` VARCHAR(80) NULL,
    `state` VARCHAR(80) NULL,
    `pincode` VARCHAR(6) NULL,
    `bankName` VARCHAR(120) NULL,
    `bankAccount` VARCHAR(40) NULL,
    `ifscCode` VARCHAR(20) NULL,
    `upiId` VARCHAR(120) NULL,
    `invoicePrefix` VARCHAR(10) NOT NULL DEFAULT 'INV',
    `invoiceTerms` TEXT NULL,
    `paymentTermDays` INTEGER NOT NULL DEFAULT 15,
    `financialYearFrom` INTEGER NOT NULL DEFAULT 4,
    `logoUrl` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(160) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `role` ENUM('ADMIN', 'MANAGER', 'CASHIER', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `phone` VARCHAR(40) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_sequences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prefix` VARCHAR(20) NOT NULL,
    `period` VARCHAR(16) NOT NULL,
    `last_number` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `uq_sequence_prefix_period`(`prefix`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `short_code` VARCHAR(20) NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `categories_code_key`(`code`),
    UNIQUE INDEX `categories_name_key`(`name`),
    INDEX `categories_is_active_deleted_at_idx`(`is_active`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `sku` VARCHAR(40) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(20) NOT NULL DEFAULT 'pcs',
    `hsn_code` VARCHAR(12) NULL,
    `mrp` DECIMAL(14, 2) NOT NULL,
    `selling_price` DECIMAL(14, 2) NOT NULL,
    `cost_price` DECIMAL(14, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `stock_quantity` INTEGER NOT NULL DEFAULT 0,
    `min_stock_level` INTEGER NOT NULL DEFAULT 10,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `products_code_key`(`code`),
    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `idx_products_category`(`category_id`),
    INDEX `idx_products_name`(`name`),
    INDEX `idx_products_stock`(`stock_quantity`),
    INDEX `idx_products_active`(`is_active`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `company` VARCHAR(160) NULL,
    `email` VARCHAR(160) NULL,
    `phone` VARCHAR(40) NULL,
    `address` VARCHAR(255) NULL,
    `city` VARCHAR(80) NULL,
    `state` VARCHAR(80) NULL,
    `pincode` VARCHAR(6) NULL,
    `gstin` VARCHAR(15) NULL,
    `credit_limit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `joined_at` DATE NOT NULL DEFAULT (CURRENT_DATE),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `customers_code_key`(`code`),
    UNIQUE INDEX `customers_gstin_key`(`gstin`),
    INDEX `idx_customers_status`(`status`, `deleted_at`),
    INDEX `idx_customers_name`(`name`),
    INDEX `idx_customers_joined`(`joined_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_number` VARCHAR(32) NOT NULL,
    `sale_code` VARCHAR(32) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `invoice_date` DATE NOT NULL,
    `due_date` DATE NOT NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `discount_type` ENUM('percent', 'flat') NOT NULL DEFAULT 'percent',
    `discount_value` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `taxable_amount` DECIMAL(14, 2) NOT NULL,
    `tax_type` ENUM('CGST_SGST', 'IGST') NOT NULL DEFAULT 'CGST_SGST',
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `cgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `sgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `igst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `shipping_charges` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(14, 2) NOT NULL,
    `paid_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `balance_due` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `payment_status` ENUM('PENDING', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'PENDING',
    `paymentMethod` ENUM('UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'COD') NOT NULL DEFAULT 'UPI',
    `status` ENUM('DRAFT', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    `notes` TEXT NULL,
    `terms` TEXT NULL,
    `snapshot_name` VARCHAR(160) NULL,
    `snapshot_company` VARCHAR(160) NULL,
    `snapshot_email` VARCHAR(160) NULL,
    `snapshot_phone` VARCHAR(40) NULL,
    `snapshot_address` VARCHAR(255) NULL,
    `snapshot_city` VARCHAR(80) NULL,
    `snapshot_state` VARCHAR(80) NULL,
    `snapshot_pincode` VARCHAR(6) NULL,
    `snapshot_gstin` VARCHAR(15) NULL,
    `created_by` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `invoices_invoice_number_key`(`invoice_number`),
    UNIQUE INDEX `invoices_sale_code_key`(`sale_code`),
    INDEX `idx_invoices_customer`(`customer_id`),
    INDEX `idx_invoices_date`(`invoice_date`),
    INDEX `idx_invoices_pstatus`(`payment_status`),
    INDEX `idx_invoices_date_total`(`invoice_date`, `grand_total`),
    INDEX `idx_invoices_deleted`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(40) NOT NULL,
    `unit` VARCHAR(20) NULL,
    `hsn_code` VARCHAR(12) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `taxable_value` DECIMAL(14, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) NOT NULL,
    `cgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `sgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `igst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(14, 2) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_items_invoice`(`invoice_id`),
    INDEX `idx_items_product`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_code` VARCHAR(24) NOT NULL,
    `invoice_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `payment_method` ENUM('UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'COD') NOT NULL,
    `reference` VARCHAR(80) NULL,
    `paid_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(255) NULL,
    `created_by` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payments_payment_code_key`(`payment_code`),
    INDEX `idx_payments_invoice`(`invoice_id`),
    INDEX `idx_payments_customer`(`customer_id`),
    INDEX `idx_payments_paid_at`(`paid_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `type` ENUM('OPENING', 'SALE', 'PURCHASE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN', 'DAMAGE') NOT NULL,
    `quantity_delta` INTEGER NOT NULL,
    `stock_after` INTEGER NOT NULL,
    `unit_cost` DECIMAL(14, 2) NULL,
    `reference_type` ENUM('INVOICE', 'ADJUSTMENT', 'PURCHASE', 'RETURN') NULL,
    `reference_id` VARCHAR(32) NULL,
    `reason` VARCHAR(120) NULL,
    `notes` VARCHAR(255) NULL,
    `created_by` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_moves_product`(`product_id`, `createdAt`),
    INDEX `idx_moves_reference`(`reference_type`, `reference_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledger_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entry_code` VARCHAR(24) NOT NULL,
    `entry_date` DATE NOT NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `type` ENUM('SALE_PAYMENT', 'PURCHASE_PAYMENT', 'EXPENSE', 'ADJUSTMENT', 'REFUND', 'OPENING') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `payment_method` ENUM('UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'COD') NULL,
    `reference` VARCHAR(80) NULL,
    `customer_id` INTEGER NULL,
    `invoice_id` INTEGER NULL,
    `supplier_name` VARCHAR(160) NULL,
    `status` ENUM('SUCCESS', 'PENDING', 'FAILED') NOT NULL DEFAULT 'SUCCESS',
    `notes` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ledger_entries_entry_code_key`(`entry_code`),
    INDEX `idx_ledger_date`(`entry_date`),
    INDEX `idx_ledger_customer`(`customer_id`),
    INDEX `idx_ledger_invoice`(`invoice_id`),
    INDEX `idx_ledger_type`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_user_id` INTEGER NULL,
    `action` VARCHAR(40) NOT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(40) NULL,
    `before_json` LONGTEXT NULL,
    `after_json` LONGTEXT NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_audit_entity`(`entity_type`, `entity_id`),
    INDEX `idx_audit_actor`(`actor_user_id`),
    INDEX `idx_audit_created`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
