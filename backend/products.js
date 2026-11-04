const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: [true, "productId is required"],
      unique: true,
      trim: true,
    },
    productName: {
      type: String,
      required: [true, "productName is required"],
      trim: true,
    },
    productPrice: {
      type: Number,
      required: [true, "productPrice is required"],
      min: [0, "productPrice cannot be negative"],
    },
    category: {
      type: String,
      required: [true, "category is required"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "quantity is required"],
      min: [0, "quantity cannot be negative"],
      default: 0,
    },
    description: {
      type: String,
      required: [true, "description is required"],
      trim: true,
    },
    // Backwards-compatibility aliases for legacy fields
    name: { type: String, trim: true },
    price: { type: Number },
    image: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

// Keep productName/name and productPrice/price synchronized
productSchema.pre("save", function () {
  if (!this.productName && this.name) {
    this.productName = this.name;
  }
  if (!this.name && this.productName) {
    this.name = this.productName;
  }
  if (this.productPrice === undefined && this.price !== undefined) {
    this.productPrice = this.price;
  }
  if (this.price === undefined && this.productPrice !== undefined) {
    this.price = this.productPrice;
  }
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
