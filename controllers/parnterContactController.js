const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');

const ParnterContactController = {

    // --------------------------------------------------
    // LIST ALL CONTACTS (PAGINATION + SEARCH)
    // --------------------------------------------------
    listall: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const parnterId = parseInt(req.query.parnterId);

            if (!parnterId) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    error: "parnterId is required"
                });
            }

            // 1️⃣ Fetch Partner
            const partner = await prisma.partner.findUnique({
                where: { id: parnterId },
                select: { tenantId: true }
            });

            if (!partner) {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: "Partner not found"
                });
            }

            const skip = (page - 1) * limit;

            // 2️⃣ Build WHERE condition
            const whereCondition = {
                tenantId: partner.tenantId,
                deletedAt: null,
                ...(searchKeyword && {
                    OR: [
                        { email: { contains: searchKeyword, mode: "insensitive" } },
                        { firstname: { contains: searchKeyword, mode: "insensitive" } },
                        { lastname: { contains: searchKeyword, mode: "insensitive" } },
                        { phone: { contains: searchKeyword } },
                    ]
                })
            };

            // 3️⃣ Fetch data + count
            const [totalCount, contacts] = await Promise.all([
                prisma.parnterContact.count({ where: whereCondition }),
                prisma.parnterContact.findMany({
                    where: whereCondition,
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' },
                    select: {
                        id: true,
                        apiId: true,
                        firstname: true,
                        lastname: true,
                        email: true,
                        types:true
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

            const contact = await prisma.parnterContact.findUnique({
                where: { id: parseInt(id) }
            });

            if (!contact || contact.deletedAt) {
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

            const existingContact = await prisma.parnterContact.findUnique({
                where: { id: parseInt(id) }
            });

            if (!existingContact || existingContact.deletedAt) {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: "Contact not found"
                });
            }

            const {
                firstname,
                lastname,
                email,
                phone,
                title,
                address1,
                address2,
                city,
                state,
                country,
                zipcode,
                website,
                industry,
                organizationSize,
                language
            } = req.body;

            const updatedContact = await prisma.parnterContact.update({
                where: { id: parseInt(id) },
                data: {
                    firstname,
                    lastname,
                    email,
                    phone,
                    title,
                    address1,
                    address2,
                    city,
                    state,
                    country,
                    zipcode,
                    website,
                    industry,
                    organizationSize,
                    language
                }
            });

            return res.status(STATUS_CODES.OK).json(updatedContact);

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    }
};

module.exports = ParnterContactController;
