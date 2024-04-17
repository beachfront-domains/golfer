


/// import

import { ensureDir, ensureFile } from "https://deno.land/std/fs/mod.ts";
import { Hono, validator } from "https://deno.land/x/hono@v4.2.4/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";

import {
  bearerAuth,
  prettyJSON,
  secureHeaders,
  trimTrailingSlash
} from "https://deno.land/x/hono/middleware.ts";

/// npm

import { default as dedent } from "npm:dedent@1.5.1";
import * as x509 from "npm:@peculiar/x509";

/// util

const app = new Hono({ strict: true });
const env = await load();
const inProduction = Deno.args.includes("production");
const token = env["TOKEN"];

const certificateAlgorithm = {
  hash: "SHA-256",
  modulusLength: 2048,
  name: "RSASSA-PKCS1-v1_5",
  publicExponent: new Uint8Array([1, 0, 1])
};



/// program

app.use(secureHeaders());
app.use(trimTrailingSlash());
app.use(prettyJSON());

app.get("/", context => context.redirect("/api"));
app.get("/api", context => context.json({ message: "Every Caddy needs a Golfer" }, 200));

app.post("/api",
  bearerAuth({ token }),
  validator("json", (value, context) => {
    const domain = value["domain"];
    const ip = value["ip"];

    if (!domain || !ip)
      return context.json({ message: "Missing data!" }, 400);

    if (typeof domain !== "string" || typeof ip !== "string")
      return context.json({ message: "Weird data!" }, 400);

    // TODO
    // : validate `domain` and `ip`
    //   : detect IPv4 or IPv6 and validate accordingly

    return { domain, ip };
  }),
  async(context) => {
    const { domain, ip } = await context.req.json();

    const certDirectory = inProduction ?
      "/opt/certificates" :
      "dist";

    const certFile = `${certDirectory}/${domain}/${domain}.crt`;
    const keyFile = `${certDirectory}/${domain}/${domain}.key`;
    const keys = await crypto.subtle.generateKey(certificateAlgorithm, true, ["sign", "verify"]);

    ///
    /// CREATE CERTIFICATE
    ///

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      extensions: [
        new x509.BasicConstraintsExtension(false, 0, false),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.digitalSignature |
          x509.KeyUsageFlags.nonRepudiation |
          x509.KeyUsageFlags.keyEncipherment |
          x509.KeyUsageFlags.dataEncipherment,
          false
        ),
        new x509.SubjectAlternativeNameExtension([
          { type: "dns", value: domain },
          { type: "dns", value: `*.${domain}` },
          { type: "ip", value: ip }
        ], false)
      ],
      keys,
      name: `CN=${domain}`,
      notBefore: new Date(getYesterdayDate()),
      notAfter: new Date(getNextYearDate()),
      serialNumber: generateSerial(18),
      signingAlgorithm: certificateAlgorithm
    });

    await ensureFile(certFile);
    await Deno.writeTextFile(certFile, cert.toString("pem"));

    console.info(`WRITE | ${certFile}`);

    ///
    /// CREATE KEY
    ///

    /// export private key to PKCS #8 format
    const exportKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
    /// convert ArrayBuffer to Uint8Array
    const exportKeyAsString = new Uint8Array(exportKey);
    /// convert Uint8Array to base64-encoded string
    const exportKeyAsBase64 = btoa(String.fromCharCode(...exportKeyAsString));
    /// add headers for PEM format
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${formatTextToWidth(exportKeyAsBase64, 64)}\n-----END PRIVATE KEY-----`;

    await ensureFile(keyFile);
    await Deno.writeTextFile(keyFile, privateKeyPEM);

    console.info(`WRITE | ${keyFile}`);

    ///
    /// CREATE CADDY CONFIG
    ///

    const configFile = inProduction ?
      `/etc/caddy/sld/${domain}` :
      `dist/${domain}/${domain}`;

    await ensureFile(configFile);

    const configContent = dedent`
      ${domain} {
        encode gzip

        file_server {
          browse /etc/caddy/template/park.html
        }

        tls ${certFile} ${keyFile}
      }
    `;

    await Deno.writeTextFile(configFile, configContent);
    console.info(`WRITE | ${configFile}`);

    ///
    /// RELOAD CADDY
    ///

    const command = new Deno.Command("service", { args: ["caddy", "reload"] });
    const { code, stderr, stdout } = await command.output();

    if (code === 0)
      console.log(new TextDecoder().decode(stdout));
    else
      console.log(new TextDecoder().decode(stderr));

    ///
    /// FINISH
    ///

    console.info(`DONE  | ${domain}\n`);
    return context.json({ message: `Created cert and placeholder site for ${domain}!` }, 201);
  }
);

Deno.serve({ port: 3699 }, app.fetch);



/// helper

function formatTextToWidth(text: string, width: number): string {
  let currentLine = "";
  let formattedText = "";

  for (let i = 0; i < text.length; i++) {
    currentLine += text[i];

    if (currentLine.length === width) {
      formattedText += currentLine + "\n";
      currentLine = "";
    } else if (i === text.length - 1) {
      formattedText += currentLine;
    }
  }

  return formattedText;
}

function generateSerial(length: number): string {
  let serial = "";

  for (let i = 0; i < length; i++) {
    /// generate a random byte (0 - 255)
    const byte = Math.floor(Math.random() * 256);

    /// convert the byte to a hexadecimal string and add it to the serial number
    serial += byte.toString(16).padStart(2, "0").toUpperCase();

    /// optionally add a space for readability
    if ((i + 1) % 2 === 0 && i < length - 1)
      serial += " ";
  }

  return serial;
}

function getNextYearDate(): string {
  const today = new Date();
  const nextYear = new Date(today);

  nextYear.setFullYear(today.getFullYear() + 1);

  const year = nextYear.getFullYear();
  const month = String(nextYear.getMonth() + 1).padStart(2, "0");
  const day = String(nextYear.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function getYesterdayDate(): string {
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}
