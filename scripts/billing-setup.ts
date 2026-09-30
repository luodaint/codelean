import { mkdir, readFile, writeFile } from "node:fs/promises";
import { creemRequest, planDefinition } from "../src/lib/creem";
import { pricing } from "../src/lib/billing-policy";

const live = process.env.CREEM_TEST_MODE === "false";
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify(
      {
        plan: planDefinition("<meter-id>"),
        pack: { price: 500, tokens: 10_000_000 },
        instructions:
          "Use --apply with a test API key. Live setup additionally requires --live and CREEM_TEST_MODE=false.",
      },
      null,
      2,
    ),
  );
} else {
  if (!["true", "false"].includes(process.env.CREEM_TEST_MODE || ""))
    throw new Error(
      "Set CREEM_TEST_MODE explicitly to true or false before setup",
    );
  if (live && !process.argv.includes("--live"))
    throw new Error("Live setup requires --live");
  await mkdir("artifacts", { recursive: true });
  const path = `artifacts/creem-${live ? "live" : "test"}-products.json`;
  let state: { meter?: string; plan?: string; pack?: string } = {};
  try {
    state = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const save = () => writeFile(path, JSON.stringify(state, null, 2) + "\n");
  if (!state.meter) {
    state.meter = (
      await creemRequest<{ id: string }>("/meters", "POST", {
        name: "Codelean additional review tokens",
        event_name: pricing.eventName,
        aggregation: "sum",
        aggregation_property: "tokens",
        unit_label: "tokens",
      })
    ).id;
    await save();
  }
  if (!state.plan) {
    state.plan = (
      await creemRequest<{ id: string }>(
        "/products",
        "POST",
        planDefinition(state.meter),
      )
    ).id;
    await save();
  }
  if (!state.pack) {
    // Payment is fulfilled into Codelean's exact token ledger by the verified
    // checkout webhook. No Creem monetary-wallet feature: avoids double grants.
    state.pack = (
      await creemRequest<{ id: string }>("/products", "POST", {
        name: "Codelean 10M tokens",
        description:
          "10 million additional review tokens. Requires an active Codelean subscription. Unused tokens carry forward.",
        price: 500,
        currency: "USD",
        billing_type: "onetime",
        tax_mode: "exclusive",
        tax_category: "saas",
      })
    ).id;
    await save();
  }
  console.log(
    `CREEM_METER_ID=${state.meter}\nCREEM_PLAN_PRODUCT_ID=${state.plan}\nCREEM_TOKEN_PRODUCT_ID=${state.pack}`,
  );
  console.log(
    "Register /api/webhooks/creem and configure CREEM_WEBHOOK_SECRET. Verify a sandbox renewal invoice before enabling live checkout.",
  );
}
