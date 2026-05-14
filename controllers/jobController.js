import JobPost from "../models/JobPost.js";
import User from "../models/authModal.js";

const createJob = async (req, res) => {
  try {
    const { title, description, categories, price, location } = req.body;
    const authorId = req.user.id;

    // Check subscription and post limit
    const user = await User.findById(authorId).populate("subscription");
    const isSubscribed = user?.subscription?.status === "active";

    if (!isSubscribed) {
      const postCount = await JobPost.countDocuments({ author: authorId });
      if (postCount >= 2) {
        return res.status(403).json({ 
          success: false,
          message: "Free plan limit reached. You can only create 2 job posts. Upgrade to Pro to post more." 
        });
      }
    }

    const job = await JobPost.create({
      author: authorId,
      title,
      description,
      categories,
      price,
      location
    });

    res.status(201).json({
      success: true,
      message: "Job post created successfully",
      job
    });
  } catch (error) {
    console.error("CREATE JOB ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getJobs = async (req, res) => {
  try {
    const { category, city, search } = req.query;
    let query = {};
    
    if (category) query.categories = { $in: [category] };
    if (city) query["location.city"] = new RegExp(city, "i");
    if (search) {
      query.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") }
      ];
    }

    const jobs = await JobPost.find(query)
      .populate("author", "name phone")
      .populate("categories", "name icon")
      .sort("-createdAt");

    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getJobById = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id)
      .populate("author", "name phone email")
      .populate("categories", "name icon");
    
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getMyJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const jobs = await JobPost.find({ author: userId })
      .populate("categories", "name icon")
      .sort("-createdAt");

    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, categories, price, location } = req.body;
    const userId = req.user.id;

    const job = await JobPost.findById(id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Ownership check
    if (job.author.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to update this job" });
    }

    const updatedJob = await JobPost.findByIdAndUpdate(
      id,
      { title, description, categories, price, location },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Job updated successfully",
      job: updatedJob
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const job = await JobPost.findById(id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Ownership check
    if (job.author.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this job" });
    }

    await JobPost.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Job deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export { createJob, getJobs, getJobById, getMyJobs, updateJob, deleteJob };
