import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";

const seedAdmin = async () => {
  const count = await Admin.countDocuments();
  if (count > 0) return;

  const email = process.env.ADMIN_EMAIL || "admin@gigseva.com";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const hashedPassword = await bcrypt.hash(password, 10);

  await Admin.create({
    name: "gigSEVA Admin",
    email,
    password: hashedPassword,
  });

  console.log(`Default admin seeded: ${email}`);
};

export { seedAdmin };
