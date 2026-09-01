import JobPost from "../models/JobPost.js";
import User from "../models/authModal.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import { randomUUID } from "crypto";
import { distanceKm, hasValidCoordinates } from "../utils/distance.js";
import { uploadToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";
import { isFeaturedActive } from "../utils/featured.js";
import { isVideoPostActive } from "../utils/videoPost.js";
import { isBannerAdActive } from "../utils/bannerPost.js";
import { buildInterleavedFeed } from "../utils/feedInterleave.js";
import { uploadVideoToS3, isS3Configured, getVideoObjectFromS3 } from "../utils/s3.js";
import { assertVideoWithinLimit } from "../utils/videoValidation.js";
import {
  getQuotaForUser,
  quoteAddon,
  sanitizeJobFields,
  createJobFromPayload,
  createVideoJobFromPayload,
  createBannerJobFromPayload,
  consumeFeatureQuota,
} from "../utils/postQuota.js";
import { createRazorpayOrder } from "../utils/razorpay.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function resolveIsFeatured(job, { videoActive, bannerActive }) {
  if (!isFeaturedActive(job)) return false;
  if (job.isBannerAd && !bannerActive) return false;
  if (job.isVideoPost && !videoActive) return false;
  return true;
}

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

    await Transaction.create({
      user: authorId,
      plan: quota.plan,
      amount: quote.amount,
      status: "pending",
      paymentMethod: "razorpay",
      transactionId: `RZP_${merchantOrderId}`,
      merchantOrderId,
      kind: quote.kind,
      jobPayload: parsed.payload,
    });

    const payOrder = await createRazorpayOrder({
      merchantOrderId,
      amountInr: quote.amount,
      notes: { kind: quote.kind, userId: String(authorId) },
    });

    await Transaction.updateOne(
      { merchantOrderId },
      { providerOrderId: payOrder.razorpayOrderId }
    );

    return res.status(201).json({
      success: true,
      paid: true,
      merchantOrderId,
      razorpayOrderId: payOrder.razorpayOrderId,
      keyId: payOrder.keyId,
      amount: quote.amount,
      amountPaise: payOrder.amountPaise,
      currency: payOrder.currency,
      kind: quote.kind,
      extraPost: quote.extraPost,
      extraFeature: quote.extraFeature,
      description: "Extra post / boost",
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
      await consumeFeatureQuota(userId);
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

    await Transaction.create({
      user: userId,
      plan: quota.plan,
      amount: quota.extraFeaturePrice,
      status: "pending",
      paymentMethod: "razorpay",
      transactionId: `RZP_${merchantOrderId}`,
      merchantOrderId,
      kind: "extra_feature",
      targetJobId: job._id,
    });

    const payOrder = await createRazorpayOrder({
      merchantOrderId,
      amountInr: quota.extraFeaturePrice,
      notes: { kind: "extra_feature", userId: String(userId), jobId: String(job._id) },
    });

    await Transaction.updateOne(
      { merchantOrderId },
      { providerOrderId: payOrder.razorpayOrderId }
    );

    return res.status(201).json({
      success: true,
      paid: true,
      merchantOrderId,
      razorpayOrderId: payOrder.razorpayOrderId,
      keyId: payOrder.keyId,
      amount: quota.extraFeaturePrice,
      amountPaise: payOrder.amountPaise,
      currency: payOrder.currency,
      kind: "extra_feature",
      description: "Extra boost",
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

      const videoActive = isVideoPostActive(job);
      const videoBoost = videoActive ? 50 * distanceScore : 0;
      const bannerActive = isBannerAdActive(job);
      const bannerBoost = bannerActive ? 45 * distanceScore : 0;

      const rankingScore =
        100 * skillMatchScore +
        60 * distanceScore +
        premiumBoost +
        recencyScore +
        verifiedBoost +
        videoBoost +
        bannerBoost;

      const isFeatured = resolveIsFeatured(job, { videoActive, bannerActive });

      return {
        ...job,
        distanceKm: km == null ? null : Math.round(km * 10) / 10,
        isFeatured,
        isVideoPost: videoActive,
        isVideoActive: videoActive,
        isBannerAd: bannerActive,
        isBannerActive: bannerActive,
        isVerifiedAuthor,
        rankingScore,
      };
    });

    const filteredRanked =
      verifiedOnly === "true"
        ? ranked.filter((j) => j.isVerifiedAuthor)
        : ranked;

    const feed = buildInterleavedFeed(filteredRanked);
    const cleanedFeed = feed.map(({ rankingScore, ...rest }) => rest);

    res.status(200).json(cleanedFeed);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const streamJobVideo = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id).select("videoUrl isVideoPost");
    if (!job?.videoUrl || !job.isVideoPost) {
      return res.status(404).json({ message: "Video not found" });
    }

    const rangeHeader = req.headers.range;
    const object = await getVideoObjectFromS3(job.videoUrl, rangeHeader);
    const contentType = object.ContentType || "video/mp4";

    if (rangeHeader && object.ContentRange) {
      res.status(206);
      res.setHeader("Content-Range", object.ContentRange);
    } else {
      res.status(200);
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    if (object.ContentLength != null) {
      res.setHeader("Content-Length", String(object.ContentLength));
    }
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (typeof object.Body?.pipe === "function") {
      object.Body.pipe(res);
      return;
    }

    const bytes = await object.Body.transformToByteArray();
    res.end(Buffer.from(bytes));
  } catch (error) {
    console.error("STREAM JOB VIDEO ERROR 👉", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Could not stream video" });
    }
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
    const bannerActive = isBannerAdActive(jobObj);
    const videoActive = isVideoPostActive(jobObj);
    res.status(200).json({
      ...jobObj,
      isFeatured: resolveIsFeatured(jobObj, { videoActive, bannerActive }),
      isVideoPost: videoActive,
      isVideoActive: videoActive,
      isBannerAd: bannerActive,
      isBannerActive: bannerActive,
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
    const expiredFeaturedIds = jobs
      .filter((j) => j.isFeatured && !isFeaturedActive(j))
      .map((j) => j._id);
    if (expiredFeaturedIds.length > 0) {
      await JobPost.updateMany(
        { _id: { $in: expiredFeaturedIds } },
        { $set: { isFeatured: false } }
      );
    }

    const expiredVideoIds = jobs
      .filter((j) => j.isVideoPost && !isVideoPostActive(j))
      .map((j) => j._id);
    if (expiredVideoIds.length > 0) {
      await JobPost.updateMany(
        { _id: { $in: expiredVideoIds } },
        { $set: { isVideoPost: false, isFeatured: false } }
      );
    }

    const expiredBannerIds = jobs
      .filter((j) => j.isBannerAd && !isBannerAdActive(j))
      .map((j) => j._id);
    if (expiredBannerIds.length > 0) {
      await JobPost.updateMany(
        { _id: { $in: expiredBannerIds } },
        { $set: { isBannerAd: false, isFeatured: false } }
      );
    }

    res.status(200).json(
      jobs.map((job) => {
        const jobObj = job.toObject ? job.toObject() : job;
        const videoActive = isVideoPostActive(jobObj);
        const bannerActive = isBannerAdActive(jobObj);
        return {
          ...jobObj,
          isFeatured: resolveIsFeatured(jobObj, { videoActive, bannerActive }),
          isVideoPost: videoActive,
          isVideoActive: videoActive,
          isBannerAd: bannerActive,
          isBannerActive: bannerActive,
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

    const authorId = job.author?._id ? String(job.author._id) : String(job.author);
    if (authorId !== String(userId)) {
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

const uploadJobVideoHandler = async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({
        message: "Video upload is not configured. Add AWS S3 credentials to the server.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Video file is required" });
    }

    const durationCheck = await assertVideoWithinLimit(
      req.file.buffer,
      req.file.mimetype,
      req.body?.durationSeconds
    );
    if (!durationCheck.ok) {
      return res.status(400).json({ message: durationCheck.message });
    }

    const { url } = await uploadVideoToS3(
      req.file.buffer,
      req.file.mimetype,
      req.user.id
    );

    res.status(200).json({ success: true, videoUrl: url });
  } catch (error) {
    console.error("UPLOAD JOB VIDEO ERROR 👉", error);
    res.status(500).json({ message: error.message || "Failed to upload video" });
  }
};

const createVideoJob = async (req, res) => {
  try {
    const authorId = req.user.id;
    const parsed = sanitizeJobFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const videoUrl =
      typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
    if (!videoUrl) {
      return res.status(400).json({ message: "Video URL is required" });
    }

    const quota = await getQuotaForUser(authorId);
    if (!quota.canPublishVideoPost) {
      return res.status(403).json({
        success: false,
        code: "VIDEO_POST_CREDIT_REQUIRED",
        message:
          "You need a Video Promotion credit. Buy one from My Subscription on the website.",
        videoPostCredits: quota.videoPostCredits || 0,
        videoPostPrice: quota.videoPostPrice,
      });
    }

    const job = await createVideoJobFromPayload(authorId, parsed.payload, videoUrl);

    res.status(201).json({
      success: true,
      message: "Video post published successfully",
      job,
    });
  } catch (error) {
    console.error("CREATE VIDEO JOB ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createBannerJob = async (req, res) => {
  try {
    const authorId = req.user.id;
    const parsed = sanitizeJobFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const bannerUrl =
      typeof req.body?.bannerUrl === "string" ? req.body.bannerUrl.trim() : "";
    if (!bannerUrl) {
      return res.status(400).json({ message: "Banner image URL is required" });
    }

    const quota = await getQuotaForUser(authorId);
    if (!quota.canPublishBannerAd) {
      return res.status(403).json({
        success: false,
        code: "BANNER_AD_CREDIT_REQUIRED",
        message:
          "You need a Banner Promotion credit. Buy one from My Subscription on the website.",
        bannerAdCredits: quota.bannerAdCredits || 0,
        bannerAdPrice: quota.bannerAdPrice,
      });
    }

    const job = await createBannerJobFromPayload(authorId, parsed.payload, bannerUrl);

    res.status(201).json({
      success: true,
      message: "Banner ad published successfully",
      job,
    });
  } catch (error) {
    console.error("CREATE BANNER JOB ERROR 👉", error);
    res.status(500).json({ message: "Server error" });
  }
};

export {
  getQuota,
  createJob,
  createVideoJob,
  createBannerJob,
  createAddonOrder,
  createFeatureOrder,
  getJobs,
  streamJobVideo,
  getJobById,
  getMyJobs,
  updateJob,
  deleteJob,
  uploadJobImageHandler,
  uploadJobVideoHandler,
};
