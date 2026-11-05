const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"]
    },
    productId: {
      type: String,
      required: [true, "productId is required"]
    },
    quantity: {
      type: Number,
      required: [true, "quantity is required"],
      min: [1, "quantity must be at least 1"]
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "completed"],
      default: "active"
    },
    expiresAt: {
      type: Date,
      required: [true, "expiresAt is required"]
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }
);

reservationSchema.index({ status: 1, expiresAt: 1 });

const Reservation = mongoose.model("Reservation", reservationSchema);

module.exports = Reservation;