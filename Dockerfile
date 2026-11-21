# Entorno de desarrollo de Ezra. No es una imagen de producción.
# Node fijo (la misma versión con la que se verificó el proyecto). Trae node:sqlite sin banderas.
FROM node:24.18.0-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    EZRA_DATA_DIR=/datos

# ffmpeg: Ezra lo usa para medir imágenes y armar videos (y las pruebas lo necesitan).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Carpetas de la app y de los datos, a nombre del usuario sin privilegios «node».
RUN mkdir -p /app /datos && chown node:node /app /datos
WORKDIR /app
USER node

# Dependencias dentro de la imagen, exactamente las de package-lock.json.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .

# Si SQLite no funciona en esta imagen, la construcción falla aquí y no al abrir la web.
RUN node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(':memory:');d.exec('create table t(x)');d.prepare('insert into t values (?)').run(1);if(d.prepare('select count(*) n from t').get().n!==1)process.exit(1);console.log('SQLite', process.version, 'OK')"

EXPOSE 3000
# 0.0.0.0 dentro del contenedor para recibir la conexión de Docker; compose.yaml solo
# la publica en 127.0.0.1 de tu computadora.
CMD ["npm", "run", "dev:docker"]
