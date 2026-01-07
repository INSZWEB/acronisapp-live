
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, RESET_PASS_EMAIL, FORGOT_PASS_EMAIL, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createTransporter } = require('../config/mailConfig')
const nodemailer = require('nodemailer');
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const JWT_SECRET = process.env.JWT_SECRET;
// Nodemailer setup (use your email service credentials)
// const transporter = nodemailer.createTransport({
//     service: 'Gmail', // Or use any other email service
//     auth: {
//         user: EMAIL_AUTH.USER,
//         pass: EMAIL_AUTH.PASS,
//     },
// });

const transporter = createTransporter();

const generateResetToken = (userId, email) => {
    return jwt.sign(
        { id: userId, email },
        JWT_SECRET,
        { expiresIn: '1h' }  // Directly use '1h' to test
    );
};

const issueTokenAndRespond = async (user, res) => {
    // --- Create JWT ---
    const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            branchId: user.branchId,
            siteId: user.branchId,
            departmentId: user.departmentNameId,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );

    // --- Fetch role permissions ---
    const rolePermissions = await prisma.userRole.findUnique({
        where: { id: user.roleId },
        include: {
            modules: {
                select: {
                    roleId: true,
                    moduleId: true,
                    view: true,
                    add: true,
                    edit: true,
                    delete: true,
                    module: { select: { id: true, moduleName: true } },
                },
            },
        },
    });

    const formattedPermissions = {
        ...rolePermissions,
        modules: rolePermissions.modules.map(m => ({
            ...m,
            moduleName: m.module.moduleName
        }))
    };

    return res.status(STATUS_CODES.OK).json({
        message: ERROR_MESSAGES.LOGIN_SUCCESS,
        token,
        user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            firstName: user.firstName,
            lastName: user.lastName,
            branchId: user.branchId,
            userType: user.roles?.roleName || null,
            rolePermission: formattedPermissions,
            tempPassword: user.tempPassword
        },
    });
};

