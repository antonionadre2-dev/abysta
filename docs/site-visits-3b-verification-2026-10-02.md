# Site Visits 3B — verificación local y alojada

Fecha: 2 de octubre de 2026. Responsable: Codex.
Base publicada: `5bf9437dcef4dbe74464e8d30f0713af9559363b`.
Rama de trabajo: `feature/site-visits-3b`.

**Resultado:** código integrado en `feature/site-visits-3b`, pruebas locales
superadas y migración incremental aplicada en `abysta-dev`. La aceptación alojada
con datos temporales pasó y la limpieza restauró exactamente la huella inicial.

## Alcance implementado

- Identidades estables de plantas/zonas por edificio, reutilizadas entre portafolios.
- Estructura actual compartida y observaciones congeladas por revisión de visita.
- Guardado único del cuestionario y layout, con dos controles de versión.
- Superficies de suelo/cristal, longitudes, recuentos tipados y área de referencia.
- Procedencia, estados pendientes, cero explícito, N/A, estimaciones y exclusiones.
- Material, estado, ocupación, obstáculos, acceso y notas por zona.
- Duplicación sin medidas heredadas, eliminación del borrador y conciliación explícita.
- Interfaz inglesa adaptable y lectura de instantáneas históricas.

## Resultados

| Comprobación | Casos con nombre | Resultado / evidencia |
| --- | ---: | --- |
| Validación, agregados y reutilización 3B | 15 | `web/tests/site-visit-layout.test.mjs` |
| Migración, snapshots, inventario, acceso y transacciones 3B | 48 | `supabase/tests/site-visit-layout.test.mjs` |
| Regresión 3A: formulario y paginación | 15 | `web/tests/site-visits-validation.test.mjs` |
| Regresión 3A: RPC original tras aplicar 04000 | 42 | `supabase/tests/site-visits.test.mjs` |
| Empresa | 42 | `npm run test:company` |
| Directorio e imágenes privadas | 86 | `npm run test:directory` |
| Navegador con componentes reales y datos ficticios | 25 | `docs/qa/site-visits-3b-browser-results.json` |
| Supabase alojado: Auth, RPC, RLS, HTTP y concurrencia | 16 pasos | `docs/qa/site-visits-3b-hosted-results.json` |
| TypeScript | — | `npm run typecheck`, correcto |
| ESLint | — | `npm run lint`, correcto |
| Build de producción | — | `npm run build -- --webpack`, correcto |
| Aplicación incremental del parche | — | Verificada sobre una copia limpia de 5bf9437; árbol resultante idéntico |

Son **63 casos nuevos de lógica/SQL**, más **185 regresiones**, total **248**.
Los contenedores del ejecutor Node no se cuentan como casos adicionales. Los
25 casos de navegador se contabilizan aparte. Una revisión independiente comparó
48 entradas entre validadores JavaScript y SQL, sin discrepancias; fue una
comprobación adicional, no parte del total de suites versionadas.

La compilación utilizó Next.js 16.3.8 y Webpack, con configuración pública ficticia
de Supabase solo para construir. La autenticación y persistencia alojadas se
acreditaron después con sesiones temporales ordinarias contra `abysta-dev`. No se
cambiaron dependencias del lockfile.

## Qué prueban los casos nuevos

La suite SQL aplica la cadena publicada, crea una visita y un recibo 3A antes de
04000 y comprueba que siguen utilizándose después. Verifica diez inventarios en
quince edificios, reutilización en dos portafolios, versiones independientes,
reintentos después de cambios posteriores y rollback de identidades, inventario,
revisión y recibo ante un fallo de inserción.

Incluye aislamiento de tenant, ascendencia incorrecta, reutilización de UUIDs,
mutaciones directas denegadas, helpers privados, archivado, revocación y límites
exactos de 50 plantas/300 zonas. Las medidas inválidas, fuentes vacías y razones
incompletas se rechazan tanto en JavaScript como en SQL. Los 42 casos SQL de 3A
ahora se ejecutan también después de la migración nueva, sobre el RPC reemplazado.

PGlite ejecuta migraciones reales con adaptadores mínimos de Auth/Storage. Su
única conexión comprueba transacciones y validaciones de versión, pero **no prueba
carreras simultáneas de conexiones reales ni respuestas HTTP de PostgREST**; esos
dos riesgos sí se comprobaron en la aceptación alojada descrita abajo.

## Verificación alojada y limpieza

