import mongoose from "mongoose";
import WorkerProfile from "../models/WorkerProfile.js";
import User from "../models/authModal.js";
import Category from "../models/Category.js";
import { distanceKm, hasValidCoordinates, resolveWorkerCoordinates } from "../utils/distance.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeSkillIds = (skills) => {
  if (!skills) return [];
  const list = Array.isArray(skills) ? skills : [skills];
  const unique = new Set();

  for (const item of list) {
    const raw = typeof item === "object" && item?._id ? String(item._id) : String(item);
    if (mongoose.Types.ObjectId.isValid(raw)) {
      unique.add(raw);
    }
  }

  return Array.from(unique).map((id) => new mongoose.Types.ObjectId(id));
};

const AGE_MIN = 18;

const normalizeAge = (age) => {
  if (age === undefined || age === null || age === "") return undefined;
  const n = Number(age);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(AGE_MIN, Math.trunc(n));
};

const assertAgeAtLeast18 = (age, res) => {
  if (age === undefined || age === null || age === "") return true;
  const n = Number(age);
  if (!Number.isFinite(n) || n < AGE_MIN) {
    res.status(400).json({ message: `Age must be ${AGE_MIN} or older` });
    return false;
  }
  return true;
};

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

    const skillIds = normalizeSkillIds(skills);
    if (skillIds.length === 0) {
      return res.status(400).json({ message: "At least one skill is required" });
    }

    if (!assertAgeAtLeast18(age, res)) return;

    const workerProfile = await WorkerProfile.create({
      user: userId,
      title,
      description,
      skills: skillIds,
      experience,
      hourlyRate,
      location,
      age: normalizeAge(age),
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
    const userId = req.user.id;
    const { 
      category, 
      city,
      search,
      minPrice, 
      maxPrice, 
      gender, 
      interestedInLongDistance,
      minAge,
      maxAge 
    } = req.query;
    
    let query = {
      user: { $ne: userId },
    };

    if (category && mongoose.Types.ObjectId.isValid(category)) {
      query.skills = { $in: [new mongoose.Types.ObjectId(category)] };
    }
    if (city) {
      query["location.city"] = new RegExp(escapeRegex(city), "i");
    }

    if (search && String(search).trim()) {
      const searchRegex = new RegExp(escapeRegex(String(search).trim()), "i");
      const matchingCategories = await Category.find({ name: searchRegex }).select("_id");
      const categoryIds = matchingCategories.map((c) => c._id);

      const searchOr = [
        { title: searchRegex },
        { description: searchRegex },
        { "location.city": searchRegex },
        { "location.state": searchRegex },
        { "location.country": searchRegex },
        { "location.district": searchRegex },
        { "location.address": searchRegex },
      ];

      if (categoryIds.length > 0) {
        searchOr.push({ skills: { $in: categoryIds } });
      }

      query.$and = [...(query.$and || []), { $or: searchOr }];
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
      if (minAge) query.age.$gte = Math.max(AGE_MIN, Number(minAge));
      if (maxAge) query.age.$lte = Math.max(AGE_MIN, Number(maxAge));
    }
    
    const [currentUser, workersRaw] = await Promise.all([
      User.findById(userId).select("location"),
      WorkerProfile.find(query)
        .populate({
          path: "user",
          select: "name email phone profilePicture isVerified location subscription",
          populate: { path: "subscription", select: "plan status" },
        })
        .populate("skills", "name"),
    ]);

    const userCoords = currentUser?.location?.coordinates;
    const hasUserCoords = hasValidCoordinates(userCoords);

    const userLng = hasUserCoords ? userCoords[0] : null;
    const userLat = hasUserCoords ? userCoords[1] : null;

    const skillMatchScore = category ? 1 : 0.6;

    const ranked = workersRaw.map((wDoc) => {
      const w = wDoc.toObject ? wDoc.toObject() : wDoc;

      const coords = resolveWorkerCoordinates(w);
      const km = hasUserCoords && hasValidCoordinates(coords)
        ? distanceKm(userLat, userLng, coords[1], coords[0])
        : null;

      const distanceScore =
        km == null ? 0.05 : Math.max(0, 1 - km / 30); // 0..1 (30km cap)

      const ratingScore = w.rating && w.rating > 0 ? w.rating / 5 : 0.5;
      const reviewsScore =
        w.totalReviews && w.totalReviews > 0
          ? Math.min(1, Math.log10(w.totalReviews + 1) / 2)
          : 0.1;

      const completenessScore =
        (w.title ? 0.25 : 0) +
        (w.description ? 0.25 : 0) +
        (Array.isArray(w.skills) && w.skills.length ? 0.25 : 0) +
        (Array.isArray(w.images) && w.images.length ? 0.25 : 0);

      const userSub = w.user?.subscription;
      const isPremium =
        userSub?.status === "active" && ["pro", "business"].includes(userSub?.plan);

      // Premium boost is distance-weighted, so premium far away won't beat near free.
      const premiumBoost = isPremium ? 80 * distanceScore : 0;

      const score =
        100 * skillMatchScore +
        50 * distanceScore +
        25 * ratingScore +
        15 * reviewsScore +
        10 * completenessScore +
        premiumBoost;

      const distanceKmRounded = km == null ? null : Math.round(km * 10) / 10;
      const isFeatured = isPremium && distanceKmRounded != null && distanceKmRounded <= 15;

      return {
        ...w,
        distanceKm: distanceKmRounded,
        isFeatured,
        rankingScore: score,
      };
    });

    const featured = ranked
      .filter((w) => w.isFeatured)
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .slice(0, 8);

    const organic = ranked
      .filter((w) => !w.isFeatured)
      .sort((a, b) => b.rankingScore - a.rankingScore);

    // Remove rankingScore before sending (optional, but keeps payload clean)
    const cleanedFeatured = featured.map(({ rankingScore, ...rest }) => rest);
    const cleanedOrganic = organic.map(({ rankingScore, ...rest }) => rest);

    res.status(200).json([...cleanedFeatured, ...cleanedOrganic]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getMyWorkerProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await WorkerProfile.findOne({ user: userId })
      .populate("user", "name isVerified")
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

    const skillIds = normalizeSkillIds(skills);
    if (skillIds.length === 0) {
      return res.status(400).json({ message: "At least one skill is required" });
    }

    if (!assertAgeAtLeast18(age, res)) return;

    const profile = await WorkerProfile.findOneAndUpdate(
      { user: userId },
      { 
        $set: {
          title,
          description,
          skills: skillIds,
          experience,
          hourlyRate,
          location,
          availability,
          age: normalizeAge(age),
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
      .populate("user", "name email phone profilePicture isVerified")
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
