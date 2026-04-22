import Category from "../models/Category.js";

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const seedCategories = async () => {
  const count = await Category.countDocuments();
  if (count === 0) {
    const defaultCategories = [
      { name: "Electrician", icon: "flash-outline" },
      { name: "Plumber", icon: "water-outline" },
      { name: "Cleaner", icon: "trash-outline" },
      { name: "Painter", icon: "color-palette-outline" },
      { name: "Carpenter", icon: "hammer-outline" },
      { name: "Tutor", icon: "book-outline" },
      { name: "Driver", icon: "car-outline" },
      { name: "Mechanic", icon: "build-outline" },
      { name: "Gardener", icon: "leaf-outline" },
      { name: "Web Developer", icon: "code-slash-outline" },
      { name: "Security Guard", icon: "shield-checkmark-outline" },
      { name: "Chef / Cook", icon: "restaurant-outline" },
      { name: "Delivery Partner", icon: "bicycle-outline" },
      { name: "Laundry", icon: "shirt-outline" },
      { name: "Appliance Repair", icon: "construct-outline" },
      { name: "Mason", icon: "cube-outline" },
    ];
    await Category.insertMany(defaultCategories);
    console.log("Categories seeded successfully");
  }
};

export { getCategories, seedCategories };
