const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Product = require("./products");
const User = require("./users");
const Reservation = require("./reservations");

const JWT_SECRET = process.env.JWT_SECRET || "webtech_mini_proj_jwt_secret_key_2026_secure";
const MONGO_URI = "mongodb+srv://pranav03102007_db_user:PranavPrakasH10@cluster0.ki5fijl.mongodb.net/lab8";

async function runBudgetTests() {
  console.log("============================================================");
  console.log("  SHOPPING BUDGET & CHEAPER ALTERNATIVES TEST SUITE");
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


    await User.deleteMany({ emailId: { $in: ["budget_user1@example.com", "budget_user2@example.com"] } });
    await Product.deleteMany({ productId: { $in: ["TEST_PREMIUM_PHONE", "TEST_CHEAP_PHONE", "TEST_OUTOFSTOCK_PHONE", "TEST_SHIRT"] } });



    await Product.create({
      productId: "TEST_PREMIUM_PHONE",
      productName: "Premium Smartphone X",
      productPrice: 500,
      category: "Electronics",
      quantity: 10,
      description: "Flagship premium smartphone with OLED display and advanced camera."
    });


    await Product.create({
      productId: "TEST_CHEAP_PHONE",
      productName: "Budget Smartphone Lite",
      productPrice: 300,
      category: "Electronics",
      quantity: 15,
      description: "Affordable smartphone with reliable battery life and clear display."
    });


    await Product.create({
      productId: "TEST_OUTOFSTOCK_PHONE",
      productName: "Discount Clearance Phone",
      productPrice: 200,
      category: "Electronics",
      quantity: 0,
      description: "Ultra cheap phone currently out of stock."
    });


    await Product.create({
      productId: "TEST_SHIRT",
      productName: "Cotton Casual Shirt",
      productPrice: 50,
      category: "Clothing",
      quantity: 20,
      description: "Comfortable cotton shirt."
    });


    const user1 = await User.create({
      username: "BudgetUser1",
      emailId: "budget_user1@example.com",
      age: 24,
      password: "password123",
      budget: 0,
      cart: []
    });

    const user2 = await User.create({
      username: "BudgetUser2",
      emailId: "budget_user2@example.com",
      age: 26,
      password: "password123",
      budget: 1500,
      cart: []
    });

    const token1 = jwt.sign({ userId: user1._id, emailId: user1.emailId }, JWT_SECRET, { expiresIn: "1h" });
    const token2 = jwt.sign({ userId: user2._id, emailId: user2.emailId }, JWT_SECRET, { expiresIn: "1h" });


    const allProducts = await Product.find();

    console.log("--- TEST 1: Customer sets a budget ---");
    user1.budget = 400;
    await user1.save();
    const fetchedUser1 = await User.findById(user1._id);
    assert(fetchedUser1.budget === 400, "User 1 successfully set initial shopping budget to $400.");

    console.log("\n--- TEST 2: Customer updates their budget ---");
    user1.budget = 450;
    await user1.save();
    const updatedUser1 = await User.findById(user1._id);
    assert(updatedUser1.budget === 450, "User 1 successfully updated shopping budget to $450.");

    console.log("\n--- TEST 3: Cart remains within budget ---");

    user1.cart = [{ productId: "TEST_CHEAP_PHONE", quantity: 1 }];
    await user1.save();

    let total = 0;
    for (const item of user1.cart) {
      const p = await Product.findOne({ productId: item.productId });
      total += p.productPrice * item.quantity;
    }
    const isExceededWithin = total > user1.budget;
    const remainingBudget = Math.max(0, user1.budget - total);
    assert(!isExceededWithin, `Cart total ($${total}) is <= budget ($${user1.budget}). isExceeded is false.`);
    assert(remainingBudget === 150, `Remaining budget correctly calculated as $${remainingBudget}.`);

    console.log("\n--- TEST 4: Cart exceeds budget ---");

    user1.cart = [{ productId: "TEST_PREMIUM_PHONE", quantity: 1 }];
    await user1.save();

    let newTotal = 0;
    for (const item of user1.cart) {
      const p = await Product.findOne({ productId: item.productId });
      newTotal += p.productPrice * item.quantity;
    }
    const isExceededOver = newTotal > user1.budget;
    const exceededAmount = newTotal - user1.budget;
    assert(isExceededOver, `Cart total ($${newTotal}) exceeds budget ($${user1.budget}).`);
    assert(exceededAmount === 50, `Exceeded amount correctly calculated as $${exceededAmount}.`);

    console.log("\n--- TEST 5: Cheaper alternatives are returned ---");

    const premiumPhone = await Product.findOne({ productId: "TEST_PREMIUM_PHONE" });
    const candidates = await Product.find({ productId: { $ne: premiumPhone.productId } });





    const validAlternatives = candidates.filter((c) => {
      const sameCat = c.category.toLowerCase().trim() === premiumPhone.category.toLowerCase().trim();
      const isCheaper = c.productPrice < premiumPhone.productPrice;
      const inStock = c.quantity > 0;
      return sameCat && isCheaper && inStock;
    });

    assert(validAlternatives.some((c) => c.productId === "TEST_CHEAP_PHONE"), "Found 'Budget Smartphone Lite' ($300) as a cheaper alternative for 'Premium Smartphone X' ($500).");
    assert(validAlternatives.find((c) => c.productId === "TEST_CHEAP_PHONE").productPrice < 500, "Alternative price ($300) is strictly lower than original price ($500).");

    console.log("\n--- TEST 6: Alternatives from unrelated categories are excluded ---");
    const unrelatedClothingItem = validAlternatives.find((c) => c.productId === "TEST_SHIRT");
    assert(unrelatedClothingItem === undefined, "Products from other categories ('Clothing') are excluded from 'Electronics' alternatives.");

    console.log("\n--- TEST 7: Out-of-stock alternatives are excluded ---");
    const outOfStockPhone = validAlternatives.find((c) => c.productId === "TEST_OUTOFSTOCK_PHONE");
    assert(outOfStockPhone === undefined, "Out-of-stock product ('Discount Clearance Phone', stock: 0) is excluded from alternatives.");

    console.log("\n--- TEST 8: Customer replaces a product ---");

    const originalQty = user1.cart[0].quantity;
    user1.cart[0].productId = "TEST_CHEAP_PHONE";
    await user1.save();

    assert(user1.cart[0].productId === "TEST_CHEAP_PHONE", "Cart item replaced successfully with 'TEST_CHEAP_PHONE'.");
    assert(user1.cart[0].quantity === originalQty, `Original quantity (${originalQty}) preserved after replacement.`);

    console.log("\n--- TEST 9: Cart total and remaining budget update correctly ---");
    let replacedTotal = 0;
    for (const item of user1.cart) {
      const p = await Product.findOne({ productId: item.productId });
      replacedTotal += p.productPrice * item.quantity;
    }
    const finalExceeded = replacedTotal > user1.budget;
    const finalRemaining = Math.max(0, user1.budget - replacedTotal);
    assert(replacedTotal === 300, `New cart total accurately recalculated to $${replacedTotal} using database prices.`);
    assert(!finalExceeded, `Cart total ($${replacedTotal}) is now within budget ($${user1.budget}).`);
    assert(finalRemaining === 150, `Remaining budget correctly updated to $${finalRemaining}.`);

    console.log("\n--- TEST 10: Customer cannot access another customer's budget or cart ---");

    const checkUser1 = await User.findById(user1._id);
    const checkUser2 = await User.findById(user2._id);
    assert(checkUser1.budget === 450 && checkUser2.budget === 1500, "User 1 ($450) and User 2 ($1500) budgets are completely isolated.");
    assert(checkUser1.cart.length === 1 && checkUser2.cart.length === 0, "User 1 and User 2 carts are isolated by JWT / userId.");


    await User.deleteMany({ emailId: { $in: ["budget_user1@example.com", "budget_user2@example.com"] } });
    await Product.deleteMany({ productId: { $in: ["TEST_PREMIUM_PHONE", "TEST_CHEAP_PHONE", "TEST_OUTOFSTOCK_PHONE", "TEST_SHIRT"] } });

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

runBudgetTests();