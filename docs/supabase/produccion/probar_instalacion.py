"""Pruebas locales de la instalación de producción de Ezra. Base desechable, sin datos reales."""
import json, sys, uuid
import psycopg2

DSN = "host=/tmp port=5544 user=postgres"
FUNDADOR = "00000000-0000-4000-8000-0000000000f1"
EDITOR = "00000000-0000-4000-8000-0000000000e1"
INTRUSO = "00000000-0000-4000-8000-0000000000a1"
VECINOS = ["00000000-0000-4000-8000-00000000000%d" % i for i in range(1, 5)]
ok = []


def conectar(db):
    c = psycopg2.connect(DSN + " dbname=" + db)
    c.autocommit = True
    return c


def como(cur, quien, rol="authenticated"):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claim.sub', %s, false), set_config('request.jwt.claim.role', %s, false), set_config('request.jwt.claims', %s, false)",
                (quien or "", rol if quien or rol == "anon" else "", json.dumps({"email": "editorial@spotmi.test"})))
    cur.execute(f"set role {rol}")


def admin(cur):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)")


def falla(cur, sql, args, codigo, nombre):
    try:
        cur.execute("begin")
        cur.execute(sql, args)
        cur.execute("rollback")
    except psycopg2.Error as e:
        cur.execute("rollback")
        assert e.pgcode == codigo, f"{nombre}: esperaba {codigo}, llegó {e.pgcode} {e.pgerror}"
        ok.append(nombre)
        return
    raise AssertionError(f"{nombre}: debía fallar con {codigo}")


def bien(nombre):
    ok.append(nombre)


base = conectar("postgres")
cb = base.cursor()
cb.execute("drop database if exists prueba_ezra")
cb.execute("create database prueba_ezra")
db = conectar("prueba_ezra")
cur = db.cursor()
cur.execute(open("/home/claude/prod/base_produccion.sql").read())

# Datos de prueba inventados
cur.execute("insert into auth.users values (%s,'f@t.t',now()),(%s,'e@t.t',now()),(%s,'i@t.t',now())", (FUNDADOR, EDITOR, INTRUSO))
for v in VECINOS:
    cur.execute("insert into auth.users values (%s,'v@t.t',now())", (v,))
    cur.execute("insert into public.profiles values (%s,0)", (v,))
cur.execute("insert into public.admin_members values (%s,'founder','active')", (FUNDADOR,))
cur.execute("insert into storage.buckets values ('eventos', true)")
cur.execute("insert into public.events(title,date,source,is_verified,source_url) values ('Concierto sin imagen','2026-12-09 18:00-06','official',true,'https://elsalvador.travel/x') returning id")
sin_imagen = cur.fetchone()[0]
cur.execute("insert into public.events(title,date,source,is_verified,cover_image_url) values ('Con imagen','2026-12-10 18:00-06','official',true,'https://x/y.jpg') returning id")
con_imagen = cur.fetchone()[0]
cur.execute("insert into public.events(title,date,source,is_verified) values ('Oculto','2026-12-11 18:00-06','official',false) returning id")
oculto = cur.fetchone()[0]
cur.execute("insert into public.event_proposals(origin,status,data) values ('analyzer','pending','{}')")

# ── Instalación (en una transacción, como apply_migration) ──
db.autocommit = False
cur.execute(open("/home/claude/prod/20261127_ezra_produccion.sql").read())
db.commit()
db.autocommit = True
bien("instalación completa en una transacción")
falla(cur, open("/home/claude/prod/20261127_ezra_produccion.sql").read(), None, "P0001", "segunda instalación se rechaza")

# ── Lo de siempre sigue igual ──
como(cur, VECINOS[0])
cur.execute("insert into public.events(title,date,source,created_by,is_verified) values ('Feria vecinal','2026-12-20 10:00-06','official',%s,true) returning id, is_verified, source", (VECINOS[0],))
feria, ver, src = cur.fetchone()
assert ver is False and src == "community"
bien("comunidad: su evento nace sin verificar y como comunidad")
falla(cur, "update public.events set is_verified = true where id = %s", (feria,), "42501", "comunidad no puede verificar")
for v in VECINOS[1:4]:
    como(cur, v)
    cur.execute("insert into public.event_verifications(event_id,user_id) values (%s,%s)", (feria, v))
