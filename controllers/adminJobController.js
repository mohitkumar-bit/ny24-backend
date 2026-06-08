import User from "../models/authModal.js";
import JobPost from "../models/JobPost.js";

const listJobs = async (req, res) => {
  try {
    const { search, status, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const authorIds = matchingUsers.map((u) => u._id);
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        ...(authorIds.length ? [{ author: { $in: authorIds } }] : []),
      ];
    }
    if (status) query.status = status;

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [jobs, total] = await Promise.all([
      JobPost.find(query)
        .populate("author", "name email")
        .populate("categories", "name icon")
        .sort("-createdAt")
        .skip(skip)
        .limit(Number(limit)),
      JobPost.countDocuments(query),
    ]);

    res.status(200).json({ success: true, jobs, total, page: Number(page), limit: Number(limit) });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id)
      .populate("author", "name email")
      .populate("categories", "name icon");
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json({ success: true, job });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createJob = async (req, res) => {
  try {
    const { author, title, description, categories, price, location, requirements, status, images } =
      req.body;

    if (!author || !title || !description || !categories?.length) {
      return res.status(400).json({ message: "Author, title, description, and categories are required" });
    }

    const job = await JobPost.create({
      author,
      title,
      description,
      categories,
      price,
      location,
      requirements,
      status,
      images,
    });

    const populated = await job.populate([
      { path: "author", select: "name email" },
      { path: "categories", select: "name icon" },
    ]);

    res.status(201).json({ success: true, job: populated });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const updateJob = async (req, res) => {
  try {
    const job = await JobPost.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("author", "name email")
      .populate("categories", "name icon");

    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json({ success: true, job });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteJob = async (req, res) => {
  try {
    const job = await JobPost.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json({ success: true, message: "Job deleted" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export { listJobs, getJob, createJob, updateJob, deleteJob };
