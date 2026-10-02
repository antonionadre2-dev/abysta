# Site Visits 3B — plantas, zonas y medidas

Fecha: 2 de octubre de 2026. Base: `5bf9437dcef4dbe74464e8d30f0713af9559363b`.
Estado de esta entrega: integrada en `feature/site-visits-3b`, probada localmente
y verificada contra Supabase alojado. **La migración 3B está aplicada a
`abysta-dev` y el dry-run final no muestra cambios pendientes.**

## Qué vas a poder hacer

Abre **Clients → Building → Site Visits → New visit** o edita una visita existente.
La sección **Floors & zones** forma parte del mismo formulario. El botón **Save
draft** guarda preguntas, estructura, medidas y observaciones en una transacción.
No hay un segundo guardado independiente que pueda dejar el cuestionario y las
medidas en versiones distintas.

1. **Add floor:** crea Ground floor, First floor, Basement u otra planta. Edita
   nombre, referencia y nivel. Las referencias son etiquetas; la identidad real
   del registro no cambia al renombrarlo.
2. **Add zone:** añade recepción, oficinas, aseos, cocina, escaleras, pasillos,
   almacenes, cuarto de instalaciones, exteriores u otras zonas dentro de la planta.
3. Abre la zona y completa **Service scope**: Included, Excluded o To confirm.
   Una exclusión exige explicar el motivo. El área excluida sigue visible, separada
   del área incluida en el servicio.
4. En **Measurements**, elige estado, cantidad y procedencia. En **Materials &
   observations**, registra material, estado, ocupación, obstáculos, acceso y notas.
5. Revisa los totales y pendientes y pulsa **Save draft**. Abre **Revision history**
   para ver exactamente lo registrado en cada guardado.

Los controles de edición están en inglés. Las zonas se despliegan individualmente
para no presentar una hoja de cálculo ancha en el móvil. La barra de guardar
permanece dentro del flujo en móvil y tablet; no tapa los campos inferiores.

## Medidas y unidades

| Campo | Unidad | Tratamiento |
| --- | --- | --- |
| Floor area | m² | Superficie de suelo de esa zona, registrada directamente |
| Glass area | m² | Cristales; suma independiente del suelo |
| Edge length | m | Longitud que interesa registrar; no se convierte en superficie |
| Fixture count | items | Enteros y tipo obligatorio, como toilets o basins; no se suman tipos distintos entre zonas |
| Building reference area | m² | Área bruta o de referencia del edificio; nunca se añade a los subtotales |

Las superficies y longitudes aceptan hasta dos decimales; los recuentos solo
enteros. Rango por medida: 0–10.000.000. Las unidades son fijas en esta entrega;
no hay conversión automática de pies cuadrados, medición sobre un plano ni
multiplicación de largo por ancho. Introduce una cantidad obtenida previamente.

Cada medida tiene cuatro estados:

- **Not recorded yet:** todavía no se ha registrado. No contiene número ni fuente.
- **Record a value:** cantidad y procedencia obligatorias. Cero es un valor válido.
- **Unknown — needs confirmation:** no se conoce y se explica qué falta.
- **Not applicable:** se explica por qué no corresponde; no equivale a cero.

Las procedencias son Measured on site, Client supplied, Floor plan, Estimated y
Document. Indican de dónde se obtuvo el dato; adjuntar esa evidencia llegará en 3C.
Una estimación se identifica como tal. Elegir Measured no certifica la medición.

Ejemplo comprobado: una recepción de 100 m², una oficina de 50 m² y una cocina
sin medida producen **150 m² conocidos y una zona pendiente**. Registrar 20 m²
de cristal mantiene el suelo en 150 m² y muestra el cristal por separado. Un área
bruta de referencia de 200 m² tampoco se añade. Los subtotales de planta se derivan
de sus zonas: no existe otro campo manual de subtotal que pueda duplicar la suma.

**Known floor area** incluye las cantidades registradas de todas las zonas y
se desglosa en Included, Excluded y To confirm. No es automáticamente el área
neta contratada. Los pendientes de área, las exclusiones, las estimaciones y el
alcance por confirmar se muestran por separado. Un total sin pendientes no prueba
que se hayan visitado todas las zonas del edificio. Los totales de cristal y
longitud también se denominan conocidos; pueden estar incompletos.

## Un edificio, varios portafolios y muchas visitas

Un edificio incluido en los portafolios de 15 y 10 edificios sigue siendo **el
mismo edificio**. Plantas y zonas tienen identidades estables vinculadas a ese
edificio, independientemente del portafolio desde el que se acceda.

