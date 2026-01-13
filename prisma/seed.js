const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    // Define modules
    const modules = [
        { moduleName: 'Parnters', status: 'Active', allPerimission: false },
        { moduleName: 'Customers', status: 'Active', allPerimission: false },
        { moduleName: 'Settings', status: 'Active', allPerimission: true },
    ];

    // Upsert modules
    for (const module of modules) {
        await prisma.module.upsert({
            where: { moduleName: module.moduleName },
            update: {},
            create: module,
        });
    }

    // Define roles
    const roles = [
        { roleName: 'SuperAdministrator', description: 'Full control to configure and manage application' },
        { roleName: 'Administrator', description: 'Full control to configure and manage application' },
    ];

    // Upsert roles
    for (const role of roles) {
        await prisma.userRole.upsert({
            where: { roleName: role.roleName },
            update: {},
            create: role,
        });
    }

    // Get SuperAdministrator role
    const adminRole = await prisma.userRole.findUnique({
        where: { roleName: 'SuperAdministrator' },
    });

    // Upsert role modules
    const allModules = await prisma.module.findMany();
    for (const module of allModules) {
        await prisma.roleModules.upsert({
            where: {
                roleId_moduleId: {
                    roleId: adminRole.id,
                    moduleId: module.id,
                },
            },
            update: {
                view: true,
                add: true,
                edit: true,
                delete: true,
            },
            create: {
                roleId: adminRole.id,
                moduleId: module.id,
                view: true,
                add: true,
                edit: true,
                delete: true,
            },
        });
    }

    // Create a user with a hashed password
    const hashedPassword = await bcrypt.hash('Password123#', 10);

    // Upsert admin user
    const adminUser = {
        firstName: 'Admin',
        lastName: 'One',
        email: 'admin@gmail.com',
        password: hashedPassword,
        roleId: adminRole.id,   // ✅ Set SuperAdministrator roleId
        emailVerified: true,
        phoneVerified: false,
        status: 'Active',
        verificationc1: {
            create: [
                {
                    verificationType: 'email',
                    verificationCode: 'abcdef',
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
                {
                    verificationType: 'phone',
                    verificationCode: 'fedcba',
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
            ],
        },
    };

    await prisma.user.upsert({
        where: { email: adminUser.email },
        update: {},
        create: adminUser,
    });

}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
