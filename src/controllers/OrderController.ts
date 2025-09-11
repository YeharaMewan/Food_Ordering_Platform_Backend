import Stripe from "stripe";
import { Request, Response } from "express";
import Restaurant, { MenuItemType } from "../models/restaurant";
import Order from "../models/order";

const STRIPE = new Stripe(process.env.STRIPE_API_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL as string;
const STRIPE_ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

const calculateMissingOrderTotal = (order: any): number => {
  let totalAmount = 0;

  // Calculate total from cart items
  if (order.cartItems && Array.isArray(order.cartItems)) {
    order.cartItems.forEach((cartItem: any) => {
      // Find the menu item in the restaurant
      const menuItem = order.restaurant?.menuItems?.find(
        (item: any) => item._id.toString() === cartItem.menuItemId.toString()
      );

      if (menuItem && cartItem.quantity) {
        const quantity = typeof cartItem.quantity === 'string' 
          ? parseInt(cartItem.quantity) 
          : cartItem.quantity;
        totalAmount += menuItem.price * quantity;
      }
    });
  }

  // Add delivery price if available
  if (order.restaurant?.deliveryPrice) {
    totalAmount += order.restaurant.deliveryPrice;
  }

  return totalAmount;
};

const getMyOrders = async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .populate("restaurant")
      .populate("user");

    // Calculate missing totalAmount for orders that don't have it
    const ordersWithTotals = orders.map(order => {
      const orderObj = order.toObject();
      
      // If totalAmount is missing or null, calculate it
      if (orderObj.totalAmount == null) {
        orderObj.totalAmount = calculateMissingOrderTotal(orderObj);
        
        // Optionally save the calculated total back to the database
        order.totalAmount = orderObj.totalAmount;
        order.save().catch(err => console.log('Error saving calculated total:', err));
      }
      
      return orderObj;
    });

    res.json(ordersWithTotals);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong" });
  }
};

type CheckoutSessionRequest = {
  cartItems: {
    menuItemId: string;
    name: string;
    quantity: string;
  }[];
  deliveryDetails: {
    email: string;
    name: string;
    addressLine1: string;
    city: string;
  };
  restaurantId: string;
};

const stripeWebhookHandler = async (req: Request, res: Response) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];
    event = STRIPE.webhooks.constructEvent(
      req.body,
      sig as string,
      STRIPE_ENDPOINT_SECRET
    );
  } catch (error: any) {
    console.log(error);
    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const order = await Order.findById(event.data.object.metadata?.orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only update totalAmount if Stripe provides a valid amount
    if (event.data.object.amount_total != null) {
      order.totalAmount = event.data.object.amount_total;
    }
    order.status = "paid";

    await order.save();
  }

  res.status(200).send();
};

const calculateOrderTotal = (
  checkoutSessionRequest: CheckoutSessionRequest,
  menuItems: MenuItemType[],
  deliveryPrice: number
): number => {
  let totalAmount = 0;

  checkoutSessionRequest.cartItems.forEach((cartItem) => {
    const menuItem = menuItems.find(
      (item) => item._id.toString() === cartItem.menuItemId.toString()
    );

    if (!menuItem) {
      throw new Error(`Menu item not found: ${cartItem.menuItemId}`);
    }

    totalAmount += menuItem.price * parseInt(cartItem.quantity);
  });

  // Add delivery price
  totalAmount += deliveryPrice;

  return totalAmount;
};

const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const checkoutSessionRequest: CheckoutSessionRequest = req.body;

    const restaurant = await Restaurant.findById(
      checkoutSessionRequest.restaurantId
    );

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    // Calculate total amount before creating the order
    const totalAmount = calculateOrderTotal(
      checkoutSessionRequest,
      restaurant.menuItems,
      restaurant.deliveryPrice
    );

    const newOrder = new Order({
      restaurant: restaurant,
      user: req.userId,
      status: "placed",
      deliveryDetails: checkoutSessionRequest.deliveryDetails,
      cartItems: checkoutSessionRequest.cartItems,
      totalAmount: totalAmount,
      createdAt: new Date(),
    });

    const lineItems = createLineItems(
      checkoutSessionRequest,
      restaurant.menuItems
    );

    const session = await createSession(
      lineItems,
      newOrder._id.toString(),
      restaurant.deliveryPrice,
      restaurant._id.toString()
    );

    if (!session.url) {
      return res.status(500).json({ message: "Error creating stripe session" });
    }

    await newOrder.save();
    res.json({ url: session.url });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ message: error.raw.message });
  }
};

const createLineItems = (
  checkoutSessionRequest: CheckoutSessionRequest,
  menuItems: MenuItemType[]
) => {
  const lineItems = checkoutSessionRequest.cartItems.map((cartItem) => {
    const menuItem = menuItems.find(
      (item) => item._id.toString() === cartItem.menuItemId.toString()
    );

    if (!menuItem) {
      throw new Error(`Menu item not found: ${cartItem.menuItemId}`);
    }

    const line_item: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: "usd",
        unit_amount: menuItem.price,
        product_data: {
          name: menuItem.name,
        },
      },
      quantity: parseInt(cartItem.quantity),
    };

    return line_item;
  });

  return lineItems;
};

const createSession = async (
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
  orderId: string,
  deliveryPrice: number,
  restaurantId: string
) => {
  const sessionData = await STRIPE.checkout.sessions.create({
    line_items: lineItems,
    shipping_options: [
      {
        shipping_rate_data: {
          display_name: "Delivery",
          type: "fixed_amount",
          fixed_amount: {
            amount: deliveryPrice,
            currency: "usd",
          },
        },
      },
    ],
    mode: "payment",
    metadata: {
      orderId,
      restaurantId,
    },
    success_url: `${FRONTEND_URL}/order-status?success=true`,
    cancel_url: `${FRONTEND_URL}/detail/${restaurantId}?cancelled=true`,
  });

  return sessionData;
};

const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.user.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to delete this order" });
    }

    if (order.status === "inProgress") {
      return res.status(400).json({ message: "Cannot delete order that is in progress" });
    }

    await Order.findByIdAndDelete(orderId);

    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to delete order" });
  }
};

export default {
  getMyOrders,
  createCheckoutSession,
  stripeWebhookHandler,
  deleteOrder,
};