La estructura actual reutilizable contiene nombres, referencias, tipos y
ubicación. Una visita nueva la carga como punto de partida, pero deja sin
confirmar sus medidas, fuentes, material, estado, ocupación, observaciones y
alcance del servicio. No hereda conclusiones de la visita anterior.

Una visita existente abre su propia última revisión. Si entretanto otra visita
ha cambiado la estructura del edificio, aparece **Use current building
structure**. Esta acción adopta nombres y zonas actuales; conserva observaciones
de identidades que siguen presentes y deja vacías las nuevas. Pide confirmación
si desaparecen plantas o zonas del borrador, porque sus observaciones actuales
saldrán de ese borrador. Las revisiones ya guardadas permanecen intactas.

Los límites son **50 plantas y 300 zonas activas por edificio**, además del límite
de tamaño del guardado. No son límites del portafolio. Se puede trabajar con
15 edificios o más y crear visitas solo para los que se inspeccionan. Esta entrega
no crea campañas ni visitas en lote y no agrega superficies entre edificios.

## Duplicar, quitar y corregir

**Duplicate zone** crea una identidad nueva en la misma planta y copia únicamente
nombre y tipo. No copia medidas, fuentes, notas ni confirmaciones. Sirve para
preparar otra oficina semejante sin dar por cierta su superficie.

**Remove zone / Remove floor** exige confirmar. Quita esos elementos del borrador;
al guardar deja de incluirlos en la estructura actual. No borra identidades ni
revisiones anteriores. Quitar una planta quita también sus zonas del borrador.
No hay papelera ni restauración individual en esta fase. Para descartar cambios
sin guardar, usa Cancel o vuelve a la visita y confirma el descarte.

La planta de una identidad de zona es fija: para representar una zona en otra
planta, crea una nueva allí. Esto evita reinterpretar la ubicación de las
observaciones históricas. Cambiar el nombre de una planta o zona sí está permitido.

## Conflictos y continuidad

Hay dos controles de versión: el de la visita y el de la estructura del edificio.
Dos formularios de visitas distintas también pueden entrar en conflicto si ambos
cambian esa estructura. El sistema devuelve HTTP 409 con `STALE_INVENTORY`, conserva
el formulario y exige revisar la situación. `STALE_RECORD` sigue protegiendo dos
ediciones de una misma visita. No se hace una mezcla automática de datos.

Tras un conflicto puedes abrir el edificio o la visita guardada en otra pestaña
y comparar. La recuperación de una visita nueva que aún no llegó a guardarse
abre un formulario nuevo después de confirmar el descarte; no intenta abrir un
registro inexistente. Una solicitud que pudo guardarse pero perdió la respuesta
mantiene su identidad y permite reintentar sin duplicar revisiones.

Los guardados antiguos del cliente 3A siguen siendo compatibles: editar solo el
cuestionario no borra la instantánea de medidas ya existente. Las revisiones
anteriores a 3B muestran que no se registró estructura, no que el edificio estuviera
vacío. No se reescribe su historial al aplicar la migración.

Solo propietarios internos activos pueden consultar y guardar, igual que en 3A.
El archivado de cliente/edificio permite consultar historial pero bloquea cambios.
Una revocación de acceso vuelve a comprobarse en cada operación. La conexión sigue
siendo obligatoria; conservar el formulario abierto no es almacenamiento offline.

## Integración en tu Mac

Usa el paquete sobre la base publicada `5bf9437`; conserva cualquier cambio propio.
La ruta esperada del proyecto es `/Users/Projects/Desktop/Abysta`. Si el proyecto
ha avanzado desde esa base, integra los cambios en una rama y resuelve los
conflictos deliberadamente; no uses un reset para forzar la aplicación.

1. Descomprime el ZIP. Copia `abysta-site-visits-3b.patch` a una ubicación conocida.
   Desde el proyecto comprueba `git status --short` y confirma la base. Crea una
   rama de trabajo desde esa base sin descartar archivos propios:

```bash
git switch -c feature/site-visits-3b 5bf9437
```

2. Ajusta la ruta del parche y verifica antes de aplicarlo:

```bash
git apply --check /ruta/al/paquete/abysta-site-visits-3b.patch
git apply --index /ruta/al/paquete/abysta-site-visits-3b.patch
```

3. Con las dependencias del lockfile instaladas, ejecuta desde `web`:

```bash
npm ci
npm run test:company
npm run test:directory
npm run test:visits
npm run test:visits:layout
npm run typecheck
npm run lint
npm run build -- --webpack
```

4. Confirma que la CLI de Supabase está vinculada a **abysta-dev**
   (`vplvaitpxcpnfuhvwlxb`). Desde la raíz, usa la CLI ya configurada:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

