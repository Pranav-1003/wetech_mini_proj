const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Product = require("./products");
const User = require("./users");
const Reservation = require("./reservations");
const SharedCart = require("./sharedCart");

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "webtech_mini_proj_jwt_secret_key_2026_secure";

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
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader || req.headers["x-user-email"];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized. Please log in first." });
  }

  try {
    // 1. Verify cryptographic JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = (decoded.userId ? await User.findById(decoded.userId) : null) ||
                 (decoded.emailId ? await User.findOne({ emailId: decoded.emailId.toLowerCase().trim() }) : null);

    if (!user) {
      return res.status(401).json({ message: "Invalid user authentication token." });
    }

    req.user = user;
    return next();
  } catch (jwtErr) {
    if (jwtErr.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Authentication token expired. Please log in again." });
    }

    // 2. Fallback for backwards compatibility with any existing session tokens
    try {
      let fallbackEmail = token;
      const decodedBuf = Buffer.from(token, "base64").toString("utf-8");
      if (decodedBuf.includes("@")) fallbackEmail = decodedBuf;
      const legacyUser = await User.findOne({ emailId: fallbackEmail.toLowerCase().trim() });
      if (legacyUser) {
        req.user = legacyUser;
        return next();
      }
    } catch { }

    return res.status(401).json({ message: "Invalid authentication token." });
  }
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

    // Generate real JWT token upon registration
    const token = jwt.sign(
      {
        userId: newUser._id,
        emailId: newUser.emailId,
        username: newUser.username,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: `Successfully registered! Welcome, ${newUser.username}.`,
      token,
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

    // Generate real, cryptographically signed JWT token with 24-hour expiration
    const token = jwt.sign(
      {
        userId: user._id,
        emailId: user.emailId,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

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

// ============================================================
// 4. SHOPPING BUDGET & CHEAPER WORTHY ALTERNATIVES
// ============================================================

/**
 * Conventional rule-based algorithm to find top cheaper worthy alternatives
 * for a product in the cart.
 *
 * Rules:
 * 1. Category Match: Must belong to the exact same category.
 * 2. Lower Price: Price must be strictly lower than original product price.
 * 3. Identity Check: Exclude the original product itself (productId !== orig.productId).
 * 4. In Stock: Available stock must be > 0.
 * 5. Rule-based Similarity Score:
 *    - Keyword overlap between productName & description of original vs candidate.
 *    - Value & savings factor.
 * 6. Top 3 Candidates: Ranked descending by similarity score and savings.
 */
function findCheaperAlternatives(originalProduct, candidates, quantity = 1) {
  const origPrice = Number(originalProduct.productPrice !== undefined ? originalProduct.productPrice : originalProduct.price || 0);
  const origCategory = String(originalProduct.category || "").toLowerCase().trim();
  const origName = String(originalProduct.productName || originalProduct.name || "").toLowerCase();
  const origDesc = String(originalProduct.description || "").toLowerCase();

  const stopWords = new Set(["the", "a", "an", "and", "or", "with", "for", "in", "of", "to", "is", "by", "on"]);
  const origTokens = new Set(
    `${origName} ${origDesc}`
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );

  const scoredAlternatives = [];

  for (const candidate of candidates) {
    const candId = String(candidate.productId);
    if (candId === String(originalProduct.productId)) continue;

    const candCategory = String(candidate.category || "").toLowerCase().trim();
    if (candCategory !== origCategory) continue;

    const candPrice = Number(candidate.productPrice !== undefined ? candidate.productPrice : candidate.price || 0);
    if (candPrice >= origPrice || candPrice <= 0) continue;

    // Check available stock
    const candStock = Number(candidate.availableStock !== undefined ? candidate.availableStock : candidate.quantity || 0);
    if (candStock <= 0) continue;

    // Keyword overlap
    const candName = String(candidate.productName || candidate.name || "").toLowerCase();
    const candDesc = String(candidate.description || "").toLowerCase();
    const candTokens = `${candName} ${candDesc}`
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    let keywordOverlap = 0;
    candTokens.forEach((token) => {
      if (origTokens.has(token)) keywordOverlap++;
    });

    const unitSavings = Number((origPrice - candPrice).toFixed(2));
    const totalSavings = Number((unitSavings * quantity).toFixed(2));

    // Rule-based score: Category match base (50) + keyword overlap (10 pts each) + price savings weight
    const similarityScore = 50 + keywordOverlap * 10 + (unitSavings / origPrice) * 20;

    scoredAlternatives.push({
      productId: candidate.productId,
      productName: candidate.productName || candidate.name,
      name: candidate.productName || candidate.name,
      category: candidate.category,
      price: candPrice,
      productPrice: candPrice,
      savings: unitSavings,
      totalSavings: totalSavings,
      availableStock: candStock,
      image: candidate.image || "",
      description: candidate.description || "",
      similarityScore: Number(similarityScore.toFixed(2)),
    });
  }

  // Rank by similarity score descending, then by savings descending
  scoredAlternatives.sort((a, b) => b.similarityScore - a.similarityScore || b.savings - a.savings);

  // Return top 3 alternatives
  return scoredAlternatives.slice(0, 3);
}

// POST /api/budget — Set or update authenticated user's shopping budget
app.post("/api/budget", verifyAuth, async (req, res) => {
  try {
    const { budget } = req.body;
    const numericBudget = Number(budget);

    if (budget === undefined || budget === null || isNaN(numericBudget) || numericBudget < 0) {
      return res.status(400).json({ message: "Budget must be a valid non-negative number." });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.budget = numericBudget;
    await user.save();

    res.json({
      message: "Shopping budget saved successfully.",
      budget: user.budget,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update budget.", error: err.message });
  }
});

// GET /api/budget — Retrieve authenticated user's budget
app.get("/api/budget", verifyAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({
      budget: Number(user.budget || 0),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve budget.", error: err.message });
  }
});

// POST /api/cart — Save or synchronize user's cart in database
app.post("/api/cart", verifyAuth, async (req, res) => {
  try {
    const { cart } = req.body;
    if (!Array.isArray(cart)) {
      return res.status(400).json({ message: "Cart must be an array of items." });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const cleanCart = [];
    for (const item of cart) {
      const pId = item.productId || item.id || item._id;
      const qty = Number(item.quantity || 1);
      if (pId && qty > 0) {
        const product = await Product.findOne({ productId: pId });
        if (product) {
          cleanCart.push({ productId: pId, quantity: qty });
        }
      }
    }

    user.cart = cleanCart;
    await user.save();

    // Recalculate using actual MongoDB prices
    let cartTotal = 0;
    const enrichedCart = [];

    for (const c of user.cart) {
      const p = await Product.findOne({ productId: c.productId });
      if (!p) continue;
      const price = Number(p.productPrice !== undefined ? p.productPrice : p.price || 0);
      const subtotal = price * c.quantity;
      cartTotal += subtotal;
      enrichedCart.push({
        productId: p.productId,
        name: p.productName || p.name,
        productName: p.productName || p.name,
        price,
        quantity: c.quantity,
        subtotal: Number(subtotal.toFixed(2)),
        image: p.image,
        category: p.category,
      });
    }

    cartTotal = Number(cartTotal.toFixed(2));
    const budget = Number(user.budget || 0);
    const isExceeded = budget > 0 && cartTotal > budget;

    res.json({
      message: "Cart updated successfully.",
      cart: enrichedCart,
      cartTotal,
      budget,
      remainingBudget: Math.max(0, Number((budget - cartTotal).toFixed(2))),
      exceededAmount: Math.max(0, Number((cartTotal - budget).toFixed(2))),
      isExceeded,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update cart.", error: err.message });
  }
});

// GET /api/cart — Retrieve authenticated user's cart with MongoDB prices
app.get("/api/cart", verifyAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    let cartTotal = 0;
    const enrichedCart = [];

    for (const c of user.cart || []) {
      const p = await Product.findOne({ productId: c.productId });
      if (!p) continue;
      const price = Number(p.productPrice !== undefined ? p.productPrice : p.price || 0);
      const subtotal = price * c.quantity;
      cartTotal += subtotal;
      enrichedCart.push({
        productId: p.productId,
        name: p.productName || p.name,
        productName: p.productName || p.name,
        price,
        quantity: c.quantity,
        subtotal: Number(subtotal.toFixed(2)),
        image: p.image,
        category: p.category,
      });
    }

    cartTotal = Number(cartTotal.toFixed(2));
    const budget = Number(user.budget || 0);
    const isExceeded = budget > 0 && cartTotal > budget;

    res.json({
      cart: enrichedCart,
      cartTotal,
      budget,
      remainingBudget: Math.max(0, Number((budget - cartTotal).toFixed(2))),
      exceededAmount: Math.max(0, Number((cartTotal - budget).toFixed(2))),
      isExceeded,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve cart.", error: err.message });
  }
});

// Common handler for GET and POST /api/budget/alternatives
const handleAlternativesRequest = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const budget = Number(user.budget || 0);

    // Accept cart items from query string, JSON body, or stored user cart
    let cartItems = [];
    if (req.body && Array.isArray(req.body.cart)) {
      cartItems = req.body.cart;
    } else if (req.query && req.query.cart) {
      try {
        cartItems = JSON.parse(req.query.cart);
      } catch {
        cartItems = [];
      }
    } else if (user.cart && user.cart.length > 0) {
      cartItems = user.cart;
    }

    // Calculate actual cart total strictly using MongoDB prices
    let actualCartTotal = 0;
    const validatedCart = [];

    for (const item of cartItems) {
      const pId = item.productId || item.id || item._id;
      const qty = Number(item.quantity || 1);
      if (!pId || qty <= 0) continue;

      const product = await Product.findOne({ productId: pId });
      if (!product) continue;

      const realPrice = Number(product.productPrice !== undefined ? product.productPrice : product.price || 0);
      actualCartTotal += realPrice * qty;

      validatedCart.push({
        product,
        quantity: qty,
        realPrice,
      });
    }

    actualCartTotal = Number(actualCartTotal.toFixed(2));
    const isExceeded = budget > 0 && actualCartTotal > budget;
    const exceededAmount = isExceeded ? Number((actualCartTotal - budget).toFixed(2)) : 0;
    const remainingBudget = Math.max(0, Number((budget - actualCartTotal).toFixed(2)));

    // If within budget, return empty alternatives
    if (!isExceeded) {
      return res.json({
        budget,
        cartTotal: actualCartTotal,
        remainingBudget,
        exceededAmount: 0,
        isExceeded: false,
        alternatives: [],
      });
    }

    // Fetch all products and active reservations to compute actual available stock
    const allProducts = await Product.find();
    const activeRes = await Reservation.aggregate([
      { $match: { status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$productId", totalReserved: { $sum: "$quantity" } } },
    ]);
    const reservedMap = {};
    activeRes.forEach((r) => {
      reservedMap[r._id] = r.totalReserved;
    });

    const enrichedCandidates = allProducts.map((p) => {
      const obj = p.toObject();
      const reserved = reservedMap[p.productId] || 0;
      obj.availableStock = Math.max(0, p.quantity - reserved);
      return obj;
    });

    const alternatives = [];

    for (const { product, quantity, realPrice } of validatedCart) {
      const suggestions = findCheaperAlternatives(product, enrichedCandidates, quantity);
      if (suggestions.length > 0) {
        alternatives.push({
          originalProduct: {
            productId: product.productId,
            name: product.productName || product.name,
            productName: product.productName || product.name,
            price: realPrice,
            productPrice: realPrice,
            quantity,
            category: product.category,
            image: product.image,
          },
          suggestions,
        });
      }
    }

    res.json({
      budget,
      cartTotal: actualCartTotal,
      remainingBudget: 0,
      exceededAmount,
      isExceeded: true,
      alternatives,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to evaluate alternatives.", error: err.message });
  }
};

// GET & POST /api/budget/alternatives — Returns cheaper worthy alternatives when cart exceeds budget
app.get("/api/budget/alternatives", verifyAuth, handleAlternativesRequest);
app.post("/api/budget/alternatives", verifyAuth, handleAlternativesRequest);

// POST /api/cart/replace — Replace an item in the cart with a cheaper alternative
app.post("/api/cart/replace", verifyAuth, async (req, res) => {
  try {
    const { originalProductId, replacementProductId, cart: clientCart } = req.body;

    if (!originalProductId || !replacementProductId) {
      return res.status(400).json({
        message: "Both originalProductId and replacementProductId are required.",
      });
    }

    if (originalProductId === replacementProductId) {
      return res.status(400).json({
        message: "Replacement product cannot be the same as original product.",
      });
    }

    // 1. Verify replacement product exists in MongoDB and is in stock
    const replacementProduct = await Product.findOne({ productId: replacementProductId });
    if (!replacementProduct) {
      return res.status(404).json({ message: "Replacement product not found in database." });
    }

    // Calculate available stock
    const activeRes = await Reservation.aggregate([
      { $match: { productId: replacementProductId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } },
    ]);
    const totalReserved = activeRes.length > 0 ? activeRes[0].totalReserved : 0;
    const availableStock = Math.max(0, replacementProduct.quantity - totalReserved);

    if (availableStock <= 0) {
      return res.status(400).json({
        message: `Replacement product '${replacementProduct.productName || replacementProduct.productId}' is out of stock.`,
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Use user.cart or clientCart passed in body
    let workingCart = user.cart && user.cart.length > 0
      ? user.cart.map((i) => ({ productId: i.productId, quantity: i.quantity }))
      : (Array.isArray(clientCart) ? clientCart.map((i) => ({ productId: i.productId || i.id, quantity: i.quantity || 1 })) : []);

    const targetIndex = workingCart.findIndex(
      (item) => String(item.productId) === String(originalProductId)
    );

    if (targetIndex === -1) {
      return res.status(404).json({
        message: `Product '${originalProductId}' is not present in the shopping cart.`,
      });
    }

    // Preserve original quantity
    const preservedQuantity = Number(workingCart[targetIndex].quantity || 1);

    if (availableStock < preservedQuantity) {
      return res.status(400).json({
        message: `Insufficient stock for replacement. Available: ${availableStock}, required: ${preservedQuantity}.`,
      });
    }

    // Check if replacement item already exists in cart; if so, combine quantity
    const existingReplacementIndex = workingCart.findIndex(
      (item, idx) => idx !== targetIndex && String(item.productId) === String(replacementProductId)
    );

    if (existingReplacementIndex !== -1) {
      workingCart[existingReplacementIndex].quantity += preservedQuantity;
      workingCart.splice(targetIndex, 1);
    } else {
      workingCart[targetIndex].productId = replacementProductId;
    }

    // Save to user.cart
    user.cart = workingCart;
    await user.save();

    // Recalculate cart total using ACTUAL database prices
    let newCartTotal = 0;
    const updatedEnrichedCart = [];

    for (const item of user.cart) {
      const p = await Product.findOne({ productId: item.productId });
      if (!p) continue;
      const price = Number(p.productPrice !== undefined ? p.productPrice : p.price || 0);
      const subtotal = price * item.quantity;
      newCartTotal += subtotal;
      updatedEnrichedCart.push({
        productId: p.productId,
        name: p.productName || p.name,
        productName: p.productName || p.name,
        price,
        productPrice: price,
        quantity: item.quantity,
        subtotal: Number(subtotal.toFixed(2)),
        image: p.image,
        category: p.category,
      });
    }

    newCartTotal = Number(newCartTotal.toFixed(2));
    const budget = Number(user.budget || 0);
    const isExceeded = budget > 0 && newCartTotal > budget;
    const remainingBudget = Math.max(0, Number((budget - newCartTotal).toFixed(2)));
    const exceededAmount = isExceeded ? Number((newCartTotal - budget).toFixed(2)) : 0;

    res.json({
      message: `Product replaced with '${replacementProduct.productName || replacementProduct.name}'.`,
      cart: updatedEnrichedCart,
      cartTotal: newCartTotal,
      budget,
      remainingBudget,
      exceededAmount,
      isExceeded,
      replacementProduct: {
        productId: replacementProduct.productId,
        name: replacementProduct.productName || replacementProduct.name,
        price: Number(replacementProduct.productPrice !== undefined ? replacementProduct.productPrice : replacementProduct.price || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to replace product in cart.", error: err.message });
  }
});

// ============================================================
// 5. COLLABORATIVE SHOPPING CART (SHARED CARTS)
// ============================================================

// Helper to enrich shared cart items with real MongoDB product data and compute cart total
const enrichSharedCart = async (cartDoc) => {
  await cartDoc.populate("members", "username emailId");
  await cartDoc.populate("createdBy", "username emailId");

  const productIds = cartDoc.items.map((i) => i.productId);
  const products = await Product.find({ productId: { $in: productIds } });
  const productMap = {};
  products.forEach((p) => {
    productMap[p.productId] = p;
  });

  let cartTotal = 0;
  const enrichedItems = [];

  for (const item of cartDoc.items) {
    const p = productMap[item.productId];
    const unitPrice = p ? Number(p.productPrice !== undefined ? p.productPrice : p.price || 0) : 0;
    const subtotal = Number((unitPrice * item.quantity).toFixed(2));
    cartTotal += subtotal;

    enrichedItems.push({
      productId: item.productId,
      name: p ? p.productName || p.name : item.productId,
      productName: p ? p.productName || p.name : item.productId,
      price: unitPrice,
      productPrice: unitPrice,
      quantity: item.quantity,
      subtotal,
      image: p ? p.image : "",
      category: p ? p.category : "General",
      availableStock: p ? p.quantity : 0,
      addedBy: item.addedBy,
      addedByUsername: item.addedByUsername || "Member",
    });
  }

  return {
    _id: cartDoc._id,
    roomCode: cartDoc.roomCode,
    status: cartDoc.status,
    version: cartDoc.version,
    createdBy: cartDoc.createdBy,
    members: cartDoc.members,
    items: enrichedItems,
    cartTotal: Number(cartTotal.toFixed(2)),
    createdAt: cartDoc.createdAt,
    updatedAt: cartDoc.updatedAt,
  };
};

// Generate unique room code
const generateUniqueRoomCode = async () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  let exists = true;

  while (exists) {
    code = "SHOP-";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const found = await SharedCart.findOne({ roomCode: code });
    if (!found) exists = false;
  }
  return code;
};

// POST /api/shared-carts/create — Create a new shared shopping room
app.post("/api/shared-carts/create", verifyAuth, async (req, res) => {
  try {
    const roomCode = await generateUniqueRoomCode();

    const sharedCart = await SharedCart.create({
      roomCode,
      createdBy: req.user._id,
      members: [req.user._id],
      items: [],
      status: "active",
      version: 1,
    });

    const enriched = await enrichSharedCart(sharedCart);

    res.status(201).json({
      message: `Shared shopping room '${roomCode}' created successfully!`,
      sharedCart: enriched,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create shared cart room.", error: err.message });
  }
});

// POST /api/shared-carts/join — Join an existing shared shopping room
app.post("/api/shared-carts/join", verifyAuth, async (req, res) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode || typeof roomCode !== "string" || !roomCode.trim()) {
      return res.status(400).json({ message: "A valid roomCode is required." });
    }

    const cleanCode = roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `No shared cart found with room code '${cleanCode}'.` });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: `Room '${cleanCode}' is closed and no longer accepting members.` });
    }

    // Prevent duplicate membership
    const alreadyMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!alreadyMember) {
      cart.members.push(req.user._id);
      cart.version += 1;
      await cart.save();
    }

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: alreadyMember ? "Already a member of this room." : "Joined shared shopping room successfully!",
      sharedCart: enriched,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to join shared cart room.", error: err.message });
  }
});

// GET /api/shared-carts/my/rooms — List active rooms the authenticated user belongs to
app.get("/api/shared-carts/my/rooms", verifyAuth, async (req, res) => {
  try {
    const rooms = await SharedCart.find({ members: req.user._id, status: "active" })
      .populate("createdBy", "username emailId")
      .populate("members", "username emailId")
      .sort({ updatedAt: -1 });

    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve user's shared rooms.", error: err.message });
  }
});

// GET /api/shared-carts/:roomCode — Get room details, members, enriched items, and total
app.get("/api/shared-carts/:roomCode", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    // Verify authorized membership
    const isMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: "Access denied. You are not a member of this shared room." });
    }

    const enriched = await enrichSharedCart(cart);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve shared cart.", error: err.message });
  }
});

// POST /api/shared-carts/:roomCode/items — Add or increment a product in the shared cart
app.post("/api/shared-carts/:roomCode/items", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const { productId, quantity = 1, version } = req.body;
    const reqQty = Number(quantity);

    if (!productId || reqQty <= 0 || isNaN(reqQty)) {
      return res.status(400).json({ message: "Valid productId and positive quantity are required." });
    }

    const cart = await SharedCart.findOne({ roomCode: cleanCode });
    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "This shared cart room is closed." });
    }

    // Verify membership
    const isMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: "Only room members can add products to this shared cart." });
    }

    // Optimistic Concurrency Check
    if (version !== undefined && version !== null && Number(version) !== cart.version) {
      const current = await enrichSharedCart(cart);
      return res.status(409).json({
        message: "Cart was updated by another member in the meantime. Latest cart synced.",
        conflict: true,
        sharedCart: current,
      });
    }

    // Validate product exists in MongoDB and check stock
    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ message: `Product '${productId}' not found in catalog.` });
    }

    const existingItem = cart.items.find((i) => i.productId === productId);
    const newTotalQty = existingItem ? existingItem.quantity + reqQty : reqQty;

    if (product.quantity < newTotalQty) {
      return res.status(400).json({
        message: `Requested quantity (${newTotalQty}) exceeds available stock (${product.quantity}) for '${product.productName || productId}'.`,
      });
    }

    if (existingItem) {
      existingItem.quantity = newTotalQty;
      existingItem.addedBy = req.user._id;
      existingItem.addedByUsername = req.user.username;
    } else {
      cart.items.push({
        productId,
        quantity: reqQty,
        addedBy: req.user._id,
        addedByUsername: req.user.username,
      });
    }

    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.status(201).json({
      message: `Added '${product.productName || productId}' to shared cart.`,
      sharedCart: enriched,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to add item to shared cart.", error: err.message });
  }
});

