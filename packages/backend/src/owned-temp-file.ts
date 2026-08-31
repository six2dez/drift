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

async function removeOwnedPath(input: {
  owners: Set<string>;
  path: string;
  remove: (path: string) => Promise<void>;
}): Promise<void> {
  try {
    await input.remove(input.path);
    // Delete only after the filesystem owner confirms removal. A rejection
    // retains the exact path for the next cleanup attempt (T-08-92).
    input.owners.delete(input.path);
  } catch {
    // The caller owns diagnostics. This state machine preserves ownership and
    // never exposes the path, config bytes, or the original error message.
  }
}

export async function writeOwnedTempFile(
  input: OwnedTempFileInput,
): Promise<string> {
  // Both paths can carry credentials. Establish ownership synchronously before
  // the first injected filesystem operation can yield or fail (T-08-91).
  input.owners.add(input.finalPath);
  input.owners.add(input.stagingPath);

  try {
    await input.writeStaged(input.stagingPath);
    await input.promote(input.stagingPath, input.finalPath);
    input.owners.delete(input.stagingPath);
    return input.finalPath;
  } catch (error) {
    // A failed write can leave partial staging bytes; a failed promotion can
    // leave either pathname behind. Best-effort both, but retain every path
    // whose removal is not confirmed and preserve the original operation error.
    await removeOwnedPath({
      owners: input.owners,
      path: input.stagingPath,
      remove: input.remove,
    });
    await removeOwnedPath({
      owners: input.owners,
      path: input.finalPath,
      remove: input.remove,
    });
    throw error;
  }
}

export async function cleanupOwnedPaths(
  input: OwnedPathCleanupInput,
): Promise<void> {
  // Snapshot iteration permits overlapping finalize/finally cleanup calls. No
  // eager clear can translate a failed unlink into an ownerless file.
  for (const path of [...input.owners]) {
    await removeOwnedPath({
      owners: input.owners,
      path,
      remove: input.remove,
    });
  }
}