admin(cur)
cur.execute("select is_verified, verification_count from public.events where id=%s", (feria,))
assert cur.fetchone() == (True, 3)
bien("3 verificaciones de la comunidad siguen publicando el evento")
como(cur, FUNDADOR)
cur.execute("select public.admin_crear_evento('Evento del panel','2026-12-24 20:00-06')")
panel = cur.fetchone()[0]
admin(cur)
cur.execute("select is_verified, source from public.events where id=%s", (panel,))
assert cur.fetchone() == (True, "official")
bien("panel: el equipo sigue creando eventos oficiales")
como(cur, FUNDADOR)
cur.execute("select public.admin_ocultar_evento(%s)", (panel,))
admin(cur)
cur.execute("select is_verified from public.events where id=%s", (panel,))
assert cur.fetchone() == (False,)
bien("panel: el equipo sigue ocultando eventos")
cur.execute("select count(*) from public.event_proposals where origin='community'")
assert cur.fetchone()[0] == 1
bien("propuestas de la comunidad siguen creándose")

# ── Ezra: permisos ──
como(cur, EDITOR)
falla(cur, "select public.ezra_proponer_evento('{}'::jsonb,'https://a.b','clave-12345')", None, "42501", "cuenta sin habilitar no propone")
como(cur, INTRUSO)
falla(cur, "select public.ezra_configurar_cliente(%s,'Ezra',true)", (EDITOR,), "42501", "solo un founder habilita cuentas")
como(cur, FUNDADOR)
cur.execute("select public.ezra_configurar_cliente(%s,'Ezra editorial',true)", (EDITOR,))
admin(cur)
cur.execute("update public.ezra_clientes_editoriales set puede_publicar = true where user_id=%s", (EDITOR,))
como(cur, EDITOR)
cur.execute("select public.ezra_identidad_editorial()")
ident = cur.fetchone()[0]
assert ident["activo"] and ident["puede_publicar"]
bien("identidad editorial: activa y con permiso de publicar")
como(cur, None, "anon")
falla(cur, "select public.ezra_publicar_evento('{}'::jsonb,'https://a.b','x')", None, "42501", "anónimo no ejecuta la publicación")
como(cur, INTRUSO)
falla(cur, "select * from public.ezra_publicaciones", None, "42501", "nadie lee los recibos directamente")

# ── Ezra: publicar ──
clave = "ezra-publicar-" + str(uuid.uuid4()) + "-" + "b" * 64
datos = json.dumps({"titulo": "Garmin Duatlón Series 2026", "fecha": "2026-11-29", "hora": "06:00", "lugar": "Parque Madre Selva", "municipio": "Antiguo Cuscatlán", "departamento": "La Libertad", "categoria": "deporte", "descripcion": "Desde $30"})
como(cur, INTRUSO)
falla(cur, "select public.ezra_publicar_evento(%s::jsonb,'https://smartticket.fun/g',%s)", (datos, clave), "42501", "cuenta ajena no publica")
como(cur, EDITOR)
cur.execute("select public.ezra_publicar_evento(%s::jsonb,'https://smartticket.fun/g',%s)", (datos, clave))
r = cur.fetchone()[0]
assert r["estado"] == "approved"
admin(cur)
cur.execute("select is_verified, source, verification_count from public.events where id=%s", (r["evento"],))
assert cur.fetchone() == (True, "official", 0)
bien("ezra publica: evento visible, oficial y con conteo 0")
como(cur, EDITOR)
cur.execute("select public.ezra_publicar_evento(%s::jsonb,'https://smartticket.fun/g',%s)", (datos, clave))
assert cur.fetchone()[0] == r
bien("reintento con la misma clave no duplica")
falla(cur, "select public.ezra_publicar_evento(%s::jsonb,'https://smartticket.fun/otra',%s)", (datos, clave), "22023", "misma clave con otro contenido se rechaza")
admin(cur)
cur.execute("select count(*) from public.events where title='Garmin Duatlón Series 2026'")
assert cur.fetchone()[0] == 1
cur.execute("select count(*) from public.admin_audit_logs where action='ezra_evento_publicado'")
assert cur.fetchone()[0] == 1
bien("un solo evento y un registro de auditoría")

# Ataque: insertar directo por la API haciéndose pasar por ezra
como(cur, EDITOR)
cur.execute("select set_config('spotmi.ezra_publicacion', %s, false)", (r["id"],))
cur.execute("insert into public.events(title,date,source,source_id,is_verified,created_by) values ('Truco','2026-12-30 10:00-06','official',%s,true,%s) returning is_verified, source", ("ezra:" + r["id"], EDITOR))
assert cur.fetchone() == (False, "community")
bien("ataque: insertar por la API como 'ezra' queda sin publicar y como comunidad")

