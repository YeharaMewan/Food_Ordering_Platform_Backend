import mongoose from "mongoose";

// Define interfaces explicitly instead of relying on InferSchemaType
export interface MenuItemType {
  _id: mongoose.Types.ObjectId;
  name: string;
  price: number;
}

export interface RestaurantType {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  restaurantName: string;
  city: string;
  country: string;
  deliveryPrice: number;
  estimatedDeliveryTime: number;
  cuisines: string[];
  menuItems: MenuItemType[];
  imageUrl: string;
  lastUpdated: Date;
}

const menuItemSchema = new mongoose.Schema<MenuItemType>({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

const restaurantSchema = new mongoose.Schema<RestaurantType>({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  restaurantName: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, required: true },
  deliveryPrice: { type: Number, required: true },
  estimatedDeliveryTime: { type: Number, required: true },
  cuisines: [{ type: String, required: true }],
  menuItems: [menuItemSchema],
  imageUrl: { type: String, required: true },
  lastUpdated: { type: Date, required: true },
});

const Restaurant = mongoose.model<RestaurantType>("Restaurant", restaurantSchema);
export default Restaurant;
