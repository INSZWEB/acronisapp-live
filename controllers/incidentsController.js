
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');


const incidentsController = {
    listall: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const parnterId = parseInt(req.query.parnterId);

            if (!parnterId) {
                return res.status(400).json({ error: "parnterId is required" });
            }

            // Fetch Partner
            const partner = await prisma.customer.findUnique({
                where: { id: parnterId }
            });



            if (!partner) {
                return res.status(404).json({ error: "Partner not found" });
            }

            const customerTenantId = partner.acronisCustomerTenantId;


            const skip = (page - 1) * limit;

            // Base filter (credential table)
            const whereCondition = {
                AND: [
                    { customerId: customerTenantId },
                ]
            };



            // Fetch credentials + total count
            const [totalCount, result] = await Promise.all([
                prisma.incidentLog.count({ where: whereCondition }),
                prisma.incidentLog.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        extraId: true,
                        severity: true,
                        state: true,
                        resourceId: true,
                        agentId: true,
                        host: true,
                        receivedAt: true,

                    },
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' }
                })
            ]);


            return res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    currentPage: page,
                    pageSize: limit
                }
            });

        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },
    view: async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(parseInt(id))) {
            return res.status(400).json({ error: "Bad Request" });
        }

        const result = await prisma.incidentLog.findUnique({
            where: {
                id: parseInt(id),
            },
            select: {
                id: true,
                incidentId: true,
                extraId: true,
                customerId: true,
                severity: true,
                state: true,
                resourceId: true,
                agentId: true,
                host: true,
                receivedAt: true,
                rawPayload: true,
            },
        });

        if (!result) {
            return res.status(404).json({ error: "Incident not found" });
        }

        let extracted = {};
        if (result.rawPayload) {
            const payload = typeof result.rawPayload === 'string' 
                ? JSON.parse(result.rawPayload) 
                : result.rawPayload;

            extracted = {
                incident_categories: payload.incident_categories || [],
                verdict: payload.verdict || null,
                mitigation_state: payload.mitigation_state || null,
                detections: (payload.detections || []).map(d => ({
                    engine: d.engine,
                    description: d.description,
                    verdict: d.verdict,
                    is_trigger: d.is_trigger,
                    file: {
                        name: d.file?.name || null
                    }
                })),
            };
        }

        return res.status(200).json({ ...result, extracted });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
},


};

module.exports = incidentsController;
