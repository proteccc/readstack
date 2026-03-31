-- Enable Row Level Security on all tables.
--
-- Run this once after `prisma db push` when setting up a new Supabase project.
-- RLS prevents direct access to your data via Supabase's public REST API using
-- the anon key. Your app is unaffected — Prisma connects via the service role
-- which bypasses RLS entirely.
--
-- In Supabase: SQL Editor → paste this → Run

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryDestination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;
