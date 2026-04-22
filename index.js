import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/authRoutes.js";
import workerRoutes from "./routes/workerRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import savedRoutes from "./routes/savedRoutes.js";
import connectDB from "./utils/db.js";
import { seedCategories } from "./controllers/categoryController.js";

const app = express();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.send("OK");
});

app.use("/api/auth", authRoutes);
app.use("/api/worker", workerRoutes);
app.use("/api/job", jobRoutes);
app.use("/api/saved", savedRoutes);
app.use("/api/application", applicationRoutes);
app.use("/api/category", categoryRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
    await connectDB();
    await seedCategories();
    console.log(`Server is running on port ${PORT}`);
});
