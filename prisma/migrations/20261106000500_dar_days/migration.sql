-- My DAR: each day's status (Present, Rest day, Leave…; from a pasted ERP attendance log or picked by hand) and what QA
-- Hub last wrote in each cell from ticket work, so it can update that entry without touching what the person typed.
-- DarReport already has RLS on.

-- AlterTable
ALTER TABLE "DarReport" ADD COLUMN "days" JSONB,
ADD COLUMN "autoCells" JSONB;
