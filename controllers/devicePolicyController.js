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
// exports.getDevicePolicies = async (req, res) => {
   
//   try {
//     const {  agentId } = req.query;

//     if (!agentId) {
//       return res.status(400).json({
//         count: 0,
//         data: [],
//         message: "agentId is required",
//       });
//     }

//     const where = {
//       ...(agentId && { agentId }),
//     };

//     const data = await prisma.policy.findMany({
//       where,
//       select: {
//         planName: true,
//         planType:true,
//         enabled: true,
//       },
//       orderBy: {
//         enabled: "desc",
//       },
//     });

//     return res.json({
//       count: data.length,
//       data,
//     });
//   } catch (err) {
//     console.error("getDevicePlan error:", err);

//     return res.status(500).json({
//       count: 0,
//       data: [],
//       message: "Failed to fetch device policies",
//     });
//   }
// };


exports.getDevicePolicies = async (req, res) => {
  try {
    const { agentId, page = 1, limit = 10 } = req.query;

    if (!agentId) {
      return res.status(400).json({
        count: 0,
        data: [],
        message: "agentId is required",
      });
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // total count (for pagination UI)
    const total = await prisma.policy.count({
      where: { agentId },
    });

    const data = await prisma.policy.findMany({
      where: { agentId },
      select: {
        planName: true,
        planType: true,
        enabled: true,
      },
      orderBy: [
        { enabled: "desc" },     // ✅ enabled first
      ],
      skip,
      take: limitNum,
    });

    return res.json({
      count: data.length,        // items in this page
      total,                     // total records
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data,
    });
  } catch (err) {
    console.error("getDevicePolicies error:", err);

    return res.status(500).json({
      count: 0,
      data: [],
      message: "Failed to fetch device policies",
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
        const count = await prisma.policy.count({
            where: {
                deviceId: Number(deviceId),
            },
        });

        // paginated data
        const data = await prisma.policy.findMany({
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

