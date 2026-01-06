const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');
function toRFC3339Range(start, end) {
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);

    if (isNaN(startDate) || isNaN(endDate)) {
        throw new Error("Invalid date format");
    }

    return { startDate, endDate };
}

const categoryController = {
    listall: async (req, res) => {
        try {
            const categories = await prisma.category.findMany({
                where: {
                    disabled: false
                },
                select: {
                    id: true,
                    name: true,
                },
                orderBy: { id: 'asc' },
            });

            return res.status(STATUS_CODES.OK).json({
                success: true,
                data: categories,
            });

        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({
                success: false,
                error: ERROR_MESSAGES.INTERNAL_ERROR,
            });
        }
    },
    alertCategory: async (req, res) => {
        const { customerId, start, end } = req.query;

        try {
            /* ---------- Validate Dates ---------- */
            if (!start || !end) {
                return res.status(400).json({
                    success: false,
                    message: "start and end dates are required (YYYY-MM-DD)",
                });
            }

            let startDate, endDate;
            try {
                ({ startDate, endDate } = toRFC3339Range(start, end));
            } catch {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date format. Use YYYY-MM-DD",
                });
            }

            /* ---------- Customer ---------- */
            const customer = await prisma.customer.findUnique({
                where: { id: Number(customerId) },
                select: { acronisCustomerTenantId: true },
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            /* ---------- Fetch Alerts (createdAt filter) ---------- */
            const alerts = await prisma.alertLog.findMany({
                where: {
                    customerTenantId: customer.acronisCustomerTenantId,
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    rawJson: true,
                },
            });

            /* ---------- Group by Category ---------- */
            const categoryCountMap = {};

            alerts.forEach((a) => {
                const category = a.rawJson?.category || "UNKNOWN";
                categoryCountMap[category] = (categoryCountMap[category] || 0) + 1;
            });

            const result = Object.entries(categoryCountMap).map(
                ([category, count]) => ({
                    category,
                    count,
                })
            );

            return res.status(200).json({
                success: true,
                data: result,
                meta: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    totalAlerts: alerts.length,
                },
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },

    alertMigration: async (req, res) => {
        const { customerId, start, end } = req.query;

        try {
            if (!start || !end) {
                return res.status(400).json({
                    success: false,
                    message: "start and end dates are required (YYYY-MM-DD)",
                });
            }

            const { startDate, endDate } = toRFC3339Range(start, end);

            const customer = await prisma.customer.findUnique({
                where: { id: Number(customerId) },
                select: { acronisCustomerTenantId: true },
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            const alerts = await prisma.alertLog.findMany({
                where: {
                    customerTenantId: customer.acronisCustomerTenantId,
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    rawJson: true,
                },
            });

            let mitigatedCount = 0;
            let notMitigatedCount = 0;

            alerts.forEach(alert => {
                const isMitigated = alert.rawJson?.details?.isMitigated;

                if (isMitigated === true || isMitigated === "true") {
                    mitigatedCount++;
                } else {
                    notMitigatedCount++;
                }
            });

            return res.status(200).json({
                success: true,
                data: [
                    { status: "MITIGATED", count: mitigatedCount },
                    { status: "NOT_MITIGATED", count: notMitigatedCount },
                ],
                meta: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    totalAlerts: alerts.length,
                },
            });

        } catch (error) {
            console.error("alertMigration error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },

    alertSummary: async (req, res) => {
        const { customerId, start, end } = req.query;

        try {
            if (!start || !end) {
                return res.status(400).json({
                    success: false,
                    message: "start and end dates are required (YYYY-MM-DD)",
                });
            }

            const { startDate, endDate } = toRFC3339Range(start, end);

            const customer = await prisma.customer.findUnique({
                where: { id: Number(customerId) },
                select: { acronisCustomerTenantId: true },
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            const alerts = await prisma.alertLog.findMany({
                where: {
                    customerTenantId: customer.acronisCustomerTenantId,
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    rawJson: true,
                },
            });

            const severityCountMap = {};

            alerts.forEach(alert => {
                const severity = alert.rawJson?.severity || "UNKNOWN";
                severityCountMap[severity] =
                    (severityCountMap[severity] || 0) + 1;
            });

            const result = Object.entries(severityCountMap).map(
                ([severity, count]) => ({ severity, count })
            );

            return res.status(200).json({
                success: true,
                data: result,
                meta: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    totalAlerts: alerts.length,
                },
            });

        } catch (error) {
            console.error("alertSummary error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },

    alertDevice: async (req, res) => {
        const customerId = req.query.customerId;

        try {
            const customer = await prisma.customer.findUnique({
                where: { id: Number(customerId) },
                select: { acronisCustomerTenantId: true },
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            const acronisTenantId = customer.acronisCustomerTenantId;

            const devices = await prisma.device.findMany({
                where: { customerTenantId: acronisTenantId },
                select: {
                    online: true,
                    osFamily: true
                },
            });

            // Count Online / Offline
            const onlineCount = devices.filter(d => d.online === true).length;
            const offlineCount = devices.filter(d => d.online === false).length;

            // Count OS family
            const osCounts = devices.reduce((acc, device) => {
                const os = device.osFamily || "Unknown";
                acc[os] = (acc[os] || 0) + 1;
                return acc;
            }, {});

            return res.status(200).json({
                success: true,
                data: {
                    onlineCount,
                    offlineCount,
                    osCounts, // Example: { Windows: 10, macOS: 5, Linux: 3 }
                },
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },
    resource: async (req, res) => {
        const customerId = req.query.customerId;

        try {
            const customer = await prisma.customer.findUnique({
                where: { id: Number(customerId) },
                select: { acronisCustomerTenantId: true },
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            const acronisTenantId = customer.acronisCustomerTenantId;

            const devices = await prisma.resource.findMany({
                where: { customerTenantId: acronisTenantId },
                select: {
                    name: true,
                    attributes: true
                },
            });

            return res.status(200).json({
                success: true,
                data: {
                    devices
                },
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

module.exports = categoryController;