# ── Ezra: portada ──
ruta = f"ezra/{EDITOR}/" + "c" * 64 + ".jpg"
ruta_otra = f"ezra/{INTRUSO}/" + "d" * 64 + ".jpg"
admin(cur)
cur.execute("insert into storage.objects(bucket_id,name) values ('eventos',%s),('eventos',%s)", (ruta, ruta_otra))
cp = "ezra-portada-" + str(uuid.uuid4()) + "-" + "e" * 64
cur.execute("select row_to_json(e)::jsonb - 'cover_image_url' from public.events e where id=%s", (sin_imagen,))
antes = cur.fetchone()[0]
como(cur, INTRUSO)
falla(cur, "select public.ezra_actualizar_portada(%s,%s,%s)", (sin_imagen, ruta, cp), "42501", "cuenta ajena no cambia portadas")
como(cur, EDITOR)
falla(cur, "select public.ezra_actualizar_portada(%s,%s,%s)", (sin_imagen, ruta_otra, cp), "22023", "no usa archivos de otra cuenta")
falla(cur, "select public.ezra_actualizar_portada(%s,%s,%s)", (con_imagen, ruta, cp), "22023", "no reemplaza una imagen existente")
falla(cur, "select public.ezra_actualizar_portada(%s,%s,%s)", (oculto, ruta, cp), "P0002", "no toca eventos ocultos")
falla(cur, "select public.ezra_actualizar_portada(%s,%s,'mala')", (sin_imagen, ruta), "22023", "exige huella de la portada")
cur.execute("select public.ezra_actualizar_portada(%s,%s,%s)", (sin_imagen, ruta, cp))
rp = cur.fetchone()[0]
assert rp["estado"] == "aplicada" and rp["portada"].endswith(ruta)
admin(cur)
cur.execute("select row_to_json(e)::jsonb - 'cover_image_url', cover_image_url from public.events e where id=%s", (sin_imagen,))
despues, url = cur.fetchone()
assert despues == antes and url == "https://bvmzrmvrdbfpkdhwazgv.supabase.co/storage/v1/object/public/eventos/" + ruta
bien("portada aplicada: sólo cambió la imagen; título, fecha, verificación y origen iguales")
como(cur, EDITOR)
cur.execute("select public.ezra_actualizar_portada(%s,%s,%s)", (sin_imagen, ruta, cp))
assert cur.fetchone()[0]["estado"] == "aplicada"
bien("reintento de portada no falla ni duplica")
# Ataque: actualizar directo por la API con la marca de portada
cur.execute("select set_config('spotmi.ezra_portada', %s, false)", (str(sin_imagen),))
cur.execute("update public.events set title='Hackeado', cover_image_url='https://malo/x.jpg' where id=%s", (sin_imagen,))
assert cur.rowcount == 0
admin(cur)
cur.execute("select title from public.events where id=%s", (sin_imagen,))
assert cur.fetchone()[0] == "Concierto sin imagen"
bien("ataque: editar el evento por la API no cambia nada")

# ── Subida de archivos al bucket ──
como(cur, EDITOR)
cur.execute("insert into storage.objects(bucket_id,name) values ('eventos',%s)", (f"ezra/{EDITOR}/" + "f" * 64 + ".png",))
bien("ezra sube portadas a su propia carpeta")
falla(cur, "insert into storage.objects(bucket_id,name) values ('eventos',%s)", (f"ezra/{INTRUSO}/" + "f" * 64 + ".png",), "42501", "ezra no sube a carpetas ajenas")
falla(cur, "insert into storage.objects(bucket_id,name) values ('eventos','portada.png')", None, "42501", "ezra no sube fuera de su carpeta")
como(cur, INTRUSO)
falla(cur, "insert into storage.objects(bucket_id,name) values ('eventos',%s)", (f"ezra/{INTRUSO}/" + "a" * 64 + ".png",), "42501", "cuenta no editorial no sube")
admin(cur)
cur.execute("select count(*) from public.events where title in ('Concierto sin imagen','Con imagen','Oculto')")
assert cur.fetchone()[0] == 3
bien("los eventos existentes siguen ahí")

print(f"\n{len(ok)} comprobaciones correctas:")
for n in ok:
    print(" ✓", n)
