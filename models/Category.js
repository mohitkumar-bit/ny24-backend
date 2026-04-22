import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  icon: {
    type: String, // Icon name for frontend (e.g., "flash-outline")
    required: true,
  },
  description: String,
});

const Category = mongoose.model("Category", categorySchema);

export default Category;
