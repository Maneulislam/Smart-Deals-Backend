require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());

// Parse incoming JSON payloads
app.use(express.json());
// Parse URL-encoded payloads
app.use(express.urlencoded({ extended: true }));



const uri = process.env.DB_URI;


// --- Routes ---
// Basic test route
app.get('/', (req, res) => {
    res.send('Smart Deals Server is Running');
});


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db("smart_db");
        const productsCollection = database.collection("products");
        const bidsCollection = database.collection("bids");
        const usersCollection = database.collection("users");



        // POST USER (NO DUPLICATE)
        app.post("/users", async (req, res) => {
            const newUser = req.body;

            const query = { email: newUser.email };
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ exists: true });
            }

            const result = await usersCollection.insertOne(newUser);
            res.send({ inserted: true, result });
        });




        app.post('/products', async (req, res) => {
            const newProduct = req.body;
            const result = await productsCollection.insertOne(newProduct);
            res.send(result);

        })


        app.get('/products', async (req, res) => {
            // const projectFields = { title: 1, price_min: 1, price_max: 1, image: 1 }
            // const cursor = productsCollection.find().sort({ _id: 1 }).project(projectFields).limit(3);

            const cursor = productsCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });



        // GET a single product
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        });




        app.patch("/products/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedProduct = req.body;

            const updateDoc = {
                $set: {
                    name: updatedProduct.name,
                    price: updatedProduct.price
                }
            }
            const result = await productsCollection.updateOne(query, updateDoc);
            res.send(result);
        })



        app.delete("/products/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        })



        // Bids

        app.get('/bids', async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.buyer_email = email;
            }

            const cursor = bidsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });


        app.get('/bids/single', async (req, res) => {

            const email = req.query.email;

            if (!email) {
                return res.status(400).send({ message: "Email is required" });
            }

            const query = { buyer_email: email };
            const result = await bidsCollection.findOne(query);

            if (!result) {
                return res.status(404).send({ message: "No bid found for this email" });
            }
        });



        // Create a bid
        app.post("/bids", async (req, res) => {

            const newBid = req.body;
            const result = await bidsCollection.insertOne(newBid);
            res.send(result);

        });



        // Update a bid
        app.patch("/bids/:id", async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedBid = req.body;

            const updateDoc = {
                $set: {
                    product: updatedBid.product,
                    buyer_image: updatedBid.buyer_image,
                    buyer_name: updatedBid.buyer_name,
                    buyer_contact: updatedBid.buyer_contact,
                    buyer_email: updatedBid.buyer_email,
                    bid_price: updatedBid.bid_price,
                    status: updatedBid.status,
                },
            };

            const result = await bidsCollection.updateOne(filter, updateDoc);
            res.send(result);

        });



        // Delete a bid
        app.delete("/bids/:id", async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await bidsCollection.deleteOne(filter);
            res.send(result);

        });





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
});