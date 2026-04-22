import User from "../models/authModal.js";
import JobPost from "../models/JobPost.js";

// @desc    Toggle save/unsave a job
// @route   POST /api/saved/toggle/:jobId
// @access  Private
export const toggleSaveJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSaved = user.savedJobs.includes(jobId);

    if (isSaved) {
      // Unsave
      user.savedJobs = user.savedJobs.filter((id) => id.toString() !== jobId);
    } else {
      // Check if job exists
      const job = await JobPost.findById(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      // Save
      user.savedJobs.push(jobId);
    }

    await user.save();

    res.status(200).json({
      message: isSaved ? "Job unsaved" : "Job saved",
      isSaved: !isSaved,
      savedJobs: user.savedJobs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all saved jobs for current user
// @route   GET /api/saved
// @access  Private
export const getSavedJobs = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate({
      path: "savedJobs",
      populate: [
        { path: "author", select: "name phone" },
        { path: "categories", select: "name icon" }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.savedJobs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
