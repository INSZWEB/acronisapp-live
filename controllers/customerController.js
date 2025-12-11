
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');


const customerController = {


    add: async (req, res) => {
        try {
            // Destructure the necessary fields from the request body
            const { email, firstName, lastName, mobile, roles } = req.body;

            // Validate required fields
            if (!firstName || !email || !roles) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // // Validate email format
            // if (!/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)) {
            //     return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.INVALID_EMAIL_FORMAT });
            // }

            // Check if email already exists
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
            }

            // Generate a random password and hash it
            const password = generateRandomPassword();
            const hashedPassword = await bcrypt.hash(password, 10);


            // Create a new user with the hashed password
            const user = await prisma.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    mobile: String(mobile),
                    password: hashedPassword,  // Use the hashed password here
                    emailVerified: true,
                    roleId: parseInt(roles),


                },
            });

            await sendVerificationEmail(email, password);

            // If isSelfLogin is true, send verification email
            // if (isSelfLogin) {
            //     
            // }

            // Return the created user and status code
            return res.status(201).json(user);
        } catch (error) {
            return res.status(500).json({ error: 'Error creating user', details: error.message });
        }
    },

    listall: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const parnterId = parseInt(req.query.parnterId);

            if (!parnterId) {
                return res.status(400).json({ error: "parnterId is required" });
            }

            // 1️⃣ Get partner details
            const partner = await prisma.partner.findUnique({
                where: { id: parnterId }
            });

         
            if (!partner) {
                return res.status(404).json({ error: "Partner not found" });
            }

            const partnerTenantId = partner.tenantId; // Get tenantId from Partner table


            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: MESSAGES.INVALID_PAGINATION_PARAMETERS
                });
            }

            const skip = (page - 1) * limit;

            // 2️⃣ Build Customer WHERE condition
            const whereCondition = {
                AND: [
                    {
                        partnerTenantId: partnerTenantId   // ⬅ Filter by partner tenantId
                    }
                ]
            };

            // Search customer name
            if (searchKeyword.trim() !== "") {
                whereCondition.AND.push({
                    acronisCustomerTenantName: {
                        contains: searchKeyword,
                    }
                });
            }

            // Filter by status
            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }

            // 3️⃣ Fetch data + Pagination
            const [totalCount, result] = await Promise.all([
                prisma.customer.count({ where: whereCondition }),
                prisma.customer.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        acronisCustomerTenantId: true,
                        acronisCustomerTenantName: true,
                        status: true,
                    },
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' }
                })
            ]);

            const totalPages = Math.ceil(totalCount / limit);

         
            
            return res.status(STATUS_CODES.OK).json({
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
            res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },


    select: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;


            const whereCondition = {
                AND: [
                    {
                        OR: [
                            { acronisCustomerTenantName: { contains: searchKeywordLower } },
                        ]
                    }
                ]
            };
            const [totalCount, result] = await Promise.all([
                prisma.customer.count({
                    where: whereCondition
                }),
                prisma.customer.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        acronisCustomerTenantName: true,
                    },
                    skip: skip,
                    take: limit,
                    orderBy: {
                        id: 'desc'
                    }
                })
            ]);


            const totalPages = Math.ceil(totalCount / limit);

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

    view: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const result = await prisma.user.findUnique({
                where: {
                    id: parseInt(id),
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    mobile: true,
                    roles: {
                        select: {
                            id: true,
                            roleName: true
                        }
                    },

                }
            });

            if (!result) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            return res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                firstName,
                lastName,
                email,
                mobile,
                roles
            } = req.body;

            // Validate required fields
            if (isNaN(parseInt(id)) || !firstName) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // Check if the user exists
            const existingUser = await prisma.user.findUnique({
                where: { id: parseInt(id) },
            });

            if (!existingUser) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Check if email already exists
            const existingEmail = await prisma.user.findFirst({
                where: {
                    email,
                    NOT: { id: parseInt(id) },
                },
            });

            if (existingEmail) {
                return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
            }

            // Prepare update data for user table
            const updateData = {
                firstName,
                lastName,
                email,
                mobile: String(mobile),
                roleId: parseInt(roles),
            };

            // Update the user record
            const result = await prisma.user.update({
                where: { id: parseInt(id) },
                data: updateData,
            });

            // Respond with the updated user data
            res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    delete: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            await prisma.user.delete({
                where: {
                    id: parseInt(id),
                },
            });

            res.status(STATUS_CODES.NO_CONTENT).send();
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },

};

module.exports = customerController;
