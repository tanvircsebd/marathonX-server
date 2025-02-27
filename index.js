require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      //   "https://marathon-b3537.web.app",
      //   "https://marathon-b3537.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  console.log("token: ", token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized user" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.xxo3m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mio0f.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    const MarathonCollection = client.db("marathondb").collection("marathon");
    const MarathonRegCollection = client
      .db("marathondb")
      .collection("marathon-registration");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1d" });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.post("/allMarathon", verifyToken, async (req, res) => {
      const newMarathon = req.body;
      try {
        const result = await MarathonCollection.insertOne(newMarathon);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error creating marathon:", error);
        res.status(500).send({ message: "Failed to create marathon" });
      }
    });
    app.get("/allMarathon", verifyToken, async (req, res) => {
      try {
        const limit = parseInt(req.query.limit);
        const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
        const cursor = MarathonCollection.find()
          .sort({ createdAt: sortOrder })
          .limit(limit);
        const result = await cursor.toArray();

        // Ensure that result is an array
        if (Array.isArray(result)) {
          res.send(result);
        } else {
          res.status(400).send({ message: "Expected an array of marathons" });
        }
      } catch (error) {
        console.error("Error fetching marathons:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/allMarathonlimit", async (req, res) => {
      try {
        const marathons = await MarathonCollection.find().limit(6).toArray();

        res.status(200).json(marathons);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error retrieving data" });
      }
    });

    app.get("/allMarathon/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const marathon = await MarathonCollection.findOne({
          _id: new ObjectId(id),
        });
        if (marathon) {
          res.send(marathon);
        } else {
          res.status(404).send({ message: "Marathon not found" });
        }
      } catch (error) {
        console.error("Error fetching marathon:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Register for a marathon
    // Register marathon route
    app.post("/registerMarathon", async (req, res) => {
      const {
        email,
        firstName,
        lastName,
        contactNumber,
        additionalInfo,
        marathonId,
        title,
        startDate,
      } = req.body;

      try {
        // Save registration details
        const registration = await MarathonRegCollection.insertOne({
          email,
          firstName,
          lastName,
          contactNumber,
          additionalInfo,
          marathonId,
          title,
          startDate,
          registrationDate: new Date(),
        });

        // Update total registration count for the marathon
        const updateResult = await MarathonCollection.updateOne(
          { _id: new ObjectId(marathonId) }, // Use ObjectId to ensure correct ID format
          { $inc: { totalRegistrationCount: 1 } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).send({ message: "Marathon not found" });
        }

        res.status(201).send({
          message: "Registration successful",
          registrationId: registration.insertedId,
        });
      } catch (error) {
        console.error("Error registering for marathon:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/regMarathon/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const searchQuery = req.query.search || ""; // Get search query from the query parameters

      // Build the query object to search by email and title (if search query is provided)
      const query = { email };

      // If a search query is provided, modify the query to include the title search
      if (searchQuery) {
        query.title = { $regex: searchQuery, $options: "i" }; // Case-insensitive search
      }

      try {
        const result = await MarathonRegCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Server error" });
      }
    });

    app.get("/allMarathon/user/:email", verifyToken, async (req, res) => {
      console.log("here");
      const email = req.params.email;
      const query = { email };
      const result = await MarathonCollection.find(query).toArray();
      res.send(result);
    });
    app.patch("/marathon/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedMarathon = req.body;

        // Convert ID to ObjectId using MongoDB's ObjectId
        const objectId = new ObjectId(id);

        const result = await MarathonCollection.updateOne(
          { _id: objectId }, // Convert ID to ObjectId
          { $set: updatedMarathon }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ message: "Marathon not found or no changes made" });
        }

        res.json({ message: "Marathon updated successfully" });
      } catch (err) {
        console.error("Error updating marathon:", err);
        res
          .status(500)
          .json({ message: "Error updating marathon", error: err.message });
      }
    });
    app.delete("/marathon/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const objectId = new ObjectId(id);

        const result = await MarathonCollection.deleteOne({ _id: objectId });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Marathon not found" });
        }

        res.json({ message: "Marathon deleted successfully" });
      } catch (err) {
        console.error("Error deleting marathon:", err);
        res
          .status(500)
          .json({ message: "Error deleting marathon", error: err.message });
      }
    });

    app.put("/updateRegistration", async (req, res) => {
      const {
        registrationId,
        firstName,
        lastName,
        contactNumber,
        additionalInfo,
      } = req.body;

      try {
        // Update registration details
        const updateResult = await MarathonRegCollection.updateOne(
          { _id: new ObjectId(registrationId) },
          {
            $set: { firstName, lastName, contactNumber, additionalInfo },
          }
        );

        if (updateResult.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Registration not found or no changes made" });
        }

        res.status(200).send({ message: "Registration updated successfully" });
      } catch (error) {
        console.error("Error updating registration:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    app.delete("/deleteRegistration", async (req, res) => {
      const { registrationId } = req.body;

      try {
        // Remove registration record
        const deleteResult = await MarathonRegCollection.deleteOne({
          _id: new ObjectId(registrationId),
        });

        if (deleteResult.deletedCount === 0) {
          return res.status(404).send({ message: "Registration not found" });
        }

        // Optionally, decrease the total registration count for the marathon
        const marathonId = req.body.marathonId; // assuming we get the marathonId from the request
        const updateResult = await MarathonCollection.updateOne(
          { _id: new ObjectId(marathonId) },
          { $inc: { totalRegistrationCount: -1 } }
        );

        res.status(200).send({ message: "Registration deleted successfully" });
      } catch (error) {
        console.error("Error deleting registration:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

// Run the server
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Marathon server is running");
});

app.listen(port, () => {
  console.log(`Marathon server running on port ${port}`);
});
