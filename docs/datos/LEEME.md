# Cortes de ingresos al país (CSV)

- `plantilla-cortes-ingresos.csv`: columnas y ejemplos con el valor vacío. También se descarga desde Inicio › Ingresos al país › Cargar CSV.
- `dgme-terrestres-ene-jun-2024.csv`: corte DGME enero–junio 2024 de los puestos terrestres. **Valores vacíos**: el PDF oficial de transparencia.gob.sv no se pudo verificar (las rutas de documentos de la DGME respondieron 404 el 21 nov 2026). Completar cada `valor` con la cifra exacta del PDF y cargarlo; una fila sin valor no se guarda.

Columnas: `fuente` (DGME | MITUR), `metrica` (DGME → ingresos; MITUR → visitantes), `periodo_tipo` (mes | trimestre | semestre | anio), `desde` y `hasta` (AAAA-MM-DD, del día 1 al último día del mes), `puesto_o_pais` (nombre del puesto, país o `total`), `valor` (entero; vacío = sin dato).
