const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const Product = require("./products");
const User = require("./users");

const sampleProducts = [
  {
    productId: "P101",
    productName: "Cotton Polo T-Shirt",
    productPrice: 24.99,
    category: "Clothing",
    quantity: 45,
    description: "Premium breathable 100% cotton polo t-shirt with classic collar and regular fit.",
    image: "/images/cotton polo t-shirt.jpg",
  },
  {
    productId: "P102",
    productName: "Slim-Fit Denim Jeans",
    productPrice: 49.99,
    category: "Clothing",
    quantity: 30,
    description: "Comfortable stretch denim jeans with five pockets and durable double-stitched seams.",
    image: "/images/Slim-Fit Denim Jeans.webp",
  },
  {
    productId: "P103",
    productName: "Wireless Bluetooth Headphones",
    productPrice: 79.99,
    category: "Electronics",
    quantity: 20,
    description: "Active noise-cancelling over-ear headphones with 30-hour battery life and high-fidelity sound.",
    image: "/images/wireless bluetooth headphone.png",
  },
  {
    productId: "P104",
    productName: "Smart Fitness Watch",
    productPrice: 99.5,
    category: "Electronics",
    quantity: 15,
    description: "Waterproof smartwatch with real-time heart rate monitor, sleep tracking, and GPS.",
    image: "/images/Smart Fitness Watch.jpeg",
  },
  {
    productId: "P105",
    productName: "Pro Running Shoes",
    productPrice: 59.99,
    category: "Footwear",
    quantity: 25,
    description: "Lightweight athletic running shoes with responsive shock-absorption sole.",
    image: "/images/Pro Running Shoes.avif",
  },
  {
    productId: "P106",
    productName: "Insulated Stainless Steel Bottle",
    productPrice: 18.0,
    category: "Accessories",
    quantity: 50,
    description: "Double-walled vacuum insulated 1000ml bottle keeping beverages cold for 24 hours.",
    image: "/images/Insulated Stainless Steel Bottle.jpeg",
  },
];

async function seed() {
  try {
    await mongoose.connect(
      "mongodb+srv://pranav03102007_db_user:PranavPrakasH10@cluster0.ki5fijl.mongodb.net/lab8"
    );
    console.log("Connected to MongoDB for seeding...");

    for (const item of sampleProducts) {
      await Product.findOneAndUpdate(
        { productId: item.productId },
        { ...item, name: item.productName, price: item.productPrice },
        { upsert: true, returnDocument: "after" }
      );
      console.log(`Seeded product: ${item.productId} - ${item.productName}`);
    }

    await Product.findOneAndUpdate(
      { productId: "P1" },
      {
        productName: "Casual Shirt",
        productPrice: 10,
        category: "Clothing",
        quantity: 20,
        description: "Classic casual shirt for daily wear.",
        image: "/images/casual shirt.jpeg",
      },
      { returnDocument: "after" }
    );
    await Product.findOneAndUpdate(
      { productId: "P2" },
      {
        productName: "Formal Pant",
        productPrice: 15,
        category: "Clothing",
        quantity: 18,
        description: "Comfortable formal trousers for office and events.",
        image: "/images/formal pant.jpeg",
      },
      { returnDocument: "after" }
    );

    console.log("All sample products seeded with images successfully!");
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

seed();
