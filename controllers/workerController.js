import WorkerProfile from "../models/WorkerProfile.js";
import User from "../models/authModal.js";

const createWorkerProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      title, 
      description, 
      skills, 
      experience, 
      hourlyRate, 
      location 
    } = req.body;

    const existingProfile = await WorkerProfile.findOne({ user: userId });
    if (existingProfile) {
      return res.status(400).json({ message: "Worker profile already exists" });
    }

    const workerProfile = await WorkerProfile.create({
      user: userId,
      title,
      description,
      skills,
      experience,
      hourlyRate,
      location
    });

    // Update User status
    await User.findByIdAndUpdate(userId, { isWorker: true });

    res.status(201).json({
      success: true,
      message: "Worker profile created successfully",
      profile: workerProfile
    });
  } catch (error) {
    console.error("CREATE WORKER PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getWorkers = async (req, res) => {
  try {
    const { category, city } = req.query;
    let query = {};

    if (category) {
      query.skills = category;
    }
    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    const workers = await WorkerProfile.find(query)
      .populate("user", "name email phone")
      .populate("skills", "name");

    res.status(200).json(workers);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getMyWorkerProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await WorkerProfile.findOne({ user: userId })
      .populate("skills", "name icon");

    if (!profile) {
      return res.status(404).json({ message: "Worker profile not found" });
    }

    res.status(200).json({
      success: true,
      profile
    });
  } catch (error) {
    console.error("GET MY WORKER PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateWorkerProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      title, 
      description, 
      skills, 
      experience, 
      hourlyRate, 
      location 
    } = req.body;

    const profile = await WorkerProfile.findOneAndUpdate(
      { user: userId },
      { 
        $set: {
          title,
          description,
          skills,
          experience,
          hourlyRate,
          location
        }
      },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({ message: "Worker profile not found" });
    }

    res.status(200).json({
      success: true,
      message: "Worker profile updated successfully",
      profile
    });
  } catch (error) {
    console.error("UPDATE WORKER PROFILE ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export { createWorkerProfile, getWorkers, getMyWorkerProfile, updateWorkerProfile };
