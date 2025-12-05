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


app.use(express.json());
// Add CORS middleware

app.use(cors({
    origin: (origin, callback) => {
	     const allowedOrigins = [ 'http://localhost:3000'];

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

app.use(cookieParser()); // Add this to parse cookies
app.use('/auth', authRoutes);
app.use('/modules', moduleRoutes);
app.use('/userroles', userRoleRoutes);
app.use('/users', userRoutes);


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


/*
app.listen(5000, '0.0.0.0', () => {
    console.log(Server is running on https://0.0.0.0:5000);
});
*/
 