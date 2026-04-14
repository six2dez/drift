// Dedupe key helpers shared by the passive and active scanners.
// Kept in a tiny module so both scanners can reuse the exact same
// normalization without one importing the other.

export function normalizePathTemplate(path: string): string {
  return path
    .split("/")
    .map((segment) => normalizeSegment(segment))
    .join("/");
}

function normalizeSegment(segment: string): string {
  if (segment === "") return segment;
  if (/^\d+$/.test(segment)) return ":id";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ":uuid";
  if (/^[0-9a-f]{32,}$/i.test(segment)) return ":hash";
  return segment;
}

export function buildPassiveDedupeKey(
  method: string,
  host: string,
  pathTemplate: string,
  className: string,
): string {
  return `drift-passive:${method}:${host}:${pathTemplate}:${className}`;
}

export function buildActiveDedupeKey(
  method: string,
  host: string,
  pathTemplate: string,
  className: string,
  injectionPoint: string,
): string {
  return `drift-active:${method}:${host}:${pathTemplate}:${className}:${injectionPoint}`;
}
