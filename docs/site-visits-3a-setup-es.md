# Abysta — Site Visits 3A

Entrega de desarrollo del 2 de octubre de 2026. Interfaz en inglés.
Se aplicó sobre el commit local `f68e0c4` del módulo Clients → Portfolios →
Buildings, en la rama `feature/site-visits-3a`. La única migración nueva está
aplicada en `abysta-dev`; la aceptación alojada y la limpieza se documentan en
`docs/site-visits-3a-verification-2026-10-02.md`. No se añadieron credenciales ni
datos de la empresa al código.

## Qué puedes hacer

Abre Clients → cliente → edificio → **Site Visits**. La nueva lista permite
buscar por título, referencia o responsable, filtrar Draft/In progress y navegar
por páginas de 20 registros. Cada edificio conserva sus visitas aunque cambie la
composición de un portafolio. Un edificio compartido abre las mismas visitas.

**New visit** abre el formulario. El título es obligatorio; referencia, fecha,
nombre del responsable y notas pueden completarse después. La fecha se guarda
como fecha de calendario, sin desplazarla por zona horaria. Las marcas del
historial se muestran con la etiqueta UTC. El nombre del responsable es una
etiqueta informativa: no invita a un usuario ni le concede permisos.

El contacto se copia del edificio al crear el formulario, pero las correcciones
se guardan en la visita. No alteran el contacto de la ficha del edificio.

## Cuestionario inicial: 16 preguntas

El banco inicial se centra en una primera visita para limpieza de oficinas.
No representa aún todo el banco del PRD ni una evaluación técnica completa.

| Sección | Preguntas |
| --- | --- |
| Client requirements | Tipo de servicio; objetivos; problemas actuales; requisitos y exclusiones |
| Building operations | Horario de uso; ventana de limpieza; días por semana; ocupación habitual |
| Access and facilities | Acceso; restricciones; agua; electricidad; almacén; residuos |
| Unvisited areas and follow-up | Áreas no inspeccionadas; otras confirmaciones pendientes |

Cada pregunta tiene cuatro estados posibles, cuando corresponda:

- **Not answered yet:** todavía no se ha recogido información.
- **Add an answer:** respuesta concreta con su procedencia obligatoria.
- **Unknown — needs confirmation:** no se conoce; exige explicar qué falta.
- **Not applicable:** solo en las preguntas que lo admiten y con una razón.

Las procedencias son Client provided, Observed, Measured, Estimated, Floor plan
y Document. Seleccionarlas no adjunta un archivo: las evidencias se incorporarán
en 3C. Las respuestas de texto, selección, número y sí/no se guardan con tipos
diferentes. **No** y **0** se conservan como valores explícitos; Unknown mantiene
un valor nulo, sin convertirse en cero.

El panel **Information captured** cuenta respuestas obligatorias con respuesta y
procedencia. Las marcadas Not applicable se muestran por separado. **To follow
up** reúne preguntas obligatorias sin resolver y todas las respuestas Unknown.
Cada enlace abre la sección de la pregunta. Este panel todavía no asigna tareas
con vencimiento ni notificaciones. Registrar una respuesta no verifica su exactitud.

## Guardado y revisiones

**Save draft** es manual y requiere conexión. Puedes guardar con preguntas
obligatorias sin responder; no puedes guardar una respuesta iniciada con formato
inválido, sin procedencia o un Unknown/Not applicable sin explicación.

Los estados Draft e In progress son estados de trabajo. Ninguno significa
aprobado, visita completa o listo para calcular. No hay botón de aprobación en 3A.

Cada guardado confirmado genera una revisión inmutable con:

- Respuestas, notas, fecha, contacto y responsable escritos en esa visita.
- La versión exacta de las preguntas.
- Los datos de cliente y edificio capturados por la base de datos al guardar.
- El identificador del usuario autenticado y la fecha del guardado.

**Revision history** permite abrir cada revisión en modo lectura. Editar el
cliente, el edificio o el portafolio no reescribe esas revisiones. Al guardar una
nueva revisión se capturan los datos actuales del edificio. La ficha muestra
claramente **Building snapshot** para distinguirlos de la ficha actual.

Una repetición de la misma solicitud, por ejemplo tras perder la respuesta de
red, no genera otra revisión. Un guardado nuevo sí crea una revisión, incluso si
no cambias los datos. Si otra persona guardó después de abrir tu formulario, el
sistema rechaza la versión antigua, conserva las entradas y ofrece abrir la
visita guardada en otra pestaña. No mezcla ni sobrescribe cambios automáticamente.

Si caduca la sesión, inicia sesión en otra pestaña y vuelve al formulario. Los
errores normales conservan las entradas mientras la página siga abierta. Los
avisos de salida no son almacenamiento: cerrar la página, recargarla o un fallo
del navegador puede perder cambios sin guardar. No hay guardado local ni modo
sin conexión. El botón se desactiva cuando el navegador detecta desconexión.

## Permisos y límites de esta entrega

Solo los propietarios internos activos de una operadora activa pueden consultar
y guardar visitas. La autoridad se comprueba de nuevo en el servidor y en cada
operación de la base de datos. Los demás perfiles todavía no tienen acceso.

