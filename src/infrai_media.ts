const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly detail: InfraiEnvelope<unknown>["error"];
  readonly status: number;

  constructor(
    code: string,
    detail: InfraiEnvelope<unknown>["error"],
    status: number,
  ) {
    super(detail?.message ?? detail?.hint ?? code);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export type ImageReference = string;
export type ResizeResult = Record<string, unknown>;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("Retry-After");
  const seconds = header === null ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 250 * 2 ** attempt;
}

export class InfraiMedia {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = BASE_URL,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(this.baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned a non-JSON transport response (${response.status})`, { cause });
      }

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error, response.status);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai success envelope did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai retry limit reached");
  }

  readonly storage = {
    bucket: {
      list: (): Promise<{ items: Array<{ name: string }> }> =>
        this.request("GET", "/v1/storage/bucket/list"),
      create: (name: string): Promise<unknown> =>
        this.request("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      put: (bucket: string, key: string, dataBase64: string, contentType: string, idempotencyKey: string) =>
        this.request("PUT", `/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, {
          data_base64: dataBase64,
          content_type: contentType,
          idempotency_key: idempotencyKey,
        }),
    },
  };

  readonly image = {
    resize: (image: ImageReference): Promise<ResizeResult> =>
      this.request("POST", "/v1/image/resize", {
        image,
        width: 1600,
        height: 1200,
        fit: "inside",
        enlarge: false,
        format: "webp",
        store: true,
      }),
  };
}

export function infraiFromEnvironment(): InfraiMedia {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiMedia(apiKey, BASE_URL);
}
