# Abysta — primera empresa y propietario

> Estado a 2 de octubre de 2026: el módulo está aplicado en la rama
> `feature/company-setup`, publicado en GitHub y verificado contra `abysta-dev`.
> La evidencia está en
> [`company-setup-verification-2026-10-02.md`](company-setup-verification-2026-10-02.md).

## Qué está preparado

Al entrar con una cuenta confirmada, `/protected` muestra el formulario **Create
your company** si todavía no tienes una empresa activa. Introduces nombre,
moneda y zona horaria. Para el Reino Unido: **GBP** y **Europe/London**.

Al guardar, una sola operación crea la empresa y te asigna como **Owner**. Al
recargar o volver a iniciar sesión se muestra la empresa guardada. Los reintentos
de la misma solicitud recuperan su resultado; no crean otra empresa.

La interfaz está en inglés, con estados de carga, errores por campo, botón de
guardado desactivado mientras trabaja y diseño adaptable a móvil. Se incluye
una portada de Abysta y la estructura de permisos para leer las empresas
accesibles. Los datos se consultan con la sesión del usuario y permisos de fila.

Este hito no incluye todavía clientes, edificios, visitas, logos, invitaciones,
edición de empresas, cálculos ni documentos comerciales. Tampoco implementa la
matriz completa del Documento 3. Es la base sobre la que construir esos módulos.

## 1. Aplicar los archivos en tu ordenador

El paquete original partía del commit
`d6ea4895b0730416ee6697975338e477a7f84863` de
`antonionadre2-dev/abysta`. Estos pasos se conservan para aplicar el paquete en
otra copia que siga en ese commit; la rama actual ya contiene los cambios.

1. Descomprime `Abysta_Company_Setup_Pack.zip`.
2. Copia `abysta-company-setup.patch` a la carpeta principal de tu repositorio
   `abysta`, junto a `README.md` y a la carpeta `web`.
3. Abre una terminal en esa carpeta. Si estás dentro de `web`, ejecuta `cd ..`.
4. Comprueba tus cambios pendientes con `git status --short`. Si tienes cambios
   propios, guárdalos primero en un commit de tu rama. No uses comandos de reset.
5. Ejecuta, en este orden:

```bash
git switch -c feature/company-setup
git apply --check abysta-company-setup.patch
git apply abysta-company-setup.patch
```

Si `git apply --check` muestra un error, no ejecutes el siguiente comando. Indica
que tu copia difiere de la base del paquete; comparte ese error para adaptar los
cambios sin sobrescribir tu trabajo. Si no muestra nada, la comprobación ha
pasado. Puedes mover el archivo `.patch` fuera del repositorio después de usarlo.

## 2. Preparar la base de datos de desarrollo

La migración está en
`supabase/migrations/20261002000100_company_setup.sql`. El paquete incluye la
configuración de Supabase CLI; no necesitas ejecutar `supabase init` de nuevo.

En la carpeta principal `abysta`, ejecuta:

```bash
npx supabase@2.119.0 login
npx supabase@2.119.0 link --project-ref TU_PROJECT_REF
npx supabase@2.119.0 db push --dry-run --skip-vault
```

Sustituye `TU_PROJECT_REF` por el identificador de tu proyecto de desarrollo en
Supabase: aparece en la URL del panel después de `/project/`. No es el nombre
visible del proyecto. Elige el proyecto que usa tu `web/.env.local`. Introduce
cualquier contraseña solicitada únicamente en la terminal; no la envíes al chat.

En un proyecto nuevo, el ensayo debe mostrar únicamente nuestra migración
pendiente `20261002000100_company_setup.sql`. En `abysta-dev` ya está aplicada,
por lo que el ensayo debe indicar que no hay migraciones pendientes. Si aparecen
otras migraciones, historial incompatible o tablas Abysta ya existentes,
detente y revisa ese resultado antes de aplicar nada. No uses `db reset`,
`--include-all` ni reparaciones de historial para saltarte un error.

Cuando el ensayo sea correcto, aplica la migración:

```bash
npx supabase@2.119.0 db push --skip-vault
```

La migración crea las tablas `operator_tenant` y `membership`, recibos privados
para evitar duplicados, políticas de lectura y la función de creación. No borra
datos existentes. No ejecutes también el SQL manualmente: utiliza un único
historial de migraciones. En `abysta-dev` se aplicó y se comprobó su historial.

## 3. Instalar y arrancar

Se ha verificado con Node.js 24. Usa esa versión para reproducir las pruebas.
Mantén el archivo `web/.env.local` que ya te funciona, con
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Este módulo no
necesita una clave `service_role`. El archivo `.env.local` no debe incluirse en
GitHub.

```bash
cd web
npm ci
npm run test:company
npm run typecheck
npm run lint
npm run build -- --webpack
npm run dev
```

Abre <http://localhost:3000/protected>, inicia sesión y confirma el correo si aún
no lo has hecho. Crea una empresa de prueba, por ejemplo **Abysta Demo Ltd**,
con **GBP** y **Europe/London**. Debes ver **Your company is ready.**

## 4. Comprobar con tu Supabase

| Comprobación | Resultado esperado | Responsable / evidencia |
| --- | --- | --- |
| Crear la empresa con usuario A confirmado | Una empresa y una membresía Owner | Verificado |
| Recargar, cerrar sesión y volver a entrar | Misma empresa; no vuelve a pedir el alta | Verificado |
| Enviar dos veces el mismo alta | Sin empresas ni propietarios duplicados | Verificado |
| Entrar con usuario B en otro navegador | No ve la empresa A y ve su propio onboarding | Verificado |
| Consultar sin autorización | La solicitud es rechazada y no devuelve datos | Verificado |
| Revocar una membresía de prueba desde administración | La siguiente lectura ya no devuelve su empresa | Verificado |
| Ejecutar dos altas simultáneas del mismo actor | Una sola empresa | Verificado |

Las pruebas locales cubren 7 casos de validación y 35 casos de base de datos.
El runner de base de datos muestra 36 tests porque también cuenta el contenedor
padre. Estas pruebas usan PostgreSQL en memoria (PGlite) y una simulación mínima
de Auth. No sustituyen las comprobaciones anteriores sobre Supabase real, su API
y sesiones independientes.

También pasan TypeScript, ESLint y la compilación de producción con webpack. La
interfaz se comprobó en escritorio y a 390 px sin desbordamiento horizontal. El
informe enlazado arriba documenta los resultados y la limitación de Turbopack en
el entorno aislado.

## 5. Guardar tu avance

Los cambios están publicados en `feature/company-setup`. Antes de fusionarlos,
revisa `git status`, el diff de la rama y el informe de verificación. Añade
únicamente archivos de código, configuración, pruebas y documentación; no añadas
`.env.local`, tokens ni material de trabajo ajeno al módulo.

El siguiente hito será **Clients → Portfolios → Buildings**: cada edificio con
su propia ficha, imagen y visita; las relaciones permitirán agrupar 15 edificios
y seleccionar los que entren en cada tender. Después se conecta el cuestionario
de visita y sus evidencias. Los cálculos llegarán sobre esos datos estructurados.

## Referencias técnicas

- Modelo, permisos y pruebas: `docs/company-data-model.md`.
- Migraciones: <https://supabase.com/docs/guides/local-development/database-migrations>.
- Seguridad de filas: <https://supabase.com/docs/guides/database/postgres/row-level-security>.
- Funciones SQL: <https://supabase.com/docs/guides/database/functions>.
