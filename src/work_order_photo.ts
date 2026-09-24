import { z } from "zod";

export const workOrderPhotoSchema = z.object({
  workOrderId: z.string().min(1).max(80),
  photoId: z.string().min(1).max(80),
  filename: z.string().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  imageBase64: z.string().min(16),
  dispatchStatus: z.enum(["scheduled", "dispatched", "on_site", "completed"]),
  technicianFollowUp: z.string().trim().max(500).default(""),
});

export type WorkOrderPhoto = z.infer<typeof workOrderPhotoSchema>;
export type PhotoWorkflowStatus = "evidence_ready" | "technician_follow_up_required";

export function decidePhotoWorkflow(input: Pick<WorkOrderPhoto, "dispatchStatus" | "technicianFollowUp">): PhotoWorkflowStatus {
  return input.dispatchStatus === "completed" && input.technicianFollowUp.length > 0
    ? "evidence_ready"
    : "technician_follow_up_required";
}
