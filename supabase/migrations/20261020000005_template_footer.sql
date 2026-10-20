-- AI-nvoices : pied de page par défaut d'un profil émetteur,
-- prérempli dans chaque nouvelle facture qui utilise ce profil.
alter table public.invoice_templates add column default_footer_text text;
