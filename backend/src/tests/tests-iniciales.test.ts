/**
 * tests-iniciales.test.ts
 *
 * Suite de tests unitarios para la funcionalidad de INSERCIÓN DE CANDIDATOS del ATS (LTI).
 *
 * Se cubren las dos familias de tests pedidas en el ejercicio:
 *   1. RECEPCIÓN DE LOS DATOS (validación del formulario / payload de la API).
 *   2. GUARDADO EN BASE DE DATOS (persistencia a través de Prisma).
 *
 * BONUS implementado:
 *   - La base de datos NUNCA se toca: se mockea por completo `@prisma/client`
 *     siguiendo la recomendación de la documentación oficial de Prisma para unit testing
 *     (https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing).
 *   - Se testea además la capa de presentación (controller Express) como tercera familia.
 *   - Se verifica el mapeo de errores de Prisma (P2002 email duplicado, error de conexión).
 */

// ---------------------------------------------------------------------------
// MOCK DE PRISMA
// ---------------------------------------------------------------------------
// `jest.mock` se "hoistea" por encima de los imports, por eso el factory NO puede
// referenciar variables externas salvo las prefijadas con `mock`. Definimos aquí
// un único objeto Prisma simulado que TODAS las instancias de `new PrismaClient()`
// (Candidate, Education, WorkExperience, Resume) compartirán.
jest.mock('@prisma/client', () => {
    const mockPrismaClient = {
        candidate: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
        education: { create: jest.fn(), update: jest.fn() },
        workExperience: { create: jest.fn(), update: jest.fn() },
        resume: { create: jest.fn() },
    };

    // Reproducimos el tipo de error que el código de dominio comprueba con `instanceof`.
    class PrismaClientInitializationError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'PrismaClientInitializationError';
            // El tsconfig del proyecto compila a ES5, donde `extends Error` rompe la
            // cadena de prototipos y `instanceof` deja de funcionar. Restaurarla manualmente
            // es imprescindible para que el código de dominio detecte el error con `instanceof`.
            Object.setPrototypeOf(this, PrismaClientInitializationError.prototype);
        }
    }

    return {
        PrismaClient: jest.fn(() => mockPrismaClient),
        Prisma: { PrismaClientInitializationError },
    };
});

// ---------------------------------------------------------------------------
// IMPORTS (después del mock, para que reciban la versión simulada de Prisma)
// ---------------------------------------------------------------------------
import { PrismaClient, Prisma } from '@prisma/client';
import { validateCandidateData } from '../application/validator';
import { addCandidate } from '../application/services/candidateService';

// Recuperamos la MISMA instancia de Prisma simulada que usan los modelos de dominio.
const prismaMock = new (PrismaClient as unknown as jest.Mock)();

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const buildValidCandidate = (overrides: Record<string, any> = {}) => ({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '612345678',
    address: 'Calle Falsa 123',
    educations: [
        { institution: 'UPC', title: 'Computer Science', startDate: '2018-09-01', endDate: '2022-06-01' },
    ],
    workExperiences: [
        { company: 'ACME', position: 'Developer', description: 'Built stuff', startDate: '2022-07-01', endDate: '2024-01-01' },
    ],
    cv: { filePath: '/uploads/cv.pdf', fileType: 'application/pdf' },
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    // Valores por defecto del "happy path": cada modelo devuelve una fila creada.
    prismaMock.candidate.create.mockResolvedValue({
        id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com',
    });
    prismaMock.education.create.mockResolvedValue({ id: 10 });
    prismaMock.workExperience.create.mockResolvedValue({ id: 20 });
    prismaMock.resume.create.mockResolvedValue({ id: 30 });
});

