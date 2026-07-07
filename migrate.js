require("dotenv").config({ path: ".env" });

const path = require("path");
const connectDB = require("./database");
const { load } = require("./lib/store"); // Your existing store.js

async function migrate() {
    try {
        console.log("Starting migration...");
        
        const db = await connectDB();

        console.log("Loading data from store...");
        const data = load();

        // Remove old data if exists
        console.log("Clearing existing collections...");
        await db.collection("questions").deleteMany({});
        await db.collection("users").deleteMany({});
        await db.collection("meta").deleteMany({});

        // Insert Questions
        if (data.questions && data.questions.length) {
            console.log(`Inserting ${data.questions.length} questions...`);
            await db.collection("questions").insertMany(data.questions);
        }

        // Insert Users
        const users = Object.entries(data.users).map(([name, value]) => ({
            name,
            ...value
        }));

        if (users.length) {
            console.log(`Inserting ${users.length} users...`);
            await db.collection("users").insertMany(users);
        }

        // Insert Metadata
        console.log("Inserting metadata...");
        await db.collection("meta").insertOne({
            nextQId: data.nextQId,
            nextAId: data.nextAId
        });

        console.log("🎉 Migration Completed Successfully!");
        console.log(`✅ ${data.questions.length} questions migrated`);
        console.log(`✅ ${users.length} users migrated`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        console.error(error);
        process.exit(1);
    }
}

migrate();
