import ContentReport from "../models/ContentReport.js";
import JobPost from "../models/JobPost.js";
import WorkerProfile from "../models/WorkerProfile.js";
import User from "../models/authModal.js";

const VALID_REASONS = new Set([
  "Spam or misleading",
  "Scam or fraud",
  "Inappropriate content",
  "Fake profile or post",
  "Harassment",
  "Other",
]);

const submitReport = async (req, res, payload) => {
  const { reason, details } = req.body;
  const reporterId = req.user.id;

  if (!reason?.trim()) {
    return res.status(400).json({ message: "Report reason is required" });
  }

  const trimmedReason = reason.trim();
  if (!VALID_REASONS.has(trimmedReason)) {
    return res.status(400).json({ message: "Invalid report reason" });
  }

  if (payload.reportedUserId === reporterId) {
    return res.status(400).json({ message: "You cannot report your own content" });
  }

  const reportedUser = await User.findById(payload.reportedUserId);
  if (!reportedUser) {
    return res.status(404).json({ message: "Reported user not found" });
  }

  const report = await ContentReport.create({
    reporter: reporterId,
    type: payload.type,
    post: payload.postId,
    workerProfile: payload.workerProfileId,
    reportedUser: payload.reportedUserId,
    reason: trimmedReason,
    details: details?.trim() || "",
  });

  return res.status(201).json({
    success: true,
    message: "Report submitted. Our team will review it shortly.",
    reportId: report._id,
  });
};

export const reportPost = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await JobPost.findById(id).select("author");
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    return submitReport(req, res, {
      type: "post",
      postId: post._id,
      reportedUserId: String(post.author),
    });
  } catch (error) {
    console.error("Error reporting post:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const reportWorkerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const worker = await WorkerProfile.findById(id).select("user");
    if (!worker) {
      return res.status(404).json({ message: "Worker profile not found" });
    }

    return submitReport(req, res, {
      type: "worker_profile",
      workerProfileId: worker._id,
      reportedUserId: String(worker.user),
    });
  } catch (error) {
    console.error("Error reporting worker profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const listContentReports = async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const filter = status === "all" ? {} : { status };

    const reports = await ContentReport.find(filter)
      .populate("reporter", "name email")
      .populate("reportedUser", "name email isBlocked")
      .populate("post", "title")
      .populate("workerProfile", "title")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      reports: reports.map((report) => ({
        id: report._id,
        type: report.type,
        reason: report.reason,
        details: report.details,
        status: report.status,
        adminNote: report.adminNote,
        reviewedAt: report.reviewedAt,
        createdAt: report.createdAt,
        post: report.post
          ? { id: report.post._id, title: report.post.title }
          : null,
        workerProfile: report.workerProfile
          ? { id: report.workerProfile._id, title: report.workerProfile.title }
          : null,
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
    console.error("LIST CONTENT REPORTS ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const dismissContentReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ContentReport.findByIdAndUpdate(
      id,
      {
        status: "dismissed",
        reviewedBy: req.admin?.id,
        reviewedAt: new Date(),
      },
      { returnDocument: 'after' }
    );

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.json({ success: true, message: "Report dismissed" });
  } catch (error) {
    console.error("DISMISS CONTENT REPORT ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};
