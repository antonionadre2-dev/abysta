# Site Visits 3A — informe de verificación

Fecha: 2 de octubre de 2026. Responsable: Codex.
Estado: aplicado y aceptado en desarrollo (`abysta-dev`); código conservado en
la rama local `feature/site-visits-3a`. No se subió código a GitHub.

## Base y alcance

La entrega parte del commit validado `f68e0c4` (`Clients → Portfolios →
Buildings`). El parche no aplicaba únicamente su bloque de `README.md` porque la
base local ya contenía evidencia posterior; ese bloque se integró manualmente y
el resto se aplicó sin forzar archivos. No se modificaron los documentos y
carpetas no versionados que ya estaban en el repositorio.

3A añade visitas independientes por edificio, cuestionario inicial tipado de 16
preguntas, guardado manual, seguimiento de pendientes e historial inmutable por
guardado. El acceso se limita a propietarios internos activos y requiere
conexión. No incluye zonas, archivos, aprobación, costes, sincronización offline
ni creación masiva de visitas.

## Resultados locales

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Validación de formulario y paginación | 15 casos pasan | `web/tests/site-visits-validation.test.mjs` |
| Esquema, funciones, transacciones y RLS | 42 casos pasan | `supabase/tests/site-visits.test.mjs` |
| Regresión de empresa | 42 casos previos pasan | `npm run test:company` |
| Regresión de directorio e imágenes | 86 casos previos pasan | `npm run test:directory` |
| TypeScript y ESLint | Correcto | `npm run typecheck`; `npm run lint` |
| Compilación de producción | Correcta; cinco rutas de visitas | `npm run build -- --webpack` |
| Navegador: escritorio, tablet y móvil | 19 comprobaciones del paquete; corrección móvil posterior | `browser-results.json` y revisión de capturas |

Los 57 casos nuevos excluyen los contenedores del ejecutor Node. La suite SQL
muestra 43 pruebas al incluir el contenedor; son 42 casos de aceptación. Aplica
las migraciones reales de empresa, directorio y visitas en una instancia PGlite
desechable con un adaptador mínimo de Auth y roles.

El build normal con Turbopack no pudo abrir su puerto auxiliar dentro del sandbox
de esta sesión (`EPERM`). El mismo build de Next.js con Webpack terminó
correctamente; no hubo un error de aplicación o de tipos. La primera ejecución
sin acceso de red también confirmó que la descarga de fuentes es una dependencia
del entorno, no del módulo.

## Migración y aceptación alojada

El dry-run inicial mostró únicamente
`supabase/migrations/20261002003000_site_visits.sql`. Se aplicó a `abysta-dev`
(project ref `vplvaitpxcpnfuhvwlxb`). Tras aplicar también la corrección posterior
`03100`, el historial remoto quedó sincronizado con estas cinco versiones:

- `20261002000100_company_setup.sql`
- `20261002002000_directory.sql`
- `20261002002100_directory_images.sql`
- `20261002003000_site_visits.sql`
- `20261002003100_http_conflict_codes.sql`

La aceptación utilizó dos usuarios reales de Supabase, dos empresas temporales y
dos sesiones autenticadas independientes. Pasaron estas 12 comprobaciones:

1. Alta e inicio de sesión de los dos usuarios de prueba.
2. Diez visitas independientes en un portafolio de quince edificios; cinco
   edificios permanecieron sin visita.
3. Conservación exacta de `false`, cero, Unknown y una fecha de calendario.
4. Corrección del contacto de visita sin modificar el contacto del edificio.
5. Tres revisiones inmutables, snapshots de padres y reintento idempotente.
6. Aislamiento para acceso anónimo y para otra empresa.
7. Dos sesiones guardando a la vez: un commit y un `STALE_RECORD` HTTP 409.
8. Quitar un edificio del portafolio sin perder su visita.
9. Cliente o edificio archivado: historial legible y guardado bloqueado hasta
   restaurarlo.
10. Carrera entre guardado y archivado sin interbloqueo y con resultado
    consistente.
11. Carrera entre guardado y revocación: el guardado esperó al bloqueo y la
    revocación denegó inmediatamente la lectura y el guardado.
12. Cierre de sesión, denegación, nuevo inicio de sesión y recuperación de la
    visita persistida.

