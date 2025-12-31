const pdf = require("html-pdf");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const { createTransporter } = require('../config/mailConfig')

const transporter = createTransporter();
const sendMail = async ({ to, cc, attachment }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,                     // primary recipient
    cc,                     // optional CC
    subject: "EMAIL_AUTH.SUBJECT",
    html: `<p>Please find the invoice attached.</p>`,
    attachments: [
      {
        filename: "invoice.pdf",
        content: attachment, // PDF buffer
        contentType: "application/pdf",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

const generateCustomerReport = async (req, res) => {
  try {
    const {
      customerId,
      month,
      startMonth,
      endMonth,
      year,
      downloadMode = "manual", // manual | auto | forward
      to,
      cc = [],
    } = req.body;

    /* ---------------- DATE RANGE ---------------- */
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();

    let start, end;

    if (month) {
      start = new Date(y, Number(month) - 1, 1);
      end = new Date(y, Number(month), 0, 23, 59, 59);
    } else if (startMonth && endMonth) {
      start = new Date(y, Number(startMonth) - 1, 1);
      end = new Date(y, Number(endMonth), 0, 23, 59, 59);
    } else if (year) {
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31, 23, 59, 59);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const formatDate = d =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    const displayStartDate = formatDate(start);
    const displayEndDate = formatDate(end);

    /* ---------------- CUSTOMER ---------------- */
    const customer = await prisma.customer.findUnique({
      where: { id: Number(customerId) },
      select: {
        partnerTenantId: true,
        partnerTenantName: true,
        acronisCustomerTenantId: true,
        acronisCustomerTenantName: true,
      },
    });

    if (!customer?.acronisCustomerTenantId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    /* ---------------- CONTACT ---------------- */
    const contact = await prisma.parnterContact.findFirst({
      where: {
        tenantId: customer.partnerTenantId,
        types: "company_billing",
      },
      select: {
        email:true,
        address1: true,
        address2: true,
        city: true,
        zipcode: true,
        state: true,
        country: true,
      },
    });

    const customerAddress = contact
      ? [
        contact.address1,
        contact.address2,
        `${contact.city ?? ""} ${contact.zipcode ?? ""}`.trim(),
        contact.state,
        contact.country,
      ]
        .filter(Boolean)
        .join("<br/>")
      : "N/A";

    /* ---------------- DEVICES ---------------- */
    const devices = await prisma.device.findMany({
      where: {
        customerTenantId: customer.acronisCustomerTenantId,
        enabled: true,
        createdAt: {
          gte: start.toISOString(),
          lte: end.toISOString(),
        },
      },
      select: {
        osFamily: true,
        policies: {
          where: { enabled: true },
          select: { policyName: true },
        },
      },
    });

    /* ---------------- POLICIES ---------------- */
    const insightPolicies = new Set();
    devices.forEach(d =>
      d.policies.forEach(p => insightPolicies.add(p.policyName))
    );

    const policyListHTML = insightPolicies.size
      ? [...insightPolicies].map(p => `• ${p}`).join("<br/>")
      : "• No active policies";

    /* ---------------- OS COUNTS ---------------- */
    const osCount = { windows: 0, linux: 0 };

    devices.forEach(d => {
      if (d.osFamily?.toLowerCase() === "windows") osCount.windows++;
      if (d.osFamily?.toLowerCase() === "linux") osCount.linux++;
    });

    const totalDevices = osCount.windows + osCount.linux;

    /* ---------------- PRICING ---------------- */
    const UNIT_PRICE = 6;
    const mdrAmount = totalDevices * UNIT_PRICE;

    /* ---------------- ITEMS ---------------- */
    const items = [
      {
        ln: 1,
        partNo: "-",
        title: "Insight MDR Service",
        body: `
          Acronis Cyber Protect Service<br/><br/>
          <strong>Plan</strong><br/>
          Enabled Policies:<br/>
          ${policyListHTML}<br/><br/>
          <span class="muted">Period: ${displayStartDate} – ${displayEndDate}</span>
        `,
        qty: null,
        unitPrice: null,
        amount: null,
      },
      {
        ln: 2,
        partNo: "-",
        title: "Acronis Cyber Protect MDR Monitoring",
        body: `
          Enabled Devices (device.enabled = true):<br/>
          • Windows: ${osCount.windows}<br/>
          • Linux: ${osCount.linux}<br/><br/>
          <span class="muted">Period: ${displayStartDate} – ${displayEndDate}</span>
        `,
        qty: totalDevices,
        unitPrice: UNIT_PRICE,
        amount: mdrAmount,
      },
    ];

    /* ---------------- TOTALS ---------------- */
    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
    const gst = total * 0.09;
    const grandTotal = total + gst;

    const ROWS_PER_PAGE = 18;
    const page = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));

    const invoiceNo = `INV-${Date.now()}`;
    const invoiceDate = new Date().toISOString().split("T")[0];

    const invoiceData = {
      invoiceNo,
      invoiceDate,
      page,
      customerName: customer.acronisCustomerTenantName,
      customerAddress,
      items,
      total,
      gst,
      grandTotal,
    };

    /* ---------------- HTML ---------------- */
    //const html = `YOUR_HTML_TEMPLATE_HERE`; // 👈 keep your existing HTML exactly

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
body { font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#222;margin:20px;padding:20px; }
table { width:100%; border-collapse:collapse; margin-top:20px; }
thead th { border-bottom:1px solid #eee; padding:8px 6px; }
tbody td { padding:10px 6px; vertical-align:top; }

tbody tr:not(:last-child) td { border-bottom:1px solid #eee; }
.right { text-align:right; }
.header td { vertical-align:top; }
.desc-title { font-weight:bold; margin-bottom:4px; }
.desc-body { font-size:11.5px; line-height:1.5; }
.muted { color:#666; font-size:11px; }
.totals { float:right; width:260px; margin-top:20px; }
.totals .grand { font-weight:bold; border-top:1px solid #eee; padding-top:6px; }
.footer { margin-top:40px; font-size:11px; color:#666; }

</style>
</head>

<body>
 <table width="100%" style="border: none;">
        <tr>
            <!-- LEFT: LOGO + COMPANY -->
            <td width="75%" style="border: none; vertical-align: top;">
                <img src="http://localhost:3000/assets/logo/Insightzlogo.png"
                    style="width:200px; margin-bottom:10px;" />

            </td>

            <!-- RIGHT: INVOICE INFO -->
            <td width="25%" style="border: none; text-align: end; vertical-align: top;">
                <div style="text-align: start; font-size: 13px;">
                    <p style="margin:0;"><b>Insightz Technology Pte Ltd</b></p>
                    <p style="margin:0;">63 Ubi Ave 1 #04-08</p>
                    <p style="margin:0;">Singapore 408937</p>
                    <p style="margin:0;">GST Registration No: 202013305N</p>
                </div>

            </td>

        </tr>
 
    <table width="100%" style="border: none; margin-top:0;padding-top:0;">
      <tr> <td>
 <h6 style="text-align:center; font-size:15px; font-weight:bold; margin:12px 0;">
        TAX INVOICE
    </h6></td>
    </tr>
    </table>

    <table width="100%" style="border: none; margin-top:0;padding-top:0;">
    <tr>
        <!-- LEFT: Customer -->
        <td width="50%" style="border: none; vertical-align: top;">
            <p>
                <strong>Customer:</strong><br />
                ${invoiceData.customerName}<br />
                ${invoiceData.customerAddress}
            </p>
        </td>

        <!-- RIGHT: Invoice Info (aligned right, text left) -->
        <td width="50%" style="border: none; vertical-align: top; text-align: right;">
            <div style="display:inline-block; text-align:left; font-size:13px;">
             <strong>   <p style="margin:0;">
                    Invoice No: ${invoiceData.invoiceNo}<br />
                    Invoice Date: ${invoiceData.invoiceDate}<br />
                    Page: ${invoiceData.page}
                </p></strong>
            </div>
        </td>
    </tr>
    <tr>
        <!-- LEFT: Customer -->
         <td width="50%" style="border: none; vertical-align: top;">
            <p>
                <p>Attn: ${customer?.partnerTenantName} </p><br />
               
            </p>
        </td>

        <!-- RIGHT: Invoice Info (aligned right, text left) -->
       <td width="50%" style="border: none; vertical-align: top; text-align: right;padding-right:"20px">
            <div style="display:inline-block; text-align:left; font-size:13px;">
   <strong>   <p style="margin-right:30px;">
      PO No: 202508148081227<br/>
      Sales: LSD<br/>
      Payment Terms: 30 Days
    </p></strong>
  </div>
</td>

    </tr>
</table>

<table>
<thead>
<tr>
<th>L/N</th>
<th>Part No</th>
<th>Description</th>
<th>Qty</th>
<th>Unit Price</th>
<th>Amount</th>
</tr>
</thead>
<tbody>
${items.map(i => `
<tr>
<td>${i.ln}</td>
<td>${i.partNo}</td>
<td>
  <div class="desc-title">${i.title}</div>
  <div class="desc-body">${i.body}</div>
</td>
<td>${i.qty ?? "-"}</td>
<td>${i.unitPrice != null ? i.unitPrice.toFixed(2) : "-"}</td>
<td>${i.amount != null ? i.amount.toFixed(2) : "-"}</td>
</tr>
`).join("")}
</tbody>
</table>


<!-- Totals (FIXED AT BOTTOM) -->
<div class="totals">
  <p>Total: SGD ${total.toFixed(2)}</p>
  <p>GST (9%): SGD ${gst.toFixed(2)}</p>
  <p class="grand">Grand Total: SGD ${grandTotal.toFixed(2)}</p>
</div>
 <table width="100%" style="border: none; margin-top:0;padding-top:0;">
    <tr><td>
  <div >
    <strong>Cheque Payable to Insightz Technology Pte Ltd</strong>
    <p>Interest at 1.5% per month will be imposed on all overdue invoices<br/>
    THIS IS A COMPUTER GENERATED INVOICE. NO SIGNATURE IS REQUIRED

    </p>
    <strong>For electronic payment,</strong><br/>
        <p>
      
Account Name: Insightz Technology Pte Ltd<br/>
Bank Name: United Overseas Bank Limited<br/>
           Bank Address: UOB Plaza, 80 Raffles Place, Singapore 048624<br/>
Account No (SGD) : 357-314-302-5<br/>
Bank Code: 7375<br/>
Branch Code: 001<br/>
Swift Code: UOVBSGSG<br/>
        </p>
    </div></td></tr></table>
</body>
</html>
`;


    /* ---------------- PDF ---------------- */
    pdf.create(html, { format: "A4" }).toBuffer(async (err, buffer) => {
      if (err) return res.status(500).send("PDF generation failed");

      if (downloadMode === "manual") {
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=${invoiceNo}.pdf`,
          "Content-Length": buffer.length,
        });
        return res.send(buffer);
      }

      if (downloadMode === "auto") {
        await sendMail({
          to: contact?.email,        // customer email
          cc,               // cc emails array or string
          attachment: buffer, // PDF buffer
        });

        return res.json({
          success: true,
          message: "Invoice sent automatically",
        });
      }

      if (downloadMode === "forward") {
        if (!to) return res.status(400).json({ error: "`to` email required" });
        // sendMail({ to, cc, attachment: buffer });
        return res.json({ success: true, message: "Invoice forwarded successfully" });
      }

      return res.status(400).json({ error: "Invalid downloadMode" });
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating invoice");
  }
};

module.exports = { generateCustomerReport };
