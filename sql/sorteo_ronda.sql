-- Sorteo por instancias: ronda + álbum por ronda. Schema everwear.
-- Aplicar directo (migrate dev falla con multi-schema / shadow DB).
-- OJO: descarta los ganadores de prueba viejos (recrea sorteo_album).

CREATE TABLE IF NOT EXISTS everwear.sorteo_ronda (
  id          SERIAL      PRIMARY KEY,
  titulo      TEXT,
  estado      TEXT        NOT NULL DEFAULT 'armado',  -- armado | sorteando | cerrado
  instancias  JSONB,                                  -- [{ orden, premios:[{ file, nombre }] }] (mejor→peor)
  "createdAt" TIMESTAMP   NOT NULL DEFAULT now()
);

DROP TABLE IF EXISTS everwear.sorteo_album;
CREATE TABLE everwear.sorteo_album (
  id          SERIAL      PRIMARY KEY,
  "rondaId"   INTEGER     NOT NULL REFERENCES everwear.sorteo_ronda(id) ON DELETE CASCADE,
  orden       INTEGER     NOT NULL,                   -- 1..10 puesto dentro de la ronda
  instancia   INTEGER     NOT NULL DEFAULT 0,
  dni         TEXT        NOT NULL,
  nombre      TEXT        NOT NULL,
  marco       TEXT        NOT NULL DEFAULT 'oro',     -- oro | plata | bronce | celeste
  premio      TEXT,                                   -- nombre del premio
  "premioImg" TEXT,                                   -- archivo en /public/premios
  "createdAt" TIMESTAMP   NOT NULL DEFAULT now(),
  CONSTRAINT sorteo_album_rondaId_orden_key UNIQUE ("rondaId", orden),
  CONSTRAINT sorteo_album_rondaId_dni_key   UNIQUE ("rondaId", dni)
);
CREATE INDEX IF NOT EXISTS sorteo_album_rondaId_idx ON everwear.sorteo_album ("rondaId");