## Corrección descubierta durante la aceptación

El conflicto de versión usaba inicialmente SQLSTATE `40001`. PostgREST 14 lo
interpreta como fallo serializable reintentable, por lo que una versión obsoleta
podía repetirse hasta agotar el timeout aunque la base no duplicara revisiones.
Se cambió a `PT409`, que conserva `STALE_RECORD` y devuelve HTTP 409 sin reintento.

La migración local, la prueba SQL y el contrato documental contienen ya `PT409`.
Como la versión `03000` se había aplicado antes de descubrirlo, la definición de
`save_site_visit` se corrigió de forma acotada en `abysta-dev` y se verificó que
no conserva ningún `40001`. Una instalación nueva recibe directamente la
definición corregida desde la única migración 3A.

Después de cerrar esta aceptación se preparó
`20261002003100_http_conflict_codes.sql` para aplicar el mismo contrato HTTP a
los tres conflictos heredados de `save_directory_record` y al conflicto de
`set_directory_image`. `npm run test:directory` pasa con esa migración y confirma
que esas funciones quedan en `PT409`. La corrección `03100` se aplicó después en
`abysta-dev`; el dry-run final devolvió `upToDate=true`, sin migraciones
pendientes. Este endurecimiento posterior sí forma parte del historial alojado
actual, pero no de la aceptación 12/12 de Site Visits ya concluida.

También se preparó localmente la recuperación de contraseña por
`/auth/callback?next=/auth/update-password`. El callback intercambia el código
PKCE antes de mostrar el formulario, y las rutas de confirmación solo aceptan
destinos internos. El panel alojado ya usa `http://localhost:3001` como Site URL;
la allowlist conserva `http://localhost:3000/**` y añade
`http://localhost:3001/**`. Solo falta la prueba end-to-end con un correo nuevo,
temporalmente bloqueada por el límite de envío de correo. Este endurecimiento de
Auth tampoco se incluye en el resultado alojado 12/12 de Site Visits.

## Limpieza y protección de datos reales

Antes de crear fixtures se tomó una huella criptográfica de todas las tablas de
la aplicación. La limpieza exigió coincidencia exacta de los dos tenants, sus
creadores, el cliente, quince edificios y diez visitas; después eliminó esos
registros en una sola transacción y borró los dos usuarios temporales de Auth.

La comprobación posterior confirmó cero fixtures y las mismas huellas iniciales:

| Relación preexistente | Filas | Huella antes y después |
| --- | ---: | --- |
| `public.operator_tenant` | 1 | `0d05854bc6316b404bddadc27d4b817f` |
| `public.membership` | 1 | `c796402ab66c47fe6efa5df4585edd6a` |
| `abysta_private.company_setup_request` | 1 | `df769854fba67b40362091e6334a385d` |

Todas las tablas de directorio, imágenes y visitas volvieron a cero filas con
huella vacía `d41d8cd98f00b204e9800998ecf8427e`. Los dos UUID de Auth temporales
también quedaron ausentes. No se alteró la empresa real existente.

## Verificación visual y límites pendientes

Las 19 comprobaciones visuales del paquete usan datos ficticios y guardados
simulados, con marca `VISUAL QA · SAMPLE DATA`; no son evidencia de Supabase.
Cubren escritorio, tablet y móvil, búsqueda, filtros, estados de respuesta,
errores, conflicto, modo offline e historial. Una revisión independiente de la
captura de 390 px detectó que la barra sticky de Guardar/Cancelar podía tapar el
campo Reference. Se dejó estática en móvil y tablet, y sticky solo desde `xl`.
Queda como aceptación manual confirmar la corrección, el teclado virtual y el
gesto Atrás en un dispositivo real del usuario.

Antes de producción también hay que decidir una política de retención y borrado
para revisiones y recibos que pueden contener datos personales, configurar el
despliegue de Vercel con `web` como Root Directory y repetir la aceptación en el
proyecto de producción. Como mejoras de robustez futuras conviene añadir un
límite total de payload en base de datos y paginación del directorio para
volúmenes grandes.

Las revisiones de 3A son borradores inmutables de trabajo: no son aprobaciones ni
evidencia de que la información introducida sea correcta.
