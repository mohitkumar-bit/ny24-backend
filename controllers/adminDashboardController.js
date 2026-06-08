import User from "../models/authModal.js";
import JobPost from "../models/JobPost.js";
import WorkerProfile from "../models/WorkerProfile.js";
import Category from "../models/Category.js";
import Subscription from "../models/Subscription.js";
import Application from "../models/Application.js";

const getDayLabels = () => {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return days;
};

const fillTrend = (rows, days) => {
  const map = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  return days.map((day) => ({
    day: day.label,
    count: map[day.key] || 0,
  }));
};

const getStats = async (req, res) => {
  try {
    const days = getDayLabels();
    const startDate = new Date(days[0].key);
    startDate.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalWorkers,
      totalJobs,
      openJobs,
      closedJobs,
      inProgressJobs,
      totalCategories,
      activeSubscriptions,
      pendingVerifications,
      totalApplications,
      userTrendRaw,
      jobTrendRaw,
      subscriptionPlans,
    ] = await Promise.all([
      User.countDocuments(),
      WorkerProfile.countDocuments(),
      JobPost.countDocuments(),
      JobPost.countDocuments({ status: "open" }),
      JobPost.countDocuments({ status: "closed" }),
      JobPost.countDocuments({ status: "in-progress" }),
      Category.countDocuments(),
      Subscription.countDocuments({ status: "active" }),
      User.countDocuments({ "verification.status": "pending" }),
      Application.countDocuments(),
      User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]),
      JobPost.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]),
      Subscription.aggregate([
        { $match: { status: "active" } },
        { $group: { _id: "$plan", count: { $sum: 1 } } },
      ]),
    ]);

    const recentUsers = await User.find()
      .select("name email isWorker createdAt")
      .sort("-createdAt")
      .limit(5);

    const recentJobs = await JobPost.find()
      .populate("author", "name email")
      .select("title status createdAt")
      .sort("-createdAt")
      .limit(5);

    const regularUsers = Math.max(totalUsers - totalWorkers, 0);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalWorkers,
        totalJobs,
        openJobs,
        totalCategories,
        activeSubscriptions,
        pendingVerifications,
        totalApplications,
      },
      charts: {
        userTrend: fillTrend(userTrendRaw, days),
        jobTrend: fillTrend(jobTrendRaw, days),
        userSplit: [
          { name: "Workers", value: totalWorkers, color: "#2563eb" },
          { name: "Regular Users", value: regularUsers, color: "#8b5cf6" },
        ],
        jobStatus: [
          { name: "Open", value: openJobs, color: "#34d399" },
          { name: "In Progress", value: inProgressJobs, color: "#fbbf24" },
          { name: "Closed", value: closedJobs, color: "#f87171" },
        ],
        platformMetrics: [
          { name: "Users", value: totalUsers },
          { name: "Jobs", value: totalJobs },
          { name: "Applications", value: totalApplications },
          { name: "Subscriptions", value: activeSubscriptions },
          { name: "Categories", value: totalCategories },
        ],
        subscriptionPlans: subscriptionPlans.map((p) => ({
          name: p._id.charAt(0).toUpperCase() + p._id.slice(1),
          value: p.count,
        })),
      },
      recentUsers,
      recentJobs,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export { getStats };
