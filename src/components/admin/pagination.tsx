import Link from "next/link";
export function AdminPagination({
  base,
  page,
  total,
  filters,
}: {
  base: string;
  page: number;
  total: number;
  filters: Record<string, string>;
}) {
  const href = (next: number) =>
    `${base}?${new URLSearchParams({ ...filters, page: String(next) })}`;
  return (
    <nav
      aria-label="Administration pagination"
      className="flex flex-wrap items-center gap-4 text-sm"
    >
      <p>
        {total} results · Page {page} of {Math.max(1, Math.ceil(total / 20))}
      </p>
      {page > 1 && (
        <Link className="text-primary underline" href={href(page - 1)}>
          Previous
        </Link>
      )}
      {page * 20 < total && (
        <Link className="text-primary underline" href={href(page + 1)}>
          Next
        </Link>
      )}
    </nav>
  );
}
