const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error("❌ Error: MONGODB_URI environment variable is not set");
    throw new Error("MONGODB_URI not configured");
}

const client = new MongoClient(uri);

let db;

async function connectDB() {
    if (db) return db;

    await client.connect();
    db = client.db("leaducate");

    console.log("✅ MongoDB Connected");

    return db;
}

module.exports = connectDB;
