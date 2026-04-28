import mongoose from "mongoose";
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
      location,
      age,
      gender,
      interestedInLongDistance
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
      location,
      age,
      gender,
      interestedInLongDistance
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
    const { 
      category, 
      city, 
      minPrice, 
      maxPrice, 
      gender, 
      interestedInLongDistance,
      minAge,
      maxAge 
    } = req.query;
    
    console.log("SEARCH WORKERS PARAMS 👉", { 
      category, city, minPrice, maxPrice, gender, interestedInLongDistance, minAge, maxAge 
    });
    let query = {};

    if (category && mongoose.Types.ObjectId.isValid(category)) {
      query.skills = { $in: [new mongoose.Types.ObjectId(category)] };
    }
    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    // Price Filter
    if (minPrice || maxPrice) {
      query.hourlyRate = {};
      if (minPrice) query.hourlyRate.$gte = Number(minPrice);
      if (maxPrice) query.hourlyRate.$lte = Number(maxPrice);
    }

    // Gender Filter
    if (gender) {
      query.gender = gender;
    }

    // Long Distance Filter
    if (interestedInLongDistance === 'true') {
      query.interestedInLongDistance = true;
    }

    // Age Filter
    if (minAge || maxAge) {
      query.age = {};
      if (minAge) query.age.$gte = Number(minAge);
      if (maxAge) query.age.$lte = Number(maxAge);
    }
    
    console.log("GENERATED QUERY 👉", query);

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
      location,
      availability,
      age,
      gender,
      interestedInLongDistance
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
          location,
          availability,
          age,
          gender,
          interestedInLongDistance
        }
      },
      { new: true }
    ).populate("skills", "name icon");

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

const getWorkerById = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await WorkerProfile.findById(id)
      .populate("user", "name email phone")
      .populate("skills", "name icon");

    if (!profile) {
      return res.status(404).json({ message: "Worker profile not found" });
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("GET WORKER BY ID ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export { createWorkerProfile, getWorkers, getMyWorkerProfile, updateWorkerProfile, getWorkerById };
