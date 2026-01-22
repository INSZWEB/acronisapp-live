const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateDocx } = require("../services/generateDocx");
const { generatePpt } = require("../services/generatePpt");
const fs = require("fs");
const path = require("path");
const { createTransporter } = require('../config/mailConfig')

const transporter = createTransporter();

const sendMail = async ({ to, subject, body, attachments }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html: body,
    attachments,
  };

  await transporter.sendMail(mailOptions);
};

const UPLOAD_BASE = path.join(process.cwd(), "uploads");
function resolveUploadPath(relativePath) {
  return path.join(
    process.cwd(),
    relativePath.replace(/^\/+/, "") // remove leading slash
  );
}

exports.getStatus = async (req, res) => {
  const { parnterId } = req.params;

  let kickoff = await prisma.parnterKickoff.findFirst({
    where: { parnterId: parseInt(parnterId) }
  });

  if (!kickoff) {
    kickoff = await prisma.parnterKickoff.create({
      data: { parnterId: parseInt(parnterId) }
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


exports.sendMailData = async (req, res) => {
  try {
    const { parnterId, } = req.body;
    const parsedPartnerId = parseInt(parnterId);

    const partner = await prisma.partner.findUnique({
      where: { id: parsedPartnerId },
      select: { tenantName: true, contactEmail: true },
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
       <a href="${process.env.NEXT_PUBLIC_BASE_URL_FRONTEND}Onboarding">
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
    const attachments = [];

    if (pptFile?.relativePath) {
      attachments.push({
        filename: "Partner_Kickoff_Slides.pptx",
        path: resolveUploadPath(pptFile.relativePath),
      });
    }

    if (docxFile?.relativePath) {
      attachments.push({
        filename: "Partner_NDA.docx",
        path: resolveUploadPath(docxFile.relativePath),
      });
    }

    if (mdrPath) {
      attachments.push({
        filename: "Insightz_MDR_Document.pdf",
        path: resolveUploadPath(mdrPath),
      });
    }

    await sendMail({
      to: partner.contactEmail,
      subject: "Welcome to Insightz MDR Partnership",
      body: emailBody,
      attachments: attachments
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

// exports.sendMailData = async (req, res) => {
//   console.log("📌 sendMailData API called");

//   try {
//     console.log("📥 Request body:", req.body);

//     const { parnterId } = req.body;
//     const parsedPartnerId = parseInt(parnterId);

//     console.log("🔢 Parsed Partner ID:", parsedPartnerId);

//     // 1️⃣ Fetch partner
//     console.log("🔍 Fetching partner details...");
//     const partner = await prisma.partner.findUnique({
//       where: { id: parsedPartnerId },
//       select: { tenantName: true, contactEmail: true },
//     });

//     if (!partner) {
//       console.warn("⚠️ Partner not found");
//       return res.status(404).json({ message: "Partner not found" });
//     }

//     console.log("✅ Partner found:", partner);

//     const partnerName = partner.tenantName || "Partner";
//     const currentYear = new Date().getFullYear().toString();

//     console.log("📅 Current Year:", currentYear);

//     // 2️⃣ Update kickoff status to PENDING
//     console.log("📝 Updating kickoff status to PENDING...");
//     await prisma.parnterKickoff.updateMany({
//       where: { parnterId: parsedPartnerId },
//       data: { status: "PENDING" },
//     });
//     console.log("✅ Kickoff status updated");

//     // 3️⃣ Generate DOCX
//     console.log("📄 Generating DOCX...");
//     const docxFile = await generateDocx({
//       parnterId: parsedPartnerId,
//       year: currentYear,
//     });
//     console.log("✅ DOCX generated:", docxFile);

//     // 4️⃣ Generate PPT
//     console.log("📊 Generating PPT...");
//     const pptFile = await generatePpt({
//       parnterId: parsedPartnerId,
//       name: partnerName,
//     });
//     console.log("✅ PPT generated:", pptFile);

//     const mdrPath = "uploads/mdr/mdr.pdf";
//     console.log("📁 MDR Path set:", mdrPath);

//     // 5️⃣ Save file paths
//     console.log("💾 Saving document paths to DB...");
//     await prisma.parnterKickoff.updateMany({
//       where: { parnterId: parsedPartnerId },
//       data: {
//         docxPath: docxFile.relativePath,
//         pptPath: pptFile.relativePath,
//         mdrPath: mdrPath,
//       },
//     });
//     console.log("✅ Document paths saved");

//     // 6️⃣ Prepare email
//     console.log("✉️ Preparing email body...");
//     const emailBody = `
//       <p>Dear ${partnerName},</p>
//       <p>Welcome aboard! We’re excited to officially welcome you as a partner...</p>
//       <p>
//         🎥 <b>Customer Self-Onboarding Video:</b><br/>
//         <a href="${process.env.NEXT_PUBLIC_BASE_URL_FRONTEND}Onboarding">
//           Watch the onboarding video
//         </a>
//       </p>
//       <p>Best regards,<br/><b>Insightz Technology Team</b></p>
//     `;

//     // 7️⃣ Prepare attachments
//     console.log("📎 Preparing attachments...");
//     const attachments = [];

//     if (pptFile?.relativePath) {
//       console.log("➕ Adding PPT attachment");
//       attachments.push({
//         filename: "Partner_Kickoff_Slides.pptx",
//         path: resolveUploadPath(pptFile.relativePath),
//       });
//     }

//     if (docxFile?.relativePath) {
//       console.log("➕ Adding DOCX attachment");
//       attachments.push({
//         filename: "Partner_NDA.docx",
//         path: resolveUploadPath(docxFile.relativePath),
//       });
//     }

//     if (mdrPath) {
//       console.log("➕ Adding MDR PDF attachment");
//       attachments.push({
//         filename: "Insightz_MDR_Document.pdf",
//         path: resolveUploadPath(mdrPath),
//       });
//     }

//     console.log("📎 Total attachments:", attachments.length);

//     // 8️⃣ Send email
//     console.log("🚀 Sending email to:", partner.contactEmail);
//     await sendMail({
//       to: partner.contactEmail,
//       subject: "Welcome to Insightz MDR Partnership",
//       body: emailBody,
//       attachments,
//     });

//     console.log("✅ Email sent successfully");

//     res.json({
//       message: "Kickoff mail sent successfully",
//       status: "PENDING",
//     });
//   } catch (err) {
//     console.error("❌ Error in sendMailData:", err);
//     res.status(500).json({
//       message: "Failed to prepare kickoff mail",
//       error: err.toString(),
//     });
//   }
// };


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



// exports.completeKickoff = async (req, res) => {
//   try {
//     const { parnterId,providesApis } = req.body;

//     if (!req.file) {
//       return res.status(400).json({
//         message: "NDA document is required",
//       });
//     }

//     const docxPath = `/uploads/nda/${req.file.filename}`;

//     await prisma.parnterKickoff.updateMany({
//       where: { parnterId: parseInt(parnterId) },
//       data: {
//         status: "COMPLETED",
//         docxPath: docxPath,
//         providesApis: Boolean(providesApis === true || providesApis === "true")

//       },
//     });

//     res.json({
//       message: "Kickoff completed",
//       status: "COMPLETED",
//       docxPath,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// };


exports.completeKickoff = async (req, res) => {
  try {
    const { parnterId, providesApis } = req.body;

    // 🔴 Validate file upload
    if (!req.file) {
      return res.status(400).json({
        message: "NDA document is required",
      });
    }

    const parsedPartnerId = parseInt(parnterId);
    if (isNaN(parsedPartnerId)) {
      return res.status(400).json({ message: "Invalid partnerId" });
    }

    const docxPath = `/uploads/nda/${req.file.filename}`;

    // 🔹 STEP 1: Fetch partner tenantId
    const data = await prisma.partner.findFirst({
      where: { id: parsedPartnerId },
      select: { tenantId: true },
    });

    if (!data) {
      console.warn("❌ Partner not found");
      return res.status(404).json({ message: "Partner not found" });
    }

    // 🔹 STEP 2: Transaction (Kickoff + Credential)
    await prisma.$transaction(async (tx) => {

      // 2.1 Update partner kickoff
      await tx.parnterKickoff.updateMany({
        where: { parnterId: parsedPartnerId },
        data: {
          status: "COMPLETED",
          docxPath: docxPath,
          providesApis: providesApis === true || providesApis === "true",
        },
      });

      // 2.2 Update partner credentials
      const credentialResult = await tx.parnterCredential.updateMany({
        where: {
          partnerTenantId: data.tenantId,
        },
        data: {
          isKickoff: true,
        },
      });

      console.log(
        `✅ Partner credentials updated (${credentialResult.count} rows)`
      );
    });

    // 🔹 STEP 3: Response
    res.json({
      message: "Kickoff completed",
      status: "COMPLETED",
      docxPath,
    });

  } catch (error) {
    console.error("🔥 completeKickoff error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