// PUT /api/shared-carts/:roomCode/items/:productId — Update product quantity in shared cart
app.put("/api/shared-carts/:roomCode/items/:productId", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const { productId } = req.params;
    const { quantity, version } = req.body;
    const newQty = Number(quantity);

    if (quantity === undefined || isNaN(newQty)) {
      return res.status(400).json({ message: "A valid numeric quantity is required." });
    }

    const cart = await SharedCart.findOne({ roomCode: cleanCode });
    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "This shared cart room is closed." });
    }

    const isMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: "Only room members can modify this shared cart." });
    }

    // Optimistic Concurrency Check
    if (version !== undefined && version !== null && Number(version) !== cart.version) {
      const current = await enrichSharedCart(cart);
      return res.status(409).json({
        message: "Cart was updated by another member in the meantime. Latest cart synced.",
        conflict: true,
        sharedCart: current,
      });
    }

    const itemIndex = cart.items.findIndex((i) => i.productId === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: `Product '${productId}' is not in the shared cart.` });
    }

    if (newQty <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      const product = await Product.findOne({ productId });
      if (!product) {
        return res.status(404).json({ message: `Product '${productId}' not found in catalog.` });
      }

      if (product.quantity < newQty) {
        return res.status(400).json({
          message: `Requested quantity (${newQty}) exceeds available stock (${product.quantity}).`,
        });
      }

      cart.items[itemIndex].quantity = newQty;
    }

    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: newQty <= 0 ? "Product removed from shared cart." : "Quantity updated successfully.",
      sharedCart: enriched,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update item quantity.", error: err.message });
  }
});

