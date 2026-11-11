-- AlterTable
ALTER TABLE `customers` MODIFY `joined_at` DATE NOT NULL DEFAULT (CURRENT_DATE);

-- AlterTable
ALTER TABLE `invoices` ADD COLUMN `credited_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `stock_movements` MODIFY `reference_type` ENUM('INVOICE', 'ADJUSTMENT', 'PURCHASE', 'RETURN', 'CREDIT_NOTE') NULL;

-- CreateTable
CREATE TABLE `credit_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `credit_note_number` VARCHAR(32) NOT NULL,
    `invoice_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `credit_date` DATE NOT NULL,
    `reason` VARCHAR(255) NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `taxable_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_type` ENUM('CGST_SGST', 'IGST') NOT NULL DEFAULT 'CGST_SGST',
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `cgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `sgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `igst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `snapshot_name` VARCHAR(160) NULL,
    `snapshot_company` VARCHAR(160) NULL,
    `snapshot_gstin` VARCHAR(15) NULL,
    `snapshot_state` VARCHAR(80) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `credit_notes_credit_note_number_key`(`credit_note_number`),
    INDEX `idx_credit_notes_invoice`(`invoice_id`),
    INDEX `idx_credit_notes_customer`(`customer_id`),
    INDEX `idx_credit_notes_date`(`credit_date`),
    INDEX `idx_credit_notes_deleted`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_note_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `credit_note_id` INTEGER NOT NULL,
    `invoice_item_id` INTEGER NULL,
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

    INDEX `idx_credit_note_items_note`(`credit_note_id`),
    INDEX `idx_credit_note_items_line`(`invoice_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_note_items` ADD CONSTRAINT `credit_note_items_credit_note_id_fkey` FOREIGN KEY (`credit_note_id`) REFERENCES `credit_notes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_note_items` ADD CONSTRAINT `credit_note_items_invoice_item_id_fkey` FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_note_items` ADD CONSTRAINT `credit_note_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
