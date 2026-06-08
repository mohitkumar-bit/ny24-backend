import Subscription from "../models/Subscription.js";
import User from "../models/authModal.js";

const listSubscriptions = async (req, res) => {
  try {
    const { search, status, plan, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (plan) query.plan = plan;

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      query.user = { $in: matchingUsers.map((u) => u._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [subscriptions, total] = await Promise.all([
      Subscription.find(query)
        .populate("user", "name email")
        .sort("-createdAt")
        .skip(skip)
        .limit(Number(limit)),
      Subscription.countDocuments(query),
    ]);

    res.status(200).json({ success: true, subscriptions, total, page: Number(page), limit: Number(limit) });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id).populate("user", "name email");
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });
    res.status(200).json({ success: true, subscription });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createSubscription = async (req, res) => {
  try {
    const { user, plan, status, startDate, endDate, billingCycle, paymentProvider } = req.body;

    if (!user || !plan || !endDate || !billingCycle) {
      return res.status(400).json({ message: "User, plan, end date, and billing cycle are required" });
    }

    const subscription = await Subscription.create({
      user,
      plan,
      status,
      startDate,
      endDate,
      billingCycle,
      paymentProvider,
    });

    await User.findByIdAndUpdate(user, { subscription: subscription._id });

    const populated = await subscription.populate("user", "name email");
    res.status(201).json({ success: true, subscription: populated });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const updateSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("user", "name email");

    if (!subscription) return res.status(404).json({ message: "Subscription not found" });
    res.status(200).json({ success: true, subscription });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findByIdAndDelete(req.params.id);
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    await User.findByIdAndUpdate(subscription.user, { $unset: { subscription: 1 } });
    res.status(200).json({ success: true, message: "Subscription deleted" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export { listSubscriptions, getSubscription, createSubscription, updateSubscription, deleteSubscription };
