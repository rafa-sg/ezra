import test from "node:test";
import assert from "node:assert/strict";
import {
  codeChallenge,
  createSession,
  randomToken,
  readSession,
  sign,
  verify,
} from "../src/lib/auth";

const secret = "s".repeat(40);

test("la sesión firmada se acepta solo con el secreto, el correo permitido y sin caducar", async () => {
  process.env.AUTH_SECRET = secret;
  process.env.AUTH_ALLOWED_EMAILS = "Dueno@Example.com, otra@example.com";
  const token = await createSession({ email: "otra@example.com", name: "Otra" }, secret);
  assert.deepEqual(await readSession(token), { email: "otra@example.com", name: "Otra" });
  // Tampering with the body or the signature, a wrong secret and garbage are all rejected.
  const [body, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ email: "otra@example.com", name: "X", exp: 9_999_999_999 }),
  ).toString("base64url");
  assert.equal(await readSession(`${forged}.${signature}`), null);
  assert.equal(await readSession(`${body}.${signature.slice(0, -2)}AA`), null);
  assert.equal(await readSession(`${token}.extra`), null);
  assert.equal(await readSession("basura"), null);
  assert.equal(await readSession(undefined), null);
  process.env.AUTH_SECRET = "t".repeat(40);
  assert.equal(await readSession(token), null);
  process.env.AUTH_SECRET = secret;
  // Expired session.
  const expired = await sign({ email: "otra@example.com", name: "Otra", exp: 1 }, secret);
  assert.equal(await readSession(expired), null);
  // Removing an address from the allow-list ends its session.
  process.env.AUTH_ALLOWED_EMAILS = "dueno@example.com";
  assert.equal(await readSession(token), null);
});

test("verify rechaza una firma de otro secreto y PKCE usa S256 sin relleno", async () => {
  const token = await sign({ exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.ok(await verify(token, secret));
  assert.equal(await verify(token, "x".repeat(40)), null);
  // RFC 7636 appendix B test vector.
  assert.equal(
    await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  assert.notEqual(randomToken(), randomToken());
});
