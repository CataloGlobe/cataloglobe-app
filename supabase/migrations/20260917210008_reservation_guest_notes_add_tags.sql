-- FASE 5.3 — i tag seguono la nota: per sede. «abituale» non e' un fatto
-- sull'azienda, e' un fatto sulla sede (uno e' di casa in un locale e non ha
-- mai messo piede nell'altro); «VIP» e «tavolo tranquillo» sono giudizi.
-- Tutti e tre hanno senso solo dentro un locale. Tag tenant-wide e note per
-- sede sarebbero due regole opposte sullo stesso oggetto. Zero tag in uso al
-- momento della migration (staging 2026-09-17; produzione da confermare
-- PRIMA che il DROP COLUMN 20260917210013 arrivi la').
ALTER TABLE public.reservation_guest_notes
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
