-- Facturation, lot 2 : le brouillon devient une etape visible.
--
-- Le parcours passe en deux temps : « Creer le brouillon » (il reste dans
-- Pennylane, ou il peut etre relu), puis « Finaliser et envoyer ». Entre les
-- deux, la vente porte le statut `brouillon`.
--
--   statut  en_cours  : une operation est en route (verrou de deux minutes)
--           brouillon : le brouillon existe dans Pennylane, rien n'est emis
--           emise     : la facture est definitive et porte un numero
--           erreur    : la derniere tentative a echoue avant le brouillon
--
-- Un brouillon connu de Baikal porte toujours l'identifiant de sa facture.
-- Aucune donnee n'est ecrite. Rejouable sans effet.

ALTER TABLE admin.factures DROP CONSTRAINT IF EXISTS factures_statut_check;
ALTER TABLE admin.factures
  ADD CONSTRAINT factures_statut_check
  CHECK (statut IN ('en_cours', 'brouillon', 'emise', 'erreur'));

ALTER TABLE admin.factures DROP CONSTRAINT IF EXISTS factures_brouillon_identifie;
ALTER TABLE admin.factures
  ADD CONSTRAINT factures_brouillon_identifie
  CHECK (statut <> 'brouillon' OR pennylane_invoice_id IS NOT NULL);

-- Verification apres application (lecture seule) :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'admin.factures'::regclass AND contype = 'c'
--    ORDER BY conname;
--   -- factures_statut_check doit lister 'brouillon' ;
--   -- factures_brouillon_identifie doit exister.
