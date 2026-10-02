-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "access_token_hash" TEXT,
ADD COLUMN     "cart_id" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_idx" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_access_token_hash_key" ON "orders"("access_token_hash");

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Order numbers shown to customers (NR-100001, NR-100002, ...).
CREATE SEQUENCE "order_number_seq" START 100001;

-- A coupon can't be used more times than its limit allows.
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_used_count_check" CHECK ("used_count" >= 0 AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit"));
