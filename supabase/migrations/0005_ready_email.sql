-- Email "commande prête".
--
-- Troisième horodatage d'envoi sur orders, sur le même modèle que les deux
-- autres: il est posé après un envoi réussi, jamais avant. Nul, il signifie
-- "à envoyer ou à réessayer"; renseigné, il signifie "parti, ne pas répéter".
--
-- Il ne porte aucune règle métier: c'est le passage au statut `prete` qui
-- déclenche l'envoi, et le trigger orders_status_transition reste seul juge de
-- ce passage.

alter table public.orders
  add column if not exists ready_emailed_at timestamptz;

comment on column public.orders.ready_emailed_at is
  'Renseigné après l''envoi réussi de l''email annonçant que la commande est prête. Nul tant que l''envoi n''a pas abouti, ce qui le rend rejouable.';
