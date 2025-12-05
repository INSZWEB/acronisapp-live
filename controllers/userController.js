
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { createTransporter } = require('../config/mailConfig')

const transporter = createTransporter();

const generateRandomPassword = (length = 12) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }
    return password;
};


function generateVerificationToken(userId, email) {
    const payload = { userId, email };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function sendVerificationEmail(email, password) {
    try {

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: email,
            subject: EMAIL_AUTH.SUBJECT,
            html: `
  <p>${EMAIL_AUTH.HTML_P_LINE1}</p>
  <p>${EMAIL_AUTH.HTML_P_LINE3} <strong>${password}</strong></p>
  <p><a href="${process.env.NEXT_PUBLIC_BASE_URL_FRONTEND}" 
     style="
        display: inline-block; 
        padding: 10px 20px; 
        background-color: #0070f3; 
        color: white; 
        text-decoration: none; 
        border-radius: 5px;
     ">
    ${EMAIL_AUTH.HTML_P_LINE5}
  </a></p>
  <p>Or  <strong>${process.env.NEXT_PUBLIC_BASE_URL_FRONTEND}</strong></p>
  <p>${EMAIL_AUTH.HTML_P_LINE4}</p>
  <p>${EMAIL_AUTH.HTML_P_LINE5_1}<br>${EMAIL_AUTH.HTML_P_LINE5_2}</p>
`

        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw new Error(EMAIL_AUTH.CREATE_ERROR);
    }
}

const userController = {


    add: async (req, res) => {
        try {
            // Destructure the necessary fields from the request body
            const {
                displayName,
                firstName,
                lastName,
                email,
                employeeId,
                jobTitle,
                SMSMailID,
                description,
                phone,
                mobile,
                CostPerHour,
                isSelfLogin,
                isVIPUser,
                emailVerified,
                phoneVerified,
                status,
                userType,
                isRequesterView,
                branchId,
                departmentNameId,
                SitesAssociationId,
                GroupAssociationId,
                reportingManagerId,
                rolePermission
            } = req.body;

            // Validate required fields
            if (!firstName || !email || !userType) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // // Validate email format
            // if (!/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)) {
            //     return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.INVALID_EMAIL_FORMAT });
            // }

            // Check if email already exists
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
            }

            // Generate a random password and hash it
            const password = generateRandomPassword();
            const hashedPassword = await bcrypt.hash(password, 10);

            // 15 minutes from now
            const passwordExpiry = new Date(Date.now() + 15 * 60 * 1000);

            // Create a new user with the hashed password
            const user = await prisma.user.create({
                data: {
                    displayName,
                    firstName,
                    lastName,
                    email,
                    employeeId,
                    jobTitle,
                    SMSMailID,
                    description,
                    phone: phone.toString(),
                    mobile: String(mobile),
                    CostPerHour,
                    isSelfLogin,
                    isVIPUser,
                    password: hashedPassword,  // Use the hashed password here
                    emailVerified,
                    phoneVerified,
                    status,
                    userType,
                    isRequesterView,
                    branchId,
                    departmentNameId,
                    SitesAssociationId,
                    GroupAssociationId,
                    reportingManagerId,
                    rolePermission,


                },
            });

            // If isSelfLogin is true, send verification email
            if (isSelfLogin) {
                await sendVerificationEmail(email, password);
            }

            // Return the created user and status code
            return res.status(201).json(user);
        } catch (error) {
            return res.status(500).json({ error: 'Error creating user', details: error.message });
        }
    },

    listall: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();

            const loggedInUserId = parseInt(1);

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;


            const whereCondition = {
                id: { not: loggedInUserId },
                AND: [
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }





            const [totalCount, result] = await Promise.all([
                prisma.user.count({
                    where: whereCondition
                }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        displayName: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        employeeId: true,
                        jobTitle: true,
                        phone: true,
                        mobile: true,
                        userType: true,
                        isVIPUser: true,
                        branchId: true,
                        branchName: {
                            select: {
                                name: true,
                                description: true
                            }
                        },
                        departmentNameId: true,
                        departmentName: {
                            select: {
                                departmentName: true,
                            }
                        },
                        reportingManagerId: true,
                        reportingManager: {
                            select: {
                                firstName: true,
                            }
                        },

                    },
                    skip: skip,
                    take: limit,
                    orderBy: {
                        id: 'desc'
                    }
                })
            ]);

            const totalPages = Math.ceil(totalCount / limit);

            res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    // selectTechnican: async (req, res) => {
    //     try {
    //         const result = await prisma.user.findMany({
    //             where: {
    //                 userType: 'Technician',  // Filter records where status is 'Active'
    //             },
    //             select: {
    //                 id: true,
    //                 displayName: true,  // Select only the 'name' field
    //                 email: true,
    //             },
    //             orderBy: { id: 'desc' }, // Order by ID in descending order
    //         });

    //         res.status(STATUS_CODES.OK).json({
    //             data: result, // Send result as an object with a key
    //         });
    //     } catch (error) {
    //         console.error(error);
    //         res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    //     }
    // },
    selectTechnican: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();

            const loggedInUserId = parseInt(1);

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;

            // Define whereCondition for Prisma queries
            const whereCondition = {
                AND: [
                    { id: { not: loggedInUserId } },
                    { userType: 'Technician' }, // Ensure userType filter is included here
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            // Add status filter if provided
            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }

            // Perform Prisma queries with Promise.all
            const [totalCount, result] = await Promise.all([
                prisma.user.count({ where: whereCondition }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        displayName: true,
                        email: true,
                    },
                    skip: skip,
                    take: limit,
                    orderBy: {
                        id: 'desc'
                    }
                })
            ]);

            // Calculate total pages
            const totalPages = Math.ceil(totalCount / limit);

            // Send response
            res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    searchTechnican: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const groupId = parseInt(req.query.groupId);
            const searchKeywordLower = searchKeyword.toLowerCase();

            const loggedInUserId = 1; // example, replace with real user from session/auth

            if (page <= 0 || limit <= 0) {
                return res
                    .status(STATUS_CODES.BAD_REQUEST)
                    .json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;

            // 🧩 Base filter
            const whereCondition = {
                AND: [
                    { id: { not: loggedInUserId } },
                    { userType: 'Technician' },
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            if (searchStatus) {
                whereCondition.AND.push({ status: searchStatus });
            }

            // 🧠 If groupId is provided, get technicians linked to that group
            if (!isNaN(groupId)) {
                const technicianGroupLinks = await prisma.technicianGroups.findMany({
                    where: { id: groupId },
                    select: { TechniciansId: true }
                });

                // Safely parse and flatten all TechniciansId arrays
                const technicianIds = technicianGroupLinks
                    .flatMap(tg => {
                        try {
                            const parsed =
                                typeof tg.TechniciansId === "string"
                                    ? JSON.parse(tg.TechniciansId)
                                    : tg.TechniciansId;

                            return Array.isArray(parsed)
                                ? parsed.filter(id => Number.isInteger(id))
                                : [];
                        } catch (e) {
                            console.warn(`Invalid TechniciansId format for group ${groupId}`, e);
                            return [];
                        }
                    })
                    .filter(Boolean);

                // If no linked technicians → return empty response
                if (!technicianIds.length) {
                    return res.status(STATUS_CODES.OK).json({
                        data: [],
                        pagination: {
                            totalCount: 0,
                            totalPages: 0,
                            currentPage: page,
                            pageSize: limit
                        }
                    });
                }

                // Add technicianIds filter
                whereCondition.AND.push({
                    id: { in: technicianIds }
                });
            }

            // 🧾 Query DB
            const [totalCount, result] = await Promise.all([
                prisma.user.count({ where: whereCondition }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: { id: true, displayName: true, email: true },
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' }
                })
            ]);

            const totalPages = Math.ceil(totalCount / limit);

            return res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res
                .status(STATUS_CODES.INTERNAL_ERROR)
                .json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },



    select: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();

            const loggedInUserId = parseInt(1);

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;


            const whereCondition = {
                id: { not: loggedInUserId },
                AND: [
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }





            const [totalCount, result] = await Promise.all([
                prisma.user.count({
                    where: whereCondition
                }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        displayName: true,
                        email: true,
                    },
                    skip: skip,
                    take: limit,
                    orderBy: {
                        id: 'desc'
                    }
                })
            ]);


            const totalPages = Math.ceil(totalCount / limit);

            res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    searchMail: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const branchId = parseInt(req.query.branchId);

            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();

            const loggedInUserId = parseInt(1);

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;


            const whereCondition = {
                branchId,
                id: { not: loggedInUserId },
                AND: [
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }





            const [totalCount, result] = await Promise.all([
                prisma.user.count({
                    where: whereCondition
                }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        displayName: true,
                        email: true,
                    },
                    skip: skip,
                    take: limit,
                    orderBy: {
                        id: 'desc'
                    }
                })
            ]);


            const totalPages = Math.ceil(totalCount / limit);

            res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    selectRequester: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const searchStatus = req.query.searchStatus || '';
            const searchKeywordLower = searchKeyword.toLowerCase();

            const loggedInUserId = parseInt(1);

            if (page <= 0 || limit <= 0) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: MESSAGES.INVALID_PAGINATION_PARAMETERS });
            }

            const skip = (page - 1) * limit;

            // Define whereCondition for Prisma queries
            const whereCondition = {
                AND: [
                    { id: { not: loggedInUserId } },
                    { userType: 'Requester' }, // Ensure userType filter is included here
                    {
                        OR: [
                            { firstName: { contains: searchKeywordLower } },
                            { lastName: { contains: searchKeywordLower } },
                            { email: { contains: searchKeywordLower } }
                        ]
                    }
                ]
            };

            // Add status filter if provided
            if (searchStatus) {
                whereCondition.AND.push({
                    status: searchStatus
                });
            }

            // Perform Prisma queries with Promise.all
            const [totalCount, result] = await Promise.all([
                prisma.user.count({ where: whereCondition }),
                prisma.user.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        displayName: true,
                        email: true,
                        phone: true,
                        departmentName: {
                            select: {
                                departmentName: true
                            }
                        },
                        jobTitle: true
                    },
                    skip: skip,
                    take: limit,
                    orderBy: {
                        id: 'desc'
                    }
                })
            ]);

            // Calculate total pages
            const totalPages = Math.ceil(totalCount / limit);

            // Send response
            res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    selectId: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const result = await prisma.user.findUnique({
                where: {
                    id: parseInt(id),
                },
                select: {
                    branchId: true,
                    branchName: {
                        select: {
                            name: true,
                            description: true
                        }
                    },
                }
            });

            if (!result) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            return res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    view: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            const result = await prisma.user.findUnique({
                where: {
                    id: parseInt(id),
                },
                select: {
                    id: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    employeeId: true,
                    jobTitle: true,
                    SMSMailID: true,
                    description: true,
                    phone: true,
                    mobile: true,
                    CostPerHour: true,
                    isSelfLogin: true,
                    isVIPUser: true,
                    userType: true,
                    isRequesterView: true,
                    branchId: true,
                    branchName: {
                        select: {
                            name: true,
                            description: true
                        }
                    },
                    departmentNameId: true,
                    departmentName: {
                        select: {
                            departmentName: true,
                        }
                    },
                    SitesAssociationId: true,
                    SitesAssociation: {
                        select: {
                            name: true,
                        }
                    },
                    GroupAssociationId: true,
                    reportingManagerId: true,
                    reportingManager: {
                        select: {
                            firstName: true,
                        }
                    },
                    rolePermission: true
                }
            });

            if (!result) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // // Parse TechniciansId from string to array
            // // Safely parse GroupAssociationId from string to array
            // const GroupAssociationId = result.GroupAssociationId
            //     ? result.GroupAssociationId.slice(1, -1).split(',').map(Number)
            //     : [];


            // // Fetch technicians' first names based on the parsed IDs
            // const GroupAssociations = await prisma.User.findMany({
            //     where: {
            //         id: {
            //             in: GroupAssociationId,
            //         }
            //     },
            //     select: {
            //         firstName: true,
            //     }
            // });

            // // Add technicians' first names to the result
            // const GroupAssociation = GroupAssociations.map(tech => tech.firstName);

            // // Prepare the final response
            // const response = {
            //     ...result,
            //     GroupAssociation
            // };


            return res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            return res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { displayName,
                firstName,
                lastName,
                email,
                employeeId,
                jobTitle,
                SMSMailID,
                description,
                phone,
                mobile,
                CostPerHour,
                isSelfLogin,
                isVIPUser,
                emailVerified,
                phoneVerified,
                userType,
                isRequesterView,
                branchId,
                departmentNameId,
                SitesAssociationId,
                GroupAssociationId,
                reportingManagerId,
                rolePermission
            } = req.body;

            // Validate required fields
            if (isNaN(parseInt(id)) || !firstName || !userType) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            // Check if the user exists
            const existingUser = await prisma.user.findUnique({
                where: { id: parseInt(id) },
            });

            if (!existingUser) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Check if email already exists
            const existingEmail = await prisma.user.findFirst({
                where: {
                    email,
                    NOT: { id: parseInt(id) },
                },
            });

            if (existingEmail) {
                return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
            }

            // Find the matching record in the requester table where userId matches the user table id
            const requesterRecord = await prisma.requester.findFirst({
                where: {
                    userId: parseInt(id), // Ensure requester record belongs to the user
                },
                select: { id: true } // Get only the requester record ID
            });

            // Only update if a requester record exists
            if (requesterRecord) {
                await prisma.requester.update({
                    where: { id: requesterRecord.id },
                    data: {
                        departmentId: parseInt(departmentNameId),
                        siteId: parseInt(branchId),
                    },
                });
            }

            // Prepare update data for user table
            const updateData = {
                displayName,
                firstName,
                lastName,
                email,
                employeeId,
                jobTitle,
                SMSMailID,
                description,
                phone: String(phone),
                mobile: String(mobile),
                CostPerHour,
                isSelfLogin,
                isVIPUser,
                emailVerified,
                phoneVerified,
                userType,
                isRequesterView,
                branchId,
                departmentNameId: parseInt(departmentNameId),
                SitesAssociationId,
                GroupAssociationId,
                reportingManagerId: parseInt(reportingManagerId),
                rolePermission,
            };

            // Update the user record
            const result = await prisma.user.update({
                where: { id: parseInt(id) },
                data: updateData,
            });

            // --- Check isSelfLogin transition (false → true) ---
            if (!existingUser.isSelfLogin && isSelfLogin === true) {
                // const verificationToken = generateVerificationToken(result.id, email);
                // const verificationLink = `${process.env.NEXT_PUBLIC_BASE_URL_FRONTEND}verifyemail?token=${verificationToken}`;

                // Generate a new temporary password
                // 15 minutes from now
                const tempPassword = generateRandomPassword();
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                const passwordExpiry = new Date(Date.now() + 15 * 60 * 1000);


                // Hash and update password in DB
                await prisma.user.update({
                    where: { id: parseInt(id) },
                    data: { password: hashedPassword, },
                });

                // Send verification email with the plain temp password
                await sendVerificationEmail(email, tempPassword);
            }


            // Respond with the updated user data
            res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },



    // update: async (req, res) => {
    //     try {
    //         const { id } = req.params;
    //         const { displayName,
    //             firstName,
    //             lastName,
    //             email,
    //             employeeId,
    //             jobTitle,
    //             SMSMailID,
    //             description,
    //             phone,
    //             mobile,
    //             CostPerHour,
    //             isSelfLogin,
    //             isVIPUser,
    //             password: hashedPassword,  // Use the hashed password here
    //             emailVerified,
    //             phoneVerified,
    //             userType,
    //             isRequesterView,
    //             branchId,
    //             departmentNameId,
    //             SitesAssociationId,
    //             GroupAssociationId,
    //             reportingManagerId, rolePermission} = req.body;


    //         // Validate required fields
    //         if (isNaN(parseInt(id)) || !firstName || !userType) {
    //             return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
    //         }

    //         // Check if the user exists
    //         const existingUser = await prisma.user.findUnique({
    //             where: {
    //                 id: parseInt(id),
    //             },
    //         });

    //         if (!existingUser) {
    //             return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
    //         }
    //         // Check if email already exists
    //         const existingEmail = await prisma.user.findFirst({
    //             where: {
    //                 email,
    //                 NOT: {
    //                     id: parseInt(id),
    //                 },
    //             },
    //         });

    //         if (existingEmail) {
    //             return res.status(STATUS_CODES.CONFLICT).json({ error: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS });
    //         }

    //         const updateData = {
    //             displayName,
    //             firstName,
    //             lastName,
    //             email,
    //             employeeId,
    //             jobTitle,
    //             SMSMailID,
    //             description,
    //             phone,
    //             mobile,
    //             CostPerHour,
    //             isSelfLogin,
    //             isVIPUser,
    //             password: hashedPassword,  // Use the hashed password here
    //             emailVerified,
    //             phoneVerified,
    //             userType,
    //             isRequesterView,
    //             branchId,
    //             departmentNameId: parseInt(departmentNameId),
    //             SitesAssociationId,
    //             GroupAssociationId,
    //             reportingManagerId: parseInt(reportingManagerId),
    //             rolePermission
    //         };

    //         // Update the user without modifying the email field
    //         const result = await prisma.user.update({
    //             where: {
    //                 id: parseInt(id),
    //             },
    //             data: updateData,
    //         });

    //         // Respond with the updated user data
    //         res.status(STATUS_CODES.OK).json(result);
    //     } catch (error) {
    //         console.error(error);
    //         res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    //     }
    // },

    delete: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
            }

            await prisma.user.delete({
                where: {
                    id: parseInt(id),
                },
            });

            res.status(STATUS_CODES.NO_CONTENT).send();
        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
    updateStatus: async (req, res) => {
        const { userIds, status } = req.body;

        // Validate input data
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.USER_MUST_ARRAY });
        }

        if (!['Active', 'Inactive'].includes(status)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.STATUS_MUST_ACTIVE_INACTIVE });
        }

        try {
            // Perform the update operation
            const result = await prisma.user.updateMany({
                where: {
                    id: { in: userIds }
                },
                data: {
                    status: status
                }
            });

            // Check if any records were updated
            if (result.count === 0) {
                return res.status(STATUS_CODES.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
            }

            // Send success response
            res.status(STATUS_CODES.OK).json({ message: ERROR_MESSAGES.CHANGE_STATUS_SUCCESS });
        } catch (error) {
            // Log the error and send an internal server error response
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
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
                },
            });

            res.status(STATUS_CODES.OK).json(result);
        } catch (error) {
            res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
        }
    },
};

module.exports = userController;
