import { catalogImageTransform } from '../utils/imageResponse.js';
import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 80,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    imageRevision: { type: Number, default: 0 },

    image: {
      url: String,
      publicId: String,
      id: String,
      width: Number,
      height: Number,
      format: String,
      bytes: Number,
      alt: String,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: catalogImageTransform },
  }
);

export default mongoose.model("Category", categorySchema);
