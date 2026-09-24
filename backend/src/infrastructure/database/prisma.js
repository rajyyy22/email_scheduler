import { PrismaClient, Prisma } from '@prisma/client';
export { Prisma, PrismaClient };
export const prisma = global.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        errorFormat: 'pretty',
    });
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
//# sourceMappingURL=prisma.js.map