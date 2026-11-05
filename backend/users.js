const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
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
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true
    },
    emailId: {
      type: String,
      required: [true, "Email ID is required"],
      unique: true,
      lowercase: true,
      trim: true
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [1, "Age must be greater than 0"]
    },
    password: {
      type: String,
      required: [true, "Password is required"]
    },
    budget: {
      type: Number,
      default: 0,
      min: [0, "Budget cannot be negative"]
    },
    cart: {
      type: [cartItemSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;