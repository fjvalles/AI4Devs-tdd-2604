# Prompts — Creación de tests unitarios para LTI (FV)

> **Autor:** Francisco J. Vallés (FV)
> **Ejercicio:** AI4Devs 2026/04 — Creación de tests unitarios para LTI
>

---

## A. Prompts

### 1. Contexto y exploración del dominio
```
Actúa como staff software engineer experto en testing con Jest + TypeScript.
Antes de escribir nada, analiza el backend de este proyecto (arquitectura en capas:
domain / application / presentation). Para la funcionalidad de "insertar candidato",
identifícame:
  - El punto de entrada (controller) y el flujo completo hasta la BBDD.
  - Dónde vive la validación de datos del formulario.
  - Cómo persisten los modelos de dominio (Candidate, Education, WorkExperience, Resume)
    y qué ORM usan.
No escribas tests todavía: dame solo el mapa del flujo y los puntos testeables.
```

### 2. Estrategia de tests (qué probar y por qué)
```
Con ese mapa, propón una estrategia de tests unitarios para la inserción de candidatos
organizada en las DOS familias del enunciado:
  1) Recepción de datos (validación del payload del formulario / API).
  2) Guardado en base de datos.
Para cada familia, lista los casos: happy path, límites (longitudes, formatos de fecha,
teléfono), campos opcionales, modo edición (id presente) y errores de Prisma
(P2002 email duplicado, error de conexión).
Indica qué se debe mockear y qué no, y justifica el aislamiento de la BBDD.
```

### 3. Configuración del entorno de tests
```
Configura Jest con ts-jest para el backend (target ES5 del tsconfig existente).
Crea jest.config.js con testMatch sobre src/tests/**/*.test.ts, testEnvironment node
y clearMocks activado. No modifiques el código de producción.
```

### 4. Mock de Prisma (BONUS — no tocar la BBDD real)
```
Implementa el mock de @prisma/client siguiendo la doc oficial de unit-testing de Prisma.
Requisitos:
  - Un único objeto Prisma simulado compartido por TODAS las instancias de
    `new PrismaClient()` (los modelos lo instancian cada uno por separado).
  - Mockear candidate/education/workExperience/resume con create/update/findUnique.
  - Reproducir Prisma.PrismaClientInitializationError como clase para que el código de
    dominio la detecte con `instanceof`.
  - Respeta la regla de hoisting de jest.mock (sin referenciar variables externas no
    prefijadas con `mock`).
La base de datos no debe tocarse en ningún test.
```

### 5. Familia 1 — Tests de recepción de datos
```
Escribe los tests de la familia "recepción de datos" sobre validateCandidateData:
payload válido, nombre (vacío/corto/caracteres inválidos/>100/tildes y ñ), email,
teléfono (prefijo 6-7-9 y longitud), dirección >100, educación (institución y fecha),
experiencia (empresa y descripción >200), CV inválido, y el caso "id presente => no valida".
Usa un builder buildValidCandidate(overrides) para mantener los tests legibles y DRY.
```

### 6. Familia 2 — Tests de guardado en BBDD
```
Escribe los tests de la familia "guardado" sobre addCandidate con Prisma mockeado:
  - Persiste el candidato y devuelve la fila creada.
  - Persiste educaciones, experiencias y CV con el candidateId correcto.
  - No crea colecciones anidadas si vienen vacías.
  - No llama a Prisma si la validación falla.
  - Traduce P2002 al mensaje "The email already exists in the database".
  - Traduce el error de conexión al mensaje legible de dominio.
Verifica las llamadas con toHaveBeenCalledWith y expect.objectContaining.
```

### 7. Bonus — Capa de presentación (controller)
```
Añade tests del controller Express addCandidateController verificando el mapeo HTTP:
201 con el candidato en datos válidos y 400 con el mensaje de error en payload inválido.
Hazlo de extremo a extremo del backend (controller -> servicio -> Prisma mock); evita
mockear el módulo del servicio porque jest.mock se hoistea y rompería la Familia 2.
```

### 8. Verificación y depuración
```
Ejecuta la suite. Si algo falla, diagnostica la causa raíz antes de cambiar el assert.
(Ojo con ES5: `class extends Error` rompe `instanceof`; restaura el prototipo con
Object.setPrototypeOf en el mock del error de Prisma.)
No relajes una aserción para "que pase": corrige la causa.
```

### 9. Entrega
```
Deja la suite en backend/src/tests/tests-iniciales.test.ts y los prompts en
prompts/prompts-FV.md. Crea la rama tests-iniciales, commit y push, y abre el PR.
Confirma que `npm test` pasa en verde y resume la cobertura por familia.
```

---

## B. Buenas prácticas aplicadas (checklist del módulo)

- **AAA (Arrange-Act-Assert)** en cada test y nombres descriptivos (en español, orientados al negocio).
- **Aislamiento total de la BBDD**: Prisma mockeado; los tests no requieren `DATABASE_URL` ni `prisma generate`.
- **DRY** con `buildValidCandidate(overrides)` y `buildRes()`.
- **`clearMocks` + `beforeEach`** para estado limpio y determinista entre tests.
- **Cobertura de errores**, no solo del happy path (P2002, error de conexión, validación previa al guardado).
- **Test del comportamiento, no de la implementación**: se verifican mensajes de dominio y contratos (status HTTP, llamadas a Prisma), no detalles internos.
- **Causa raíz sobre síntoma**: el fallo de `instanceof` en ES5 se resolvió arreglando el prototipo, no debilitando el assert.

## C. Resultado

- `backend/src/tests/tests-iniciales.test.ts` — **28 tests en verde** (Familia 1: validación, Familia 2: persistencia, Bonus: controller).
- `backend/jest.config.js` — configuración ts-jest.
- BBDD nunca alterada (Prisma 100% mockeado).
