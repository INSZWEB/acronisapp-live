
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');


const contractController = {
    list: async (req, res) => {
        try {
            const { id } = req.query;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const result = await prisma.customerContract.findUnique({
                where: {
                    id: parseInt(id),
                },
                select: {
                    id: true,
                    name: true,
                    installationId: true,
                    endDate: true,
                    serialNumber: true

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
    contractView: async (req, res) => {
        try {
            const { id } = req.query;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const result = await prisma.customerContract.findUnique({
                where: {
                    customerId: parseInt(id),
                },
                select: {
                    id: true,
                    startDate: true,
                    name: true,
                    installationId: true,
                    endDate: true,
                    serialNumber: true,
                    seats: true

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
            const { startDate, endDate } = req.body;

            if (isNaN(parseInt(id))) {
                return res
                    .status(STATUS_CODES.BAD_REQUEST)
                    .json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const result = await prisma.customerContract.upsert({
                where: {
                    customerId: parseInt(id),
                },
                update: {
                    startDate,
                    endDate,
                },
                create: {
                    customerId: parseInt(id), // ⚠️ only if ID is NOT auto-generated
                    startDate,
                    endDate,
                    serialNumber: "12234567890",
                    installationId: "67890",
                    name: "Insightz Technology"
                },
            });

            return res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            return res
                .status(STATUS_CODES.INTERNAL_ERROR)
                .json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    seats: async (req, res) => {
        try {
            const { seats, id } = req.body;

            const customerId = parseInt(id);
            const seatCount = parseInt(seats);

            // ---------------- VALIDATION ----------------
            if (isNaN(customerId) || isNaN(seatCount) || seatCount < 1) {
                return res
                    .status(STATUS_CODES.BAD_REQUEST)
                    .json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // ---------------- UPDATE ONLY ----------------
            const result = await prisma.customerContract.update({
                where: {
                    customerId,
                },
                data: {
                    seats: seatCount,
                },
            });

            return res.status(STATUS_CODES.OK).json({
                success: true,
                message: "Seats updated successfully",
                data: result,
            });

        } catch (error) {
            console.error("Seat update error:", error);

            // Record not found
            if (error.code === "P2025") {
                return res.status(STATUS_CODES.NOT_FOUND).json({
                    error: "Customer contract not found",
                });
            }

            return res
                .status(STATUS_CODES.INTERNAL_ERROR)
                .json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },



};

module.exports = contractController;
