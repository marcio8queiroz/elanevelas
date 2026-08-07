import mongoose from "mongoose";

const productImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    publicId: String,
    alt: String,
    isMain: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    fragrance: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    promotionalPrice: {
      type: Number,
      min: 0,
      default: null,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    lowStockThreshold: {
      type: Number,
      min: 0,
      default: 5,
    },

    images: {
      type: [productImageSchema],
      default: [],
    },

    specifications: {
      weight: Number,
      burnTime: Number,
      waxType: String,
      wickType: String,
      containerMaterial: String,
    },

    shipping: {
      weightKg: {
        type: Number,
        required: true,
        min: 0,
      },
      heightCm: {
        type: Number,
        required: true,
        min: 0,
      },
      widthCm: {
        type: Number,
        required: true,
        min: 0,
      },
      lengthCm: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    tags: {
      type: [String],
      default: [],
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    salesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({
  name: "text",
  description: "text",
  fragrance: "text",
  tags: "text",
});

productSchema.index({
  category: 1,
  fragrance: 1,
  price: 1,
  isActive: 1,
});

export default mongoose.model("Product", productSchema);