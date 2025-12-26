const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * GET /api/device-policies
 * Query params:
 *  - customerTenantId (required)
 *  - deviceId (optional)
 *  - agentId (optional)
 *  - category = PLAN | POLICY (optional)
 */
exports.getDevicePolicies = async (req, res) => {
    try {
        const {
            customerTenantId,
            deviceId,
            agentId,
            category,
        } = req.query;

        if (!customerTenantId) {
            return res.status(400).json({
                message: "customerTenantId is required",
            });
        }

        const where = {
            customerTenantId,
            ...(deviceId && { deviceId: Number(deviceId) }),
            ...(agentId && { agentId }),
            ...(category && { category }),
        };

        const data = await prisma.devicePolicy.findMany({
            where,
            include: {
                device: {
                    select: {
                        hostname: true,
                        agentId: true,
                        osFamily: true,
                    },
                },
            },
            orderBy: {
                updatedAt: "desc",
            },
        });

        res.json({
            count: data.length,
            data,
        });
    } catch (err) {
        res.status(500).json({
            message: "Failed to fetch device policies",
            error: err.message,
        });
    }
};



/**
 * GET /api/device-policies/plans
 */
exports.getPlans = async (req, res) => {
    req.query.category = "PLAN";
    return exports.getDevicePolicies(req, res);
};

/**
 * GET /api/device-policies/policies
 */
exports.getPolicies = async (req, res) => {
    req.query.category = "POLICY";
    return exports.getDevicePolicies(req, res);
};

/**
 * GET /api/device/:deviceId/policies
 */
exports.getPoliciesByDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;

        // pagination params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // total count (without pagination)
        const count = await prisma.devicePolicy.count({
            where: {
                deviceId: Number(deviceId),
            },
        });

        // paginated data
        const data = await prisma.devicePolicy.findMany({
            where: {
                deviceId: Number(deviceId),
            },
            orderBy: {
                updatedAt: "desc",
            },
            skip,
            take: limit,
        });

        res.json({
            count,   // total policies
            page,
            limit,
            data,    // paginated result
        });
    } catch (err) {
        res.status(500).json({
            message: "Failed to fetch policies for device",
            error: err.message,
        });
    }
};

