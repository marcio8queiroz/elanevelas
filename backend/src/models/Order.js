import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    sku: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    imageUrl: String,

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    unitPriceInCents: {
      type: Number,
      required: true,
      min: 0,
    },

    totalInCents: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: String,
    zipCode: String,
    street: String,
    number: String,
    complement: String,
    neighborhood: String,
    city: String,
    state: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
    },

    subtotalInCents: {
      type: Number,
      required: true,
      min: 0,
    },

    discountInCents: {
      type: Number,
      default: 0,
      min: 0,
    },

    shippingInCents: {
      type: Number,
      required: true,
      min: 0,
    },

    totalInCents: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },

    shipping: {
      provider: String,
      service: String,
      estimatedDays: Number,
      trackingCode: String,
    },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending_payment",
      index: true,
    },

    payment: {
      provider: {
        type: String,
        enum: ["mercado_pago", "pagarme"],
      },
      method: String,
      externalPaymentId: String,
      status: String,
      paidAt: Date,
      transactionAmountInCents: Number,
    },

    statusHistory: [
      {
        status: String,
        description: String,
        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    customerNotes: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.externalPaymentId": 1 });

export default mongoose.model("Order", orderSchema);