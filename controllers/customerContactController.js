const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');

const customerContactController = {
    add: async (req, res) => {
        try {
            // Destructure the necessary fields from the request body
            const { email, name, mobile, contactMode, customerId } = req.body;

            // Validate required fields
            if (!name || !email) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // Check if email already exists
            const existingUser = await prisma.customerContact.findFirst({
                where: { contactMode, customerId },
            });

            if (existingUser) {
                return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
            }

            // Create a new user with the hashed password
            const user = await prisma.customerContact.create({
                data: {
                    name,
                    email,
                    mobile: String(mobile),
                    contactMode,
                    customerId: parseInt(customerId)

                },
            });

            // Return the created user and status code
            return res.status(201).json(user);
        } catch (error) {
            return res.status(500).json({ error: 'Error creating user', details: error.message });
        }
    },

    // --------------------------------------------------
    // LIST ALL CONTACTS (PAGINATION + SEARCH)
    // --------------------------------------------------
    listall: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const customerId = parseInt(req.query.customerId);

            if (!customerId) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: "customerId is required"
                });
            }


            const skip = (page - 1) * limit;

            // 2️⃣ Build WHERE condition
            const whereCondition = {
                customerId: customerId,
                ...(searchKeyword && {
                    OR: [
                        { email: { contains: searchKeyword, mode: "insensitive" } },
                        { name: { contains: searchKeyword, mode: "insensitive" } },
                    ]
                })
            };

            // 3️⃣ Fetch data + count
            const [totalCount, contacts] = await Promise.all([
                prisma.customerContact.count({ where: whereCondition }),
                prisma.customerContact.findMany({
                    where: whereCondition,
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' },
                    select: {
                        id: true,
                        customerId: true,
                        name: true,
                        mobile: true,
                        contactMode: true,
                        email: true,
                    }
                })
            ]);

            return res.status(STATUS_CODES.OK).json({
                data: contacts,
                pagination: {
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    currentPage: page,
                    pageSize: limit
                }
            });

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },

    // --------------------------------------------------
    // VIEW SINGLE CONTACT
    // --------------------------------------------------
    view: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: ERROR_MESSAGES.BAD_REQUEST
                });
            }

            const contact = await prisma.customerContact.findUnique({
                where: { id: parseInt(id) }
            });

            if (!contact) {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: "Contact not found"
                });
            }

            return res.status(STATUS_CODES.OK).json(contact);

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },
    emergency: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: ERROR_MESSAGES.BAD_REQUEST
                });
            }

            const contact = await prisma.emergencyEscalation.findUnique({
                where: { customerId: parseInt(id) }
            });

            if (!contact) {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: "Contact not found"
                });
            }

            return res.status(STATUS_CODES.OK).json(contact);

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },
    // --------------------------------------------------
    // UPDATE CONTACT (MANUAL EDITABLE FIELDS)
    // --------------------------------------------------
    update: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: ERROR_MESSAGES.BAD_REQUEST
                });
            }

            const existingContact = await prisma.customerContact.findUnique({
                where: { id: parseInt(id) }
            });

            if (!existingContact) {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: "Contact not found"
                });
            }

            const {
                name,
                email,
                mobile,
                contactMode
            } = req.body;

            const updatedContact = await prisma.customerContact.update({
                where: { id: parseInt(id) },
                data: {
                    name,
                    email,
                    mobile: String(mobile),
                    contactMode,
                }
            });

            return res.status(STATUS_CODES.OK).json(updatedContact);

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },
    upsertEmergencyEscalation: async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(parseInt(id))) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                error: ERROR_MESSAGES.BAD_REQUEST
            });
        }

        const {
            emergencyMode,
            whatsapp,
            teams
        } = req.body;

        const escalation = await prisma.emergencyEscalation.upsert({
            where: {
                customerId: parseInt(id)   // must be UNIQUE
            },
            update: {
                emergencyMode,
                whatsapp,
                teams
            },
            create: {
                customerId: parseInt(id),
                emergencyMode,
                whatsapp,
                teams
            }
        });

        return res.status(STATUS_CODES.OK).json(escalation);

    } catch (error) {
        console.error(error);
        return res.status(STATUS_CODES.INTERNAL_ERROR).json({
            error: ERROR_MESSAGES.INTERNAL_ERROR
        });
    }
    
},
 delete: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            await prisma.customerContact.delete({
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

module.exports = customerContactController;
