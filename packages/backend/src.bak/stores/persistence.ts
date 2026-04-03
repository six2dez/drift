import { readFile, writeFile } from "fs/promises";
import path from "path";

export type Persistence = {
  save: (data: unknown) => Promise<void>;
  load: () => Promise<unknown>;
};

export const defaultMergeStrategy = <T>(current: T, loaded: unknown): T => {
  if (Array.isArray(current)) {
    return loaded as T;
  }
  return Object.assign({}, current, loaded);
};

export const createGlobalPersistence = (
  basePath: string,
  filename: string
): Persistence => {
  const getFilePath = () => path.join(basePath, `${filename}.json`);

  return {
    save: async (data) => {
      await writeFile(getFilePath(), JSON.stringify(data, null, 2));
    },
    load: async () => {
      try {
        const fileData = await readFile(getFilePath(), "utf-8");
        return JSON.parse(fileData);
      } catch {
        return undefined;
      }
    },
  };
};
