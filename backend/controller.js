require("dotenv").config();
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
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "webtech_mini_proj_jwt_secret_key_2026_secure";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://pranav03102007_db_user:PranavPrakasH10@cluster0.ki5fijl.mongodb.net/lab8";

app.use(cors());
app.use(express.json());

const cleanupExpiredReservations = async () => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await Reservation.updateMany(
      { status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );
  } catch (err) {
    console.error("Reservation cleanup error:", err.message);
  }
};

mongoose.
  connect(MONGO_URI).
  then(() => {
    console.log("Connected to MongoDB!");
    cleanupExpiredReservations();
  }).catch((err) => console.error("MongoDB connection error:", err));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ?
    authHeader.split(" ")[1] :
    authHeader || req.headers["x-user-email"];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized. Please log in first." });
  }

  try {

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = (decoded.userId ? await User.findById(decoded.userId) : null) || (
      decoded.emailId ? await User.findOne({ emailId: decoded.emailId.toLowerCase().trim() }) : null);

    if (!user) {
      return res.status(401).json({ message: "Invalid user authentication token." });
    }

    req.user = user;
    return next();
  } catch (jwtErr) {
    if (jwtErr.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Authentication token expired. Please log in again." });
    }


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
      password: String(password)
    });


    const token = jwt.sign(
      {
        userId: newUser._id,
        emailId: newUser.emailId,
        username: newUser.username
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: `Successfully registered! Welcome, ${newUser.username}.`,
      token,
      user: { username: newUser.username, emailId: newUser.emailId, age: newUser.age }
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


    const token = jwt.sign(
      {
        userId: user._id,
        emailId: user.emailId,
        username: user.username
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "Login successful!",
      token,
      user: { username: user.username, emailId: user.emailId, age: user.age }
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

app.get(["/api/products", "/products"], verifyAuth, async (req, res) => {
  try {

    await Reservation.updateMany(
      { status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const products = await Product.find();


    const activeReservations = await Reservation.aggregate([
      { $match: { status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$productId", totalReserved: { $sum: "$quantity" } } }]
    );
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
      user: { username: user.username, emailId: user.emailId, age: user.age }
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
      user: { username: user.username, emailId: user.emailId, age: user.age }
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


    await Reservation.updateMany(
      { productId: product.productId, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const activeReservations = await Reservation.aggregate([
      { $match: { productId: product.productId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } }]
    );
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
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
});


app.post(["/api/orders", "/orders"], verifyAuth, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order must contain at least one item." });
    }


    const updates = [];
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          message: `Invalid item: each item must have a productId and a quantity >= 1.`
        });
      }

      const product = await Product.findOne({ productId: item.productId });
      if (!product) {
        return res.status(404).json({
          message: `Product "${item.productId}" not found.`
        });
      }

      if (product.quantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for "${product.productName}" (ID: ${item.productId}). Available: ${product.quantity}, Requested: ${item.quantity}.`
        });
      }

      updates.push({ product, orderedQty: item.quantity });
    }


    for (const { product, orderedQty } of updates) {
      product.quantity -= orderedQty;
      await product.save();
    }

    res.json({
      message: "Order placed successfully! Product quantities have been updated.",
      updatedProducts: updates.map(({ product }) => ({
        productId: product.productId,
        productName: product.productName,
        remainingQuantity: product.quantity
      }))
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to place order", error: err.message });
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


setInterval(cleanupExpiredReservations, 60 * 1000);




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


    await Reservation.updateMany(
      { productId, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );


    const activeReservations = await Reservation.aggregate([
      { $match: { productId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } }]
    );
    const totalReserved = activeReservations.length > 0 ? activeReservations[0].totalReserved : 0;
    const availableStock = Math.max(0, product.quantity - totalReserved);

    if (reqQty > availableStock) {
      return res.status(400).json({
        message: `Insufficient stock. Only ${availableStock} unit(s) available.`,
        availableStock
      });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);


    const reservation = await Reservation.create({
      userId: req.user._id,
      productId,
      quantity: reqQty,
      status: "active",
      expiresAt
    });



    const activePriorReservations = await Reservation.find({
      productId,
      status: "active",
      expiresAt: { $gt: new Date() },
      $or: [
        { createdAt: { $lt: reservation.createdAt } },
        { createdAt: reservation.createdAt, _id: { $lte: reservation._id } }]

    });
    const cumulativeReserved = activePriorReservations.reduce((sum, r) => sum + r.quantity, 0);

    if (cumulativeReserved > product.quantity) {

      await Reservation.deleteOne({ _id: reservation._id });
      return res.status(409).json({
        message: "Reservation conflict. The requested stock was reserved by another user.",
        availableStock: 0
      });
    }

    res.status(201).json({
      message: "Product reserved successfully!",
      reservation
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create reservation", error: err.message });
  }
});


app.get("/api/reservations/my", verifyAuth, async (req, res) => {
  try {

    await Reservation.updateMany(
      { userId: req.user._id, status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );

    const reservations = await Reservation.find({ userId: req.user._id }).
      sort({ createdAt: -1 });


    const productIds = [...new Set(reservations.map((r) => r.productId))];
    const products = await Product.find({ productId: { $in: productIds } });
    const productMap = {};
    products.forEach((p) => { productMap[p.productId] = p; });

    const enriched = reservations.map((r) => ({
      ...r.toObject(),
      product: productMap[r.productId] || null
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch reservations", error: err.message });
  }
});


app.delete("/api/reservations/:id", verifyAuth, async (req, res) => {
  try {

    const updated = await Reservation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: "active" },
      { $set: { status: "cancelled" } },
      { returnDocument: 'after' }
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


app.post("/api/reservations/:id/complete", verifyAuth, async (req, res) => {
  try {

    const updatedReservation = await Reservation.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id,
        status: "active",
        expiresAt: { $gt: new Date() }
      },
      { $set: { status: "completed" } },
      { returnDocument: 'after' }
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


    const updatedProduct = await Product.findOneAndUpdate(
      { productId: updatedReservation.productId, quantity: { $gte: updatedReservation.quantity } },
      { $inc: { quantity: -updatedReservation.quantity } },
      { returnDocument: 'after' }
    );

    if (!updatedProduct) {

      await Reservation.updateOne({ _id: updatedReservation._id }, { $set: { status: "active" } });
      return res.status(400).json({ message: "Insufficient product stock to complete reservation." });
    }

    res.json({
      message: "Reservation completed! Purchase successful.",
      reservation: updatedReservation,
      updatedProduct
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to complete reservation", error: err.message });
  }
});



















function findCheaperAlternatives(originalProduct, candidates, quantity = 1) {
  const origPrice = Number(originalProduct.productPrice !== undefined ? originalProduct.productPrice : originalProduct.price || 0);
  const origCategory = String(originalProduct.category || "").toLowerCase().trim();
  const origName = String(originalProduct.productName || originalProduct.name || "").toLowerCase();
  const origDesc = String(originalProduct.description || "").toLowerCase();

  const stopWords = new Set(["the", "a", "an", "and", "or", "with", "for", "in", "of", "to", "is", "by", "on"]);
  const origTokens = new Set(
    `${origName} ${origDesc}`.
      replace(/[^a-z0-9\s]/g, " ").
      split(/\s+/).
      filter((w) => w.length > 2 && !stopWords.has(w))
  );

  const scoredAlternatives = [];

  for (const candidate of candidates) {
    const candId = String(candidate.productId);
    if (candId === String(originalProduct.productId)) continue;

    const candCategory = String(candidate.category || "").toLowerCase().trim();
    if (candCategory !== origCategory) continue;

    const candPrice = Number(candidate.productPrice !== undefined ? candidate.productPrice : candidate.price || 0);
    if (candPrice >= origPrice || candPrice <= 0) continue;


    const candStock = Number(candidate.availableStock !== undefined ? candidate.availableStock : candidate.quantity || 0);
    if (candStock <= 0) continue;


    const candName = String(candidate.productName || candidate.name || "").toLowerCase();
    const candDesc = String(candidate.description || "").toLowerCase();
    const candTokens = `${candName} ${candDesc}`.
      replace(/[^a-z0-9\s]/g, " ").
      split(/\s+/).
      filter((w) => w.length > 2 && !stopWords.has(w));

    let keywordOverlap = 0;
    candTokens.forEach((token) => {
      if (origTokens.has(token)) keywordOverlap++;
    });

    const unitSavings = Number((origPrice - candPrice).toFixed(2));
    const totalSavings = Number((unitSavings * quantity).toFixed(2));


    const similarityScore = 50 + keywordOverlap * 10 + unitSavings / origPrice * 20;

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
      similarityScore: Number(similarityScore.toFixed(2))
    });
  }


  scoredAlternatives.sort((a, b) => b.similarityScore - a.similarityScore || b.savings - a.savings);


  return scoredAlternatives.slice(0, 3);
}


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
      budget: user.budget
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update budget.", error: err.message });
  }
});


app.get("/api/budget", verifyAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({
      budget: Number(user.budget || 0)
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve budget.", error: err.message });
  }
});


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
        category: p.category
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
      isExceeded
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update cart.", error: err.message });
  }
});


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
        category: p.category
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
      isExceeded
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve cart.", error: err.message });
  }
});


const handleAlternativesRequest = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const budget = Number(user.budget || 0);


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
        realPrice
      });
    }

    actualCartTotal = Number(actualCartTotal.toFixed(2));
    const isExceeded = budget > 0 && actualCartTotal > budget;
    const exceededAmount = isExceeded ? Number((actualCartTotal - budget).toFixed(2)) : 0;
    const remainingBudget = Math.max(0, Number((budget - actualCartTotal).toFixed(2)));


    if (!isExceeded) {
      return res.json({
        budget,
        cartTotal: actualCartTotal,
        remainingBudget,
        exceededAmount: 0,
        isExceeded: false,
        alternatives: []
      });
    }


    const allProducts = await Product.find();
    const activeRes = await Reservation.aggregate([
      { $match: { status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$productId", totalReserved: { $sum: "$quantity" } } }]
    );
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
            image: product.image
          },
          suggestions
        });
      }
    }

    res.json({
      budget,
      cartTotal: actualCartTotal,
      remainingBudget: 0,
      exceededAmount,
      isExceeded: true,
      alternatives
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to evaluate alternatives.", error: err.message });
  }
};


app.get("/api/budget/alternatives", verifyAuth, handleAlternativesRequest);
app.post("/api/budget/alternatives", verifyAuth, handleAlternativesRequest);


app.post("/api/cart/replace", verifyAuth, async (req, res) => {
  try {
    const { originalProductId, replacementProductId, cart: clientCart } = req.body;

    if (!originalProductId || !replacementProductId) {
      return res.status(400).json({
        message: "Both originalProductId and replacementProductId are required."
      });
    }

    if (originalProductId === replacementProductId) {
      return res.status(400).json({
        message: "Replacement product cannot be the same as original product."
      });
    }


    const replacementProduct = await Product.findOne({ productId: replacementProductId });
    if (!replacementProduct) {
      return res.status(404).json({ message: "Replacement product not found in database." });
    }


    const activeRes = await Reservation.aggregate([
      { $match: { productId: replacementProductId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } }]
    );
    const totalReserved = activeRes.length > 0 ? activeRes[0].totalReserved : 0;
    const availableStock = Math.max(0, replacementProduct.quantity - totalReserved);

    if (availableStock <= 0) {
      return res.status(400).json({
        message: `Replacement product '${replacementProduct.productName || replacementProduct.productId}' is out of stock.`
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });


    let workingCart = Array.isArray(clientCart) && clientCart.length > 0 ?
      clientCart.map((i) => ({ productId: i.productId || i.id || i._id, quantity: Number(i.quantity || 1) })) :
      user.cart && user.cart.length > 0 ?
        user.cart.map((i) => ({ productId: i.productId, quantity: Number(i.quantity || 1) })) :
        [];

    const targetIndex = workingCart.findIndex(
      (item) => String(item.productId) === String(originalProductId)
    );

    if (targetIndex === -1) {
      return res.status(404).json({
        message: `Product '${originalProductId}' is not present in the shopping cart.`
      });
    }


    const preservedQuantity = Number(workingCart[targetIndex].quantity || 1);

    if (availableStock < preservedQuantity) {
      return res.status(400).json({
        message: `Insufficient stock for replacement. Available: ${availableStock}, required: ${preservedQuantity}.`
      });
    }


    const existingReplacementIndex = workingCart.findIndex(
      (item, idx) => idx !== targetIndex && String(item.productId) === String(replacementProductId)
    );

    if (existingReplacementIndex !== -1) {
      workingCart[existingReplacementIndex].quantity += preservedQuantity;
      workingCart.splice(targetIndex, 1);
    } else {
      workingCart[targetIndex].productId = replacementProductId;
    }


    user.cart = workingCart;
    await user.save();


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
        category: p.category
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
        price: Number(replacementProduct.productPrice !== undefined ? replacementProduct.productPrice : replacementProduct.price || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to replace product in cart.", error: err.message });
  }
});






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
      addedByUsername: item.addedByUsername || "Member"
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
    updatedAt: cartDoc.updatedAt
  };
};


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


app.post("/api/shared-carts/create", verifyAuth, async (req, res) => {
  try {
    const roomCode = await generateUniqueRoomCode();

    const sharedCart = await SharedCart.create({
      roomCode,
      createdBy: req.user._id,
      members: [req.user._id],
      items: [],
      status: "active",
      version: 1
    });

    const enriched = await enrichSharedCart(sharedCart);

    res.status(201).json({
      message: `Shared shopping room '${roomCode}' created successfully!`,
      sharedCart: enriched
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create shared cart room.", error: err.message });
  }
});


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


    const alreadyMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!alreadyMember) {
      cart.members.push(req.user._id);
      cart.version += 1;
      await cart.save();
    }

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: alreadyMember ? "Already a member of this room." : "Joined shared shopping room successfully!",
      sharedCart: enriched
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to join shared cart room.", error: err.message });
  }
});


app.get("/api/shared-carts/my/rooms", verifyAuth, async (req, res) => {
  try {
    const rooms = await SharedCart.find({ members: req.user._id, status: "active" }).
      populate("createdBy", "username emailId").
      populate("members", "username emailId").
      sort({ updatedAt: -1 });

    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve user's shared rooms.", error: err.message });
  }
});


app.get("/api/shared-carts/:roomCode", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }


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


    const isMember = cart.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: "Only room members can add products to this shared cart." });
    }


    if (version !== undefined && version !== null && Number(version) !== cart.version) {
      const current = await enrichSharedCart(cart);
      return res.status(409).json({
        message: "Cart was updated by another member in the meantime. Latest cart synced.",
        conflict: true,
        sharedCart: current
      });
    }


    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ message: `Product '${productId}' not found in catalog.` });
    }

    const existingItem = cart.items.find((i) => i.productId === productId);
    const newTotalQty = existingItem ? existingItem.quantity + reqQty : reqQty;

    if (product.quantity < newTotalQty) {
      return res.status(400).json({
        message: `Requested quantity (${newTotalQty}) exceeds available stock (${product.quantity}) for '${product.productName || productId}'.`
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
        addedByUsername: req.user.username
      });
    }

    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.status(201).json({
      message: `Added '${product.productName || productId}' to shared cart.`,
      sharedCart: enriched
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to add item to shared cart.", error: err.message });
  }
});


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


    if (version !== undefined && version !== null && Number(version) !== cart.version) {
      const current = await enrichSharedCart(cart);
      return res.status(409).json({
        message: "Cart was updated by another member in the meantime. Latest cart synced.",
        conflict: true,
        sharedCart: current
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
          message: `Requested quantity (${newQty}) exceeds available stock (${product.quantity}).`
        });
      }

      cart.items[itemIndex].quantity = newQty;
    }

    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: newQty <= 0 ? "Product removed from shared cart." : "Quantity updated successfully.",
      sharedCart: enriched
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update item quantity.", error: err.message });
  }
});


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


    if (version !== undefined && version !== null && Number(version) !== cart.version) {
      const current = await enrichSharedCart(cart);
      return res.status(409).json({
        message: "Cart was updated by another member in the meantime. Latest cart synced.",
        conflict: true,
        sharedCart: current
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
      sharedCart: enriched
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove item from shared cart.", error: err.message });
  }
});


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
      message: "You have left the shared shopping room."
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to leave shared cart room.", error: err.message });
  }
});


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
      message: "Shared shopping room has been closed."
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to close shared cart room.", error: err.message });
  }
});


app.post("/api/shared-carts/:roomCode/checkout", verifyAuth, async (req, res) => {
  try {
    const cleanCode = req.params.roomCode.toUpperCase().trim();
    const cart = await SharedCart.findOne({ roomCode: cleanCode });

    if (!cart) {
      return res.status(404).json({ message: `Shared cart '${cleanCode}' not found.` });
    }


    if (cart.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized. Only the room creator can initiate checkout." });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "Cannot checkout a closed room." });
    }

    if (cart.items.length === 0) {
      return res.status(400).json({ message: "Cannot checkout an empty shopping cart." });
    }


    for (const item of cart.items) {
      const product = await Product.findOne({ productId: item.productId });
      if (!product) {
        return res.status(400).json({ message: `Product '${item.productId}' no longer exists in catalog.` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for '${product.productName || item.productId}'. Available: ${product.quantity}, needed: ${item.quantity}.`
        });
      }
    }


    for (const item of cart.items) {
      await Product.updateOne({ productId: item.productId }, { $inc: { quantity: -item.quantity } });
    }


    cart.status = "closed";
    cart.version += 1;
    await cart.save();

    const enriched = await enrichSharedCart(cart);

    res.json({
      message: "Shared cart checkout successful! Thank you for shopping together.",
      sharedCart: enriched
    });
  } catch (err) {
    res.status(500).json({ message: "Checkout failed.", error: err.message });
  }
});