# Abysta — clientes, portafolios y edificios

Este segundo bloque parte de `main`, commit
`92d54cbd1da3ce18b3b80a5f6b931c1aa5b10a3e`, después de integrar la creación de
empresa. La interfaz sigue en inglés. No modifica tus credenciales de Supabase.

## Qué podrás hacer

Desde tu empresa, **Open clients** abre el directorio. **New client** crea la
organización que compra tus servicios: nombre, referencia opcional, dirección,
contacto principal y notas. El logo se carga después del primer guardado.

En cada cliente puedes crear edificios (**Buildings**) y portafolios
(**Portfolios**). Un edificio tiene nombre, referencia, dirección, tipo, zona
horaria, contacto de visita, notas e imagen propia. Su identidad permanece aunque
lo saques de un portafolio. Para corregir datos, abre la ficha y pulsa **Edit**.

Un portafolio es un grupo de edificios del mismo cliente. Seleccionas edificios
existentes mediante casillas y ves el contador seleccionado. Puedes crear 15,
25 o más edificios; no hay un límite de 10 o 15. El guardado admite hasta 5.000
selecciones por solicitud. Un edificio puede estar en varios portafolios sin
duplicar su ficha. Los edificios deben existir antes de seleccionarlos.

Las listas permiten buscar, filtrar por estado y pasar de página. La carga de la
base de datos también se pagina para que su límite de respuesta no oculte registros.

## Guardar, cancelar y resolver cambios simultáneos

Los formularios validan campos, conservan lo escrito ante un error de guardado y
desactivan el envío mientras esperan respuesta. Cada solicitud conserva una clave
para reconocer reintentos. Después de guardar se abre la ficha con sus datos.

**Cancel** permite salir sin guardar. Si has cambiado campos, la interfaz avisa
antes de descartarlos. Esto no equivale a un borrador guardado: todavía no hay
edición sin conexión ni recuperación automática después de cerrar el navegador.

Cada registro tiene una versión interna. Si alguien lo modifica después de que
abrieras el formulario, tu guardado se rechaza para no sobrescribir esa edición.
Conserva tus cambios, abre la versión actual en otra pestaña y compáralos antes
de volver a editar. Cambiar una imagen también actualiza la versión de su ficha.

## Archivar y restaurar

El estado **Archived** conserva el registro y sus relaciones. Puedes consultar
los archivados usando el filtro correspondiente y restaurarlos con **Active**.
Archivar un cliente bloquea la modificación de sus edificios y portafolios hasta
restaurarlo. No borra esos edificios ni les cambia automáticamente su estado.

Un edificio archivado que ya pertenecía a un portafolio sigue identificado como
tal. No puede añadirse a otro grupo hasta restaurarlo. Quitar una pertenencia
conserva el edificio y registra el cierre del vínculo. No hay eliminación física
desde esta interfaz.

## Logos y fotos

Puedes cargar un logo de la operadora, un logo por cliente y una imagen principal
por edificio. Los formatos admitidos son PNG, JPEG y WebP, hasta 3 MiB por archivo.
El servidor comprueba que pueda decodificarse, limita sus dimensiones y genera
una versión WebP de hasta 1.600 píxeles por lado, sin metadatos del original.

Las imágenes se guardan en un bucket privado. Su visualización vuelve a comprobar
el acceso del usuario; no se publica una URL abierta. Reemplazar o quitar una
imagen cambia la portada actual, conservando la versión anterior. No se ha creado
aún una pantalla para gestionar todo el historial de archivos ni una política
automática de purga. No publiques propuestas con estas imágenes sin la futura
selección y aprobación documental.

## Permisos de esta entrega

Solo los propietarios internos activos de una operadora activa pueden usar este
directorio. El aislamiento se aplica en servidor, base de datos y almacenamiento;
conocer el identificador de otra empresa no concede acceso a sus registros.

Ventas, técnicos, administradores y usuarios cliente no obtienen acceso al
directorio por este cambio. La asignación de permisos por cliente o edificio se
incorporará en un hito posterior siguiendo el Documento 3. No se incluyen costes,
salarios, exportación comercial ni acceso financiero.

## Aplicación paso a paso

1. Descomprime el paquete y coloca `abysta-directory.patch` en la carpeta principal
   de tu repositorio, junto a `README.md` y `web`.
2. Abre una terminal en esa carpeta. Comprueba `git status --short` y guarda tus
   cambios propios antes de cambiar de rama. No uses `reset` para descartarlos.
