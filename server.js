const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const cookieParser = require("cookie-parser");

const moduleRoutes = require('./routes/moduleRoutes');
const userRoleRoutes = require('./routes/userRoleRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const callbackRoutes = require( "./routes/callbackRoutes.js");
const parnterRoutes = require( "./routes/parnterRoutes.js");
const customerRoutes = require( "./routes/customerRoutes.js");
const credentialRoutes = require( "./routes/credentialRoutes.js");
const settingsRoutes = require("./routes/settingsRoutes");
const devicesRoutes = require("./routes/devicesRoutes.js");
const alertsRoutes = require("./routes/alertsRoutes.js");
const devicePolicyRoutes = require("./routes/devicePolicyRoutes.js");
const parnterContactRoutes = require("./routes/parnterContactRoutes.js");
const reportRoutes = require('./routes/reportRoutes.js');
const customerContactRoutes = require('./routes/customerContactRoutes.js');
const invoiceRoutes = require('./routes/invoiceRoutes.js');
const contractRoutes = require('./routes/contractRoutes.js');
const categoryRoutes = require('./routes/categoryRoutes.js');
const planRoutes = require('./routes/planRoutes.js');
const syncContactRoutes = require("./routes/syncContactRoutes.js");
const reportsRoutes = require("./routes/reportsRoutes.js");
const kickoffRoutes = require("./routes/kickoffRoutes");
const ParnterKickoffRoutes = require("./routes/ParnterKickoffRoutes.js");
const incidentsRoutes = require("./routes/incidentsRoutes.js");
const autoInvoiceRoutes= require("./routes/autoInvoiceRoutes.js")

require("./scheduler/autoInvoiceScheduler");

//app.use(express.json());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// Add CORS middleware

app.use(cors({
    origin: (origin, callback) => {
	     const allowedOrigins = [ 'http://localhost:3000','https://acronismdr.insightzmss.com',"http://192.168.1.72:3000"];

        // Allow requests with no origin (like Postman or Curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,  // Allow cookies to be sent with requests
}));


app.get('/', (req, res) => {
    res.send('Welcome to the application!');
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/*
app.use((req, res, next) => {
    req.user = { id: 1, branchId: 1 };
    next();
});  
*/

// Protected route
app.get("/api/protected", (req, res) => {
    const token = req.cookies.BackendToken;

    if (token) {
        res.status(200).json({ message: "Access granted" });
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

app.get("/test", async (req, res) => {
  try {
    const result = await testSMTP();
    res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


app.use(cookieParser()); // Add this to parse cookies
app.use('/auth', authRoutes);
app.use('/modules', moduleRoutes);
app.use('/userroles', userRoleRoutes);
app.use('/users', userRoutes);
app.use("/callback", callbackRoutes);
app.use("/parnters", parnterRoutes);
app.use("/customers",customerRoutes);
app.use("/credential",credentialRoutes)
app.use("/settings", settingsRoutes);
app.use('/devices',devicesRoutes);
app.use("/alerts",alertsRoutes);
app.use("/devicepolicy",devicePolicyRoutes);
app.use("/parntercontact",parnterContactRoutes);
app.use("/report",reportRoutes);
app.use("/customercontact",customerContactRoutes);
app.use("/invoice",invoiceRoutes);
app.use("/contract",contractRoutes);
app.use("/category",categoryRoutes);
app.use("/plan",planRoutes);
app.use("/synccontact",syncContactRoutes);
app.use('/g',reportsRoutes)
app.use("/kickoff", kickoffRoutes);
app.use("/parnterKickoff",ParnterKickoffRoutes);
app.use("/incidents",incidentsRoutes);
app.use("/autoinvoice",autoInvoiceRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


/*
app.listen(5000, '0.0.0.0', () => {
    console.log(Server is running on https://0.0.0.0:5000);
});
*/
 