Debe aparecer solo la nueva `20261002004000_site_visit_layout.sql` como pendiente.
Las versiones `00100`, `02000`, `02100`, `03000` y `03100` son la base existente.
No modifiques ni vuelvas a aplicar manualmente `03100`. Si el dry-run muestra
otra cosa, revisa la vinculación y la rama antes de continuar.

5. Aplica la nueva migración de desarrollo y comprueba el historial:

```bash
supabase db push --linked
supabase migration list --linked
supabase db push --linked --dry-run
```

El último dry-run debe quedar sin cambios. Arranca la aplicación con el entorno
local ya configurado y el puerto 3001. Abre **Clients → Building → Site Visits**.
No configures valores ficticios de pruebas como credenciales del proyecto real.

## Aceptación en abysta-dev

La entrega incluye pruebas locales con PGlite y una vista de componentes reales
con datos ficticios. Además, el 2 de octubre de 2026 se ejecutó una aceptación
alojada, aislada en dos usuarios y dos empresas temporales, para los riesgos que
dependen de PostgREST, Auth, RLS y concurrencia real:

| Caso | Resultado esperado | Evidencia a conservar |
| --- | --- | --- |
| Migración | Solo 04000 nueva, luego ninguna pendiente | Salidas de migration list y dry-run |
| Portafolios | 15 edificios; visitas en 10; otro portafolio reutiliza los mismos edificios | IDs y recuentos, sin duplicados |
| Estructura | Plantas y zonas guardadas en el edificio correcto | Lectura autenticada de inventario y visita |
| Medidas | 100 + 50 + unknown = 150 conocidos + 1 pendiente; 20 de cristal separado; cero y N/A distintos | Captura y respuesta JSON |
| Historial | Guardar 100, cambiar a 120; la revisión anterior sigue en 100 y con su nombre anterior | Dos revisiones leídas por API |
| Nueva visita | Mismos IDs de estructura, medidas y observaciones sin confirmar | Comparación de ambos payloads |
| Duplicación | ID nuevo y medidas vacías; el original conserva las suyas | Captura y revisión guardada |
| Mismo formulario | Dos sesiones, un guardado y un STALE_RECORD 409 | Respuestas HTTP y solo una revisión nueva |
| Visitas distintas | Dos cambios estructurales sobre la misma versión: uno se guarda y otro recibe STALE_INVENTORY 409 | Respuestas HTTP y estructura resultante |
| Reintento | Misma solicitud no duplica; solicitud antigua no revierte cambios posteriores | Versiones y recuentos antes/después |
| Aislamiento | Otra empresa, anónimo y propietario revocado no acceden | Sesiones independientes, respuestas y tablas vacías |
| Archivado | Se lee historial, se bloquean cambios; carrera con guardado consistente | Respuestas y estado final |
| Móvil físico | Teclado, desplazamiento, botones y gesto Atrás sin campos tapados | Dispositivo/navegador y resultado |

Usa registros temporales claramente identificados. Captura el estado de los datos
reales antes y después. La limpieza debe apuntar solo a esos fixtures; las
identidades y revisiones son inmutables en el uso normal, así que una eliminación
técnica exige un procedimiento acotado y revisado, como en la aceptación de 3A.
No desactives salvaguardas globalmente ni elimines datos reales para limpiar pruebas.

Resultado alojado de esta integración: migración, persistencia de 150 m² conocidos
más una zona pendiente, 20 m² de cristal, cero frente a N/A, historial congelado,
reutilización de identidades, idempotencia, `STALE_RECORD` y `STALE_INVENTORY` con
HTTP 409, rollback del perdedor, aislamiento, denegación de escritura directa y
revocación con el mismo JWT, correctos. La prueba fue deliberadamente incremental:
el escenario de 15 edificios/10 visitas ya se aceptó en 3A y vuelve a cubrirse en
las suites locales 3B; no se recreó en los datos alojados. El archivado está cubierto
por las suites SQL locales. La huella completa posterior a la limpieza coincidió
con la inicial, incluidos Auth, tablas privadas y Storage.

Solo queda fuera de la automatización la fila **Móvil físico**: teclado virtual,
Safari/iOS y gesto Atrás deben comprobarse en un dispositivo real.

## Qué sigue

Cuando esta aceptación esté cerrada, **Site Visits 3C** incorporará fotografías,
vídeos y planos privados asociados a visita, planta o zona, con sus permisos y
referencias de revisión. El motor de tiempos y costes se conectará después a un
alcance de servicio definido; estas superficies todavía no producen horas ni precios.
