import http from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

export interface MockIdpOptions {
  clientId: string;
  /** When set, redirect responses use this origin instead of the request host. */
  redirectOrigin?: string;
}

interface PendingAuth {
  nonce: string;
  redirectUri: string;
}

export class MockOidcServer {
  issuerUrl = "";
  origin = "";
  private server!: http.Server;
  private port = 0;
  private readonly pending = new Map<string, PendingAuth>();
  private privateKey!: CryptoKey;
  private publicJwk!: Record<string, unknown>;

  constructor(private readonly options: MockIdpOptions) {}

  async start(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    this.privateKey = privateKey;
    this.publicJwk = await exportJWK(publicKey);
    this.publicJwk.kid = "mock-key";
    this.publicJwk.alg = "RS256";
    this.publicJwk.use = "sig";

    await new Promise<void>((resolve) => {
      this.server = http.createServer((req, res) => {
        void this.handle(req, res);
      });
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address();
        if (!addr || typeof addr === "string") {
          throw new Error("Failed to bind mock OIDC server");
        }
        this.port = addr.port;
        this.origin = `http://127.0.0.1:${this.port}`;
        this.issuerUrl = `${this.origin}/`;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", this.origin);

    if (url.pathname === "/.well-known/openid-configuration") {
      return this.json(res, {
        issuer: this.issuerUrl,
        authorization_endpoint: `${this.origin}/authorize`,
        token_endpoint: `${this.origin}/token`,
        userinfo_endpoint: `${this.origin}/userinfo`,
        jwks_uri: `${this.origin}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }

    if (url.pathname === "/jwks") {
      return this.json(res, { keys: [this.publicJwk] });
    }

    if (url.pathname === "/authorize" && req.method === "GET") {
      const state = url.searchParams.get("state");
      const nonce = url.searchParams.get("nonce");
      const redirectUri = url.searchParams.get("redirect_uri");
      if (!state || !nonce || !redirectUri) {
        res.statusCode = 400;
        res.end("missing params");
        return;
      }
      const code = `mock-code-${state}`;
      this.pending.set(code, { nonce, redirectUri });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      res.statusCode = 302;
      res.setHeader("location", target.toString());
      res.end();
      return;
    }

    if (url.pathname === "/token" && req.method === "POST") {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const code = params.get("code");
      if (!code) {
        res.statusCode = 400;
        res.end("missing code");
        return;
      }
      const pending = this.pending.get(code);
      if (!pending) {
        res.statusCode = 400;
        res.end("invalid code");
        return;
      }
      this.pending.delete(code);
      const idToken = await new SignJWT({
        sub: "oidc-subject-1",
        email: "oidc@test.local",
        name: "OIDC User",
        preferred_username: "oidcuser",
        nonce: pending.nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: "mock-key" })
        .setIssuer(this.issuerUrl)
        .setAudience(this.options.clientId)
        .setSubject("oidc-subject-1")
        .setExpirationTime("2h")
        .setIssuedAt()
        .sign(this.privateKey);

      return this.json(res, {
        access_token: "mock-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idToken,
      });
    }

    if (url.pathname === "/userinfo" && req.method === "GET") {
      return this.json(res, {
        sub: "oidc-subject-1",
        email: "oidc@test.local",
        name: "OIDC User",
        preferred_username: "oidcuser",
      });
    }

    if (url.pathname === "/evil-redirect" && req.method === "GET") {
      res.statusCode = 302;
      res.setHeader("location", "https://evil.example.com/");
      res.end();
      return;
    }

    if (url.pathname === "/discovery-redirect" && req.method === "GET") {
      res.statusCode = 302;
      res.setHeader("location", "https://evil.example.com/.well-known/openid-configuration");
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  }

  private json(res: http.ServerResponse, data: unknown): void {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
