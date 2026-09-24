import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infraiFromEnvironment, type InfraiMedia } from "./infrai_media.js";
import { decidePhotoWorkflow, workOrderPhotoSchema, type WorkOrderPhoto } from "./work_order_photo.js";

const BUCKET = "field-service-originals";

async function ensureBucket(infrai: InfraiMedia): Promise<void> {
  const { items } = await infrai.storage.bucket.list();
  if (!items.some((bucket) => bucket.name === BUCKET)) {
    await infrai.storage.bucket.create(BUCKET);
  }
}

export async function storeWorkOrderPhoto(infrai: InfraiMedia, input: WorkOrderPhoto) {
  await ensureBucket(infrai);
  const objectKey = `work-orders/${input.workOrderId}/${input.photoId}-${input.filename}`;
  const operationId = `${input.workOrderId}:${input.photoId}`;

  await infrai.storage.object.put(
    BUCKET,
    objectKey,
    input.imageBase64,
    input.contentType,
    `${operationId}:original`,
  );
  const resized = await infrai.image.resize(input.imageBase64);

  return {
    workOrderId: input.workOrderId,
    photoId: input.photoId,
    dispatchStatus: input.dispatchStatus,
    technicianFollowUp: input.technicianFollowUp,
    workflowStatus: decidePhotoWorkflow(input),
    original: { bucket: BUCKET, key: objectKey },
    resized,
  };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const infrai = infraiFromEnvironment();
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-order-photos") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = workOrderPhotoSchema.parse(await readBody(request));
    sendJson(response, 201, await storeWorkOrderPhoto(infrai, input));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid work-order photo body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 502, { error: "Photo pipeline request failed" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("work-order photo service listening on http://localhost:3000");
});
