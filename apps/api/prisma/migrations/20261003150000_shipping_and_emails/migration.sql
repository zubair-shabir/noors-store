-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimated_delivery" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "next_attempt_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "send_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emails_dedupe_key_key" ON "emails"("dedupe_key");

-- CreateIndex
CREATE INDEX "emails_status_send_after_idx" ON "emails"("status", "send_after");

-- CreateIndex
CREATE INDEX "emails_order_id_idx" ON "emails"("order_id");

-- CreateIndex
CREATE INDEX "shipments_status_next_attempt_at_idx" ON "shipments"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one live shipment per order, so two workers can't book the same order twice.
CREATE UNIQUE INDEX "shipments_one_open_per_order" ON "shipments"("order_id") WHERE "status" <> 'CANCELLED';
