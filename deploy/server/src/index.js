import "dotenv/config";
import express from "express";
import cors from "cors";
import { manageUsersRouter } from "./manage-users.js";
import { processImportRouter } from "./process-import.js";

const app = express();

app.use(
  cors({
    origin: "*",
    allowedHeaders: [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-api-key",
    ],
  }),
);
app.use(express.json({ limit: "100mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Mesmas rotas usadas pelo frontend (supabase.functions.invoke):
// - /manage-users   (administração de usuários)
// - /process-import (importação COOISPI / Recebimento / MON + robô SAP)
app.use("/manage-users", manageUsersRouter);
app.use("/process-import", processImportRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API Puxada de Fábrica N&L rodando em http://localhost:${port}`);
});
