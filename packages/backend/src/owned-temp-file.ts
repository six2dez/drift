export type OwnedTempFileInput = {
  owners: Set<string>;
  finalPath: string;
  stagingPath: string;
  writeStaged: (stagingPath: string) => Promise<void>;
  promote: (stagingPath: string, finalPath: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
};

export type OwnedPathCleanupInput = {
  owners: Set<string>;
  remove: (path: string) => Promise<void>;
};

export async function writeOwnedTempFile(
  _input: OwnedTempFileInput,
): Promise<string> {
  throw new Error("owned temporary-file state machine is not implemented");
}

export async function cleanupOwnedPaths(
  _input: OwnedPathCleanupInput,
): Promise<void> {
  throw new Error("owned path cleanup is not implemented");
}
