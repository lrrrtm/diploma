-- Migration: replace init_secret with reg_pin + display_pin on tablets table
-- Run once on the production DB before deploying the updated backend.

ALTER TABLE tablets
  DROP COLUMN IF EXISTS init_secret,
  ADD COLUMN reg_pin     VARCHAR(6)  NOT NULL DEFAULT '' AFTER id,
  ADD COLUMN display_pin VARCHAR(6)  NOT NULL DEFAULT '' AFTER reg_pin;

-- After adding columns, generate unique 6-digit PINs for existing rows:
UPDATE tablets t
JOIN (
  SELECT id,
         LPAD(FLOOR(RAND() * 1000000), 6, '0') AS rp,
         LPAD(FLOOR(RAND() * 1000000), 6, '0') AS dp
  FROM tablets
) gen ON t.id = gen.id
SET t.reg_pin = gen.rp, t.display_pin = gen.dp;

-- Add unique indexes
ALTER TABLE tablets
  ADD UNIQUE INDEX uq_tablets_reg_pin (reg_pin),
  ADD UNIQUE INDEX uq_tablets_display_pin (display_pin);
