const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().email({ message: "Valid email is required" }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters" })
});

const loginSchema = z.object({
  email: z.string().email({ message: "Valid email is required" }),
  password: z.string().min(1, { message: "Password is required" })
});

function createUserController(config) {
  const registerUser = async (req, res) => {
    try {
      const { email, password } = req.body;
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const newUser = new User({ email, password });
      await newUser.save();

      return res.status(201).json({
        message: "User registered successfully",
        userId: newUser._id
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Registration failed", details: error.message });
    }
  };

  const loginUser = async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ userId: user._id }, config.JWT_SECRET, {
        expiresIn: "24h"
      });

      return res.json({
        message: "Login successful",
        token,
        userId: user._id
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Login failed", details: error.message });
    }
  };

  const getUser = async (req, res) => {
    try {
      const user = await User.findById(req.userId).select("-password");
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.json(user);
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to fetch user", details: error.message });
    }
  };

  return {
    registerUser,
    loginUser,
    getUser,
    registerSchema,
    loginSchema
  };
}

module.exports = {
  createUserController,
  registerSchema,
  loginSchema
};
