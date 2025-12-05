// controllers/moduleController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');

const moduleController = {
    list: async (req, res) => {
        try {
            const result = await prisma.module.findMany({
                where: {
                    status: 'Active',
                    allPerimission:false
                },
                select: {
                    id: true,
                    moduleName: true,
                    status: true
                }
            });

            res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },

};

module.exports = moduleController;
