import Subscription from "../models/Subscription.js";
import Transaction from "../models/Transaction.js";
import User from "../models/authModal.js";

export const createSubscription = async (req, res) => {
  try {
    const { plan, billingCycle, amount } = req.body;
    const userId = req.user.id;

    // Check for existing active subscription
    const existingSubscription = await Subscription.findOne({ 
      user: userId, 
      status: "active" 
    });

    if (existingSubscription) {
      // Logic for upgrade/downgrade: Cancel the previous one
      existingSubscription.status = "cancelled";
      await existingSubscription.save();
    }

    if (!plan || !billingCycle || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Calculate end date
    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      return res.status(400).json({ message: "Invalid billing cycle" });
    }

    // 1. Create Subscription
    const subscription = new Subscription({
      user: userId,
      plan,
      billingCycle,
      startDate,
      endDate,
      status: "active",
      paymentProvider: "dummy",
    });

    await subscription.save();

    // 2. Create Dummy Transaction
    const transactionId = `TRANS_DUMMY_${Date.now()}`;
    const transaction = new Transaction({
      user: userId,
      subscription: subscription._id,
      amount,
      status: "success",
      paymentMethod: "dummy",
      transactionId,
      paidAt: new Date(),
    });

    await transaction.save();

    // 3. Update User
    await User.findByIdAndUpdate(userId, {
      subscription: subscription._id,
      isWorker: true, // Assuming pro plans might enable worker features, or just keep as is
    });

    res.status(201).json({
      message: "Subscription created successfully (Dummy)",
      subscription,
      transaction,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("subscription");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      subscription: user.subscription,
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
