import Category from "../models/Category.js";

const listCategories = async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { icon: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    const categories = await Category.find(query).sort("name");
    res.status(200).json({ success: true, categories, total: categories.length });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ success: true, category });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, icon, description } = req.body;
    if (!name || !icon) {
      return res.status(400).json({ message: "Name and icon are required" });
    }

    const category = await Category.create({ name, icon, description });
    res.status(201).json({ success: true, category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ success: true, category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ success: true, message: "Category deleted" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export { listCategories, getCategory, createCategory, updateCategory, deleteCategory };
