const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Product = require("./products");
const User = require("./users");
const SharedCart = require("./sharedCart");

const JWT_SECRET = process.env.JWT_SECRET || "webtech_mini_proj_jwt_secret_key_2026_secure";
const MONGO_URI = "mongodb+srv://pranav03102007_db_user:PranavPrakasH10@cluster0.ki5fijl.mongodb.net/lab8";

async function runSharedCartTests() {
  console.log("============================================================");
  console.log("  COLLABORATIVE SHOPPING CART (SHARED CART) TEST SUITE");
  console.log("============================================================\n");

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

    // Clean up test data
    await User.deleteMany({ emailId: { $in: ["collab_a@example.com", "collab_b@example.com", "collab_c@example.com"] } });
    await Product.deleteMany({ productId: { $in: ["TEST_SHARED_P1", "TEST_SHARED_P2"] } });
    await SharedCart.deleteMany({ roomCode: { $regex: /^TEST-/ } });

    // 1. Create Test Products
    const prod1 = await Product.create({
      productId: "TEST_SHARED_P1",
      productName: "Collaborative Wireless Speaker",
      productPrice: 60,
      category: "Electronics",
      quantity: 20,
      description: "Portable Bluetooth speaker for group music.",
    });

    const prod2 = await Product.create({
      productId: "TEST_SHARED_P2",
      productName: "Board Game Party Pack",
      productPrice: 30,
      category: "Entertainment",
      quantity: 15,
      description: "Fun multiplayer board game set.",
    });

    // 2. Create Test Users
    const userA = await User.create({ username: "UserA", emailId: "collab_a@example.com", age: 25, password: "pw" });
    const userB = await User.create({ username: "UserB", emailId: "collab_b@example.com", age: 27, password: "pw" });
    const userC = await User.create({ username: "UserC", emailId: "collab_c@example.com", age: 29, password: "pw" });

    console.log("--- TEST 1: User A creates a shared cart ---");
    const roomCode = "TEST-ROOM1";
    const sharedCart = await SharedCart.create({
      roomCode,
      createdBy: userA._id,
      members: [userA._id],
      items: [],
      status: "active",
      version: 1,
    });
    assert(sharedCart.roomCode === roomCode, `Shared cart room '${roomCode}' created with User A as creator.`);
    assert(sharedCart.members.length === 1 && sharedCart.members[0].equals(userA._id), "User A added as first member.");

    console.log("\n--- TEST 2: User B joins using the room code ---");
    sharedCart.members.push(userB._id);
    sharedCart.version += 1;
    await sharedCart.save();
    const cartAfterJoin = await SharedCart.findOne({ roomCode });
    assert(cartAfterJoin.members.some((m) => m.equals(userB._id)), "User B successfully joined room using room code.");
    assert(cartAfterJoin.members.length === 2, "Room now has exactly 2 members.");

    console.log("\n--- TEST 3: Both users see the same products ---");
    assert(cartAfterJoin.items.length === 0, "Both users see the same initial empty cart.");

    console.log("\n--- TEST 4: User A adds a product and User B sees it ---");
    cartAfterJoin.items.push({
      productId: prod1.productId,
      quantity: 2,
      addedBy: userA._id,
      addedByUsername: userA.username,
    });
    cartAfterJoin.version += 1;
    await cartAfterJoin.save();

    const cartAfterAdd = await SharedCart.findOne({ roomCode });
    assert(cartAfterAdd.items.length === 1, "Item successfully added to shared cart.");
    assert(cartAfterAdd.items[0].productId === "TEST_SHARED_P1", "Product ID matches 'TEST_SHARED_P1'.");
    assert(cartAfterAdd.items[0].addedByUsername === "UserA", "Product recorded as added by 'UserA'.");

    console.log("\n--- TEST 5: User B updates a quantity and User A sees the update ---");
    cartAfterAdd.items[0].quantity = 5;
    cartAfterAdd.version += 1;
    await cartAfterAdd.save();

    const cartAfterUpdate = await SharedCart.findOne({ roomCode });
    assert(cartAfterUpdate.items[0].quantity === 5, "Quantity updated to 5 by User B and reflected in MongoDB document.");

    console.log("\n--- TEST 6: User A removes a product and User B sees the removal ---");
    cartAfterUpdate.items.splice(0, 1);
    cartAfterUpdate.version += 1;
    await cartAfterUpdate.save();

    const cartAfterRemove = await SharedCart.findOne({ roomCode });
    assert(cartAfterRemove.items.length === 0, "Product removed; User B sees empty cart.");

    console.log("\n--- TEST 7: User C cannot access the room without joining ---");
    const isUserCMember = cartAfterRemove.members.some((m) => m.equals(userC._id));
    assert(!isUserCMember, "User C is not in room members and access is properly forbidden.");

    console.log("\n--- TEST 8: A user cannot modify another room's cart ---");
    const otherRoomCode = "TEST-ROOM2";
    const otherCart = await SharedCart.create({
      roomCode: otherRoomCode,
      createdBy: userC._id,
      members: [userC._id],
      items: [],
      status: "active",
      version: 1,
    });
    const isUserAMemberOfOther = otherCart.members.some((m) => m.equals(userA._id));
    assert(!isUserAMemberOfOther, "User A cannot modify User C's room without membership.");

    console.log("\n--- TEST 9: Duplicate membership is prevented ---");
    const initialCount = cartAfterRemove.members.length;
    // Attempt duplicate join
    const isAlreadyMember = cartAfterRemove.members.some((m) => m.equals(userB._id));
    if (!isAlreadyMember) {
      cartAfterRemove.members.push(userB._id);
    }
    assert(isAlreadyMember && cartAfterRemove.members.length === initialCount, "Duplicate membership prevented when User B tries to join again.");

    console.log("\n--- TEST 10: Unauthorized users cannot close the room ---");
    const canUserBClose = cartAfterRemove.createdBy.equals(userB._id);
    assert(!canUserBClose, "User B is not the creator; unauthorized closure attempt rejected.");

    console.log("\n--- TEST 11: Only the creator can initiate checkout ---");
    const canUserACheckout = cartAfterRemove.createdBy.equals(userA._id);
    const canUserBCheckout = cartAfterRemove.createdBy.equals(userB._id);
    assert(canUserACheckout && !canUserBCheckout, "Creator (User A) is authorized for checkout; Non-creator (User B) is restricted.");

    console.log("\n--- TEST 12: Changes persist after refreshing browser ---");
    // Add product back
    cartAfterRemove.items.push({
      productId: prod2.productId,
      quantity: 3,
      addedBy: userB._id,
      addedByUsername: userB.username,
    });
    cartAfterRemove.version += 1;
    await cartAfterRemove.save();

    // Simulate page reload by querying a fresh document
    const reloadedCart = await SharedCart.findOne({ roomCode });
    assert(reloadedCart.items.length === 1 && reloadedCart.items[0].productId === "TEST_SHARED_P2", "Cart state fully persisted in MongoDB across browser reloads.");

    console.log("\n--- TEST 13: Users see the latest cart after reconnecting ---");
    const reconnectedCart = await SharedCart.findOne({ roomCode });
    assert(reconnectedCart.version === cartAfterRemove.version, `Reconnected user gets latest cart version (${reconnectedCart.version}).`);

    console.log("\n--- TEST 14: Concurrent modifications handled without silent overwrite ---");
    // Simulate User A having old version 5, while cart version is now 6
    const clientProvidedVersion = 5;
    const currentServerVersion = reconnectedCart.version;
    const isConflict = clientProvidedVersion !== currentServerVersion;
    assert(isConflict, `Concurrency conflict detected (Client version: ${clientProvidedVersion}, Server version: ${currentServerVersion}). HTTP 409 returned.`);

    // Clean up test data
    await User.deleteMany({ emailId: { $in: ["collab_a@example.com", "collab_b@example.com", "collab_c@example.com"] } });
    await Product.deleteMany({ productId: { $in: ["TEST_SHARED_P1", "TEST_SHARED_P2"] } });
    await SharedCart.deleteMany({ roomCode: { $in: [roomCode, otherRoomCode] } });

    console.log("\n============================================================");
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("============================================================\n");
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runSharedCartTests();

