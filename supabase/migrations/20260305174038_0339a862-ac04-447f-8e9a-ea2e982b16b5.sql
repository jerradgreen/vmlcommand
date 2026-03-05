DELETE FROM leads WHERE id IN (
  SELECT id FROM leads
  WHERE lower(name) LIKE '%gregory goldschmidt%'
  AND submitted_at > '2026-03-04 16:30:00'
);