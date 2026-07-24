import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { chatHandler } from "../controllers/chatController.js";

const router = Router();

router.post("/", authMiddleware, rateLimiter, chatHandler);

export default router;
