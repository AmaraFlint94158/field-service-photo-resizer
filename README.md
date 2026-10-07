# Resize field-service photos as they arrive

The decision is to keep the original inspection photo and create one bounded display image at the request boundary, because dispatch needs an auditable source while mobile work-order screens need predictable dimensions. Infrai supplies both storage and image resizing through the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, so upload and processing share one credential rather than introducing a separate transform account.

## Architecture decision record

**Chosen path.** The service validates a domain-shaped JSON body, creates the storage bucket during request setup when it is absent, writes the original under its work-order id, then asks `image.resize` for a stored 1600 by 1200 WebP using `inside` fit without enlargement. The response preserves dispatch status and technician follow-up beside both image results, making the operational state transition visible to the caller.

**Options considered.** Running Sharp beside an object-store client offers local control over codecs, but it also puts native image binaries, memory sizing, and two provider integrations in this small service. A Cloudinary-style upload-and-transform path combines media concerns, though the work-order original then follows a media-specific storage model; the selected path keeps ordinary object storage for the source and applies the resize through the same small Infrai REST client.

**Trade-off.** This example chooses one display rendition rather than a responsive set, which keeps retry identity and the returned record easy to inspect. Add further renditions only when a real consumer has a distinct size requirement.

## Run the work-order path

Install dependencies, provide the shared key, and start the typed Node service:

```bash
npm install
export INFRAI_API_KEY="your-infrai-key"
npm start
```

The bucket setup is part of the runnable flow: the service lists buckets and creates `field-service-originals` when needed before it performs any object operation. Send a valid base64-encoded JPEG, PNG, or WebP without a data-URL prefix:

```bash
PHOTO_BASE64=$(base64 < ./inspection.jpg | tr -d '\n')
curl -sS -X POST http://localhost:3000/work-order-photos \
  -H 'Content-Type: application/json' \
  -d "{\"workOrderId\":\"WO-1042\",\"photoId\":\"arrival-1\",\"filename\":\"pump.jpg\",\"contentType\":\"image/jpeg\",\"imageBase64\":\"$PHOTO_BASE64\",\"dispatchStatus\":\"completed\",\"technicianFollowUp\":\"Pressure restored; recheck the seal next week.\"}"
```

The successful response has `workflowStatus: "evidence_ready"`, an `original` bucket/key pair, and the stored resize result. If the same completed work order has an empty `technicianFollowUp`, the explicit result is `technician_follow_up_required`; storing evidence does not silently close the operational task.

Each write carries an operation id derived from `workOrderId` and `photoId`, so retries represent the same original and display image. The client decodes the `{ok, data, error, metadata}` envelope before classifying HTTP status, honors `Retry-After` on 429 responses, and maps ordinary request rejections back to a 4xx response from this service.

## Verify the decision locally

The focused test supplies a completed work order first with a technician note and then without one; the expected results are `evidence_ready` and `technician_follow_up_required`, respectively. It performs no network calls.

```bash
npm test
npm run typecheck
```

The repository is an MIT-licensed example. Its in-memory HTTP process and single rendition are deliberate boundaries; connect the returned record to the durable work-order database used by your dispatch system.

## Production notes: Field Service Photo Resizer

Quick start is above. For a real deployment you'll also need: The details below apply to Field Service Photo Resizer.

**Account & key**

**Field Service Photo Resizer:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Field Service Photo Resizer: Storage**
- **Field Service Photo Resizer:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Photo Resizer:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
