import { Decimal } from "@/lib/records/money";
import { addDays, type DateRange } from "./period";

export type SaleDay = {
  date: string;
  revenue: string;
  cogs: string;
  transactions: number;
  costKnown: number;
};
export type ExpenseDay = {
  date: string;
  operating: string;
  inventory: string;
  other: string;
};
export type CustomerDay = { date: string; visits: number };
export type DailyData = {
  sales: SaleDay[];
  expenses: ExpenseDay[];
  customers: CustomerDay[];
};
export type Metrics = ReturnType<typeof calculateMetrics>;
const sum = (values: string[]) =>
  values.reduce((total, value) => total.plus(value), new Decimal(0));

export function growth(current: string | number, previous: string | number) {
  const baseline = new Decimal(previous);
  if (baseline.isZero()) return null;
  return new Decimal(current)
    .minus(baseline)
    .dividedBy(baseline.abs())
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

export function calculateMetrics(data: DailyData) {
  const revenue = sum(data.sales.map((row) => row.revenue));
  const cogs = sum(data.sales.map((row) => row.cogs));
  const operating = sum(data.expenses.map((row) => row.operating));
  const inventory = sum(data.expenses.map((row) => row.inventory));
  const other = sum(data.expenses.map((row) => row.other));
  const profit = revenue.minus(cogs).minus(operating);
  const transactions = data.sales.reduce((n, row) => n + row.transactions, 0);
  const costKnown = data.sales.reduce((n, row) => n + row.costKnown, 0);
  const visits = data.customers.reduce((n, row) => n + row.visits, 0);
  const percent = (numerator: string | number, denominator: string | number) =>
    new Decimal(numerator)
      .dividedBy(denominator)
      .times(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
  return {
    revenue: revenue.toFixed(),
    cogs: cogs.toFixed(),
    operating: operating.toFixed(),
    inventory: inventory.toFixed(),
    other: other.toFixed(),
    totalExpenses: operating.plus(inventory).plus(other).toFixed(),
    profit: profit.toFixed(),
    margin: revenue.isZero()
      ? null
      : percent(profit.toFixed(), revenue.toFixed()),
    transactions,
    averageSale: transactions
      ? revenue.dividedBy(transactions).toFixed()
      : null,
    costKnown,
    costMissing: transactions - costKnown,
    costCoverage: transactions ? percent(costKnown, transactions) : null,
    visits,
    customerDays: data.customers.length,
  };
}

export function dataInRange(data: DailyData, range: DateRange): DailyData {
  const within = (row: { date: string }) =>
    row.date >= range.from && row.date <= range.to;
  return {
    sales: data.sales.filter(within),
    expenses: data.expenses.filter(within),
    customers: data.customers.filter(within),
  };
}

export function dailySeries(data: DailyData, range: DateRange) {
  const sales = new Map(data.sales.map((row) => [row.date, row]));
  const expenses = new Map(data.expenses.map((row) => [row.date, row]));
  const customers = new Map(data.customers.map((row) => [row.date, row]));
  return Array.from({ length: range.days }, (_, index) => {
    const date = addDays(range.from, index);
    const sale = sales.get(date);
    const expense = expenses.get(date);
    const customer = customers.get(date);
    return {
      date,
      revenue: sale?.revenue ?? "0",
      operating: expense?.operating ?? "0",
      totalExpenses: new Decimal(expense?.operating ?? 0)
        .plus(expense?.inventory ?? 0)
        .plus(expense?.other ?? 0)
        .toFixed(),
      profit: new Decimal(sale?.revenue ?? 0)
        .minus(sale?.cogs ?? 0)
        .minus(expense?.operating ?? 0)
        .toFixed(),
      visits: customer?.visits ?? null,
      costMissing: (sale?.transactions ?? 0) - (sale?.costKnown ?? 0),
    };
  });
}
