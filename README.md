# Full-Stack E-Commerce Project

A complete full-stack web application built with **React**, **Node.js / Express**, and **MongoDB (Mongoose)** featuring:
- **JWT-Based Authentication** with token verification
- **Product Catalog & Management**
- **Product Reservation System** (with 10-minute expiry & concurrency protection)
- **Shopping Budget Limit & Cheaper Worthy Alternatives**
- **Collaborative Shopping Cart** (Multiple Users – Single Shared Cart via REST & Polling)

---

## 📋 Table of Contents
1. [Collaborative Shopping Cart (Multiple Users – Shared Cart)](#-collaborative-shopping-cart)
2. [Shopping Budget & Cheaper Alternatives](#-shopping-budget--cheaper-alternatives)
3. [Database Schema Models](#-database-schema-models)
4. [API Endpoints Documentation](#-api-endpoints-documentation)
5. [Polling & Concurrency Handling](#-polling--concurrency-handling)
6. [Automated Test Suites](#-automated-test-suites)
7. [Testing with Two Browser Sessions](#-testing-with-two-browser-sessions)
8. [Postman Testing Instructions](#-postman-testing-instructions)
9. [Running the Application](#-running-the-application)

---

## 👥 Collaborative Shopping Cart

The Collaborative Shopping Cart allows multiple authenticated users to shop together in the same cart in real time without WebSockets, Socket.IO, or third-party services:

```
[ User A (Browser 1) ]             [ Server / MongoDB ]            [ User B (Browser 2) ]
          |                                  |                                  |
 1. POST /shared-carts/create                |                                  |
          | ---- Create room "SHOP-8K42" --->|                                  |
          |<--- Return room details ---------|                                  |
          |                                  | 2. POST /shared-carts/join       |
 (Shares code SHOP-8K42)                     |<--- Join with code "SHOP-8K42" --|
          |                                  |--- Add User B to members ------->|
          |                                  |                                  |
 3. POST /items (Add Product P101)           |                                  |
          | ---- Add P101, version++ ------->|                                  |
          |                                  | 4. Polling (every 2 seconds)     |
          |                                  |<--- GET /shared-carts/SHOP-8K42 -|
          |                                  |--- Returns enriched cart ------->|
          |                                  | (User B sees P101 in ~2 sec!)    |
```

### Key Capabilities:
- **Room Creation**: Any authenticated user can create a collaborative shopping room (`POST /api/shared-carts/create`).
- **Room Joining**: Other users join using the unique alphanumeric room code (`POST /api/shared-carts/join`).
- **Real-Time Polling**: React client polls `GET /api/shared-carts/:roomCode` every 2 seconds with overlap protection.
- **Member Attribution**: Displays which user added each product (`addedByUsername`).
- **Optimistic Concurrency**: Tracked via `version` field. When a mutation conflict occurs, HTTP 409 is returned, resynchronizing the client and preventing lost updates.
- **Creator Ownership & Controlled Checkout**: Only the room creator can initiate checkout (`POST /api/shared-carts/:roomCode/checkout`) or close the room.

---

## 💰 Shopping Budget & Cheaper Alternatives

- **Budget Limit**: Customers establish and edit a shopping budget.
- **Visual Status & Progress Bar**: Green when within budget, Red when exceeding budget, with an animated progress bar.
- **Cheaper Worthy Alternatives Algorithm**:
  1. Identifies products when cart exceeds budget.
  2. Filters same category and strictly lower price.
  3. Excludes original product and out-of-stock items (taking active reservations into account).
  4. Ranks candidates using token overlap similarity between product names and descriptions.
  5. Displays top 3 alternatives per item with unit and total savings.
  6. 1-click **Replace Product** button swaps the item while preserving original quantity and recalculating total using actual MongoDB prices.

---

## 🗄️ Database Schema Models

### 1. `SharedCart` Model (`backend/sharedCart.js`)
```javascript
const sharedCartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedByUsername: { type: String, default: "Member" },
  },
  { _id: false, timestamps: true }
);

const sharedCartSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, uppercase: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    items: [sharedCartItemSchema],
    status: { type: String, enum: ["active", "closed"], default: "active" },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);
```

### 2. `User` Model (`backend/users.js`)
Enhanced with `budget` and `cart` array.

---

## 📡 API Endpoints Documentation

All endpoints require JWT Header: `Authorization: Bearer <token>`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/shared-carts/create` | Create a new shared cart room with unique room code |
| `POST` | `/api/shared-carts/join` | Join an existing active shared cart using `{ "roomCode": "SHOP-XXXX" }` |
| `GET` | `/api/shared-carts/my/rooms` | Retrieve all active rooms the authenticated user belongs to |
| `GET` | `/api/shared-carts/:roomCode` | Retrieve room details, members, enriched products, and total |
| `POST` | `/api/shared-carts/:roomCode/items` | Add product to shared cart (`{ productId, quantity, version }`) |
| `PUT` | `/api/shared-carts/:roomCode/items/:productId` | Update item quantity in shared cart (`{ quantity, version }`) |
| `DELETE` | `/api/shared-carts/:roomCode/items/:productId` | Remove product from shared cart |
| `DELETE` | `/api/shared-carts/:roomCode/leave` | Leave shared shopping room |
| `DELETE` | `/api/shared-carts/:roomCode/close` | Close room (Creator only) |
| `POST` | `/api/shared-carts/:roomCode/checkout` | Checkout shared cart and decrement stock (Creator only) |
| `POST` | `/api/budget` | Set or update customer shopping budget |
| `GET` | `/api/budget` | Retrieve user shopping budget |
| `GET / POST`| `/api/budget/alternatives` | Return cheaper alternatives when cart exceeds budget |
| `POST` | `/api/cart/replace` | Replace item with alternative, preserving quantity |

---

## 🔄 Polling & Concurrency Handling

### Polling Mechanism
In `frontend/src/pages/SharedCart.jsx`:
- Sets up an interval running `fetchRoomData()` every **2000ms** (2 seconds).
- **Overlap Prevention**: Uses `isFetchingRef = useRef(false)` to skip a poll cycle if a previous network request is still pending.
- **Cleanup**: Polling cleanly halts when the component unmounts or when the room status changes to `"closed"`.

### Concurrency Protection
- Each shared cart has an integer `version` field.
- Every mutating request (`POST /items`, `PUT /items/:id`, `DELETE /items/:id`) sends the client's current `version`.
- If the server's `cart.version !== clientVersion`, the server aborts the mutation and responds with `HTTP 409 Conflict`:
```json
{
  "message": "Cart was updated by another member in the meantime. Latest cart synced.",
  "conflict": true,
  "sharedCart": { ...latestCart... }
}
```
- The frontend immediately synchronizes its local state with the returned authoritative cart, displaying a notification so users never silently overwrite each other's changes.

---

## 🧪 Automated Test Suites

Both test suites pass 100%:

### 1. Collaborative Shopping Cart Tests (`18/18 Passing`)
```bash
node backend/test_shared_cart.js
```
- [PASS] User A creates a shared cart.
- [PASS] User B joins using the room code.
- [PASS] Both users see the same products.
- [PASS] User A adds a product and User B sees it.
- [PASS] User B updates a quantity and User A sees the update.
- [PASS] User A removes a product and User B sees the removal.
- [PASS] User C cannot access the room without joining.
- [PASS] A user cannot modify another room's cart.
- [PASS] Duplicate membership is prevented.
- [PASS] Unauthorized users cannot close the room.
- [PASS] Only the creator can initiate checkout.
- [PASS] Changes persist after refreshing browser.
- [PASS] Users see the latest cart after reconnecting.
- [PASS] Concurrent modifications are handled without silent overwrite (HTTP 409).

### 2. Budget Limit & Cheaper Alternatives Tests (`17/17 Passing`)
```bash
node backend/test_budget_alternatives.js
```

---

## 👥 Testing with Two Browser Sessions

1. Open **Browser 1** (e.g. Chrome) to `http://localhost:5173` and sign in as **User A**.
2. Open **Browser 2** (e.g. Chrome Incognito or Firefox) to `http://localhost:5173` and sign in as **User B**.
3. In **Browser 1 (User A)**:
   - Click **Shared Cart** in the navbar.
   - Click **Create Shared Cart Room**.
   - Note the generated room code (e.g. `SHOP-8K42`) or click **Copy Room Code**.
4. In **Browser 2 (User B)**:
   - Click **Shared Cart** in the navbar.
   - Enter `SHOP-8K42` in the **Join with a Room Code** input and click **Join Room**.
   - Notice both User A and User B appear in the **Room Members** bar with User A tagged as `👑 Creator`.
5. In **Browser 1 (User A)**:
   - Select a product (e.g. *Cotton Polo T-Shirt*) and click **+ Add to Shared Cart**.
6. In **Browser 2 (User B)**:
   - Within 2 seconds, without refreshing, observe the product appear automatically in User B's screen with `👤 Added by: UserA`.
7. In **Browser 2 (User B)**:
   - Click `+` on the product to increase quantity.
   - Watch Browser 1 update automatically within 2 seconds.
8. In **Browser 2 (User B)**:
   - Note that the checkout button shows `Checkout (Creator Only)`.
9. In **Browser 1 (User A)**:
   - Click **Proceed to Checkout**. The shared order completes and both sessions update to show the room is closed.

---

## 📮 Postman Testing Instructions

1. **User A Login**:
   `POST http://localhost:3000/api/login` with User A credentials $\rightarrow$ copy `tokenA`.
2. **User B Login**:
   `POST http://localhost:3000/api/login` with User B credentials $\rightarrow$ copy `tokenB`.
3. **User A Creates Room**:
   - `POST http://localhost:3000/api/shared-carts/create`
   - Header: `Authorization: Bearer <tokenA>`
   - Copy `roomCode` from response.
4. **User B Joins Room**:
   - `POST http://localhost:3000/api/shared-carts/join`
   - Header: `Authorization: Bearer <tokenB>`
   - Body: `{ "roomCode": "<roomCode>" }`
5. **User A Adds Product**:
   - `POST http://localhost:3000/api/shared-carts/<roomCode>/items`
   - Header: `Authorization: Bearer <tokenA>`
   - Body: `{ "productId": "P101", "quantity": 2 }`
6. **User B Polls Room**:
   - `GET http://localhost:3000/api/shared-carts/<roomCode>`
   - Header: `Authorization: Bearer <tokenB>`
   - Verifies item `P101` added with `addedByUsername: UserA`.
7. **User A Initiates Checkout**:
   - `POST http://localhost:3000/api/shared-carts/<roomCode>/checkout`
   - Header: `Authorization: Bearer <tokenA>`
   - Status changes to `closed` and MongoDB product stock decrements.

---

## 🚀 Running the Application

```bash
# Terminal 1: Backend Server (Port 3000)
cd backend
npm install
npm run dev

# Terminal 2: Frontend Server (Port 5173)
cd frontend
npm install
npm run dev
```
Open your browser to `http://localhost:5173`.
