import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  orderConfirmedEmailOptionalPreviewFixtures,
  orderConfirmedEmailPreviewFixtures,
} from "../src/modules/notifications/gateway/order-confirmed-email.preview";
import { renderOrderConfirmedEmail } from "../src/modules/notifications/gateway/order-confirmed.email";

const outputDirectory = path.join(os.tmpdir(), "novotech-order-confirmation-email-previews");
const fixtures = {
  ru: orderConfirmedEmailPreviewFixtures.ru,
  ro: orderConfirmedEmailPreviewFixtures.ro,
  "ru-no-name": orderConfirmedEmailOptionalPreviewFixtures.noName,
  "ru-no-manager": orderConfirmedEmailOptionalPreviewFixtures.noManager,
  "ru-no-confirmed-shipment": orderConfirmedEmailOptionalPreviewFixtures.noConfirmedShipment,
  "ru-no-payment": orderConfirmedEmailOptionalPreviewFixtures.noPaymentSchedule,
};

async function main(): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true });
  const results = await Promise.all(Object.entries(fixtures).map(async ([name, payload]) => {
    const message = renderOrderConfirmedEmail(
      payload,
      "preview@example.com",
      "https://www.nsd.md",
      2,
    );
    const filePath = path.join(outputDirectory, `order-confirmed-${name}.html`);
    await fs.writeFile(filePath, message.html, "utf8");
    return {
      name,
      subject: message.subject,
      filePath,
      htmlBytes: Buffer.byteLength(message.html, "utf8"),
      textBytes: Buffer.byteLength(message.text, "utf8"),
    };
  }));

  process.stdout.write(`${JSON.stringify({ outputDirectory, previews: results }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Preview rendering failed."}\n`);
  process.exitCode = 1;
});
