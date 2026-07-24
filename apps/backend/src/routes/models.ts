import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { listModels } from "../controllers/modelsController.js";

const router = Router();

router.get("/", authMiddleware, listModels);

export default router;
