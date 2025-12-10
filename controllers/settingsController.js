const prisma = require("../prismaClient");

// Utility: Always ensure a settings row exists
async function ensureSettingsRow() {
  let settings = await prisma.settings.findFirst();

  if (!settings) {
    // Create default row if missing
    settings = await prisma.settings.create({
      data: {
        customerLogInterval: 5,
        customerDeviceInterval: 12,
      },
    });
  }

  return settings;
}

// -----------------------------
// Update Customer Log Interval
// -----------------------------
exports.updateLogInterval = async (req, res) => {
  try {
    const { customerLogInterval } = req.body;

    if (!customerLogInterval && customerLogInterval !== 0) {
      return res.status(400).json({
        message: "customerLogInterval is required",
      });
    }

    const settings = await ensureSettingsRow();

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: { customerLogInterval },
    });

    return res.json({
      message: "Customer Log Interval updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// -----------------------------
// Update Customer Device Interval
// -----------------------------
exports.updateDeviceInterval = async (req, res) => {
  try {
    const { customerDeviceInterval } = req.body;

    if (!customerDeviceInterval && customerDeviceInterval !== 0) {
      return res.status(400).json({
        message: "customerDeviceInterval is required",
      });
    }

    const settings = await ensureSettingsRow();

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: { customerDeviceInterval },
    });

    return res.json({
      message: "Customer Device Interval updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
