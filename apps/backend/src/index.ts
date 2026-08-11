import "dotenv/config";
import express from "express";
import authRouter from "./routes/auth.js";
import memberRouter from "./routes/member.js";
import cabildoRouter from "./routes/cabildo.js";
import familiaRouter from "./routes/familia.js";
import chatRouter from "./routes/chat.js";
import modelsRouter from "./routes/models.js";
import adminRouter from "./routes/admin.js";
import reportesRouter from "./routes/reportes.js";
import { ensureInitialAdmin } from "./controllers/authController.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Fail fast if JWT_SECRET is missing (issue #45). There is no default fallback
// anymore — a server running with a public secret would forge any token.
if (!process.env.JWT_SECRET) {
  console.error("[auth] JWT_SECRET is not set. Refusing to start. Configure it in .env (see .env.example).");
  process.exit(1);
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Bootstrap: crear el primer administrador desde env si no existe (issue #38)
ensureInitialAdmin().catch((err) => {
  console.error("[auth] Error al crear el primer administrador:", err);
});

app.get("/test", (_req, res) => {


  res.send("working");
});

app.use("/api/auth", authRouter);
app.use("/api/miembros", memberRouter);
app.use("/api/cabildos", cabildoRouter);
app.use("/api/familias", familiaRouter);
app.use("/api/chat", chatRouter);
app.use("/api/models", modelsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/reportes", reportesRouter);

// Global error handler — must be LAST
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
