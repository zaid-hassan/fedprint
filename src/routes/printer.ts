import type { FastifyInstance } from "fastify";
import { getCapabilities, getStatus } from "../services/printer.js";

export async function printerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/printer/status", async () => {
    const [status, capabilities] = await Promise.all([getStatus(), getCapabilities()]);
    return { ...status, capabilities };
  });
}
