import type {
  AdminAccessInspection,
  AdminAccessSubject,
} from "../types";

export interface AdminAccessRepository {
  listSubjects(search: string): Promise<AdminAccessSubject[]>;
  inspect(
    userId: string,
    companyId: string | null,
  ): Promise<AdminAccessInspection | null>;
}
