import "dotenv/config";
import express from "express";
import authRouter from "./routes/auth.js";
import memberRouter from "./routes/member.js";
import cabildoRouter from "./routes/cabildo.js";
import familiaRouter from "./routes/familia.js";
import chatRouter from "./routes/chat.js";
import modelsRouter from "./routes/models.js";
import { errorHandler } from "./middleware/errorHandler.js";
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/test", (_req, res) => {
  console.log("someone is asking for /test");
  res.send("working");
});

app.use("/api/auth", authRouter);
app.use("/api/miembros", memberRouter);
app.use("/api/cabildos", cabildoRouter);
app.use("/api/familias", familiaRouter);
app.use("/api/chat", chatRouter);
app.use("/api/models", modelsRouter);

// Global error handler — must be LAST
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
