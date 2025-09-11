import mongoose from "mongoose";

export interface UserType {
  _id: mongoose.Types.ObjectId;
  auth0Id: string;
  email: string;
  name?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  role: "user" | "admin";
}

const userSchema = new mongoose.Schema<UserType>({
  auth0Id: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  name: {
    type: String,
  },
  addressLine1: {
    type: String,
  },
  city: {
    type: String,
  },
  country: {
    type: String,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    required: true,
  },
});

const User = mongoose.model<UserType>("User", userSchema);
export default User;
