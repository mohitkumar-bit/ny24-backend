import mongoose from "mongoose";

const connectDB = async () => {
  await mongoose.connect(process.env.URL_DB);
  console.log("Connected to MongoDB");
};

export default connectDB;