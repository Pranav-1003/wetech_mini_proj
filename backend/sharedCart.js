const mongoose = require("mongoose");

const sharedCartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    addedByUsername: {
      type: String,
      default: "Member"
    }
  },
  { _id: false, timestamps: true }
);

const sharedCartSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],

    items: [sharedCartItemSchema],
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active"
    },
    version: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  {
    timestamps: true
  }
);


sharedCartSchema.index({ roomCode: 1, status: 1 });

const SharedCart = mongoose.model("SharedCart", sharedCartSchema);

module.exports = SharedCart;