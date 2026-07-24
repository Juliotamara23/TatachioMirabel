import { Router } from "express";
import {
  createCabildo,
  getCabildos,
  getCabildoById,
  updateCabildo,
  deleteCabildo,
} from "../controllers/cabildoController.js";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Read routes — any authenticated user
router.get("/", getCabildos);
router.get("/:id", getCabildoById);

// Write routes — admin only
router.post("/", isAdmin, createCabildo);
router.put("/:id", isAdmin, updateCabildo);
router.delete("/:id", isAdmin, deleteCabildo);

export default router;
