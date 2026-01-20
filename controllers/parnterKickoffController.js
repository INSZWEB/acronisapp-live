const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateDocx } = require("../services/generateDocx");
const { generatePpt } = require("../services/generatePpt");

const { createTransporter } = require('../config/mailConfig')

const transporter = createTransporter();

const sendMail = async ({ to, cc, subject, body, attachments }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to:"Pradeep.Rajangam@insightz.tech",
    subject,
    html: body,
    attachments,
  };

  await transporter.sendMail(mailOptions);
};

exports.getStatus = async (req, res) => {
  const { parnterId } = req.params;

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
//   try {
//     const { parnterId } = req.body;
//     const parsedPartnerId = parseInt(parnterId);

//     console.log("parnterId", parsedPartnerId);

//     // 1️⃣ Fetch partner details
//     const partner = await prisma.partner.findUnique({
//       where: { id: parsedPartnerId },
//       select: {
//         tenantName: true, // Get the partner name
//       },
//     });

//     if (!partner) {
//       return res.status(404).json({ message: "Partner not found" });
//     }

//     const partnerName = partner.tenantName || "Partner"; // fallback name
//     const currentYear = new Date().getFullYear().toString();

//     // 2️⃣ Update kickoff status
//     await prisma.parnterKickoff.updateMany({
//       where: { parnterId: parsedPartnerId },
//       data: { status: "PENDING" },
//     });

//     // 3️⃣ Generate DOCX
//     const docxFile = await generateDocx({
//       parnterId: parsedPartnerId,
//       year: currentYear, // dynamic year
//     });

//     // 4️⃣ Generate PPT
//     const pptFile = await generatePpt({
//       parnterId: parsedPartnerId,
//       name: partnerName, // dynamic partner name
//     });

//     // 5️⃣ Store file paths in DB
//     await prisma.parnterKickoff.updateMany({
//       where: { parnterId: parsedPartnerId },
//       data: {
//         docxPath: docxFile.relativePath,
//         pptPath: pptFile.relativePath,
//       },
//     });

//     res.json({
//       message: "Kickoff mail prepared",
//       status: "PENDING",
//       files: {
//         docx: docxFile.relativePath,
//         ppt: pptFile.relativePath,
//       },
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       message: "Failed to prepare kickoff mail",
//       error: err.toString(),
//     });
//   }
// };


// exports.completeKickoff = async (req, res) => {
//   const { parnterId } = req.body;

//   await prisma.parnterKickoff.updateMany({
//     where: { parnterId:parseInt(parnterId) },
//     data: { status: "COMPLETED" }
//   });

//   res.json({ message: "Kickoff completed", status: "COMPLETED" });
// };


exports.sendMail = async (req, res) => {
  try {
    const { parnterId, to, cc } = req.body;
    const parsedPartnerId = parseInt(parnterId);

    const partner = await prisma.partner.findUnique({
      where: { id: parsedPartnerId },
      select: { tenantName: true },
    });

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const partnerName = partner.tenantName || "Partner";
    const currentYear = new Date().getFullYear().toString();

    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parsedPartnerId },
      data: { status: "PENDING" },
    });

    const docxFile = await generateDocx({
      parnterId: parsedPartnerId,
      year: currentYear,
    });

    const pptFile = await generatePpt({
      parnterId: parsedPartnerId,
      name: partnerName,
    });

    const mdrPath = "uploads/mdr/mdr.pdf";

    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parsedPartnerId },
      data: {
        docxPath: docxFile.relativePath,
        pptPath: pptFile.relativePath,
        mdrPath: mdrPath,
      },
    });

    // 📩 Email Body
    const emailBody = `
      <p>Dear ${partnerName},</p>

      <p>Welcome aboard! We’re excited to officially welcome you as a partner and thank you for choosing to work with <b>Insightz Technology</b> to deliver advanced Managed Detection and Response (MDR) services powered by Acronis.</p>

      <p>Our mission is to help partners like you strengthen your cybersecurity offerings with enterprise-grade protection, 24/7 threat monitoring, rapid incident response, and expert security operations.</p>

      <p><b>What you can expect as a partner:</b></p>
      <ul>
        <li>24/7 MDR coverage backed by Acronis technology</li>
        <li>Proactive threat detection and response</li>
        <li>Expert security support from our MDR team</li>
        <li>Scalable services for your customers</li>
        <li>Partner enablement and onboarding support</li>
      </ul>

      <p><b>Next steps:</b></p>
      <ul>
        <li>Our team will reach out to schedule an onboarding session</li>
        <li>You’ll receive documentation to get started quickly</li>
      </ul>

      <p>
        🎥 <b>Customer Self-Onboarding Video:</b><br/>
        <a href="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">
          Watch the onboarding video
        </a>
      </p>

      <p>If you have any questions, our team is here to support you.</p>

      <p>Welcome to the team!</p>

      <p>
        Best regards,<br/>
        <b>Insightz Technology Team</b>
      </p>
    `;

    await sendMail({
      to,
      cc,
      subject: "Welcome to Insightz MDR Partnership",
      body: emailBody,
      attachments: [
        {
          filename: "Partner_Kickoff_Slides.pptx",
          path: pptFile.relativePath,
        },
        {
          filename: "Partner_NDA.docx",
          path: docxFile.relativePath,
        },
        {
          filename: "Insightz_MDR_Document.pdf",
          path: mdrPath,
        },
      ],
    });

    res.json({
      message: "Kickoff mail sent successfully",
      status: "PENDING",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to prepare kickoff mail",
      error: err.toString(),
    });
  }
};



exports.sendMailold = async (req, res) => {
  try {
    const { parnterId } = req.body;
    const parsedPartnerId = parseInt(parnterId);

    // 1️⃣ Fetch partner details
    const partner = await prisma.partner.findUnique({
      where: { id: parsedPartnerId },
      select: {
        tenantName: true,
      },
    });

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const partnerName = partner.tenantName || "Partner";
    const currentYear = new Date().getFullYear().toString();

    // 2️⃣ Update kickoff status
    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parsedPartnerId },
      data: { status: "PENDING" },
    });

    // 3️⃣ Generate DOCX
    const docxFile = await generateDocx({
      parnterId: parsedPartnerId,
      year: currentYear,
    });

    // 4️⃣ Generate PPT
    const pptFile = await generatePpt({
      parnterId: parsedPartnerId,
      name: partnerName,
    });

    // ✅ 5️⃣ MDR PDF path (static file)
    const mdrPath = "uploads/mdr/mdr.pdf";

    // 6️⃣ Store file paths in DB
    await prisma.parnterKickoff.updateMany({
      where: { parnterId: parsedPartnerId },
      data: {
        docxPath: docxFile.relativePath,
        pptPath: pptFile.relativePath,
        mdrPath: mdrPath, // ✅ added
      },
    });

    res.json({
      message: "Kickoff mail prepared",
      status: "PENDING",
      files: {
        docx: docxFile.relativePath,
        ppt: pptFile.relativePath,
        mdr: mdrPath,
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
