const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();


exports.getDevicePlan = async (req, res) => {
  try {
    const {  agentId } = req.query;

    if (!agentId) {
      return res.status(400).json({
        count: 0,
        data: [],
        message: "agentId is required",
      });
    }

    const where = {
      ...(agentId && { agentId }),
    };

    const data = await prisma.plan.findMany({
      where,
      select: {
        planName: true,
        enabled: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return res.json({
      count: data.length,
      data,
    });
  } catch (err) {
    console.error("getDevicePlan error:", err);

    return res.status(500).json({
      count: 0,
      data: [],
      message: "Failed to fetch device policies",
    });
  }
};



