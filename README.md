# Mi Periódico de Inversiones — PWA

## Archivos
```
periodico-inversiones/
├── index.html        ← App completa (React 18 + Recharts)
├── manifest.json     ← PWA manifest
├── sw.js             ← Service Worker (offline-first)
├── icon-192.png      ← Icono iOS/Android
└── icon-512.png      ← Icono splash screen
```

## Instalación en móvil

### Android (Chrome/Pixel 9a)
1. Abre el archivo en un servidor HTTPS (ver abajo)
2. Chrome mostrará banner "Añadir a pantalla de inicio"
3. O: menú ⋮ → "Instalar app"

### iOS (Safari)
1. Abre la URL en Safari
2. Botón compartir → "Añadir a pantalla de inicio"
3. Confirmar nombre "Periódico"

## Servir localmente (HTTPS requerido para PWA)

### Opción A: npx serve (más fácil)
```bash
npx serve . -l 3000
```
Luego accede desde móvil a: `http://TU-IP-LOCAL:3000`

### Opción B: Python HTTPS
```bash
# Instalar mkcert para HTTPS local
mkcert -install
mkcert localhost 127.0.0.1 ::1 TU-IP-LOCAL
python3 -m http.server 443 --bind 0.0.0.0  # con SSL
```

### Opción C: GitHub Pages / Netlify Drop
- Arrastra la carpeta a https://app.netlify.com/drop
- Gratis, HTTPS automático, URL permanente

## Uso diario

### Cada mañana (cuando Cowork genera los archivos):
1. Abre la app en móvil
2. Toca "↑ Noticias .md" → selecciona `resumen-diario-YYYY-MM-DD.md`
3. Toca "↑ Patrones .json" → selecciona `patrones-acumulados.json`

Los datos se guardan en localStorage. La app funciona offline después de la primera carga.

## Formato esperado de archivos

### resumen-diario-YYYY-MM-DD.md
```markdown
## TIKR (N noticias)
### AAPL — Apple Inc.
Texto de la noticia...

## Seeking Alpha (N noticias)
### MSFT — Microsoft Corp.
Texto de la noticia...
```

### patrones-acumulados.json
Schema: ver ejemplo en el proyecto.

## Datos
- **Noticias**: rolling 7 días, se purgan automáticamente
- **Patrones**: rolling 30 días, se reemplazan al sincronizar
- **Storage**: localStorage (no requiere backend)
- **Peso total**: <500 KB (sin datos)
