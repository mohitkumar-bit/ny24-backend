import Category from "../models/Category.js";

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

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

  // New marketplace categories
  { name: "Book Store", icon: "library-outline" },
  { name: "Baby Sitter", icon: "happy-outline" },
  { name: "Model", icon: "body-outline" },
  { name: "Fashion Designer", icon: "shirt-outline" },
  { name: "Sculptor", icon: "hammer-outline" },
  { name: "Ceramist & Potter", icon: "color-palette-outline" },
  { name: "Locksmith", icon: "key-outline" },
  { name: "Truck Driver", icon: "bus-outline" },
  { name: "Loading and Shipping", icon: "boat-outline" },
  { name: "Crane", icon: "construct-outline" },
  { name: "Brick", icon: "cube-outline" },
  { name: "Timber", icon: "leaf-outline" },
  { name: "Pump & Motor Repairing", icon: "settings-outline" },
  { name: "Boring & Water Well", icon: "water-outline" },
  { name: "Photo Studio & Editing", icon: "camera-outline" },
  { name: "Glass & Mirror", icon: "images-outline" },
  { name: "Inverter & Battery", icon: "battery-charging-outline" },
  { name: "UPVC and ACP Product", icon: "business-outline" },
  { name: "Sliders and Aluminium", icon: "grid-outline" },
  { name: "Boutique", icon: "bag-outline" },
  { name: "Helmet", icon: "shield-checkmark-outline" },
  { name: "Bike Modification", icon: "bicycle-outline" },
  { name: "Car Modification", icon: "car-outline" },
  { name: "Car & Bike Wash", icon: "sparkles-outline" },
  { name: "Number Plate", icon: "pricetag-outline" },
  { name: "School Uniform", icon: "school-outline" },
  { name: "Bags & Belts", icon: "bag-outline" },
  { name: "Air Conditioner & Water Coolers", icon: "snow-outline" },
  { name: "Bartender", icon: "wine-outline" },
  { name: "Cycle Shop", icon: "bicycle-outline" },
  { name: "Washing and Dry Clean", icon: "shirt-outline" },
  { name: "Hotel & Resorts", icon: "bed-outline" },
  { name: "Insurance", icon: "document-text-outline" },
  { name: "Pets & Animals", icon: "paw-outline" },
  { name: "Animal Feeds & Grooming", icon: "cut-outline" },
  { name: "Chiropractor & Cupping", icon: "fitness-outline" },
  { name: "Wheels & Tyres", icon: "speedometer-outline" },
  { name: "Air Ducts & Insulation", icon: "thermometer-outline" },
  { name: "Gypsum & False Ceiling", icon: "layers-outline" },
  { name: "Wallpaper & Louvers", icon: "brush-outline" },
  { name: "Gems and Stone", icon: "diamond-outline" },
  { name: "CCTV Camera", icon: "videocam-outline" },
];

const seedCategories = async () => {
  try {
    const existing = await Category.find({}, "name").lean();
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
    const toInsert = defaultCategories.filter(
      (c) => !existingNames.has(c.name.toLowerCase())
    );

    if (toInsert.length === 0) {
      console.log("Categories already up to date");
      return;
    }

    await Category.insertMany(toInsert);
    console.log(`Categories seeded: added ${toInsert.length} new categories`);
  } catch (error) {
    console.error("Category seed error:", error.message);
  }
};

export { getCategories, seedCategories };
