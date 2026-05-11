require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
var jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Firebase Init ---
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Firebase Token Verify ---
const verifyFirebaseToken = async (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
    const token = req.headers.authorization.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
    try {
        const userInfo = await admin.auth().verifyIdToken(token);
        req.token_email = userInfo.email;
        next();
    } catch {
        return res.status(401).send({ message: "Unauthorized access" });
    }
};

// --- JWT Token Verify ---
const verifyJWTToken = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
    const token = authorization.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
    jwt.verify(token, process.env.JWT_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "Unauthorized access" });
        }
        req.token_email = decoded.email;
        next();
    });
};

// --- MongoDB Connection (Cached for Vercel Serverless) ---
const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let isConnected = false; // connection cache flag

async function connectDB() {
    if (!isConnected) {
        await client.connect();
        isConnected = true;
        console.log("Connected to MongoDB!");
    }
    return client;
}

// --- DB Collections Helper ---
async function getCollections() {
    const client = await connectDB();
    const database = client.db("smart_db");
    return {
        productsCollection: database.collection("products"),
        bidsCollection: database.collection("bids"),
        usersCollection: database.collection("users"),
    };
}

// =====================
// --- Routes ---
// =====================

// Health check
app.get('/', (req, res) => {
    res.send('Smart Deals Server is Running');
});

// JWT Token
app.post('/get-token', (req, res) => {
    const loggedUser = req.body;
    const token = jwt.sign(loggedUser, process.env.JWT_TOKEN, { expiresIn: "1h" });
    res.send({ token });
});

// POST User
app.post("/users", async (req, res) => {
    const { usersCollection } = await getCollections();
    const newUser = req.body;
    const existingUser = await usersCollection.findOne({ email: newUser.email });
    if (existingUser) return res.send({ exists: true });
    const result = await usersCollection.insertOne(newUser);
    res.send({ inserted: true, result });
});

// GET Recent Products
app.get('/recent-products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const result = await productsCollection.find().sort({ created_at: -1 }).limit(6).toArray();
    res.send(result);
});

// GET All Products
app.get('/products', async (req, res) => {
    const { productsCollection } = await getCollections();
    const result = await productsCollection.find().toArray();
    res.send(result);
});

// POST Product
app.post('/products', verifyFirebaseToken, async (req, res) => {
    const { productsCollection } = await getCollections();
    const result = await productsCollection.insertOne(req.body);
    res.send(result);
});

// GET Single Product
app.get('/products/:id', async (req, res) => {
    const { productsCollection } = await getCollections();
    const result = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
});

// PATCH Product
app.patch("/products/:id", async (req, res) => {
    const { productsCollection } = await getCollections();
    const { name, price } = req.body;
    const result = await productsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { name, price } }
    );
    res.send(result);
});

// DELETE Product
app.delete("/products/:id", async (req, res) => {
    const { productsCollection } = await getCollections();
    const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
});

// GET Bids (JWT protected)
app.get('/bids', verifyJWTToken, async (req, res) => {
    const { bidsCollection } = await getCollections();
    const email = req.query.email;
    if (email !== req.token_email) {
        return res.status(403).send({ message: "Forbidden access" });
    }
    const query = email ? { buyerEmail: email } : {};
    const result = await bidsCollection.find(query).toArray();
    res.send(result);
});

// GET Single Bid by email
app.get('/bids/single', async (req, res) => {
    const { bidsCollection } = await getCollections();
    const { email } = req.query;
    if (!email) return res.status(400).send({ message: "Email is required" });
    const result = await bidsCollection.findOne({ buyer_email: email });
    if (!result) return res.status(404).send({ message: "No bid found for this email" });
    res.send(result);
});

// GET Bids for a Product (Firebase protected)
app.get('/products/bids/:id', verifyFirebaseToken, async (req, res) => {
    const { bidsCollection } = await getCollections();
    const result = await bidsCollection
        .find({ product: req.params.id })
        .sort({ bidPrice: -1 })
        .toArray();
    res.send(result);
});

// POST Bid
app.post("/bids", async (req, res) => {
    const { bidsCollection } = await getCollections();
    const result = await bidsCollection.insertOne(req.body);
    res.send(result);
});

// PATCH Bid
app.patch("/bids/:id", async (req, res) => {
    const { bidsCollection } = await getCollections();
    const { product, buyer_image, buyer_name, buyer_contact, buyer_email, bid_price, status } = req.body;
    const result = await bidsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { product, buyer_image, buyer_name, buyer_contact, buyer_email, bid_price, status } }
    );
    res.send(result);
});

// DELETE Bid
app.delete("/bids/:id", async (req, res) => {
    const { bidsCollection } = await getCollections();
    const result = await bidsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
});

// --- Start Server (local only) ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// --- Export for Vercel ---
module.exports = app;