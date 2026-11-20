import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAME = "greencode-av3";

let queue: Queue | undefined;

function connection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL não configurada; processamento assíncrono indisponível.");
  return new IORedis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    retryStrategy: (attempt) => Math.min(attempt * 250, 1_000),
  });
}

export function obterFila() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: connection(), defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 604_800, count: 1_000 },
  } });
  return queue;
}

export async function enfileirarTarefa(id: string) {
  await obterFila().add("executar", { taskId: id }, { jobId: id });
}

export async function fecharFila() {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
