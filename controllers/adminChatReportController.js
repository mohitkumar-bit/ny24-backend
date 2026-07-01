import User from "../models/authModal.js";
import ChatReport from "../models/ChatReport.js";

export const listChatReports = async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const filter = status === "all" ? {} : { status };

    const reports = await ChatReport.find(filter)
      .populate("reporter", "name email")
      .populate("reportedUser", "name email isBlocked")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      reports: reports.map((report) => ({
        id: report._id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        adminNote: report.adminNote,
        reviewedAt: report.reviewedAt,
        createdAt: report.createdAt,
        conversationId: report.conversationId,
        reporter: report.reporter
          ? {
              id: report.reporter._id,
              name: report.reporter.name,
              email: report.reporter.email,
            }
          : null,
        reportedUser: report.reportedUser
          ? {
              id: report.reportedUser._id,
              name: report.reportedUser.name,
              email: report.reportedUser.email,
              isBlocked: report.reportedUser.isBlocked,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("LIST CHAT REPORTS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const dismissChatReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const report = await ChatReport.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "dismissed",
          adminNote: adminNote?.trim() || "Dismissed by admin",
          reviewedBy: req.admin?._id || req.admin?.id,
          reviewedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.json({ success: true, message: "Report dismissed" });
  } catch (error) {
    console.error("DISMISS CHAT REPORT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const blockUserFromReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const report = await ChatReport.findById(id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    const reportedUser = await User.findById(report.reportedUser);
    if (!reportedUser) {
      return res.status(404).json({ message: "Reported user not found" });
    }

    reportedUser.isBlocked = true;
    reportedUser.accountBlockReason =
      adminNote?.trim() || `Blocked after chat report: ${report.reason}`;
    reportedUser.accountBlockedAt = new Date();
    reportedUser.refreshToken = null;
    reportedUser.activeSessionId = null;
    await reportedUser.save();

    report.status = "account_blocked";
    report.adminNote = reportedUser.accountBlockReason;
    report.reviewedBy = req.admin?.id;
    report.reviewedAt = new Date();
    await report.save();

    res.json({
      success: true,
      message: "User account blocked",
      userId: reportedUser._id,
    });
  } catch (error) {
    console.error("BLOCK USER FROM REPORT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};
