const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


const autoInvoiceController = {

    get: async (req, res) => {
        const { customerId } = req.query;

        try {
            /* ---------- Customer ---------- */
            const customer = await prisma.autoInvoice.findUnique({
                where: { customerId: Number(customerId) },
                select: { automail: true,scheduleTiming:true  },
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }


            return res.status(200).json({
                success: true,
                data: customer,
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },
};

module.exports = autoInvoiceController;