Se comprobó primero que el proyecto enlazado era `abysta-dev`
(`vplvaitpxcpnfuhvwlxb`). `db push` aplicó únicamente
`20261002004000_site_visit_layout.sql`; `migration list` dejó 00100, 02000, 02100,
03000, 03100 y 04000 sincronizadas y el dry-run final quedó sin migraciones.

La ejecución `20261002092556665-e595f56a` creó dos usuarios confirmados y dos
empresas temporales. Las operaciones funcionales usaron sus JWT normales, no la
conexión administrativa. Pasaron estos riesgos alojados:

- persistencia de 100 + 50 m², una medida pendiente, 20 m² de cristal, cero y N/A;
- idempotencia y vinculación de la clave de solicitud;
- concurrencia real con HTTP 409/`PT409` para `STALE_RECORD` y `STALE_INVENTORY`;
- rollback completo del guardado perdedor y protección frente a recibos antiguos;
- historial congelado al renombrar y nueva visita con UUID estables pero observaciones vacías;
- RLS entre empresas, anónimo, RPC ajena y escrituras directas denegadas;
- revocación comprobada con el mismo JWT y restauración solo durante la prueba.

Fue una aceptación incremental: el escenario alojado de 15 edificios y 10 visitas
ya había sido aceptado en 3A y los límites/portafolios vuelven a probarse localmente
en 3B. No se duplicó esa carga en la base alojada. El archivado también permanece
cubierto por la suite SQL local.

La limpieza bloqueó y validó los UUID y relaciones exactos, desactivó únicamente
los cinco triggers inmutables necesarios dentro de una transacción, los reactivó
y verificó su estado. Después eliminó mediante Auth Admin solo los dos usuarios
marcados con el identificador de la ejecución. La huella final coincidió exactamente
con la inicial en 19 relaciones: tablas públicas y privadas, `auth.users` por
ID/email y objetos del bucket. Permanecieron el único usuario, empresa, cliente,
edificio y dos contactos originales; no quedaron visitas, plantas, zonas,
inventarios ni recibos 3B temporales.

## Verificación visual

Escritorio 1440 px, tablet 834 px y móvil 390 px: 25 casos pasan, sin errores de
página, con nueve capturas revisadas. Las imágenes del paquete llevan la marca
**VISUAL QA · SAMPLE DATA**. La interfaz y el validador son reales; las lecturas,
autenticación y respuestas de guardado son fixtures. Las ocho huellas de archivos
registradas en el JSON coinciden con el código probado.

Se comprobó separación de 150 m² de suelo, 20 m² de vidrio y 300 m² de referencia;
una zona pendiente, una N/A, cero, fuentes, estados y planta vacía. También
creación, duplicación, confirmación de eliminación, foco de errores anidados,
conciliación, historial, conflicto, desconexión y aviso al usar Atrás.

La barra de guardar sigue estática por debajo de `xl`. Quedan para un dispositivo
real el teclado virtual, Safari/iOS y el gesto Atrás; la emulación no los sustituye.

## Hallazgos corregidos

- Se impidió que números inválidos del borrador produjeran subtotales plausibles.
- Los errores de tamaño e identidad tienen instrucciones útiles, sin recomendar
  reintentos idénticos que no podrían resolverlos.
- El conflicto de inventario del primer guardado recupera un formulario nuevo;
  no enlaza a una supuesta visita guardada que todavía no existe.
- La duplicación recorta nombres por caracteres Unicode, sin partir emojis.
- Se armonizó el límite de versión segura entre JavaScript y PostgreSQL.
- Los errores de medición abren los grupos anidados y llevan el foco al campo.

## Integración y pendientes reales

La entrega añade únicamente la migración `20261002004000_site_visit_layout.sql`.
No modifica ninguna migración previa, los arreglos de autenticación publicados,
la migración 03100 ni el comportamiento de las imágenes privadas.

La migración está aplicada y la aceptación alojada incremental está cerrada. Sigue
la [guía de integración](site-visits-3b-setup-es.md) para reproducir el proceso.
Queda pendiente exclusivamente la comprobación del teclado y del gesto Atrás en un
móvil físico; la revisión responsive emulada no sustituye ese dispositivo.

La entrada de datos sigue siendo manual, online y solo para propietarios internos.
No incluye medición sobre plano, conversiones de unidad, archivos de visita,
aprobaciones, horas/costes, exportaciones ni campañas masivas. Estos son límites
del incremento, no funciones ocultas detrás de datos de ejemplo.