// DELETE /api/shared-carts/:roomCode/items/:productId — Remove product from shared cart
app.delete("/api/shared-carts/:roomCode/items/:productId", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const { productId } = req.params;
    const { version } = req.body || req.query;

    const cart = await SharedCart.findOne({ roomCode: cleanCode });
    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "This shared cart room is closed." });
    }

    const isMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: "Only room members can modify this shared cart." });
    }

    // Optimistic Concurrency Check
    if (version !== undefined && version !== null && Number(version) !== cart.version) {
      const current = await enrichSharedCart(cart);
      return res.status(409).json({
        message: "Cart was updated by another member in the meantime. Latest cart synced.",
        conflict: true,
        sharedCart: current,
      });
    }

    const itemIndex = cart.items.findIndex((i) => i.productId === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: `Product '${productId}' is not in the shared cart.` });
    }

    cart.items.splice(itemIndex, 1);
    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: "Product removed from shared cart successfully.",
      sharedCart: enriched,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove item from shared cart.", error: err.message });
  }
});

// DELETE /api/shared-carts/:roomCode/leave — Leave the shared shopping room
app.delete("/api/shared-carts/:roomCode/leave", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    const memberIndex = cart.members.findIndex((m) => m.toString() === req.user._id.toString());
    if (memberIndex === -1) {
      return res.status(400).json({ message: "You are not a member of this room." });
    }

    cart.members.splice(memberIndex, 1);

    // Creator ownership handling: reassign or close
    if (cart.createdBy.toString() === req.user._id.toString()) {
      if (cart.members.length > 0) {
        cart.createdBy = cart.members[0];
      } else {
        cart.status = "closed";
      }
    }

    cart.version += 1;
    await cart.save();

    res.json({
      message: "You have left the shared shopping room.",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to leave shared cart room.", error: err.message });
  }
});

