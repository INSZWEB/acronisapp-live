const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateDocx } = require("../services/generateDocx");
const { generatePpt } = require("../services/generatePpt");

exports.getStatus = async (req, res) => {
  const { parnterId } = req.params;

  console.log("parnterId",parnterId)

  let kickoff = await prisma.parnterKickoff.findFirst({
    where: { parnterId:parseInt(parnterId) }
  });

  if (!kickoff) {
    kickoff = await prisma.parnterKickoff.create({
      data: { parnterId:parseInt(parnterId) }
    });
  }

  res.json(kickoff);
};

// exports.sendMail = async (req, res) => {
//   const { parnterId } = req.body;

//   const kickoff = await prisma.parnterKickoff.updateMany({
//     where: { parnterId:parseInt(parnterId) },
//     data: { status: "PENDING" }
//   });

//   // 👉 Here you can integrate Nodemailer / SES later
//   res.json({ message: "Kickoff mail sent", status: "PENDING" });
// };

exports.sendMail = async (req, res) => {
  try {
    const { parnterId } = req.body;
    const parsedPartnerId = parseInt(parnterId);

    console.log("parnterId", parsedPartnerId);

    // 1️⃣ Fetch partner details
    const partner = await prisma.partner.findUnique({
      where: { id: parsedPartnerId },
      select: {
        tenantName: true, // Get the partner name
      },
    });

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const partnerName = partner.tenantName || "Partner"; // fallback name
    const currentYear = new Date().getFullYear().toString();

    // 2️⃣ Update kickoff status
    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parsedPartnerId },
      data: { status: "PENDING" },
    });

    // 3️⃣ Generate DOCX
    const docxFile = await generateDocx({
      parnterId: parsedPartnerId,
      year: currentYear, // dynamic year
    });

    // 4️⃣ Generate PPT
    const pptFile = await generatePpt({
      parnterId: parsedPartnerId,
      name: partnerName, // dynamic partner name
    });

    // 5️⃣ Store file paths in DB
    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parsedPartnerId },
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
//   const { parnterId } = req.body;

//   await prisma.parnterKickoff.updateMany({
//     where: { parnterId:parseInt(parnterId) },
//     data: { status: "COMPLETED" }
//   });

//   res.json({ message: "Kickoff completed", status: "COMPLETED" });
// };
exports.completeKickoff = async (req, res) => {
  try {
    const { parnterId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        message: "NDA document is required",
      });
    }

    const docxPath = `/uploads/nda/${req.file.filename}`;

    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parseInt(parnterId) },
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
