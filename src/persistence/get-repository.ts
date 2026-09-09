import { usesSecureApi, usesSharedJsonRepository } from "../app/runtime";
import { HttpDiagramRepository } from "./http";
import { LocalStorageDiagramRepository } from "./local-storage";
import { PageDropDiagramRepository } from "./pagedrop";
import type { DiagramRepository } from "./repository";

let singleton: DiagramRepository | undefined;

export function getRepository(): DiagramRepository {
  singleton ??= usesSecureApi() ? new HttpDiagramRepository() : usesSharedJsonRepository()
    ? new PageDropDiagramRepository()
    : new LocalStorageDiagramRepository();
  return singleton;
}
