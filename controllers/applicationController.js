import Application from "../models/Application.js";
import User from "../models/authModal.js";

const applyToJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobPostId, message } = req.body;

    // Check if user is a worker
    const user = await User.findById(userId);
    if (!user || !user.isWorker) {
      return res.status(403).json({ 
        message: "Only registered workers can apply for jobs" 
      });
    }

    const application = await Application.create({
      jobPost: jobPostId,
      worker: userId,
      message
    });

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      application
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "You have already applied for this job" });
    }
    console.error("APPLY ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getApplicationsForJob = async (req, res) => {
  try {
    const applications = await Application.find({ jobPost: req.params.jobId })
      .populate("worker", "name email phone");
    res.status(200).json(applications);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export { applyToJob, getApplicationsForJob };