3. Ejecuta:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/clients-portfolios-buildings
git apply --check abysta-directory.patch
git apply abysta-directory.patch
```

Si la comprobación del parche da un error, detente antes de aplicarlo: tu versión
puede haber cambiado y hay que adaptar el parche. No vuelvas a aplicar el paquete
del primer módulo. Después puedes mover el `.patch` fuera del repositorio.

4. Comprueba primero la protección de operaciones de Storage. En el **SQL
   Editor** de `abysta-dev`, ejecuta esta consulta de lectura:

```sql
select to_regprocedure('storage.allow_any_operation(text[])') is not null
  as storage_ready;
```

Debe devolver `true`. Si devuelve `false`, no apliques todavía las migraciones:
hay que resolver la versión de Supabase Storage. La función permite bloquear
enlaces firmados de descarga y subida que podrían sobrevivir a la revocación de
acceso. No crees una función falsa ni quites la comprobación para continuar.

Con Supabase CLI ya vinculado a `abysta-dev`, comprueba las migraciones:

```bash
npx supabase@2.119.0 db push --dry-run --skip-vault
```

Deben aparecer únicamente estas dos migraciones nuevas, en este orden:

- `20261002002000_directory.sql`
- `20261002002100_directory_images.sql`

La migración anterior de empresa debe figurar ya aplicada. Si aparecen errores
de historial, nombres de tablas existentes u otras migraciones inesperadas,
revisa el resultado antes de continuar. Si el proyecto ya no está vinculado,
ejecuta `npx supabase@2.119.0 link --project-ref TU_PROJECT_REF` usando el
identificador de tu proyecto de desarrollo.

La migración de imágenes también detiene el proceso con
`ABYSTA_STORAGE_OPERATION_HELPER_REQUIRED` si falta esa función. Los dos archivos
se aplican por separado: si falla el segundo, corrige la causa y vuelve a ejecutar
el despliegue; no borres la primera migración del historial ni repitas su SQL.

5. Aplica los cambios a desarrollo:

```bash
npx supabase@2.119.0 db push --skip-vault
cd web
npm ci
npm run test:company
npm run test:directory
npm run typecheck
npm run lint
npm run build -- --webpack
npm run dev
```

Usa Node.js 24 para reproducir el entorno de pruebas. Conserva tu `.env.local`
existente y mantén **Root Directory: web** si despliegas en Vercel. No necesitas
poner una clave `service_role` en la aplicación.

## Prueba de aceptación en tu Supabase

| Paso | Resultado esperado |
| --- | --- |
| Crear el cliente ficticio Rivermere Estates | Se guarda bajo tu operadora y conserva sus datos al recargar |
| Crear 15 edificios distintos | Cada ficha tiene su UUID, dirección, contacto y notas propios |
| Crear un portafolio con los 15 edificios | Se ven 15 pertenencias, sin duplicar los edificios |
| Crear otro portafolio con 10 de ellos | Siguen existiendo 15 edificios, aunque haya 25 pertenencias |
| Editar un edificio compartido | Ambos portafolios abren la misma ficha actualizada |
| Quitar un edificio de un grupo | Permanece en el cliente y en sus otros portafolios |
| Editar la misma ficha desde dos pestañas | La segunda edición antigua se rechaza y conserva sus entradas |
| Archivar/restaurar un cliente | Sus edificios se conservan; la edición se bloquea mientras está archivado |
| Cargar, reemplazar y quitar una imagen | La portada cambia sin hacer público el archivo |
| Probar sesión de otra empresa y sesión cerrada | No pueden leer ni cambiar fichas o imágenes de tu empresa |
| Revocar al propietario de una cuenta de prueba | Las nuevas solicitudes pierden acceso a datos e imágenes |

Realiza estas comprobaciones con datos ficticios y una cuenta de prueba que no
sea el único propietario de tu empresa real. El ZIP por sí solo no cambia
Supabase; los comandos de esta guía sí aplican migraciones al proyecto enlazado.
La ejecución del 2 de octubre de 2026 en `abysta-dev`, incluida la limpieza de
los datos ficticios, está documentada en
[`directory-verification-2026-10-02.md`](directory-verification-2026-10-02.md).

## Qué viene después

**Site Visits** añadirá la visita independiente de cada edificio: cuestionario,
zonas, medidas, fotografías, vídeos y planos. A continuación se construirá la
selección de edificios de un tender y el motor de tiempos y costes sobre sus
datos. El grupo de 10 edificios de la prueba es un portafolio, todavía no un
tender ni un presupuesto.
