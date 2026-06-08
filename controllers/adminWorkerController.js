import WorkerProfile from "../models/WorkerProfile.js";

const listWorkers = async (req, res) => {
  try {
    const { search, availability, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (availability === "true") query.availability = true;
    if (availability === "false") query.availability = false;

    const skip = (Number(page) - 1) * Number(limit);
    const [workers, total] = await Promise.all([
      WorkerProfile.find(query)
        .populate("user", "name email phone isVerified")
        .populate("skills", "name icon")
        .sort("-createdAt")
        .skip(skip)
        .limit(Number(limit)),
      WorkerProfile.countDocuments(query),
    ]);

    res.status(200).json({ success: true, workers, total, page: Number(page), limit: Number(limit) });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getWorker = async (req, res) => {
  try {
    const worker = await WorkerProfile.findById(req.params.id)
      .populate("user", "name email phone isVerified")
      .populate("skills", "name icon");
    if (!worker) return res.status(404).json({ message: "Worker not found" });
    res.status(200).json({ success: true, worker });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createWorker = async (req, res) => {
  try {
    const { user, title, description, skills, experience, hourlyRate, location, availability, age, gender } =
      req.body;

    if (!user || !title || !hourlyRate || !skills?.length) {
      return res.status(400).json({ message: "User, title, hourly rate, and skills are required" });
    }

    const worker = await WorkerProfile.create({
      user,
      title,
      description,
      skills,
      experience,
      hourlyRate,
      location: location || {
        type: "Point",
        coordinates: [77.209, 28.6139],
        city: "New Delhi",
        state: "Delhi",
      },
      availability,
      age,
      gender,
    });

    const populated = await worker.populate([
      { path: "user", select: "name email phone isVerified" },
      { path: "skills", select: "name icon" },
    ]);

    res.status(201).json({ success: true, worker: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Worker profile already exists for this user" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const updateWorker = async (req, res) => {
  try {
    const worker = await WorkerProfile.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("user", "name email phone isVerified")
      .populate("skills", "name icon");

    if (!worker) return res.status(404).json({ message: "Worker not found" });
    res.status(200).json({ success: true, worker });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteWorker = async (req, res) => {
  try {
    const worker = await WorkerProfile.findByIdAndDelete(req.params.id);
    if (!worker) return res.status(404).json({ message: "Worker not found" });
    res.status(200).json({ success: true, message: "Worker deleted" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export { listWorkers, getWorker, createWorker, updateWorker, deleteWorker };
