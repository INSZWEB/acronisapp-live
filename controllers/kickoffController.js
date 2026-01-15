const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateDocx } = require("../services/generateDocx");
const { generatePpt } = require("../services/generatePpt");

exports.getStatus = async (req, res) => {
  const { customerId } = req.params;

  let kickoff = await prisma.customerKickoff.findFirst({
    where: { customerId: parseInt(customerId) }
  });

  if (!kickoff) {
    kickoff = await prisma.customerKickoff.create({
      data: { customerId: parseInt(customerId) }
    });
  }

  res.json(kickoff);
};


exports.sendMail = async (req, res) => {
  try {
    const { customerId } = req.body;

    const parsedCustomerId = parseInt(customerId);

    // 1️⃣ Fetch customer details
    const customer = await prisma.customer.findUnique({
      where: { id: parsedCustomerId },
      select: {
        acronisCustomerTenantName: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const customerName = customer.acronisCustomerTenantName || "Customer";
    const currentYear = new Date().getFullYear().toString();

    // 2️⃣ Update kickoff status
    await prisma.customerKickoff.updateMany({
      where: { customerId: parsedCustomerId },
      data: { status: "PENDING" },
    });

    // 3️⃣ Generate DOCX
    const docxFile = await generateDocx({
      customerId: parsedCustomerId,
      year: currentYear,
    });

    // 4️⃣ Generate PPT (use acronisCustomerTenantName)
    const pptFile = await generatePpt({
      customerId: parsedCustomerId,
      name: customerName,
    });

    // 5️⃣ Store file paths
    await prisma.customerKickoff.updateMany({
      where: { customerId: parsedCustomerId },
      data: {
        docxPath: docxFile.relativePath,
        pptPath: pptFile.relativePath,
      },
    });

    res.json({
      message: "Kickoff mail prepared",
      status: "PENDING",
      files: {
        docx: docxFile.relativePath,
        ppt: pptFile.relativePath,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to prepare kickoff mail",
      error: err.toString(),
    });
  }
};



exports.completeKickoff = async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        message: "NDA document is required",
      });
    }

    const docxPath = `/uploads/nda/${req.file.filename}`;

    await prisma.customerKickoff.updateMany({
      where: { customerId: parseInt(customerId) },
      data: {
        status: "COMPLETED",
        docxPath: docxPath,
      },
    });

    res.json({
      message: "Kickoff completed",
      status: "COMPLETED",
      docxPath,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
