-- Team Lead: a tick-box on the account (like Designer) that lets a QA tester or developer manage Team & modules (add,
-- edit, hide and delete modules and set their members). Users stays admin-only. The User table already has RLS on.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "teamLead" BOOLEAN NOT NULL DEFAULT false;
