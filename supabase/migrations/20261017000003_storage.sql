-- =====================================================================
-- AI-nvoices : stockage des logos des profils émetteur
-- Bucket public en lecture (le PDF doit pouvoir charger le logo).
-- PNG et JPEG uniquement : ce sont les formats lus par @react-pdf/renderer.
-- Chaque utilisateur écrit uniquement dans son dossier « <user_id>/… ».
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');

create policy "logos_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "logos_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "logos_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
