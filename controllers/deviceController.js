
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');


const deviceController = {


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
            const parnterId = parseInt(req.query.parnterId);

            if (!parnterId) {
                return res.status(400).json({ error: "parnterId is required" });
            }

            // Fetch Partner
            const partner = await prisma.customer.findUnique({
                where: { id: parnterId }
            });



            if (!partner) {
                return res.status(404).json({ error: "Partner not found" });
            }

            const partnerTenantId = partner.partnerTenantId;
            const customerTenantId = partner.acronisCustomerTenantId;


            const skip = (page - 1) * limit;

            // Base filter (credential table)
            const whereCondition = {
                AND: [
                    { partnerTenantId: partnerTenantId },
                    { customerTenantId: customerTenantId },
                ]
            };

            if (searchKeyword.trim() !== "") {
                whereCondition.AND.push({
                    clientId: { contains: searchKeyword }
                });
            }

            // Fetch credentials + total count
            const [totalCount, result] = await Promise.all([
                prisma.device.count({ where: whereCondition }),
                prisma.device.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        agentId: true,
                        hostname: true,
                        hostId: true,
                        online: true,
                        enabled: true,
                        osFamily: true,
                        registrationDate: true,
                    },
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' }
                })
            ]);




            return res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
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

            const loggedInUserId = parseInt(1);

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;


            const whereCondition = {
                id: { not: loggedInUserId },
                AND: [
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }





            const [totalCount, result] = await Promise.all([
                prisma.user.count({
                    where: whereCondition
                }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        displayName: true,
                        email: true,
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

            const result = await prisma.device.findUnique({
                where: {
                    id: parseInt(id),
                },
                select: {
                    id: true,
                    agentId: true,
                    hostname: true,
                    hostId: true,
                    online: true,
                    enabled: true,
                    osFamily: true,
                    registrationDate: true

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
    count: async (req, res) => {
        try {
            const { parentId } = req.query;

            if (isNaN(parseInt(parentId))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // 1️⃣ Get partnerTenantId from customer table
            const customer = await prisma.customer.findUnique({
                where: { id: parseInt(parentId) },
                select: { partnerTenantId: true }
            });

            if (!customer) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            const partnerTenantId = customer.partnerTenantId;

            // 2️⃣ Count enabled = true
            const enabledCount = await prisma.device.count({
                where: {
                    partnerTenantId,
                    enabled: true
                }
            });

            // 3️⃣ Count enabled = false
            const disabledCount = await prisma.device.count({
                where: {
                    partnerTenantId,
                    enabled: false
                }
            });

            // 4️⃣ Return counts
            return res.status(STATUS_CODES.OK).json({
                enabled: enabledCount,
                disabled: disabledCount
            });

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    customerCount: async (req, res) => {
        try {
            const { id } = req.query;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: ERROR_MESSAGES.BAD_REQUEST
                });
            }

            // 1️⃣ Get customerTenantId
            const customer = await prisma.customer.findUnique({
                where: { id: parseInt(id) },
                select: { acronisCustomerTenantId: true }
            });

            if (!customer) {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: ERROR_MESSAGES.USER_NOT_FOUND
                });
            }

            const customerTenantId = customer.acronisCustomerTenantId;

            // 2️⃣ Count enabled devices
            const enabledCount = await prisma.device.count({
                where: {
                    customerTenantId,
                    enabled: true
                }
            });

            // 3️⃣ Get last device registration date
            const lastDevice = await prisma.device.findFirst({
                where: {
                    customerTenantId
                },
                orderBy: {
                    registrationDate: 'desc'
                },
                select: {
                    registrationDate: true
                }
            });

            // 4️⃣ Response
            return res.status(STATUS_CODES.OK).json({
                enabled: enabledCount,
                lastDeviceRegistrationDate: lastDevice?.registrationDate || null
            });

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },

    parentcount: async (req, res) => {
        try {


            // 2️⃣ Count enabled = true
            const enabledCount = await prisma.device.count({
                where: {
                    enabled: true
                }
            });

            // 3️⃣ Count enabled = false
            const disabledCount = await prisma.device.count({
                where: {
                    enabled: false
                }
            });

            // 4️⃣ Return counts
            return res.status(STATUS_CODES.OK).json({
                enabled: enabledCount,
                disabled: disabledCount
            });

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    policy: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const get = await prisma.device.findFirst({
                where: {
                    id: parseInt(id),
                },
                select: {
                    id: true,
                    agentId: true,

                }
            });

            console.log("get", get)


            const result = await prisma.policy.findMany({
                where: {
                    agentId: get?.agentId,
                },
                select: {
                    id: true,
                    policyId: true,
                    agentId: true,
                    type: true,
                    name: true,
                    enabled: true,
                }
            });

            console.log("result", result)

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

module.exports = deviceController;
