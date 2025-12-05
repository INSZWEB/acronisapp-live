
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');

const userRoleController = {
    list: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();
            const requiredFields = ["roleName"];
            
            // Initial where condition
            const whereCondition = {
                AND: [
                    {
                        OR: requiredFields.map(field => ({
                            [field]: { contains: searchKeywordLower }
                        }))
                    },
                    {
                        roleName: { not: 'SuperAdministrator' } // Exclude SuperAdministrator role
                    }
                ]
            };
    
            // Add status filter if provided
            if (searchStatus) {
                whereCondition.AND.push({ status: searchStatus });
            }
    
            // Count total matching records
            const totalCount = await prisma.UserRole.count({ where: whereCondition });
    
            const result = await prisma.UserRole.findMany({
                where: whereCondition,
                select: {
                    id: true,
                    roleName: true,
                },
                skip,
                take: limit,
                orderBy: { id: 'desc' }
            });
    
            // Calculate total pages
            const totalPages = Math.ceil(totalCount / limit);
    
            // Return paginated results
            res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    
    // list: async (req, res) => {
    //     try {
    //         const result = await prisma.UserRole.findMany({
    //             // where: {
    //             //     status: 'Active'
    //             // },
    //             select: {
    //                 id: true,
    //                 roleName: true,
    //             }
    //         });

    //         res.status(STATUS_CODES.OK).json(result);
    //     } catch (error) {
    //         console.error(error);
    //         res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    //     }
    // },
    listall: async (req, res) => {
        try {
            const result = await prisma.UserRole.findMany({
                // where: {
                //     roleName: 'SuperAdministrator'
                // },
                select: {
                    id: true,
                    roleName: true,
                    description: true,
                    modules: {
                        select: {
                            roleId: true,
                            moduleId: true,
                            view: true,
                            add: true,
                            edit: true,
                            delete: true,
                            module: {
                                select: {
                                    id: true,
                                    moduleName: true,
                                }
                            }
                        }
                    }
                }
            });

            res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    add: async (req, res) => {
        const { roleName, description, modules } = req.body; // Expecting roleName, description, and an array of modules with permissions
        // Check if email already exists
        const existingUser = await prisma.userRole.findUnique({
            where: { roleName },
        });

        if (existingUser) {
            return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.USER_ROLE_ALREADY_EXITS });
        }
        try {
            // Create the UserRole
            const newRole = await prisma.userRole.create({
                data: {
                    roleName,
                    description,
                    modules: {
                        create: modules.map(module => ({
                            module: {
                                connect: { id: module.moduleId } // Connect existing modules
                            },
                            view: module.view || false,
                            add: module.add || false,
                            edit: module.edit || false,
                            delete: module.delete || false,
                        })),
                    },
                },
            });

            return res.status(201).json(newRole);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error creating role with modules' });
        }
    },
    view: async (req, res) => {
        const { id } = req.params; // Get the ID from the request parameters

        try {
            const role = await prisma.userRole.findUnique({
                where: { id: parseInt(id, 10) }, // Convert ID to integer
                // include: {
                //     modules: {
                //         include: {
                //             module: true, // Include module details
                //         },
                //     },
                // },
                select: {
                    id: true,
                    roleName: true,
                    description: true,
                    modules: {
                        select: {
                            roleId: true,
                            moduleId: true,
                            view: true,
                            add: true,
                            edit: true,
                            delete: true,
                            module: {
                                select: {
                                    id: true,
                                    moduleName: true,
                                }
                            }
                        }
                    }
                }
            });

            if (!role) {
                return res.status(404).json({ error: 'Role not found' });
            }

            return res.status(200).json(role);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error fetching role' });
        }
    },
    update: async (req, res) => {
        const { id } = req.params; // Get the ID from the request parameters
        const { roleId, roleName, description, modules } = req.body; // Expecting roleId, roleName, description, and an array of modules with permissions
        const existingUser = await prisma.userRole.findUnique({
            where: {
                roleName,
                NOT: {
                    id: parseInt(id),
                },
            },

        });

        if (existingUser) {
            return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.USER_ROLE_ALREADY_EXITS });
        }
        try {
            // Update existing UserRole
            const updatedRole = await prisma.userRole.update({
                where: { id: parseInt(id, 10) }, // Find the role by its ID
                data: {
                    roleName,
                    description,
                    modules: {
                        deleteMany: {}, // Clear existing module permissions
                        create: modules.map(module => ({
                            module: {
                                connect: { id: module.moduleId }, // Connect existing modules
                            },
                            view: module.view || false,
                            add: module.add || false,
                            edit: module.edit || false,
                            delete: module.delete || false,
                        })),
                    },
                },
                include: {
                    modules: {
                        include: {
                            module: true, // Include module details
                        },
                    },
                },
            });

            return res.status(200).json(updatedRole); // Respond with the updated role
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error updating role with modules' }); // Error handling
        }
    },
    delete: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // 1. First, delete related RoleModules that reference this UserRole
            await prisma.roleModules.deleteMany({
                where: {
                    roleId: parseInt(id), // Use roleId to delete RoleModules associated with the role
                },
            });

            // 2. Then, delete the UserRole itself by its roleName (or `id` if it's unique)
            await prisma.userRole.delete({
                where: {
                    id: parseInt(id), // Assuming you're using the `id` field to identify the UserRole
                },
            });

            res.status(STATUS_CODES.NO_CONTENT).send();
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },




};

module.exports = userRoleController;
