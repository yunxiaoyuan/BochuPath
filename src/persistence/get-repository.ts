import { usesSharedJsonRepository } from "../app/runtime";
import { LocalStorageDiagramRepository } from "./local-storage";
import { PageDropDiagramRepository } from "./pagedrop";
import type { DiagramRepository } from "./repository";

let singleton: DiagramRepository | undefined;

export function getRepository(): DiagramRepository {
  singleton ??= usesSharedJsonRepository()
    ? new PageDropDiagramRepository()
    : new LocalStorageDiagramRepository();
  return singleton;
}
