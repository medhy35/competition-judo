-- Migration: Ajout de la colonne raison_fin à la table combats
-- Date: 2025-11-15

ALTER TABLE combats
ADD COLUMN IF NOT EXISTS raison_fin VARCHAR(50);

-- Commentaire pour documenter les valeurs possibles
COMMENT ON COLUMN combats.raison_fin IS 'Raison de fin du combat: ippon, double_wazari, osaekomi_ippon, temps, abandon, disqualification, etc.';
