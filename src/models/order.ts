import mongoose from "mongoose";

export interface CartItemType {
  menuItemId: string;
  quantity: string;
  name: string;
}

export interface DeliveryDetailsType {
  email: string;
  name: string;
  addressLine1: string;
  city: string;
}

export interface OrderType {
  _id: mongoose.Types.ObjectId;
  restaurant: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  deliveryDetails: DeliveryDetailsType;
  cartItems: CartItemType[];
  totalAmount: number;
  status: "placed" | "paid" | "inProgress" | "outForDelivery" | "delivered";
  createdAt: Date;
}

const orderSchema = new mongoose.Schema<OrderType>({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  deliveryDetails: {
    email: { type: String, required: true },
    name: { type: String, required: true },
    addressLine1: { type: String, required: true },
    city: { type: String, required: true },
  },
  cartItems: [
    {
      menuItemId: { type: String, required: true },
      quantity: { type: String, required: true },
      name: { type: String, required: true },
    },
  ],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["placed", "paid", "inProgress", "outForDelivery", "delivered"],
  },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model<OrderType>("Order", orderSchema);
export default Order;
