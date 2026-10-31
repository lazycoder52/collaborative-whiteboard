const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let memoryServerInstance = null;

async function connectDB(config, retries = 5, backoffMs = 1000) {
  if (config.USE_MEMORY_DB) {
    if (!memoryServerInstance) {
      memoryServerInstance = await MongoMemoryServer.create();
    }
    const uri = memoryServerInstance.getUri();
    await mongoose.connect(uri);
    return { uri, isMemory: true };
  }

  let attempt = 0;
  while (attempt < retries) {
    try {
      await mongoose.connect(config.MONGODB_URI);
      return { uri: config.MONGODB_URI, isMemory: false };
    } catch (error) {
      attempt += 1;
      const delay = backoffMs * Math.pow(2, attempt - 1);
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt >= retries) {
        throw new Error(`Failed to connect to MongoDB after ${retries} attempts: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
}

module.exports = {
  connectDB,
  disconnectDB
};
