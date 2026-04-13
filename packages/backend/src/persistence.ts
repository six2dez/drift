export type PersistenceDbHandle = {
  execute(sql: string): Promise<void>;
  query(sql: string): Promise<unknown[]>;
};

export function getPersistenceDbHandle(raw: unknown): PersistenceDbHandle | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Partial<PersistenceDbHandle>;
  if (typeof candidate.execute !== "function" || typeof candidate.query !== "function") {
    return undefined;
  }
  return candidate as PersistenceDbHandle;
}
