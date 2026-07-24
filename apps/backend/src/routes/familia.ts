import { Router } from "express";
import {
  createFamilia,
  getFamilias,
  getFamiliaById,
  updateFamilia,
  deleteFamilia,
} from "../controllers/familiaController.js";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Read routes — any authenticated user
router.get("/", getFamilias);
router.get("/:id", getFamiliaById);

// Write routes — admin only
router.post("/", isAdmin, createFamilia);
router.put("/:id", isAdmin, updateFamilia);
router.delete("/:id", isAdmin, deleteFamilia);

export default router;