const verifyToken = (token) => {
    try {
        // Use your JWT secret key to verify the token
        const decoded = jwt.verify(token, JWT_SECRET); // Replace with your JWT secret key
        return { decoded };
    } catch (error) {
        return { decoded: null, message: error.message };
    }
};
const authController = {
    // login: async (req, res) => {
    //     try {
    //         const { email, password } = req.body;

    //         // --- Find user by email ---
    //         const user = await prisma.user.findUnique({
    //             where: { email },
    //             include: {
    //                 roles: {   // <-- your relation User.role (roleId)
    //                     select: {
    //                         id: true,
    //                         roleName: true
    //                     }
    //                 }
    //             }
    //         });

    //         if (!user) {
    //             return res
    //                 .status(STATUS_CODES.UNAUTHORIZED)
    //                 .json({ error: ERROR_MESSAGES.INVALID_CREDENTIALS });
    //         }

    //         // --- Check if user has permission to login ---
    //         // if (!user.isSelfLogin) {
    //         //     return res
    //         //         .status(STATUS_CODES.FORBIDDEN)
    //         //         .json({ error: ERROR_MESSAGES.NO_PERMISSION_TO_LOGIN });
    //         // }

    //         // --- Check account status ---
    //         if (user.status !== "Active") {
    //             return res
    //                 .status(STATUS_CODES.FORBIDDEN)
    //                 .json({ error: ERROR_MESSAGES.ACCOUNT_INACTIVE });
    //         }

    //         // --- Verify password ---
    //         const isMatch = await bcrypt.compare(password, user.password);
    //         if (!isMatch) {
    //             return res
    //                 .status(STATUS_CODES.UNAUTHORIZED)
    //                 .json({ error: ERROR_MESSAGES.INVALID_CREDENTIALS });
    //         }

    //         // --- Auto verify email ---
    //         if (!user.emailVerified) {
    //             await prisma.user.update({
    //                 where: { id: user.id },
    //                 data: { emailVerified: true },
    //             });
    //         }

    //         // --- Create JWT Token ---
    //         const token = jwt.sign(
    //             {
    //                 id: user.id,
    //                 email: user.email,
    //                 branchId: user.branchId,
    //                 siteId: user.branchId,
    //                 departmentId: user.departmentNameId,
    //             },
    //             process.env.JWT_SECRET,
    //             { expiresIn: "1d" }
    //         );

    //         // --- Fetch role permissions using user.roleId ---
    //         const rolePermissions = await prisma.userRole.findUnique({
    //             where: { id: user.roleId },
    //             include: {
    //                 modules: {
    //                     select: {
    //                         roleId: true,
    //                         moduleId: true,
    //                         view: true,
    //                         add: true,
    //                         edit: true,
    //                         delete: true,
    //                         module: { select: { id: true, moduleName: true } },
    //                     },
    //                 },
    //             },
    //         });

    //         // format modules
    //         const formattedPermissions = {
    //             ...rolePermissions,
    //             modules: rolePermissions.modules.map(m => ({
    //                 ...m,
    //                 moduleName: m.module.moduleName
    //             }))
    //         };

    //         // --- Final Response ---
    //         return res.status(STATUS_CODES.OK).json({
    //             message: ERROR_MESSAGES.LOGIN_SUCCESS,
    //             token,
    //             user: {
    //                 id: user.id,
    //                 email: user.email,
    //                 displayName: user.displayName,
    //                 firstName: user.firstName,
    //                 lastName: user.lastName,
    //                 branchId: user.branchId,
    //                 userType: user.roles.roleName,   // <-- FINAL USER TYPE
    //                 rolePermission: formattedPermissions,
    //                 tempPassword: user.tempPassword
    //             },
    //         });

    //     } catch (error) {
    //         console.error("Login error:", error);
    //         return res
    //             .status(STATUS_CODES.INTERNAL_ERROR)
    //             .json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    //     }
    // },


    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            const user = await prisma.user.findUnique({
                where: { email },
                include: {
                    roles: {
                        select: {
                            id: true,
                            roleName: true
                        }
                    }
                }
            });

            if (!user) {
                return res
                    .status(STATUS_CODES.UNAUTHORIZED)
                    .json({ error: ERROR_MESSAGES.INVALID_CREDENTIALS });
            }

            if (user.status !== "Active") {
                return res
                    .status(STATUS_CODES.FORBIDDEN)
                    .json({ error: ERROR_MESSAGES.ACCOUNT_INACTIVE });
            }

            // --- Verify password ---
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res
                    .status(STATUS_CODES.UNAUTHORIZED)
                    .json({ error: ERROR_MESSAGES.INVALID_CREDENTIALS });
            }

            // 🔐 MFA CHECK (ADD THIS BLOCK)
            if (user.mfaEnabled) {
                return res.status(200).json({
                    mfaRequired: true,
                    userId: user.id,
                    qrCodeShow: user.qrCodeShow,
                    message: "OTP required"
                });
            }

            // --- Auto verify email ---
            if (!user.emailVerified) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { emailVerified: true },
                });
            }

            // --- Create JWT Token (ONLY if MFA not enabled) ---
            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    branchId: user.branchId,
                    siteId: user.branchId,
                    departmentId: user.departmentNameId,
                },
                process.env.JWT_SECRET,
                { expiresIn: "1d" }
            );

            // --- Fetch role permissions ---
            const rolePermissions = await prisma.userRole.findUnique({
                where: { id: user.roleId },
                include: {
                    modules: {
                        select: {
                            roleId: true,
                            moduleId: true,
                            view: true,
                            add: true,
                            edit: true,
                            delete: true,
                            module: { select: { id: true, moduleName: true } },
                        },
                    },
                },
            });

            const formattedPermissions = {
                ...rolePermissions,
                modules: rolePermissions.modules.map(m => ({
                    ...m,
                    moduleName: m.module.moduleName
                }))
            };

            return res.status(STATUS_CODES.OK).json({
                message: ERROR_MESSAGES.LOGIN_SUCCESS,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    branchId: user.branchId,
                    userType: user.roles.roleName,
                    rolePermission: formattedPermissions,
                    tempPassword: user.tempPassword
                },
            });

        } catch (error) {
            console.error("Login error:", error);
            return res
                .status(STATUS_CODES.INTERNAL_ERROR)
                .json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    setupMfa: async (req, res) => {
        try {
            const { userId } = req.body;

            const user = await prisma.user.findUnique({
                where: { id: userId }
            });

            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            // ⛔ Prevent re-setup
            if (!user.qrCodeShow) {
                return res.status(400).json({ error: "MFA already enabled" });
            }

            // Generate secret
            const secret = speakeasy.generateSecret({
                name: `Insightz (${user.email})`,
            });

            // Save secret TEMPORARILY (before verification)
            await prisma.user.update({
                where: { id: userId },
                data: {
                    mfaSecret: secret.base32,
                    qrCodeShow: false
                },
            });

            // Generate QR
            const qrCode = await QRCode.toDataURL(secret.otpauth_url);

            res.json({
                qrCode,
                message: "Scan QR code using Google Authenticator"
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "MFA setup failed" });
        }
    },
    otpVerify: async (req, res) => {
        const { userId, otp } = req.body;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                roles: {
                    select: {
                        id: true,
                        roleName: true
                    }
                }
            }
        });
        if (!user || !user.mfaSecret) {
            return res.status(401).json({ error: "Invalid request" });
        }

        const valid = speakeasy.totp.verify({
            secret: user.mfaSecret,
            encoding: "base32",
            token: otp,
            window: 1,
        });

        if (!valid) {
            return res.status(401).json({ error: "Invalid OTP" });
        }

        // ✅ ENABLE MFA AFTER FIRST SUCCESS
        if (!user.mfaEnabled) {
            await prisma.user.update({
                where: { id: userId },
                data: { mfaEnabled: true },
            });
        }

        // ✅ Issue JWT
        // --- Create JWT Token (ONLY if MFA not enabled) ---
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                branchId: user.branchId,
                siteId: user.branchId,
                departmentId: user.departmentNameId,
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // --- Fetch role permissions ---
        const rolePermissions = await prisma.userRole.findUnique({
            where: { id: user.roleId },
            include: {
                modules: {
                    select: {
                        roleId: true,
                        moduleId: true,
                        view: true,
                        add: true,
                        edit: true,
                        delete: true,
                        module: { select: { id: true, moduleName: true } },
                    },
                },
            },
        });

        const formattedPermissions = {
            ...rolePermissions,
            modules: rolePermissions.modules.map(m => ({
                ...m,
                moduleName: m.module.moduleName
            }))
        };

        return res.status(STATUS_CODES.OK).json({
            message: ERROR_MESSAGES.LOGIN_SUCCESS,
            token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                firstName: user.firstName,
                lastName: user.lastName,
                branchId: user.branchId,
                userType: user.roles.roleName,
                rolePermission: formattedPermissions,
                tempPassword: user.tempPassword
            },
        });
    },

    editProfile: async (req, res) => {
        try {
            const { userId, branchId } = req.query;
            const { firstName, lastName, email, mobileNumber } = req.body;

            if (!userId || !branchId) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // Optional: Validate that the branchId belongs to this user
            const user = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId),
                    branchId: parseInt(branchId)
                },
            });

            if (!user || user.branchId !== parseInt(branchId)) {
                return res.status(STATUS_CODES.UNAUTHORIZED).json({ error: ERROR_MESSAGES.UNAUTHORIZED_BRANCH });
            }

            // Proceed with the update
            const updatedUser = await prisma.user.update({
                where: {
                    id: parseInt(userId),
                    branchId: parseInt(branchId)
                },
                data: {
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    mobileNumber: mobileNumber
                },
            });

            res.status(STATUS_CODES.OK).json({
                message: ERROR_MESSAGES.PROFILE_UPDATE_SUCCESS,
                user: updatedUser,
            });
        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    changePassword: async (req, res) => {
        try {
            const { userId } = req.query;
            const { currentPassword, newPassword, confirmNewPassword } = req.body;


            // Check if newPassword and confirmNewPassword match
            if (newPassword !== confirmNewPassword) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.PASSWORDS_DO_NOT_MATCH });
            }

            // Fetch user from database
            const user = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId)
                }
            });


            if (!user) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Compare current password with the stored password
            const match = await bcrypt.compare(currentPassword, user.password);


            if (!match) {
                return res.status(STATUS_CODES.UNAUTHORIZED).json({ error: ERROR_MESSAGES.INVALID_CURRENT_PASSWORD });
            }

            // Hash the new password and update it in the database
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            await prisma.user.update({
                where: {
                    id: user.id
                },
                data: { password: hashedNewPassword }
            });

            res.status(STATUS_CODES.OK).json({ message: ERROR_MESSAGES.PASSWORD_UPDATE_SUCCESS });

        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    newPassword: async (req, res) => {
        try {
            const { currentPassword, newPassword, confirmNewPassword, userId } = req.body;


            // Check if newPassword and confirmNewPassword match
            if (newPassword !== confirmNewPassword) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.PASSWORDS_DO_NOT_MATCH });
            }

            // Fetch user from database
            const user = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId)
                }
            });


            if (!user) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Compare current password with the stored password
            const match = await bcrypt.compare(currentPassword, user.password);


            if (!match) {
                return res.status(STATUS_CODES.UNAUTHORIZED).json({ error: ERROR_MESSAGES.INVALID_CURRENT_PASSWORD });
            }

            // Hash the new password and update it in the database
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            await prisma.user.update({
                where: {
                    id: user.id
                },
                data: { password: hashedNewPassword, tempPassword: false }
            });

            res.status(STATUS_CODES.OK).json({ message: ERROR_MESSAGES.PASSWORD_UPDATE_SUCCESS });

        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    viewProfile: async (req, res) => {
        try {
            const { userId, branchId } = req.query;

            const user = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId),
                    branchId: parseInt(branchId)
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    branchId: true,
                    mobileNumber: true,
                    userModules: true,
                    status: true,
                    profileImage: true
                }
            });

            if (!user) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            res.status(STATUS_CODES.OK).json({ user });

        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    forgotPassword: async (req, res) => {
        const { email } = req.body;

        try {
            // --- 1. Find user by email ---
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return res.status(404).json({ message: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // --- 2. Generate 6-digit OTP ---
            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            // --- 3. Set OTP expiry (15 minutes from now) ---
            const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

            // --- 4. Save OTP + expiry to user record ---
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    resetOTP: otp,
                    resetOTPExpiresAt: otpExpiresAt,
                },
            });

            // --- 5. Prepare email content ---
            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: user.email,
                subject: FORGOT_PASS_EMAIL.SUBJECT,
                html: `
        <p>${FORGOT_PASS_EMAIL.HTML_P_LINE1}</p>
        <p>${FORGOT_PASS_EMAIL.HTML_P_LINE2}</p>
        <h2 style="color:#007BFF;">${otp}</h2>
        <p>This OTP is valid for 15 minutes.</p>
        <p>${FORGOT_PASS_EMAIL.HTML_P_LINE3}</p>
        <p>${FORGOT_PASS_EMAIL.HTML_P_LINE4}</p>
        <p>${FORGOT_PASS_EMAIL.HTML_P_LINE5}</p>
      `,
            };

            // --- 6. Send OTP email ---
            await transporter.sendMail(mailOptions);

            // --- 7. Respond success ---
            res.json({ message: FORGOT_PASS_EMAIL.CREATE_SUCCESS, userId: user.id, });
        } catch (error) {
            console.error(FORGOT_PASS_EMAIL.CREATE_ERROR, error);
            res.status(500).json({ message: FORGOT_PASS_EMAIL.CREATE_ERROR });
        }
    },
    verifyOTP: async (req, res) => {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({ message: "OTP is required" });
        }

        try {
            // --- Find user by OTP ---
            const user = await prisma.user.findFirst({
                where: { resetOTP: otp },
            });

            if (!user) {
                return res.status(400).json({ message: "Invalid OTP" });
            }

            // --- Check expiry ---
            if (!user.resetOTPExpiresAt || new Date() > user.resetOTPExpiresAt) {
                return res.status(400).json({ message: "OTP expired" });
            }

            // --- Clear OTP after verification ---
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    resetOTP: null,
                    resetOTPExpiresAt: null,
                },
            });

            // --- Generate short-lived JWT token (15 min) ---
            const tempToken = jwt.sign(
                { id: user.id },
                process.env.JWT_SECRET || "TEMP_SECRET",
                { expiresIn: "15m" }
            );

            // --- Send token in response (frontend will store in localStorage) ---
            res.status(200).json({
                success: true,
                message: "OTP verified successfully",
                token: tempToken, // ← send to frontend
            });
        } catch (error) {
            console.error("Error verifying OTP:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    },
    resetPassword: async (req, res) => {
        const { userId, password } = req.body;

        try {
            if (!userId || !password) {
                return res.status(400).json({ message: "User ID and new password are required" });
            }

            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                return res.status(404).json({ message: RESET_PASS_EMAIL.CHECK_TOKEN || "Invalid user" });
            }

            // Hash the new password
            const hashedPassword = await bcrypt.hash(password, 10);

            await prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword },
            });

            return res.json({ message: RESET_PASS_EMAIL.CREATE_SUCCESS || "Password reset successfully" });
        } catch (error) {
            console.error(RESET_PASS_EMAIL.CREATE_ERROR || "Error resetting password:", error);
            return res.status(500).json({ message: RESET_PASS_EMAIL.CREATE_ERROR || "Internal server error" });
        }
    },
    checkAuth: (req, res) => {
        const token = req.cookies.BackendToken;

        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err) => {
            if (err) {
                if (err.name === "TokenExpiredError") {
                    return res.status(401).json({ message: "Token expired, unauthorized" });
                } else if (err.name === "JsonWebTokenError") {
                    return res.status(401).json({ message: "Invalid token, unauthorized" });
                } else {
                    return res.status(401).json({ message: "Unauthorized" });
                }
            }

            res.status(200).json({ message: "Access granted" });
        });
    },
    logout: (req, res) => {
        res.clearCookie("BackendToken", {
            httpOnly: true,
            secure: false, // Use true in production with HTTPS
            sameSite: "lax",
        });
        res.status(200).json({ message: "Logged out successfully" });
    },
    verifyTokenController: async (req, res) => {
        const { token } = req.body;  // Extract token from the request body

        // Check if the token is provided
        if (!token) {
            return res.status(400).json({ message: 'JWT must be provided' });
        }

        try {
            // Call verifyToken to decode and verify the token
            const result = verifyToken(token);

            // Check if token was successfully decoded
            if (result.decoded) {
                return res.json({ valid: true, decoded: result.decoded });  // Respond with decoded token
            } else {
                return res.json({ valid: false, message: result.message });  // Respond with error message if invalid
            }
        } catch (error) {
            // Catch any unexpected errors
            return res.status(500).json({ message: 'An unexpected error occurred', error: error.message });
        }
    },
    updateVerifiedEmail: async (req, res) => {
        try {
            const { userId } = req.body;

            // Validate if userId exists and is a number
            if (!userId || isNaN(userId)) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Check if the user exists
            const existingUser = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId), // Ensure userId is parsed as an integer
                },
            });

            if (!existingUser) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Check if the email is already verified
            if (existingUser.emailVerified) {
                return res.status(STATUS_CODES.CONFLICT).json({ message: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
            }

            // Update the emailVerified field
            const result = await prisma.user.update({
                where: {
                    id: parseInt(userId),
                },
                data: {
                    emailVerified: true, // Set emailVerified to true (Boolean)
                    status: "Active"
                },
            });

            res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    uploadImage: async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'User ID is required' });
            if (!req.file) return res.status(400).json({ error: 'Profile image file is required' });

            const imagePath = `uploads/${req.file.filename}`;

            // Update user in Prisma
            const updatedUser = await prisma.user.update({
                where: { id: Number(userId) },
                data: { profileImage: imagePath },
            });

            res.json({ message: 'Profile image updated successfully', profileImage: updatedUser.profileImage });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }
    },
    viewImage: async (req, res) => {
        try {
            const { userId, branchId } = req.query;

            const user = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId),
                    branchId: parseInt(branchId)
                },
                select: {
                    id: true,
                    profileImage: true,
                    userType: true
                }
            });

            const approvalCount = await prisma.approvalLevel.count({
                where: {
                    status: "Pending Approval",
                },
            });

            if (!user) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            res.status(STATUS_CODES.OK).json({ user, approvalCount });

        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },

};

module.exports = authController;
