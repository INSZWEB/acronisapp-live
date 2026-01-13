const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateDocx } = require("../services/generateDocx");
const { generatePpt } = require("../services/generatePpt");

exports.getStatus = async (req, res) => {
  const { customerId } = req.params;

  let kickoff = await prisma.customerKickoff.findFirst({
    where: { customerId:parseInt(customerId) }
  });

  if (!kickoff) {
    kickoff = await prisma.customerKickoff.create({
      data: { customerId:parseInt(customerId) }
    });
  }

  res.json(kickoff);
};

// exports.sendMail = async (req, res) => {
//   const { customerId } = req.body;

//   const kickoff = await prisma.customerKickoff.updateMany({
//     where: { customerId:parseInt(customerId) },
//     data: { status: "PENDING" }
//   });

//   // 👉 Here you can integrate Nodemailer / SES later
//   res.json({ message: "Kickoff mail sent", status: "PENDING" });
// };

exports.sendMail = async (req, res) => {
  try {
    const { customerId } = req.body;

    // 1️⃣ Update kickoff status
    await prisma.customerKickoff.updateMany({
      where: { customerId: parseInt(customerId) },
      data: { status: "PENDING" },
    });

    // 2️⃣ Generate DOCX
    const docxFile = await generateDocx({
      customerId,
      year: "2026",
    });

    // 3️⃣ Generate PPT
    const pptFile = await generatePpt({
      customerId,
      name: "ICS Asia",
    });

    // 4️⃣ (Optional) Store file paths in DB
    await prisma.customerKickoff.updateMany({
      where: { customerId: parseInt(customerId) },
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

// exports.completeKickoff = async (req, res) => {
//   const { customerId } = req.body;

//   await prisma.customerKickoff.updateMany({
//     where: { customerId:parseInt(customerId) },
//     data: { status: "COMPLETED" }
//   });

//   res.json({ message: "Kickoff completed", status: "COMPLETED" });
// };
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
