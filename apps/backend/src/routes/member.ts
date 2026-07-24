import { Router } from "express";
import {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
} from "../controllers/memberController.js";
import { authMiddleware, isAdmin, isCapitana } from "../middleware/authMiddleware.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Read routes — any authenticated user
router.get("/", getMembers);
router.get("/:id", getMemberById);

// Write routes — capitana or admin
router.post("/", isCapitana, createMember);
router.put("/:id", isCapitana, updateMember);

// Delete — admin only
router.delete("/:id", isAdmin, deleteMember);

export default router;