// DELETE /api/shared-carts/:roomCode/close — Close the shared shopping room (Creator only)
app.delete("/api/shared-carts/:roomCode/close", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    if (cart.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized. Only the room creator can close this room." });
    }

    cart.status = "closed";
    cart.version += 1;
    await cart.save();

    res.json({
      message: "Shared shopping room has been closed.",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to close shared cart room.", error: err.message });
  }
});

// POST /api/shared-carts/:roomCode/checkout — Checkout the shared cart (Creator only)
app.post("/api/shared-carts/:roomCode/checkout", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }

    // Verify creator authorization
    if (cart.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized. Only the room creator can initiate checkout." });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "Cannot checkout a closed room." });
    }

    if (cart.items.length === 0) {
      return res.status(400).json({ message: "Cannot checkout an empty shopping cart." });
    }

    // Validate available stock for each item from MongoDB
    for (const item of cart.items) {
      const product = await Product.findOne({ productId: item.productId });
      if (!product) {
        return res.status(400).json({ message: `Product '${item.productId}' no longer exists in catalog.` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for '${product.productName || item.productId}'. Available: ${product.quantity}, needed: ${item.quantity}.`,
        });
      }
    }

    // Atomically decrement stock
    for (const item of cart.items) {
      await Product.updateOne({ productId: item.productId }, { $inc: { quantity: -item.quantity } });
    }

    // Close shared cart upon order completion
    cart.status = "closed";
    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: "Shared cart checkout successful! Thank you for shopping together.",
      sharedCart: enriched,
    });
  } catch (err) {
    res.status(500).json({ message: "Checkout failed.", error: err.message });
  }
});

