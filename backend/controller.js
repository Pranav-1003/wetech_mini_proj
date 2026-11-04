const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Product = require("./products");
const User = require("./users");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

mongoose
  .connect("mongodb+srv://pranav03102007_db_user:PranavPrakasH10@cluster0.ki5fijl.mongodb.net/lab8")
  .then(() => console.log("Connected to MongoDB!"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const email = req.headers["x-user-email"] || (authHeader && authHeader.split(" ")[1]);

  if (!email) {
    return res.status(401).json({ message: "Unauthorized. Please log in first." });
  }

  let userEmail = email;
  try {
    const decoded = Buffer.from(email, "base64").toString("utf-8");
    if (decoded.includes("@")) userEmail = decoded;
  } catch { }

  const user = await User.findOne({ emailId: userEmail.toLowerCase().trim() });
  if (!user) {
    return res.status(401).json({ message: "Invalid user authentication." });
  }

  req.user = user;
  next();
};

app.post(["/api/users", "/users"], async (req, res) => {
  try {
    const { username, emailId, age, password } = req.body;
    if (!username || !emailId || age === undefined || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const cleanEmail = emailId.toLowerCase().trim();
    const existing = await User.findOne({ emailId: cleanEmail });
    if (existing) {
      return res.status(400).json({ message: "Email ID is already registered." });
    }

    const newUser = await User.create({
      username: username.trim(),
      emailId: cleanEmail,
      age: Number(age),
      password: String(password),
    });

    res.status(201).json({
      message: `Successfully registered! Welcome, ${newUser.username}.`,
      user: { username: newUser.username, emailId: newUser.emailId, age: newUser.age },
    });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

app.post(["/api/login", "/login"], async (req, res) => {
  try {
    const { emailId, password } = req.body;
    if (!emailId || !password) {
      return res.status(400).json({ message: "Email ID and password are required." });
    }

    const user = await User.findOne({ emailId: emailId.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: "User Not Registered." });
    }

    if (user.password !== String(password)) {
      return res.status(401).json({ message: "Invalid Password." });
    }

    const token = Buffer.from(user.emailId).toString("base64");
    res.json({
      message: "Login successful!",
      token,
      user: { username: user.username, emailId: user.emailId, age: user.age },
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

app.get(["/api/products", "/products"], verifyAuth, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve products", error: err.message });
  }
});

app.put(["/api/users", "/users"], async (req, res) => {
  try {
    const emailId = (req.query.emailId || req.body.emailId || "").toLowerCase().trim();
    const user = await User.findOne({ emailId });
    if (!user) {
      return res.status(404).json({ message: "User Not Registered." });
    }

    const { username, age, password } = req.body;
    if (!username || age === undefined || !password) {
      return res.status(400).json({ message: "Complete details (username, age, password) are required." });
    }

    user.username = username.trim();
    user.age = Number(age);
    user.password = String(password);
    await user.save();

    res.json({
      message: "Complete profile details updated successfully.",
      user: { username: user.username, emailId: user.emailId, age: user.age },
    });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

app.patch(["/api/users", "/users"], async (req, res) => {
  try {
    const emailId = (req.query.emailId || req.body.emailId || "").toLowerCase().trim();
    const user = await User.findOne({ emailId });
    if (!user) {
      return res.status(404).json({ message: "User Not Registered." });
    }

    const { username, age, password } = req.body;
    if (username !== undefined) user.username = username.trim();
    if (age !== undefined) user.age = Number(age);
    if (password !== undefined) user.password = String(password);
    await user.save();

    res.json({
      message: "Selected profile fields updated successfully.",
      user: { username: user.username, emailId: user.emailId, age: user.age },
    });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

app.delete(["/api/users", "/users"], async (req, res) => {
  try {
    const emailId = (req.query.emailId || "").toLowerCase().trim();
    const user = await User.findOne({ emailId });
    if (!user) {
      return res.status(404).json({ message: "User Not Registered." });
    }

    await User.deleteOne({ emailId });
    res.json({ message: `User record with email '${emailId}' deleted successfully.` });
  } catch (err) {
    res.status(500).json({ message: "Deletion failed", error: err.message });
  }
});

app.get(["/api/products/:productId", "/products/:productId"], async (req, res) => {
  const product = await Product.findOne({ productId: req.params.productId });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

app.post(["/api/products", "/products"], async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to create product", error: err.message });
  }
});

app.put(["/api/products/:productId", "/products/:productId"], async (req, res) => {
  try {
    const updated = await Product.findOneAndUpdate(
      { productId: req.params.productId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
});

app.delete(["/api/products/:productId", "/products/:productId"], async (req, res) => {
  try {
    const result = await Product.deleteOne({ productId: req.params.productId });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
});
