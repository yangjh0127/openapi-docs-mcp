import type { DiagnosticCode, OpenApiDiagnostic } from "../types.js";

interface DiagnosticGroup {
  code: DiagnosticCode;
  count: number;
  paths: string[];
}

export function formatDiagnosticSummary(
  diagnostics: OpenApiDiagnostic[],
  sampleLimit = 5,
): string[] {
  const limit = Number.isFinite(sampleLimit)
    ? Math.max(0, Math.floor(sampleLimit))
    : 0;
  const groups = new Map<DiagnosticCode, DiagnosticGroup>();

  for (const diagnostic of diagnostics) {
    const group = groups.get(diagnostic.code) ?? {
      code: diagnostic.code,
      count: 0,
      paths: [],
    };
    group.count += 1;
    if (group.paths.length < limit) group.paths.push(diagnostic.path || "document");
    groups.set(diagnostic.code, group);
  }

  return [...groups.values()].map((group) => {
    const examples = group.paths.length
      ? `; examples: ${group.paths.join(", ")}`
      : "";
    return `OpenAPI diagnostic ${group.code} (${group.count})${examples}`;
  });
}