// ===========================================================================
// FAMILIA 1 — RECEPCIÓN DE LOS DATOS (validación del payload)
// ===========================================================================
describe('Familia 1 — Recepción de datos: validateCandidateData()', () => {
    describe('payload válido', () => {
        it('no lanza ningún error cuando todos los campos son correctos', () => {
            expect(() => validateCandidateData(buildValidCandidate())).not.toThrow();
        });

        it('acepta un candidato sin campos opcionales (phone, address, cv vacío)', () => {
            const data = buildValidCandidate({ phone: '', address: '', cv: {} });
            expect(() => validateCandidateData(data)).not.toThrow();
        });
    });

    // NOTA DE SEGURIDAD: `validateCandidateData` hace un early-return cuando recibe `id`,
    // saltándose TODA la validación. Esto NO es un caso de alta válida: documenta el
    // comportamiento actual del modo edición. Es un riesgo conocido (un payload de "alta"
    // con `id` podría enrutar a `Candidate.save()` en modo update sin validar). Se deja
    // como test de regresión, separado del bloque de alta y sin modificar el código de
    // producción (fuera del alcance de este ejercicio de tests).
    describe('comportamiento documentado: modo edición (id presente) — riesgo conocido', () => {
        it('omite la validación cuando se recibe un id, aunque el resto del payload sea inválido', () => {
            expect(() => validateCandidateData({ id: 99, firstName: '' })).not.toThrow();
        });
    });

    describe('nombre / apellido', () => {
        it('rechaza un firstName vacío', () => {
            expect(() => validateCandidateData(buildValidCandidate({ firstName: '' }))).toThrow('Invalid name');
        });

        it('rechaza un nombre demasiado corto (< 2 caracteres)', () => {
            expect(() => validateCandidateData(buildValidCandidate({ firstName: 'A' }))).toThrow('Invalid name');
        });

        it('rechaza un nombre con caracteres no permitidos (números/símbolos)', () => {
            expect(() => validateCandidateData(buildValidCandidate({ firstName: 'John123' }))).toThrow('Invalid name');
        });

        it('rechaza un nombre que supera los 100 caracteres', () => {
            expect(() => validateCandidateData(buildValidCandidate({ firstName: 'A'.repeat(101) }))).toThrow('Invalid name');
        });

        it('acepta nombres con tildes y ñ', () => {
            expect(() => validateCandidateData(buildValidCandidate({ firstName: 'Begoña', lastName: 'Núñez' }))).not.toThrow();
        });
    });

    describe('email', () => {
        it('rechaza un email con formato inválido', () => {
            expect(() => validateCandidateData(buildValidCandidate({ email: 'not-an-email' }))).toThrow('Invalid email');
        });

        it('rechaza un email ausente', () => {
            expect(() => validateCandidateData(buildValidCandidate({ email: '' }))).toThrow('Invalid email');
        });
    });

    describe('teléfono', () => {
        it('rechaza un teléfono que no empieza por 6, 7 o 9', () => {
            expect(() => validateCandidateData(buildValidCandidate({ phone: '123456789' }))).toThrow('Invalid phone');
        });

        it('rechaza un teléfono con número incorrecto de dígitos', () => {
            expect(() => validateCandidateData(buildValidCandidate({ phone: '61234' }))).toThrow('Invalid phone');
        });
    });

    describe('dirección', () => {
        it('rechaza una dirección de más de 100 caracteres', () => {
            expect(() => validateCandidateData(buildValidCandidate({ address: 'x'.repeat(101) }))).toThrow('Invalid address');
        });
    });

    describe('formación académica', () => {
        it('rechaza una educación sin institución', () => {
            const data = buildValidCandidate({ educations: [{ title: 'CS', startDate: '2020-01-01' }] });
            expect(() => validateCandidateData(data)).toThrow('Invalid institution');
        });

        it('rechaza una educación con fecha de inicio mal formateada', () => {
            const data = buildValidCandidate({ educations: [{ institution: 'UPC', title: 'CS', startDate: '01-01-2020' }] });
            expect(() => validateCandidateData(data)).toThrow('Invalid date');
        });
    });

    describe('experiencia laboral', () => {
        it('rechaza una experiencia sin empresa', () => {
            const data = buildValidCandidate({ workExperiences: [{ position: 'Dev', startDate: '2020-01-01' }] });
            expect(() => validateCandidateData(data)).toThrow('Invalid company');
        });

        it('rechaza una descripción de más de 200 caracteres', () => {
            const data = buildValidCandidate({
                workExperiences: [{ company: 'ACME', position: 'Dev', description: 'd'.repeat(201), startDate: '2020-01-01' }],
            });
            expect(() => validateCandidateData(data)).toThrow('Invalid description');
        });
    });

    describe('CV', () => {
        it('rechaza un CV sin filePath', () => {
            expect(() => validateCandidateData(buildValidCandidate({ cv: { fileType: 'application/pdf' } }))).toThrow('Invalid CV data');
        });
    });
});

