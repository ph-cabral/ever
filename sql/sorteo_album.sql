-- Álbum de ganadores del sorteo (persistente). Schema everwear.
-- Aplicar directo (migrate dev falla con multi-schema / shadow DB).
CREATE TABLE IF NOT EXISTS everwear.sorteo_album (
  id          SERIAL PRIMARY KEY,
  orden       INTEGER     NOT NULL UNIQUE,        -- 1..10, orden de salida
  dni         TEXT        NOT NULL,
  nombre      TEXT        NOT NULL,
  marco       TEXT        NOT NULL DEFAULT 'oro', -- oro | plata | bronce | celeste
  premio      TEXT,                               -- nombre del premio (opcional)
  "createdAt" TIMESTAMP   NOT NULL DEFAULT now()
);

-- Evita duplicar la misma persona en el álbum
CREATE UNIQUE INDEX IF NOT EXISTS sorteo_album_dni_key ON everwear.sorteo_album (dni);
