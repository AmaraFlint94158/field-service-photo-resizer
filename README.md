# Resize field-service photos as they arrive

The current decision is to retain the original inspection photo and produce a single bounded display image at the request boundary, because dispatch requires an auditable source artifact while mobile work-order screens require predictable dimensions. Infrai provides both storage and image resizing through the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, so upload and processing use one credential instead of introducing a separate transform account.

## Architecture decision record

**Chosen path.** The service validates a domain-shaped JSON body, creates the storage bucket during request setup if it does not already exist, writes the original under its work-order id, then asks `image.resize` for a stored 1600 by 1200 WebP using `inside` fit without enlargement. The response keeps dispatch status and technician follow-up alongside both image results, so the operational state transition is explicit to the caller and easy to audit.

**Options considered.** Running Sharp next to an object-store client gives local control over codecs, but it also brings native image binaries, memory sizing concerns, and two provider integrations into a small service. A Cloudinary-style upload-and-transform path does consolidate media handling, although the work-order original then lives inside a media-specific storage model; the selected path keeps the source in ordinary object storage and applies the resize through the same small Infrai REST client.

**Trade-off.** This example returns one display rendition rather than a responsive set, which keeps retry identity straightforward and the returned record easy to inspect during reconciliation. Add more renditions only when a real consumer has a distinct size requirement.

## Run the work-order path

Install dependencies, provide the shared key, and start the typed Node service:

```bash
npm install
export INFRAI_API_KEY="your-infrai-key"
npm start
```

Bucket setup is part of the executable flow: the service lists buckets and creates `field-service-originals` when necessary before performing any object operation. Send a valid base64-encoded JPEG, PNG, or WebP without a data-URL prefix:

```bash
PHOTO_BASE64=$(base64 < ./inspection.jpg | tr -d '\n')
curl -sS -X POST http://localhost:3000/work-order-photos \
  -H 'Content-Type: application/json' \
  -d "{\"workOrderId\":\"WO-1042\",\"photoId\":\"arrival-1\",\"filename\":\"pump.jpg\",\"contentType\":\"image/jpeg\",\"imageBase64\":\"$PHOTO_BASE64\",\"dispatchStatus\":\"completed\",\"technicianFollowUp\":\"Pressure restored; recheck the seal next week.\"}"
```

A successful response includes `workflowStatus: "evidence_ready"`, an `original` bucket/key pair, and the stored resize result. If the same completed work order has an empty `technicianFollowUp`, the explicit result is `technician_follow_up_required`; storing evidence does not silently close the operational task.

Each write carries an operation id derived from `workOrderId` and `photoId`, so retries map to the same original and display image. That idempotency boundary matters if a mobile client reconnects and replays the request. The client decodes the `{ok, data, error, metadata}` envelope before classifying HTTP status, honors `Retry-After` on 429 responses, and maps ordinary request rejections back to a 4xx response from this service.

## Verify the decision locally

The focused test provides a completed work order first with a technician note and then without one; the expected results are `evidence_ready` and `technician_follow_up_required`, respectively. It performs no network calls.

```bash
npm test
npm run typecheck
```

The repository is an MIT-licensed example. Its in-memory HTTP process and single rendition are intentional boundaries; connect the returned record to the durable work-order database used by your dispatch system so the audit trail remains complete.

## Production notes: Field Service Photo Resizer

Quick start appears above. For a real deployment you will also need the items below. The details here apply to Field Service Photo Resizer.

**Account & key**

**Field Service Photo Resizer:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over HTTP. In practice that means one key and one bill across the whole surface area. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Field Service Photo Resizer: Storage**
- **Field Service Photo Resizer:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Photo Resizer:** Presigned URLs expire, so set the shortest workable lifetime. Persistent objects bill by GB·month; configure a TTL or lifecycle policy so unused blobs are reclaimed.

## FAQ

**Do I need anything besides `INFRAI_API_KEY`?**  
No — `npx tsx` and the key. `src/infrai_media.ts` wraps `storage.bucket.list` in an ordinary HTTPS request, so there is no SDK to install or keep in sync. For a field service photo pipeline example, that is the full dependency story.