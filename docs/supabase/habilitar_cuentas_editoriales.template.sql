-- Plantilla: reemplazar los cuatro valores UUID_1, CORREO_1, UUID_2 y CORREO_2.
-- Ejecutar completo en SQL Editor de Spotmi-Web (producción).
-- Concede a las dos cuentas el permiso editorial de publicación directa.
-- No cambia contraseñas, no da rol administrador y no publica eventos.
begin;
set local lock_timeout = '5s';
do $$
declare
  targets jsonb := '[{"id":"UUID_1","email":"CORREO_1"},{"id":"UUID_2","email":"CORREO_2"}]';
  target record;
  founder uuid;
begin
  -- En SQL Editor no hay sesión Auth: se usa el fundador configurado como
  -- responsable del alta, de la misma forma que el procedimiento de provisión.
  select user_id into founder from public.admin_members
    where role = 'founder' and status = 'active' order by created_at limit 1;
  if founder is null then
    raise exception 'Falta un fundador activo en Spotmi. No se habilitó ninguna cuenta.';
  end if;
  for target in select * from jsonb_to_recordset(targets) as t(id uuid, email text)
  loop
    if not exists (select 1 from auth.users u
      where u.id = target.id and lower(u.email) = lower(target.email)
        and u.email_confirmed_at is not null) then
      raise exception 'La cuenta % no coincide con el UUID o no tiene correo confirmado. No se habilitó ninguna cuenta.', target.email;
    end if;
    if exists (select 1 from public.admin_members where user_id = target.id) then
      raise exception 'La cuenta % ya pertenece al equipo administrador. Usa una cuenta editorial separada.', target.email;
    end if;
    insert into public.ezra_clientes_editoriales(user_id, nombre, activo, puede_publicar, created_by)
      values (target.id, 'Ezra · cuenta editorial', true, true, founder)
    on conflict (user_id) do update set activo = true, puede_publicar = true, updated_at = now();
  end loop;
end;
$$;
commit;

select u.email as correo, e.user_id, e.activo, e.puede_publicar
from public.ezra_clientes_editoriales e join auth.users u on u.id = e.user_id
where e.user_id in ('UUID_1'::uuid, 'UUID_2'::uuid)
order by u.email;
