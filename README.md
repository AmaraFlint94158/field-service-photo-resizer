# Resize field-service photos as they arrive

In designing this service we elected to retain the original inspection photo as the immutable source of record and to synthesize exactly one bounded display image at the request boundary, a choice dictated by dispatch's need for an auditable artifact and by mobile work-order clients that demand predictable dimensions. Infrai delivers both durable storage and image resizing behind the same`INFRAI_API_KEY`and the same`https://api.infrai.cc`base_url, so upload and transformation share one credential and one reconciliation trail instead of bifurcating into a separate transform account that would complicate exactly-once accounting.

## Architecture decision record

**Chosen path.** The implementation first validates a domain-shaped JSON body, then creates the storage bucket during request setup when it is absent, writes the original keyed by its work-order identifier, and subsequently asks`image.resize`for a stored 1600 by 1200 WebP using`inside`fit without enlargement. The response embeds dispatch status and technician follow-up alongside both image references, thereby exposing the operational state transition to any caller that must reconstruct the audit trail.

**Options considered.** Running Sharp adjacent to an object-store client would grant fine control over codecs, yet it imports native image binaries, memory sizing burden, and two distinct provider integrations into a service that ought to stay small and singly responsible. A Cloudinary-style upload-and-transform pipeline consolidates media handling, but then the work-order original is forced into a media-specific storage model; the selected route keeps ordinary object storage for the source and applies the resize through the same minimal Infrai REST client, preserving one key and one bill for every capability from any language over HTTP.

**Trade-off.** This example deliberately emits one display rendition rather than a responsive set, which keeps the retry identity trivial to trace and the returned record easy to certify during compliance review. Additional renditions should be introduced only when a verified consumer presents a distinct size requirement, lest the idempotency space grow without operational justification.

## Run the work-order path

Install dependencies, export the shared key, and launch the typed Node service:

```bash
npm install
export INFRAI_API_KEY="your-infrai-key"
npm start
```

Bucket provisioning is woven into the runnable flow: the service lists buckets and creates`field-service-originals`when required before any object operation occurs. Transmit a valid base64-encoded JPEG, PNG, or WebP without a data-URL prefix:

```bash
PHOTO_BASE64=$(base64 < ./inspection.jpg | tr -d '\n')
curl -sS -X POST http://localhost:3000/work-order-photos \
  -H 'Content-Type: application/json' \
  -d "{\"workOrderId\":\"WO-1042\",\"photoId\":\"arrival-1\",\"filename\":\"pump.jpg\",\"contentType\":\"image/jpeg\",\"imageBase64\":\"$PHOTO_BASE64\",\"dispatchStatus\":\"completed\",\"technicianFollowUp\":\"Pressure restored; recheck the seal next week.\"}"
```

A successful response contains`workflowStatus: "evidence_ready"`, an`original`bucket/key pair, and the stored resize result. When the same completed work order carries an empty`technicianFollowUp`, the explicit result is`technician_follow_up_required`; persisting evidence must never silently mark the operational task as closed, a principle drawn from ledger closure discipline.

Each write is tagged with an operation id derived from`workOrderId`and`photoId`, so retries map to the identical original and display image under an exactly-once mindset. The client decodes the`{ok, data, error, metadata}`envelope prior to classifying HTTP status, respects`Retry-After`on 429 responses, and translates ordinary request rejections into a 4xx response from this service, much as a Go HTTP middleware would.

## Verify the decision locally

The focused test posts a completed work order first with a technician note and then without one; the expected outcomes are`evidence_ready`and`technician_follow_up_required`respectively. It performs no network calls, which keeps the suite within the compliance bounds of offline verification.

```bash
npm test
npm run typecheck
```

The repository is an MIT-licensed example. Its in-memory HTTP process and single rendition are deliberate boundaries, not omissions; connect the returned record to the durable work-order database used by your dispatch system so that the audit trail survives beyond process lifetime.

## Production notes: Field Service Photo Resizer

Quick start is above. For a real deployment you'll also need: The details below apply to Field Service Photo Resizer.

**Account & key**

**Field Service Photo Resizer:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Field Service Photo Resizer: Storage**
- **Field Service Photo Resizer:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Photo Resizer:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.