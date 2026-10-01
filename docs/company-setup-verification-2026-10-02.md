# Verificación del alta de empresa — 2 de octubre de 2026

## Resultado

El primer módulo de Abysta quedó verificado contra el proyecto de desarrollo
`abysta-dev`, además de las pruebas locales. El historial local y remoto registra
la versión `20261002000100_company_setup`.

La empresa de desarrollo conservada al terminar es:

- Empresa: `Abysta Demo Ltd`
- Moneda y zona horaria: `GBP`, `Europe/London`
- Estado: `active`
- Membresía: un propietario interno activo

## Comprobaciones locales

| Comprobación | Resultado |
| --- | --- |
| Instalación reproducible con `npm ci` | Correcta; 0 vulnerabilidades informadas |
| Validación de formulario | 7 casos correctos |
| Base de datos y permisos | 35 casos correctos; el runner muestra 36 al contar el contenedor padre |
| TypeScript | Correcto |
| ESLint | Correcto |
| Compilación de producción con webpack | Correcta |

La compilación predeterminada de Next.js usa Turbopack. En este entorno aislado
no pudo abrir su proceso/puerto interno (`Operation not permitted`); la misma
aplicación compiló por completo con `next build --webpack`. Esto documenta una
limitación del entorno de prueba, no un error observado en el código.

## Comprobaciones con Supabase real

| Caso | Evidencia observada |
| --- | --- |
| Alta y doble envío | Una empresa, una membresía Owner y un recibo privado; no hubo duplicados |
| Recarga | Recuperó la misma empresa y no volvió a mostrar el alta |
| Acceso anónimo | Denegado con HTTP 401 / SQLSTATE `42501` |
| Aislamiento entre usuarios | El segundo usuario no pudo leer la empresa del primero y solo vio su propio onboarding |
| Idempotencia concurrente | Dos altas simultáneas con la misma clave devolvieron el mismo UUID; la segunda esperó el bloqueo y quedaron `1/1/1` filas |
| Clave reutilizada con otros datos | Rechazada con SQLSTATE `22023` y `REQUEST_KEY_REUSED` |
| Dos claves concurrentes | Se observó una sesión esperando el advisory lock; la segunda terminó con SQLSTATE `42501` y `ABYSTA_ALREADY_HAS_WORKSPACE`, sin recibo adicional |
| Revocación | Tras cambiar la membresía a `revoked`, la siguiente recarga mostró el onboarding; repetir la petición antigua devolvió `COMPANY_ACCESS_REVOKED` |
| Diseño adaptable | Revisado en escritorio y a 390 px, sin desbordamiento horizontal |

## Limpieza y estado final

Las pruebas avanzadas usaron un usuario, dos empresas y dos recibos temporales.
La limpieza se ejecutó en una transacción con precondiciones estrictas y en este
orden: recibos, membresías y empresas. Después se eliminó el usuario temporal de
Authentication.

La comprobación administrativa final devolvió:

| Recurso | Filas temporales | Total conservado |
| --- | ---: | ---: |
| Usuarios Auth de la prueba | 0 | — |
| Empresas | 0 | 1 |
| Membresías | 0 | 1 |
| Recibos privados | 0 | 1 |

El total conservado corresponde a `Abysta Demo Ltd`; su UUID, creador, moneda,
zona horaria, estado, propietario y recibo se compararon antes y después de la
limpieza y no cambiaron. No se guardaron contraseñas, tokens ni claves de
Supabase en el repositorio.

## Fuera de este hito

Este informe se generó antes de integrar la rama en `main`. El despliegue en
Vercel no formó parte de este hito; al importar el repositorio se debe mantener
**Root Directory** en `web`. Clientes, portfolios, edificios y visitas
pertenecen a los siguientes hitos.
