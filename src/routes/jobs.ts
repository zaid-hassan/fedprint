import type { FastifyInstance } from "fastify";
import { logger } from "../logger.js";
import { cancelJob, list } from "../services/print-job.js";

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/jobs", async () => {
    const jobs = await list();
    return { jobs };
  });

  app.post("/api/jobs/:id/cancel", async (request) => {
    const { id } = request.params as { id: string };
    const jobId = await cancelJob(id);
    logger.info("Print job cancelled", { jobId });
    return { ok: true, jobId };
  });
}