// ===========================================================================
// FAMILIA 2 — GUARDADO EN BASE DE DATOS (persistencia con Prisma mockeado)
// ===========================================================================
describe('Familia 2 — Guardado en BBDD: addCandidate()', () => {
    it('persiste el candidato y devuelve la fila creada', async () => {
        const result = await addCandidate(buildValidCandidate());

        expect(prismaMock.candidate.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.candidate.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john.doe@example.com',
                }),
            }),
        );
        expect(result).toEqual(expect.objectContaining({ id: 1 }));
    });

    it('persiste las educaciones asociadas al candidato creado', async () => {
        await addCandidate(buildValidCandidate());

        expect(prismaMock.education.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.education.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ institution: 'UPC', candidateId: 1 }),
            }),
        );
    });

    it('persiste la experiencia laboral asociada al candidato creado', async () => {
        await addCandidate(buildValidCandidate());

        expect(prismaMock.workExperience.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.workExperience.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ company: 'ACME', candidateId: 1 }),
            }),
        );
    });

    it('persiste el CV asociado al candidato creado', async () => {
        await addCandidate(buildValidCandidate());

        expect(prismaMock.resume.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.resume.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ filePath: '/uploads/cv.pdf', candidateId: 1 }),
            }),
        );
    });

    it('guarda solo el candidato cuando no hay colecciones anidadas', async () => {
        const data = buildValidCandidate({ educations: [], workExperiences: [], cv: {} });
        await addCandidate(data);

        expect(prismaMock.candidate.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.education.create).not.toHaveBeenCalled();
        expect(prismaMock.workExperience.create).not.toHaveBeenCalled();
        expect(prismaMock.resume.create).not.toHaveBeenCalled();
    });

    it('NO intenta guardar en BBDD si la validación falla', async () => {
        await expect(addCandidate(buildValidCandidate({ email: 'bad' }))).rejects.toThrow(/Invalid email/);
        expect(prismaMock.candidate.create).not.toHaveBeenCalled();
    });

    // --- Mapeo de errores de Prisma -------------------------------------
    it('traduce el error P2002 (email único) a un mensaje de dominio', async () => {
        prismaMock.candidate.create.mockRejectedValueOnce({ code: 'P2002' });

        await expect(addCandidate(buildValidCandidate())).rejects.toThrow('The email already exists in the database');
    });

    it('traduce un error de conexión de Prisma a un mensaje legible', async () => {
        prismaMock.candidate.create.mockRejectedValueOnce(
            new Prisma.PrismaClientInitializationError('connection refused', '5.13.0'),
        );

        await expect(addCandidate(buildValidCandidate())).rejects.toThrow(/No se pudo conectar con la base de datos/);
    });
});

// ===========================================================================
// BONUS — CAPA DE PRESENTACIÓN (controller Express)
// ===========================================================================
// Probamos el controller de extremo a extremo del backend (controller → servicio →
// validación → Prisma mockeado), verificando el mapeo de respuestas HTTP
// (201 éxito / 400 error). Mockear el módulo del servicio aquí no es viable porque
// `jest.mock` se "hoistea" y rompería la Familia 2, así que reutilizamos el Prisma mock.
import { addCandidateController } from '../presentation/controllers/candidateController';

const buildRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('Bonus — Controller: addCandidateController()', () => {
    it('responde 201 con el candidato cuando los datos son válidos', async () => {
        const req: any = { body: buildValidCandidate() };
        const res = buildRes();

        await addCandidateController(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Candidate added successfully',
                data: expect.objectContaining({ id: 1 }),
            }),
        );
    });

    it('responde 400 con el mensaje de error cuando el payload es inválido', async () => {
        const req: any = { body: buildValidCandidate({ email: 'bad' }) };
        const res = buildRes();

        await addCandidateController(req, res);

        expect(prismaMock.candidate.create).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error adding candidate',
                error: expect.stringContaining('Invalid email'),
            }),
        );
    });
});
