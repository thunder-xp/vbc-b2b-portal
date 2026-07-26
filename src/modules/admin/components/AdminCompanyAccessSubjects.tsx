import Link from "next/link";

import type { CompanyUserPage } from "@/src/modules/access-control/types";

export function AdminCompanyAccessSubjects({
  companyId,
  users,
}: {
  companyId: string;
  users: CompanyUserPage;
}) {
  const memberships = users.records.filter(
    (record) => record.recordType === "membership" && record.userId,
  );
  return (
    <section className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="font-semibold">Эффективный доступ</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Выберите пользователя для серверной проверки разрешений в этой компании.
        </p>
      </div>
      {memberships.length ? (
        <div className="divide-y divide-zinc-100">
          {memberships.map((membership) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              key={membership.recordId}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{membership.fullName}</p>
                <p className="truncate text-sm text-zinc-500">
                  {membership.email} · {membership.roleName}
                </p>
              </div>
              <Link
                className="text-sm font-semibold text-emerald-700"
                href={`/admin/access?userId=${membership.userId}&companyId=${companyId}`}
                prefetch={false}
              >
                Проверить доступ
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-8 text-sm text-zinc-500">
          Пользователей компании пока нет.
        </p>
      )}
    </section>
  );
}
