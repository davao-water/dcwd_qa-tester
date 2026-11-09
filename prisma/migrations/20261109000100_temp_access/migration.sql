-- Temporary access: admin features an admin lends to one person for a few hours (Admin → Users). One row per person.

-- CreateTable
CREATE TABLE "TempAccess" (
    "userId" TEXT NOT NULL,
    "actions" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempAccess_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "TempAccess_expiresAt_idx" ON "TempAccess"("expiresAt");

-- CreateIndex
CREATE INDEX "TempAccess_grantedById_idx" ON "TempAccess"("grantedById");

-- AddForeignKey
ALTER TABLE "TempAccess" ADD CONSTRAINT "TempAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempAccess" ADD CONSTRAINT "TempAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Like every table: no access through Supabase's public API (CLAUDE.md rule 6).
ALTER TABLE "TempAccess" ENABLE ROW LEVEL SECURITY;
