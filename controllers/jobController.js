import JobPost from "../models/JobPost.js";
import User from "../models/authModal.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import { randomUUID } from "crypto";
import { distanceKm, hasValidCoordinates } from "../utils/distance.js";
import { uploadToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";
import { isFeaturedActive } from "../utils/featured.js";
import {
  getQuotaForUser,
  quoteAddon,
  sanitizeJobFields,
  createJobFromPayload,
} from "../utils/postQuota.js";
import { createPhonePeCheckout, getPublicBaseUrl } from "../utils/phonepe.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getQuota = async (req, res) => {
  try {
    const quota = await getQuotaForUser(req.user.id);
    res.status(200).json({ success: true, ...quota });
  } catch (error) {
    console.error("GET QUOTA ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createJob = async (req, res) => {
  try {
    const authorId = req.user.id;
    const parsed = sanitizeJobFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const quota = await getQuotaForUser(authorId);
    const plan = quota.plan;
    const wantFeatured = plan === "free" ? false : Boolean(req.body.wantFeatured);
    const canBuyAddons = plan === "pro" || plan === "business";

    const quote = quoteAddon({
      quota,
      wantFeatured,
      isNewPost: true,
    });

    if (quote.amount > 0 && !canBuyAddons) {
      const nextMonthHint =
        plan === "free"
          ? `${quota.postLimit}/${quota.postLimit} posts created this month. Upgrade your plan or try again next month.`
          : `${quota.postLimit}/${quota.postLimit} posts created this month. You can create new posts next month.`;
      return res.status(403).json({
        success: false,
        code: "POST_LIMIT_REACHED",
        plan,
        used: quota.postCount,
        limit: quota.postLimit,
        message: nextMonthHint,
      });
    }

    if (quote.amount > 0) {
      const extraBits = [];
      if (quote.extraPost) extraBits.push(`₹${quota.extraPostPrice} for an extra post`);
      if (quote.extraFeature) extraBits.push(`₹${quota.extraFeaturePrice} to feature`);
      return res.status(402).json({
        success: false,
        code: quote.extraPost ? "POST_PAYMENT_REQUIRED" : "FEATURE_PAYMENT_REQUIRED",
        plan,
        extraPost: quote.extraPost,
        extraFeature: quote.extraFeature,
        amount: quote.amount,
        kind: quote.kind,
        used: quota.postCount,
        limit: quota.postLimit,
        featuredUsed: quota.featuredCount,
        featuredLimit: quota.featuredLimit,
        message: quote.extraPost
          ? `You've used ${quota.postCount}/${quota.postLimit} included posts this month. Pay ${extraBits.join(" + ")}.`
          : `You've used your ${quota.featuredLimit} included featured post. Pay ₹${quota.extraFeaturePrice} to feature this post.`,
      });
    }

    const isFeatured = wantFeatured && quota.canFeatureFree;

    const job = await createJobFromPayload(authorId, parsed.payload, { isFeatured });

    res.status(201).json({
      success: true,
      message: "Job post created successfully",
      job,
    });
  } catch (error) {
    console.error("CREATE JOB ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createAddonOrder = async (req, res) => {
  try {
    const authorId = req.user.id;
    const parsed = sanitizeJobFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const quota = await getQuotaForUser(authorId);
    if (quota.plan !== "pro" && quota.plan !== "business") {
      return res.status(403).json({
        message: "Extra posts and extra featured ads are available on Pro and Business plans.",
      });
    }

    const wantFeatured = Boolean(req.body.wantFeatured);
    const quote = quoteAddon({
      quota,
      wantFeatured,
      isNewPost: true,
    });

    if (!quote.kind || quote.amount <= 0) {
      const job = await createJobFromPayload(authorId, parsed.payload, {
        isFeatured: wantFeatured && quota.canFeatureFree,
      });
      return res.status(201).json({
        success: true,
        paid: false,
        job,
      });
    }

    const merchantOrderId = `GS_ADDON_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const publicBase = getPublicBaseUrl();
    const redirectUrl = `${publicBase}/api/subscription/phonepe/redirect?merchantOrderId=${encodeURIComponent(merchantOrderId)}`;

    await Transaction.create({
      user: authorId,
      plan: quota.plan,
      amount: quote.amount,
      status: "pending",
      paymentMethod: "phonepe",
      transactionId: `PHONEPE_${merchantOrderId}`,
      merchantOrderId,
      kind: quote.kind,
      jobPayload: parsed.payload,
    });

    const payResponse = await createPhonePeCheckout({
      merchantOrderId,
      amountInr: quote.amount,
      redirectUrl,
    });

    const checkoutUrl = payResponse?.redirectUrl || payResponse?.redirect_url;
    if (!checkoutUrl) {
      return res.status(502).json({ message: "PhonePe did not return a checkout URL" });
    }

    return res.status(201).json({
      success: true,
      paid: true,
      merchantOrderId,
      checkoutUrl,
      amount: quote.amount,
      kind: quote.kind,
      extraPost: quote.extraPost,
      extraFeature: quote.extraFeature,
    });
  } catch (error) {
    console.error("CREATE ADDON ORDER ERROR 👉", error);
    res.status(500).json({ message: error?.message || "Failed to start extra-post payment" });
  }
};

const createFeatureOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const job = await JobPost.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.author.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to feature this job" });
    }
    if (isFeaturedActive(job)) {
      return res.status(400).json({ message: "This post is already featured" });
    }

    const quota = await getQuotaForUser(userId);
    if (quota.canFeatureFree) {
      job.isFeatured = true;
      job.featuredAt = new Date();
      await job.save();
      return res.status(200).json({
        success: true,
        paid: false,
        job,
        message: "Post featured using your included featured slot",
      });
    }

    if (quota.plan !== "pro" && quota.plan !== "business") {
      return res.status(403).json({
        message: "Upgrade to Pro or Business to buy extra featured posts.",
      });
    }

    const merchantOrderId = `GS_FEAT_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const publicBase = getPublicBaseUrl();
    const redirectUrl = `${publicBase}/api/subscription/phonepe/redirect?merchantOrderId=${encodeURIComponent(merchantOrderId)}`;

    await Transaction.create({
      user: userId,
      plan: quota.plan,
      amount: quota.extraFeaturePrice,
      status: "pending",
      paymentMethod: "phonepe",
      transactionId: `PHONEPE_${merchantOrderId}`,
      merchantOrderId,
      kind: "extra_feature",
      targetJobId: job._id,
    });

    const payResponse = await createPhonePeCheckout({
      merchantOrderId,
      amountInr: quota.extraFeaturePrice,
      redirectUrl,
    });
    const checkoutUrl = payResponse?.redirectUrl || payResponse?.redirect_url;
    if (!checkoutUrl) {
      return res.status(502).json({ message: "PhonePe did not return a checkout URL" });
    }

    return res.status(201).json({
      success: true,
      paid: true,
      merchantOrderId,
      checkoutUrl,
      amount: quota.extraFeaturePrice,
      kind: "extra_feature",
    });
  } catch (error) {
    console.error("CREATE FEATURE ORDER ERROR 👉", error);
    res.status(500).json({ message: error?.message || "Failed to start feature payment" });
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

      const isFeatured = isFeaturedActive(job);

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

    const jobObj = job.toObject ? job.toObject() : job;
    res.status(200).json({
      ...jobObj,
      isFeatured: isFeaturedActive(jobObj),
    });
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

    // Drop featured flag after 30 days so home feed and My Ads stay in sync
    const expiredIds = jobs
      .filter((j) => j.isFeatured && !isFeaturedActive(j))
      .map((j) => j._id);
    if (expiredIds.length > 0) {
      await JobPost.updateMany(
        { _id: { $in: expiredIds } },
        { $set: { isFeatured: false } }
      );
    }

    res.status(200).json(
      jobs.map((job) => {
        const jobObj = job.toObject ? job.toObject() : job;
        return {
          ...jobObj,
          isFeatured: isFeaturedActive(jobObj),
        };
      })
    );
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
  getQuota,
  createJob,
  createAddonOrder,
  createFeatureOrder,
  getJobs,
  getJobById,
  getMyJobs,
  updateJob,
  deleteJob,
  uploadJobImageHandler,
};
