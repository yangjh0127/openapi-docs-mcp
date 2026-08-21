import { expect, it } from "vitest";
import { formatDiagnosticSummary } from "../src/openapi/diagnostics.js";

it("groups diagnostics and bounds example locations", () => {
  expect(
    formatDiagnosticSummary(
      [
        {
          severity: "repair",
          code: "ref_repaired",
          path: "/a",
          message: "fixed",
        },
        {
          severity: "repair",
          code: "ref_repaired",
          path: "/b",
          message: "fixed",
        },
        {
          severity: "repair",
          code: "ref_repaired",
          path: "/c",
          message: "fixed",
        },
        {
          severity: "skipped",
          code: "operation_skipped",
          path: "/d",
          message: "skipped",
        },
      ],
      2,
    ),
  ).toEqual([
    "OpenAPI diagnostic ref_repaired (3); examples: /a, /b",
    "OpenAPI diagnostic operation_skipped (1); examples: /d",
  ]);
});

it("handles an empty list and clamps invalid sample limits", () => {
  expect(formatDiagnosticSummary([])).toEqual([]);
  expect(
    formatDiagnosticSummary(
      [
        {
          severity: "warning",
          code: "ref_unresolved",
          path: "/missing",
          message: "missing",
        },
      ],
      Number.NaN,
    ),
  ).toEqual(["OpenAPI diagnostic ref_unresolved (1)"]);
});
