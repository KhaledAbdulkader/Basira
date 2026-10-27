import type { Metadata } from "next";
import {
  RecordsPage,
  type RecordSearchParams,
} from "@/components/records/records-page";
export const metadata: Metadata = { title: "Expense categories" };
export default function Page({
  searchParams,
}: {
  searchParams: RecordSearchParams;
}) {
  return (
    <RecordsPage resource="expense-categories" searchParams={searchParams} />
  );
}
