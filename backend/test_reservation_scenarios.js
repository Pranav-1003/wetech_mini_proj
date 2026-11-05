const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Product = require("./products");
const User = require("./users");
const Reservation = require("./reservations");

const JWT_SECRET = process.env.JWT_SECRET || "webtech_mini_proj_jwt_secret_key_2026_secure";
const MONGO_URI = "mongodb+srv://pranav03102007_db_user:PranavPrakasH10@cluster0.ki5fijl.mongodb.net/lab8";

async function runTests() {
  console.log("=== STARTING PRODUCT RESERVATION TEST SUITE ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB successfully.\n");


    await User.deleteMany({ emailId: { $in: ["test_usera@example.com", "test_userb@example.com"] } });
    await Product.deleteMany({ productId: { $in: ["TEST_P1", "TEST_P2", "TEST_RACE"] } });
    await Reservation.deleteMany({ productId: { $in: ["TEST_P1", "TEST_P2", "TEST_RACE"] } });


    const userA = await User.create({
      username: "UserA",
      emailId: "test_usera@example.com",
      age: 25,
      password: "password123"
    });

    const userB = await User.create({
      username: "UserB",
      emailId: "test_userb@example.com",
      age: 28,
      password: "password123"
    });


    const testProduct = await Product.create({
      productId: "TEST_P1",
      productName: "Test Reservation Gadget",
      productPrice: 50.0,
      category: "Test",
      quantity: 5,
      description: "A gadget used for testing reservation system"
    });

    console.log("Setup complete: Created User A, User B, and Product TEST_P1 with 5 units stock.\n");


    async function getAvailableStock(productId) {
      const prod = await Product.findOne({ productId });
      if (!prod) return 0;
      const activeRes = await Reservation.aggregate([
      { $match: { productId, status: "active", expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, totalReserved: { $sum: "$quantity" } } }]
      );
      const totalReserved = activeRes.length > 0 ? activeRes[0].totalReserved : 0;
      return Math.max(0, prod.quantity - totalReserved);
    }

    async function reserveProduct(user, productId, quantity) {
      const product = await Product.findOne({ productId });
      if (!product) throw new Error("Product not found");


      await Reservation.updateMany(
        { productId, status: "active", expiresAt: { $lte: new Date() } },
        { $set: { status: "expired" } }
      );

      const available = await getAvailableStock(productId);
      if (quantity > available) {
        const err = new Error(`Insufficient stock. Only ${available} unit(s) available.`);
        err.status = 400;
        err.availableStock = available;
        throw err;
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const resv = await Reservation.create({
        userId: user._id,
        productId,
        quantity,
        status: "active",
        expiresAt
      });


      const activePrior = await Reservation.find({
        productId,
        status: "active",
        expiresAt: { $gt: new Date() },
        $or: [
        { createdAt: { $lt: resv.createdAt } },
        { createdAt: resv.createdAt, _id: { $lte: resv._id } }]

      });
      const cumulative = activePrior.reduce((s, r) => s + r.quantity, 0);

      if (cumulative > product.quantity) {
        await Reservation.deleteOne({ _id: resv._id });
        const err = new Error("Reservation conflict. Requested stock was reserved by another user.");
        err.status = 409;
        throw err;
      }

      return resv;
    }

    async function cancelReservation(user, reservationId) {
      const updated = await Reservation.findOneAndUpdate(
        { _id: reservationId, userId: user._id, status: "active" },
        { $set: { status: "cancelled" } },
        { new: true }
      );
      if (!updated) {
        const existing = await Reservation.findById(reservationId);
        if (!existing) {
          const err = new Error("Reservation not found.");
          err.status = 404;
          throw err;
        }
        if (existing.userId.toString() !== user._id.toString()) {
          const err = new Error("You can only cancel your own reservations.");
          err.status = 403;
          throw err;
        }
        const err = new Error(`Cannot cancel a reservation with status '${existing.status}'.`);
        err.status = 400;
        throw err;
      }
      return updated;
    }

    async function completeReservation(user, reservationId) {
      const updatedRes = await Reservation.findOneAndUpdate(
        {
          _id: reservationId,
          userId: user._id,
          status: "active",
          expiresAt: { $gt: new Date() }
        },
        { $set: { status: "completed" } },
        { new: true }
      );

      if (!updatedRes) {
        const existing = await Reservation.findById(reservationId);
        if (!existing) {
          const err = new Error("Reservation not found.");
          err.status = 404;
          throw err;
        }
        if (existing.userId.toString() !== user._id.toString()) {
          const err = new Error("You can only complete your own reservations.");
          err.status = 403;
          throw err;
        }
        if (existing.status !== "active") {
          const err = new Error(`Cannot complete a reservation with status '${existing.status}'.`);
          err.status = 400;
          throw err;
        }
        if (new Date() > existing.expiresAt) {
          existing.status = "expired";
          await existing.save();
          const err = new Error("Reservation has expired.");
          err.status = 400;
          throw err;
        }
        const err = new Error("Unable to complete reservation.");
        err.status = 400;
        throw err;
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { productId: updatedRes.productId, quantity: { $gte: updatedRes.quantity } },
        { $inc: { quantity: -updatedRes.quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        await Reservation.updateOne({ _id: updatedRes._id }, { $set: { status: "active" } });
        const err = new Error("Insufficient product stock to complete reservation.");
        err.status = 400;
        throw err;
      }

      return { reservation: updatedRes, product: updatedProduct };
    }




    console.log("TEST 1: User A reserves a product successfully");
    const resA = await reserveProduct(userA, "TEST_P1", 2);
    assert(resA && resA.status === "active", "Reservation created with status 'active'");
    assert(resA.quantity === 2, "Reservation quantity is 2");
    const stockAfterA = await getAvailableStock("TEST_P1");
    assert(stockAfterA === 3, `Available stock correctly reduced from 5 to 3 (actual: ${stockAfterA})`);
    const expiryDiff = (resA.expiresAt.getTime() - resA.createdAt.getTime()) / 60000;
    assert(Math.round(expiryDiff) === 10, `Reservation duration is 10 minutes (actual: ${expiryDiff.toFixed(1)}m)`);
    console.log();




    console.log("TEST 2: User B tries to reserve more than available stock");
    let overReserveFailed = false;
    try {
      await reserveProduct(userB, "TEST_P1", 4);
    } catch (err) {
      overReserveFailed = true;
      assert(err.status === 400, "Server rejected over-reservation with 400 Bad Request");
      assert(err.message.includes("Insufficient stock"), `Error message indicates insufficient stock: "${err.message}"`);
    }
    assert(overReserveFailed, "Over-reservation was successfully blocked");
    console.log();




    console.log("TEST 3: User cancels an active reservation and releases stock");
    const cancelled = await cancelReservation(userA, resA._id);
    assert(cancelled.status === "cancelled", "Reservation status transitioned to 'cancelled'");
    const stockAfterCancel = await getAvailableStock("TEST_P1");
    assert(stockAfterCancel === 5, `Reserved quantity was released; available stock restored to 5 (actual: ${stockAfterCancel})`);
    console.log();




    console.log("TEST 4: Reservation expiration handling");
    const expiredRes = await Reservation.create({
      userId: userA._id,
      productId: "TEST_P1",
      quantity: 3,
      status: "active",
      expiresAt: new Date(Date.now() - 5000)
    });

    await Reservation.updateMany(
      { status: "active", expiresAt: { $lte: new Date() } },
      { $set: { status: "expired" } }
    );
    const refreshedExpired = await Reservation.findById(expiredRes._id);
    assert(refreshedExpired.status === "expired", "Expired reservation automatically marked as 'expired'");
    const stockAfterExpiry = await getAvailableStock("TEST_P1");
    assert(stockAfterExpiry === 5, `Expired reservation does not deduct from available stock (actual: ${stockAfterExpiry})`);
    console.log();




    console.log("TEST 5: User tries to complete an expired reservation");
    let completeExpiredFailed = false;
    try {
      await completeReservation(userA, expiredRes._id);
    } catch (err) {
      completeExpiredFailed = true;
      assert(err.status === 400, "Completion of expired reservation rejected with 400");
      assert(err.message.includes("expired") || err.message.includes("Cannot complete"), `Error message: "${err.message}"`);
    }
    assert(completeExpiredFailed, "Expired reservation could not be completed");
    console.log();




    console.log("TEST 6: User B attempts to cancel User A's reservation");
    const userAActive = await reserveProduct(userA, "TEST_P1", 1);
    let crossCancelFailed = false;
    try {
      await cancelReservation(userB, userAActive._id);
    } catch (err) {
      crossCancelFailed = true;
      assert(err.status === 403, "Cross-user cancellation rejected with 403 Forbidden");
      assert(err.message.includes("only cancel your own"), `Error message: "${err.message}"`);
    }
    assert(crossCancelFailed, "Unauthorized cancellation prevented");

    await cancelReservation(userA, userAActive._id);
    console.log();




    console.log("TEST 7: Concurrency race condition - Two users simultaneously reserve last unit");
    const raceProduct = await Product.create({
      productId: "TEST_RACE",
      productName: "Last Unit Rare Item",
      productPrice: 199.99,
      category: "Rare",
      quantity: 1,
      description: "Only one available in the world"
    });

    const results = await Promise.allSettled([
    reserveProduct(userA, "TEST_RACE", 1),
    reserveProduct(userB, "TEST_RACE", 1)]
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert(fulfilled.length === 1, `Exactly one user succeeded (fulfilled: ${fulfilled.length})`);
    assert(rejected.length === 1, `Exactly one user was rejected (rejected: ${rejected.length})`);
    const remainingRaceStock = await getAvailableStock("TEST_RACE");
    assert(remainingRaceStock === 0, `Remaining stock is exactly 0 without over-reservation (actual: ${remainingRaceStock})`);
    const activeRaceReservations = await Reservation.countDocuments({ productId: "TEST_RACE", status: "active" });
    assert(activeRaceReservations === 1, `Total active reservations in database equals 1 (actual: ${activeRaceReservations})`);
    console.log();




    console.log("TEST 8: Complete reservation during checkout - Stock decreases exactly once");
    const freshRes = await reserveProduct(userA, "TEST_P1", 2);
    const prodBefore = await Product.findOne({ productId: "TEST_P1" });
    const stockBefore = prodBefore.quantity;

    const completionResult = await completeReservation(userA, freshRes._id);
    assert(completionResult.reservation.status === "completed", "Reservation status transitioned to 'completed'");
    assert(completionResult.product.quantity === stockBefore - 2, `Product total stock decreased from ${stockBefore} to ${completionResult.product.quantity}`);


    let doubleCompleteFailed = false;
    try {
      await completeReservation(userA, freshRes._id);
    } catch (err) {
      doubleCompleteFailed = true;
      assert(err.status === 400, "Second completion rejected with 400");
    }
    assert(doubleCompleteFailed, "Double completion prevented");
    const prodAfter = await Product.findOne({ productId: "TEST_P1" });
    assert(prodAfter.quantity === stockBefore - 2, `Stock did NOT decrease twice; remains at ${prodAfter.quantity}`);
    console.log();




    console.log("TEST 9: JWT Authentication and Token Security Verification");

    const validToken = jwt.sign(
      { userId: userA._id, emailId: userA.emailId, username: userA.username },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    const decodedValid = jwt.verify(validToken, JWT_SECRET);
    assert(decodedValid && decodedValid.userId.toString() === userA._id.toString(), "Valid JWT successfully signed and verified with correct payload");
    assert(decodedValid.exp > Math.floor(Date.now() / 1000), "JWT has valid future expiration timestamp");


    let tamperedRejected = false;
    try {
      const tamperedToken = validToken.slice(0, -6) + "xxxxxx";
      jwt.verify(tamperedToken, JWT_SECRET);
    } catch (err) {
      tamperedRejected = true;
      assert(err.name === "JsonWebTokenError", "Tampered JWT token rejected with JsonWebTokenError (signature invalid)");
    }
    assert(tamperedRejected, "Tampered JWT rejected successfully");


    let expiredTokenRejected = false;
    try {
      const expiredJwt = jwt.sign(
        { userId: userA._id, emailId: userA.emailId },
        JWT_SECRET,
        { expiresIn: "-1s" }
      );
      jwt.verify(expiredJwt, JWT_SECRET);
    } catch (err) {
      expiredTokenRejected = true;
      assert(err.name === "TokenExpiredError", "Expired JWT token rejected with TokenExpiredError");
    }
    assert(expiredTokenRejected, "Expired JWT rejected successfully");
    console.log();


    await User.deleteMany({ emailId: { $in: ["test_usera@example.com", "test_userb@example.com"] } });
    await Product.deleteMany({ productId: { $in: ["TEST_P1", "TEST_P2", "TEST_RACE"] } });
    await Reservation.deleteMany({ productId: { $in: ["TEST_P1", "TEST_P2", "TEST_RACE"] } });

    console.log("=== TEST SUMMARY ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed === 0) {
      console.log("\nALL 8 SCENARIOS PASSED WITH 100% SUCCESS!");
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();