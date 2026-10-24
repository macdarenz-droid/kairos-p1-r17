const encoder = new TextEncoder();

const ACTIVATION_ALLOWED_ORIGIN = "https://kairos-p1-r17.pages.dev";

function corsHeaders(request) {
  const headers = {
    "vary": "Origin",
  };

  if (request.headers.get("origin") === ACTIVATION_ALLOWED_ORIGIN) {
    headers["access-control-allow-origin"] = ACTIVATION_ALLOWED_ORIGIN;
  }

  return headers;
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...corsHeaders(request),
    },
  });
}

function preflight(request) {
  if (request.headers.get("origin") !== ACTIVATION_ALLOWED_ORIGIN) {
    return new Response(null, {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "vary": "Origin",
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": ACTIVATION_ALLOWED_ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Accept, Content-Type",
      "cache-control": "no-store",
      "vary": "Origin",
    },
  });
}

function base64ToBytes(base64) {
  const binary = atob(base64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(env) {
  const privateKeyBase64 = env.KAIROS_ACTIVATION_PRIVATE_KEY;

  if (
    typeof privateKeyBase64 !== "string" ||
    privateKeyBase64.trim().length === 0
  ) {
    throw new Error("Signing key is not configured.");
  }

  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(privateKeyBase64),
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"],
  );
}

async function createSignedReceipt(env, activationId, issuedAt) {
  const verifierPayload = JSON.stringify({
    proofVersion: 1,
    purpose: "kairos-activation",
    receiptVersion: 1,
    activationId,
    issuedAt,
  });

  const signingKey = await getSigningKey(env);

  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    signingKey,
    encoder.encode(verifierPayload),
  );

  const signatureBytes = new Uint8Array(signature);

  if (signatureBytes.byteLength !== 64) {
    throw new Error("Unexpected ECDSA signature length.");
  }

  return {
    receiptVersion: 1,
    activationId,
    issuedAt,
    verifierPayload,
    verifierSignature: base64Url(signatureBytes),
  };
}

function validRequest(body) {
  return (
    body !== null &&
    typeof body === "object" &&
    typeof body.inviteCode === "string" &&
    body.inviteCode.trim().length > 0 &&
    typeof body.appVersion === "string" &&
    body.appVersion.trim().length > 0 &&
    typeof body.buildId === "string" &&
    body.buildId.trim().length > 0
  );
}

async function activationRateLimitKey(request) {
  // Activation happens before Kairos has an authenticated user identity. A
  // one-way hash keeps the network identifier out of the limiter key while
  // avoiding the previous single global counter that let one actor throttle
  // every activation attempt worldwide.
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  const actor = connectingIp && connectingIp.length > 0
    ? connectingIp
    : "unidentified-client";

  return `activation:${await sha256Hex(actor)}`;
}

async function classifyRejection(env, codeHash, now) {
  const row = await env.DB.prepare(
    `
      SELECT status, expires_at
      FROM activation_codes
      WHERE code_hash = ?
      LIMIT 1
    `,
  )
    .bind(codeHash)
    .first();

  if (!row) {
    return "invalid-code";
  }

  if (row.status === "used") {
    return "already-used";
  }

  if (row.status === "revoked") {
    return "invalid-code";
  }

  if (
    typeof row.expires_at === "string" &&
    row.expires_at.length > 0 &&
    row.expires_at <= now
  ) {
    return "expired-code";
  }

  return "service-error";
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname !== "/activate") {
        return json(request, { ok: false, reason: "service-error" }, 404);
      }

      if (request.method === "OPTIONS") {
        return preflight(request);
      }

      if (request.method !== "POST") {
        return json(request, { ok: false, reason: "service-error" }, 405);
      }

      // Abuse protection only. D1 remains authoritative for one-time invite
      // consumption; the limiter must never be used as an accounting system.
      const rateLimitResult = await env.ACTIVATION_RATE_LIMITER.limit({
        key: await activationRateLimitKey(request),
      });

      if (!rateLimitResult.success) {
        return json(
          request,
          {
            ok: false,
            reason: "rate-limited",
          },
          429,
        );
      }

      const contentType = request.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("application/json")) {
        return json(request, { ok: false, reason: "service-error" }, 415);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(request, { ok: false, reason: "invalid-code" }, 400);
      }

      if (!validRequest(body)) {
        return json(request, { ok: false, reason: "invalid-code" }, 400);
      }

      const canonicalCode = body.inviteCode.trim().toUpperCase();
      const codeHash = await sha256Hex(canonicalCode);

      const activationId = crypto.randomUUID();
      const issuedAt = new Date().toISOString();

      // Sign before consuming the invite. If signing fails, the invite remains
      // unused and the client receives no activation receipt.
      const receipt = await createSignedReceipt(
        env,
        activationId,
        issuedAt,
      );

      const result = await env.DB.prepare(
        `
          UPDATE activation_codes
          SET status = 'used',
              used_at = ?,
              activation_id = ?,
              app_version = ?,
              build_id = ?
          WHERE code_hash = ?
            AND status = 'unused'
            AND (expires_at IS NULL OR expires_at > ?)
        `,
      )
        .bind(
          issuedAt,
          activationId,
          body.appVersion.trim(),
          body.buildId.trim(),
          codeHash,
          issuedAt,
        )
        .run();

      if (result.meta.changes !== 1) {
        const reason = await classifyRejection(
          env,
          codeHash,
          issuedAt,
        );

        return json(
          request,
          {
            ok: false,
            reason,
          },
          reason === "service-error" ? 503 : 403,
        );
      }

      return json(request, {
        ok: true,
        receipt,
      });
    } catch {
      return json(
        request,
        {
          ok: false,
          reason: "service-error",
        },
        500,
      );
    }
  },
};
