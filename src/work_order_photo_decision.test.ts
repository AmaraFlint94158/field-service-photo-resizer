import assert from "node:assert/strict";
import test from "node:test";
import { decidePhotoWorkflow, workOrderPhotoSchema } from "./work_order_photo.js";

test("a completed visit with a technician note makes photo evidence ready", () => {
  const input = workOrderPhotoSchema.parse({
    workOrderId: "WO-1042",
    photoId: "arrival-1",
    filename: "pump.jpg",
    contentType: "image/jpeg",
    imageBase64: "a-valid-length-base64-value",
    dispatchStatus: "completed",
    technicianFollowUp: "Pressure restored; recheck the seal next week.",
  });

  assert.equal(decidePhotoWorkflow(input), "evidence_ready");
});

test("a completed visit without a technician note stays in follow-up", () => {
  const input = workOrderPhotoSchema.parse({
    workOrderId: "WO-1043",
    photoId: "repair-1",
    filename: "valve.png",
    contentType: "image/png",
    imageBase64: "a-valid-length-base64-value",
    dispatchStatus: "completed",
    technicianFollowUp: "",
  });

  assert.equal(decidePhotoWorkflow(input), "technician_follow_up_required");
});
