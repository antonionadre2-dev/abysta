# Verificación local y en `abysta-dev` — 2 de octubre de 2026

Base revisada: `92d54cbd1da3ce18b3b80a5f6b931c1aa5b10a3e` de `main`.
Implementación: rama `feature/clients-portfolios-buildings`.
Proyecto Supabase de desarrollo: `abysta-dev` (`vplvaitpxcpnfuhvwlxb`).
Responsable de estas comprobaciones: Codex.

## Resultado

Las migraciones siguientes están aplicadas y registradas en desarrollo, en este
orden:

1. `20261002000100_company_setup.sql`
2. `20261002002000_directory.sql`
3. `20261002002100_directory_images.sql`

El preflight confirmó que `storage.allow_any_operation(text[])` existe y que el
rol `authenticated` puede ejecutarlo. El bucket `abysta-directory-images` es
privado, admite únicamente WebP de hasta 3 MiB y conserva las siete políticas
restrictivas previstas.

| Comprobación local | Resultado / evidencia reproducible |
| --- | --- |
| Validación del directorio | 10 casos: `npm run test:directory:validation` |
| Datos, permisos y lectura atómica | 42 casos: `npm run test:directory:database` |
| Decodificación y límite HTTP de imágenes | 7 casos: `web/tests/directory-images.test.mjs` |
| Metadatos, permisos y versiones de imágenes | 27 casos: `supabase/tests/directory-images.test.mjs` |
| Regresión del primer módulo | 7 casos de formulario y 35 de base de datos: `npm run test:company` |
| Tipos y estilo | `npm run typecheck` y `npm run lint` correctos |
| Compilación final | `npm run build -- --webpack` correcta con Next.js 16.3.8 |

Los runners SQL muestran un contenedor padre adicional; no se cuenta como caso
de aceptación. El build estándar con Turbopack no pudo abrir su puerto auxiliar
en el sandbox local (`EPERM`), por lo que la comprobación reproducible se hizo
con Webpack.

## Aceptación contra Supabase real

Se creó una operadora y un usuario desechables, un cliente ficticio, 15 edificios
independientes y dos portafolios: uno con los 15 edificios y otro con 10. Se
comprobó lo siguiente mediante Auth, PostgREST, RPC y Storage reales:

- La recarga conserva los datos y muestra 15 edificios y dos portafolios.
- Editar un edificio compartido actualiza la misma ficha sin duplicarlo ni
  alterar los otros 14.
- Una escritura con una versión antigua devuelve `STALE_RECORD`.
- Quitar y volver a añadir un edificio crea historial de pertenencia y deja una
  sola relación activa.
- Archivar y restaurar un edificio conserva su contacto y relaciones.
- Un administrador sin rol de propietario, otra empresa, una sesión anónima y
  una pertenencia revocada no pueden leer ni mutar el directorio.
- La empresa real `Abysta Demo Ltd` no fue modificada.

Para imágenes se verificó subida, reemplazo y retirada mediante la aplicación,
conversión real a WebP, dimensiones máximas de 1.600 píxeles y entrega privada.
También se probó subir A y reemplazarla por B sin recargar: el componente conserva
la nueva `row_version` y no produce un falso `STALE_RECORD`. El endpoint
`POST /api/directory-images` exige origen coincidente, multipart y longitud entre
1 byte y 4 MiB, autentica antes de materializar el cuerpo y devuelve respuestas
JSON `private, no-store`.

El listado anónimo de Storage no reveló objetos (HTTP 200 con una lista vacía);
la descarga/firma anónima y una subida anónima a una ruta válida fallaron. La
ruta privada de la aplicación, sin sesión, redirige al inicio de sesión y no
entrega bytes. No se intentó actualizar o borrar un objeto existente como usuario
final porque esas pruebas son destructivas; las políticas locales y alojadas
confirman que esas operaciones no están concedidas.

Al terminar se eliminaron por la API de Storage los nueve objetos generados y,
mediante una transacción con precondiciones exactas, el tenant, usuario, fichas,
relaciones, recibos y versiones ficticios. La verificación final devolvió cero en
todos los recuentos temporales y uno para `Abysta Demo Ltd`.

## Correcciones surgidas de la prueba

- El texto de los portafolios solo menciona edificios archivados cuando existen.
- El flujo de imágenes usa un Route Handler normal en lugar de una Server Action,
  evitando un estado de carga indefinido observado en el navegador.
- La versión y el asset guardados viven en estado local separado; elegir un nuevo
  archivo ya no restaura props antiguas.
- Peticiones sin `Origin`, sin `Content-Length`, con tipo incorrecto o mayores de
  4 MiB se rechazan antes de leer el multipart; las sesiones anónimas se rechazan
  antes de procesar el archivo.

## Pendiente antes de producción

- Repetir carreras verdaderamente simultáneas desde dos conexiones: el runner y
  la aceptación alojada comprobaron locks, revocación transaccional y conflictos
  secuenciales, no todos los solapamientos de red posibles.
- Archivar y restaurar un cliente completo desde el navegador. El caso se cubre
  en SQL local y el navegador real comprobó el ciclo equivalente en un edificio.
- Completar mediante HTTP alojado los casos no destructivos del plan de Storage
  como propietario, no propietario y otra empresa, incluidas las operaciones de
  URL firmada, subida firmada, bytes WebP inválidos y cabeceras del proxy. Update
  y delete sobre un objeto existente deben reservarse para un fixture desechable.
- Verificar en el despliegue de Vercel el runtime Node/Sharp y configurar
  **Root Directory = `web`**.
- Definir cuota, monitorización y un proceso administrativo de retención y
  limpieza para versiones antiguas y objetos huérfanos.
- Paginar relaciones de portafolio por separado antes de admitir directorios muy
  grandes; la implementación actual carga el directorio completo.
- Definir la retención de los recibos privados, que contienen el payload completo
  de cada guardado.

Los tests PGlite siguen siendo evidencia local y no sustituyen estas últimas
pruebas de despliegue. No hay todavía visitas, finanzas, permisos delegados ni
acceso para clientes externos.
