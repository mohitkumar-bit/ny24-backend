import JobPost from "../models/JobPost.js";
import User from "../models/authModal.js";
import Category from "../models/Category.js";
import { distanceKm, hasValidCoordinates } from "../utils/distance.js";
import { uploadToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createJob = async (req, res) => {
  try {
    const { title, description, categories, price, location, requirements, images } = req.body;
    const authorId = req.user.id;

    const cleanTitle = typeof title === "string" ? title.trim() : "";
    const cleanDescription = typeof description === "string" ? description.trim() : "";

    if (!cleanTitle || cleanTitle.length > 11 || /\d/.test(cleanTitle)) {
      return res.status(400).json({
        message: "Title must be at most 11 characters and cannot contain numbers",
      });
    }
    if (!cleanDescription || cleanDescription.length > 29 || /\d/.test(cleanDescription)) {
      return res.status(400).json({
        message: "Description must be at most 29 characters and cannot contain numbers",
      });
    }

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

    const jobImages = Array.isArray(images)
      ? images.filter((url) => typeof url === "string" && url.trim())
      : [];

    const job = await JobPost.create({
      author: authorId,
      title: cleanTitle,
      description: cleanDescription,
      categories,
      price,
      location,
      images: jobImages,
      requirements: {
        gender: requirements?.gender || "Any",
        minAge:
          typeof requirements?.minAge === "number" ? requirements.minAge : null,
        maxAge:
          typeof requirements?.maxAge === "number" ? requirements.maxAge : null,
      },
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
    const { category, city, search, verifiedOnly } = req.query;
    const userId = req.user.id;

    const currentUser = await User.findById(userId).select("location");
    const userCoords = currentUser?.location?.coordinates;
    const hasUserCoords = hasValidCoordinates(userCoords);
    const userLng = hasUserCoords ? userCoords[0] : null;
    const userLat = hasUserCoords ? userCoords[1] : null;

    let query = {};
    
    if (category) query.categories = { $in: [category] };
    if (city) query["location.city"] = new RegExp(escapeRegex(city), "i");
    if (search) {
      const searchRegex = new RegExp(escapeRegex(String(search).trim()), "i");
      const matchingCategories = await Category.find({ name: searchRegex }).select("_id");
      const categoryIds = matchingCategories.map((c) => c._id);

      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { "location.city": searchRegex },
        { "location.state": searchRegex },
        { "location.address": searchRegex },
      ];

      if (categoryIds.length > 0) {
        query.$or.push({ categories: { $in: categoryIds } });
      }
    }

    const jobs = await JobPost.find(query)
      .populate({
        path: "author",
        select: "name phone profilePicture isVerified location subscription",
        populate: { path: "subscription", select: "plan status" },
      })
      .populate("categories", "name icon")
      ;

    const skillMatchScore = category ? 1 : 0.6;

    const ranked = jobs.map((jobDoc) => {
      const job = jobDoc.toObject ? jobDoc.toObject() : jobDoc;
      const authorCoords = job.author?.location?.coordinates;
      const isVerifiedAuthor = !!job.author?.isVerified;

      const km =
        hasUserCoords && hasValidCoordinates(authorCoords)
          ? distanceKm(userLat, userLng, authorCoords[1], authorCoords[0])
          : null;

      const distanceScore = km == null ? 0.05 : Math.max(0, 1 - km / 40); // 0..1 (40km cap)

      const authorSub = job.author?.subscription;
      const isPremium =
        authorSub?.status === "active" && ["pro", "business"].includes(authorSub?.plan);

      const premiumBoost = isPremium ? 80 * distanceScore : 0;

      const ageHours = job.createdAt
        ? (Date.now() - new Date(job.createdAt).getTime()) / (1000 * 60 * 60)
        : 999;
      const recencyScore = Math.max(0, 1 - ageHours / 72) * 25;

      const verifiedBoost =
        verifiedOnly === "true" && isVerifiedAuthor ? 40 * distanceScore : 0;

      const rankingScore =
        100 * skillMatchScore +
        60 * distanceScore +
        premiumBoost +
        recencyScore +
        verifiedBoost;

      const isFeatured = isPremium && km != null && km <= 15;

      return {
        ...job,
        distanceKm: km == null ? null : Math.round(km * 10) / 10,
        isFeatured,
        isVerifiedAuthor,
        rankingScore,
      };
    });

    const filteredRanked =
      verifiedOnly === "true"
        ? ranked.filter((j) => j.isVerifiedAuthor)
        : ranked;

    const featured = filteredRanked
      .filter((j) => j.isFeatured)
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .slice(0, 10);

    const organic = filteredRanked
      .filter((j) => !j.isFeatured)
      .sort((a, b) => b.rankingScore - a.rankingScore);

    const cleanedFeatured = featured.map(({ rankingScore, ...rest }) => rest);
    const cleanedOrganic = organic.map(({ rankingScore, ...rest }) => rest);

    res.status(200).json([...cleanedFeatured, ...cleanedOrganic]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getJobById = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id)
      .populate("author", "name phone email profilePicture isVerified")
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
    const { title, description, categories, price, location, requirements } = req.body;
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
      {
        title,
        description,
        categories,
        price,
        location,
        ...(requirements
          ? {
              requirements: {
                gender: requirements.gender || "Any",
                minAge:
                  typeof requirements.minAge === "number"
                    ? requirements.minAge
                    : null,
                maxAge:
                  typeof requirements.maxAge === "number"
                    ? requirements.maxAge
                    : null,
              },
            }
          : {}),
      },
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

const uploadJobImageHandler = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        message: "Image upload is not configured. Add Cloudinary credentials to the server.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const imageUrl = await uploadToCloudinary(
      req.file.buffer,
      req.user.id,
      "jobs"
    );

    res.status(200).json({ success: true, imageUrl });
  } catch (error) {
    console.error("UPLOAD JOB IMAGE ERROR 👉", error);
    res.status(500).json({ message: "Failed to upload image" });
  }
};

export {
  createJob,
  getJobs,
  getJobById,
  getMyJobs,
  updateJob,
  deleteJob,
  uploadJobImageHandler,
};