Si archivas el cliente o el edificio, las visitas e historial permanecen visibles
para los propietarios autorizados. Crear o editar visitas exige restaurar ambos.
No hay borrado físico de visitas ni de revisiones desde la aplicación.

La entrega no incluye plantas/zonas, medidas de superficies, fotografías de
visita, vídeo, planos adjuntos, aprobación, exportación, cálculo ni creación masiva
de campañas. Puedes crear visitas independientes en los diez edificios elegidos
de un portafolio de quince, entrando en cada edificio. No crea quince visitas
automáticamente ni copia observaciones entre edificios.

## Reproducir la integración en otra copia

Estos pasos quedan como procedimiento reproducible. No vuelvas a aplicar el
parche ni la migración en la copia actual: Git y Supabase ya contienen el cambio.

1. Conserva el commit validado `f68e0c4`. Desde la raíz del repositorio, comprueba
   el estado y que trabajas sobre la rama que contiene ese commit:

```bash
git status --short
git merge-base --is-ancestor f68e0c4 HEAD
```

El segundo comando debe finalizar correctamente. No cambia archivos. Si faltan
el commit o la rama correcta, revisa la base antes de aplicar el parche. Guarda
tus cambios propios sin descartarlos. Es recomendable subir la versión validada
a tu repositorio con tu cuenta autorizada.

2. Descomprime el paquete y coloca `abysta-site-visits-3a.patch` junto a `README.md`
   y `web`. Crea una rama desde esta versión validada:

```bash
git switch -c feature/site-visits-3a
git apply --check abysta-site-visits-3a.patch
git apply abysta-site-visits-3a.patch
```

Si la comprobación falla, detente antes de aplicar: hay que adaptar el parche a
los cambios de tu Mac. No uses opciones para forzar ni sobrescribir. Después de
aplicarlo puedes mover el archivo `.patch` fuera del repositorio.

3. Con la CLI ya vinculada al proyecto de desarrollo correcto, comprueba las
   migraciones antes de aplicarlas:

```bash
npx supabase@2.119.0 db push --dry-run --skip-vault
```

Antes del primer despliegue debe aparecer únicamente la nueva migración
`20261002003000_site_visits.sql`. Después de aplicarla, como ocurre ya en
`abysta-dev`, el dry-run no debe mostrar migraciones pendientes. Las migraciones
de empresa, directorio e imágenes deben estar sincronizadas. Si aparece otra,
verifica el proyecto y el historial antes de continuar.

4. Aplica la migración de desarrollo e instala/verifica el código:

```bash
npx supabase@2.119.0 db push --skip-vault
cd web
npm ci
npm run test:visits
npm run test:company
npm run test:directory
npm run typecheck
npm run lint
npm run build -- --webpack
npm run dev -- --port 3001
```

Usa Node.js 24. Conserva tu configuración de Supabase existente. Si ya hay un
servidor del proyecto en 3001, detenlo con Ctrl+C en su terminal antes de arrancar
el nuevo. No es necesario tocar el otro proyecto que utiliza 3000.
Abre http://localhost:3001. Esta entrega no añade dependencias.

## Prueba de aceptación en abysta-dev

Usa datos ficticios y conserva tu empresa real.

| Comprobación | Resultado esperado |
| --- | --- |
| Portafolio con 15 edificios; crear visitas en 10 | Diez visitas independientes; cinco edificios sin visita; ningún edificio duplicado |
| Guardar respuestas diferentes y volver a iniciar sesión | Se recuperan en la visita y edificio correctos |
| Guardar No, 0 y Unknown con explicación | Siguen siendo tres situaciones distintas al recargar |
| Editar y guardar tres veces | Tres revisiones distintas; las anteriores siguen en lectura |
| Modificar el nombre/dirección del edificio | Las revisiones anteriores conservan la identificación capturada |
| Quitar el edificio de un portafolio | Sus visitas siguen en su ficha y en otros portafolios que lo referencien |
| Dos pestañas con la misma revisión; guardar una y después la otra | La segunda recibe conflicto y conserva sus entradas |
| Caducar la sesión antes de guardar | El error conserva el formulario; se puede iniciar sesión en otra pestaña |
| Archivar cliente o edificio | Se consulta historial, pero no se guardan cambios hasta restaurarlo |
| Usuario de otra operadora o sesión revocada | No accede a visitas, respuestas ni revisiones |
| Editar desde móvil y tablet | Se pueden abrir secciones, localizar pendientes y guardar sin desplazamiento horizontal |

En `abysta-dev` ya se verificaron con Auth y API reales dos sesiones concurrentes,
aislamiento entre empresas, reintento idempotente, archivado, revocación y
recuperación tras iniciar sesión. Los fixtures se eliminaron y las huellas de las
tablas existentes volvieron exactamente al estado inicial. Consulta el informe
de verificación para el resultado 12/12 y los límites que siguen abiertos. Falta
únicamente repetir el recorrido táctil en un dispositivo real y, antes de
producción, ejecutar allí una aceptación nueva con datos ficticios.

## Siguiente entrega

**3B · Plantas y zonas:** inventario del edificio, superficies y materiales,
restricciones por zona y procedencia de cantidades. Después, **3C** añadirá
archivos privados vinculados a visita/zona, revisión de pendientes y cierre
controlado. El motor de horas y costes llegará sobre revisiones identificables.
