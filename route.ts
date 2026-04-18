# Crear evento
curl -X POST http://localhost:3001/api/picking/eventos \
  -H "Content-Type: application/json" \
  -d '{"codigo":"MAN-001","cantidad":5,"picker_nombre":"Juan"}'

# Listar pendientes
curl http://localhost:3001/api/picking/eventos

# Responder
curl -X POST http://localhost:3001/api/picking/eventos/1/responder \
  -H "Content-Type: application/json" \
  -d '{"estado":"confirmado","respuesta_nota":"Listo"}'

