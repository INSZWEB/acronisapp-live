const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');

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
        const customerId = req.query.customerId;

        try {
            const customer = await prisma.customer.findUnique({
                where: { id: Number(customerId) },
                select: { acronisCustomerTenantId: true },
            });

            if (!customer) {
                return res.status(404).json({ success: false, message: "Customer not found" });
            }

            const acronisTenantId = customer.acronisCustomerTenantId;

            const alerts = await prisma.alertLog.findMany({
                where: {
                    customerTenantId: acronisTenantId,
                },
                select: {
                    rawJson: true,
                },
            });

            // 🔥 Group by category & count
            const categoryCountMap = {};

            alerts.forEach(a => {
                const category = a.rawJson?.category || "UNKNOWN";
                categoryCountMap[category] = (categoryCountMap[category] || 0) + 1;
            });

            // Convert to array
            const result = Object.entries(categoryCountMap).map(
                ([category, count]) => ({
                    category,
                    count,
                })
            );

            return res.status(200).json({
                success: true,
                data: result,
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

            const alerts = await prisma.alertLog.findMany({
                where: {
                    customerTenantId: acronisTenantId,
                },
                select: {
                    rawJson: true,
                },
            });

            // 🔥 Mitigation counters
            let mitigatedCount = 0;
            let notMitigatedCount = 0;

            alerts.forEach(alert => {
                const isMitigated = alert.rawJson?.details?.isMitigated;

                if (isMitigated === "true" || isMitigated === true) {
                    mitigatedCount++;
                } else {
                    // false / missing → NOT_MITIGATED
                    notMitigatedCount++;
                }
            });

            return res.status(200).json({
                success: true,
                data: [
                    { status: "MITIGATED", count: mitigatedCount },
                    { status: "NOT_MITIGATED", count: notMitigatedCount },
                ],
            });

        } catch (error) {
            console.error("alertSummary error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    },
    alertSummary: async (req, res) => {
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

            const alerts = await prisma.alertLog.findMany({
                where: {
                    customerTenantId: acronisTenantId,

                },
                select: {
                    rawJson: true,   // ✅ fetch rawJson only
                },
            });

            // 🔥 Group by rawJson.severity
            const severityCountMap = {};

            alerts.forEach(alert => {
                const severity = alert.rawJson?.severity || "UNKNOWN";
                severityCountMap[severity] =
                    (severityCountMap[severity] || 0) + 1;
            });

            const result = Object.entries(severityCountMap).map(
                ([severity, count]) => ({
                    severity,
                    count,
                })
            );

            return res.status(200).json({
                success: true,
                data: result,
            });

        } catch (error) {
            console.error(error);
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




};

module.exports = categoryController;
