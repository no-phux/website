import { expect, test } from "bun:test";

test("Worker validation retains website history for source-date contracts", async () => {
  const workflow = Bun.YAML.parse(
    await Bun.file(new URL("../.github/workflows/site-deploy-worker.yml", import.meta.url)).text(),
  ) as { jobs: { worker: { steps: { uses?: string; with?: Record<string, unknown>; run?: string }[] } } };
  const steps = workflow.jobs.worker.steps;
  const checkout = steps.find(step => step.uses?.startsWith("actions/checkout@"));
  expect(checkout?.with?.["fetch-depth"]).toBe(0);
  expect(checkout?.with?.["persist-credentials"]).toBe(false);
  expect(steps.some(step => step.run?.includes("bun run test"))).toBe(true);
});
