const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Product = require("./products");
const User = require("./users");
const Reservation = require("./reservations");

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
    // Expire any stale reservations first
    await Reservation.updateMany(
      { status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const products = await Product.find();

    // Aggregate active reserved quantities per product
    const activeReservations = await Reservation.aggregate([
      { $match: { status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$productId", totalReserved: { $sum: "$quantity" } } },
    ]);
    const reservedMap = {};
    activeReservations.forEach((r) => {
      reservedMap[r._id] = r.totalReserved;
    });

    const enriched = products.map((p) => {
      const obj = p.toObject();
      const reserved = reservedMap[p.productId] || 0;
      obj.availableStock = Math.max(0, p.quantity - reserved);
      return obj;
    });

    res.json(enriched);
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
  try {
    const product = await Product.findOne({ productId: req.params.productId });
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Expire any stale reservations first
    await Reservation.updateMany(
      { productId: product.productId, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const activeReservations = await Reservation.aggregate([
      { $match: { productId: product.productId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } },
    ]);
    const totalReserved = activeReservations.length > 0 ? activeReservations[0].totalReserved : 0;
    const obj = product.toObject();
    obj.availableStock = Math.max(0, product.quantity - totalReserved);

    res.json(obj);
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve product", error: err.message });
  }
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

// --- Reservation Expiry Cleanup ---
const cleanupExpiredReservations = async () => {
  try {
    await Reservation.updateMany(
      { status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );
  } catch (err) {
    console.error("Reservation cleanup error:", err.message);
  }
};
setInterval(cleanupExpiredReservations, 60 * 1000);
cleanupExpiredReservations(); // run once on startup

// --- Reservation API Endpoints ---

// POST /api/reservations — Reserve a product with 10-minute expiry and concurrency protection
app.post("/api/reservations", verifyAuth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const reqQty = Number(quantity);

    if (!productId || !reqQty || reqQty < 1 || isNaN(reqQty)) {
      return res.status(400).json({ message: "Valid productId and quantity (>= 1) are required." });
    }

    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Clean up any expired reservations first
    await Reservation.updateMany(
      { productId, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    // Calculate currently available stock: Total Stock - Sum of Active Reservations
    const activeReservations = await Reservation.aggregate([
      { $match: { productId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } },
    ]);
    const totalReserved = activeReservations.length > 0 ? activeReservations[0].totalReserved : 0;
    const availableStock = Math.max(0, product.quantity - totalReserved);

    if (reqQty > availableStock) {
      return res.status(400).json({
        message: `Insufficient stock. Only ${availableStock} unit(s) available.`,
        availableStock,
      });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Create reservation
    const reservation = await Reservation.create({
      userId: req.user._id,
      productId,
      quantity: reqQty,
      status: "active",
      expiresAt,
    });

    // Concurrency verification:
    // Determine cumulative active reservations ordered by (createdAt ASC, _id ASC) up to and including this reservation
    const activePriorReservations = await Reservation.find({
      productId,
      status: "active",
      expiresAt: { $gt: new Date() },
      $or: [
        { createdAt: { $lt: reservation.createdAt } },
        { createdAt: reservation.createdAt, _id: { $lte: reservation._id } },
      ],
    });
    const cumulativeReserved = activePriorReservations.reduce((sum, r) => sum + r.quantity, 0);

    if (cumulativeReserved > product.quantity) {
      // Race condition detected: another concurrent request reserved the last stock first. Roll back this reservation.
      await Reservation.deleteOne({ _id: reservation._id });
      return res.status(409).json({
        message: "Reservation conflict. The requested stock was reserved by another user.",
        availableStock: 0,
      });
    }

    res.status(201).json({
      message: "Product reserved successfully!",
      reservation,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create reservation", error: err.message });
  }
});

// GET /api/reservations/my — Return logged-in user's reservations
app.get("/api/reservations/my", verifyAuth, async (req, res) => {
  try {
    // Automatically mark user's expired reservations
    await Reservation.updateMany(
      { userId: req.user._id, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const reservations = await Reservation.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    // Enrich reservations with product details
    const productIds = [...new Set(reservations.map((r) => r.productId))];
    const products = await Product.find({ productId: { $in: productIds } });
    const productMap = {};
    products.forEach((p) => { productMap[p.productId] = p; });

    const enriched = reservations.map((r) => ({
      ...r.toObject(),
      product: productMap[r.productId] || null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch reservations", error: err.message });
  }
});

// DELETE /api/reservations/:id — Cancel reservation and release stock
app.delete("/api/reservations/:id", verifyAuth, async (req, res) => {
  try {
    // Atomically cancel reservation owned by the user
    const updated = await Reservation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: "active" },
      { $set: { status: "cancelled" } },
      { new: true }
    );

    if (!updated) {
      const existing = await Reservation.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Reservation not found." });
      }
      if (existing.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "You can only cancel your own reservations." });
      }
      return res.status(400).json({ message: `Cannot cancel a reservation with status '${existing.status}'.` });
    }

    res.json({ message: "Reservation cancelled successfully.", reservation: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel reservation", error: err.message });
  }
});

// POST /api/reservations/:id/complete — Complete reservation during checkout, reduce stock exactly once
app.post("/api/reservations/:id/complete", verifyAuth, async (req, res) => {
  try {
    // Atomically transition reservation from active -> completed to prevent double-completion
    const updatedReservation = await Reservation.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id,
        status: "active",
        expiresAt: { $gt: new Date() },
      },
      { $set: { status: "completed" } },
      { new: true }
    );

    if (!updatedReservation) {
      const existing = await Reservation.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Reservation not found." });
      }
      if (existing.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "You can only complete your own reservations." });
      }
      if (existing.status !== "active") {
        return res.status(400).json({ message: `Cannot complete a reservation with status '${existing.status}'.` });
      }
      if (new Date() > existing.expiresAt) {
        existing.status = "expired";
        await existing.save();
        return res.status(400).json({ message: "Reservation has expired." });
      }
      return res.status(400).json({ message: "Unable to complete reservation." });
    }

    // Atomically decrement product stock exactly once
    const updatedProduct = await Product.findOneAndUpdate(
      { productId: updatedReservation.productId, quantity: { $gte: updatedReservation.quantity } },
      { $inc: { quantity: -updatedReservation.quantity } },
      { new: true }
    );

    if (!updatedProduct) {
      // Revert reservation status if stock is unexpectedly insufficient
      await Reservation.updateOne({ _id: updatedReservation._id }, { $set: { status: "active" } });
      return res.status(400).json({ message: "Insufficient product stock to complete reservation." });
    }

    res.json({
      message: "Reservation completed! Purchase successful.",
      reservation: updatedReservation,
      updatedProduct,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to complete reservation", error: err.message });
  }
});
