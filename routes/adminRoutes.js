import express from "express";
import adminAuthMiddleware from "../middleware/adminAuthMiddleware.js";
import { login, me } from "../controllers/adminAuthController.js";
import { getStats } from "../controllers/adminDashboardController.js";
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/adminUserController.js";
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
} from "../controllers/adminJobController.js";
import {
  listWorkers,
  getWorker,
  createWorker,
  updateWorker,
  deleteWorker,
} from "../controllers/adminWorkerController.js";
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/adminCategoryController.js";
import {
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from "../controllers/adminSubscriptionController.js";
import {
  listPending,
  approveVerification,
  rejectVerification,
} from "../controllers/adminVerificationController.js";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendNotification,
  listSentNotifications,
} from "../controllers/adminNotificationController.js";

const router = express.Router();

router.post("/login", login);

router.use(adminAuthMiddleware);

router.get("/me", me);
router.get("/dashboard/stats", getStats);

router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

router.get("/jobs", listJobs);
router.get("/jobs/:id", getJob);
router.post("/jobs", createJob);
router.put("/jobs/:id", updateJob);
router.delete("/jobs/:id", deleteJob);

router.get("/workers", listWorkers);
router.get("/workers/:id", getWorker);
router.post("/workers", createWorker);
router.put("/workers/:id", updateWorker);
router.delete("/workers/:id", deleteWorker);

router.get("/categories", listCategories);
router.get("/categories/:id", getCategory);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);

router.get("/subscriptions", listSubscriptions);
router.get("/subscriptions/:id", getSubscription);
router.post("/subscriptions", createSubscription);
router.put("/subscriptions/:id", updateSubscription);
router.delete("/subscriptions/:id", deleteSubscription);

router.get("/verifications/pending", listPending);
router.post("/verifications/:userId/approve", approveVerification);
router.post("/verifications/:userId/reject", rejectVerification);

router.get("/notification-templates", listTemplates);
router.get("/notification-templates/:id", getTemplate);
router.post("/notification-templates", createTemplate);
router.put("/notification-templates/:id", updateTemplate);
router.delete("/notification-templates/:id", deleteTemplate);
router.post("/notifications/send", sendNotification);
router.get("/notifications/sent", listSentNotifications);

export default router;
