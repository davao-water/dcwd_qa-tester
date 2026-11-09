-- Which role a member plays in this module: as its UI/UX designer instead of their account's role (Team & modules,
-- Members). Only for people with the Designer tick-box. Starts off for everyone. AreaMember already has RLS on.

-- AlterTable
ALTER TABLE "AreaMember" ADD COLUMN "asDesigner" BOOLEAN NOT NULL DEFAULT false;
