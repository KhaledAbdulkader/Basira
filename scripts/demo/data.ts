import { addDays } from "../../src/lib/dashboard/period";
import { parseDate } from "../../src/lib/records/dates";
import { calculateSaleTotal } from "../../src/lib/records/money";
import { dateSchema } from "../../src/lib/validation/records";

export const DEMO_EMAIL = "demo@basira.example";
export const DEMO_USER_ID = "basira-demo-v1-owner";
export const DEMO_TIMEZONE = "Asia/Riyadh";

const recipes = [
  {
    key: "cafe",
    name: "Olive & Oak Cafe (Demo)",
    businessType: "CAFE" as const,
    location: "Riyadh, Saudi Arabia — fictional demonstration",
    days: 210,
    products: [
      {
        name: "Espresso",
        type: "PRODUCT" as const,
        category: "Coffee",
        sellingPrice: "10",
        costPrice: "2.4",
      },
      {
        name: "Cappuccino",
        type: "PRODUCT" as const,
        category: "Coffee",
        sellingPrice: "16",
        costPrice: "5.2",
      },
      {
        name: "Iced latte",
        type: "PRODUCT" as const,
        category: "Coffee",
        sellingPrice: "18",
        costPrice: "6",
      },
      {
        name: "Pistachio pastry",
        type: "PRODUCT" as const,
        category: "Bakery",
        sellingPrice: "14",
        costPrice: "5.5",
      },
      {
        name: "Breakfast sandwich",
        type: "PRODUCT" as const,
        category: "Food",
        sellingPrice: "24",
        costPrice: "9",
      },
      {
        name: "Coffee beans 250g",
        type: "PRODUCT" as const,
        category: "Retail",
        sellingPrice: "42",
        costPrice: "23",
      },
    ],
    feedback: [
      "The cappuccino was smooth and the staff were welcoming.",
      "Coffee arrived cold during the morning rush.",
      "More dairy-free options would be helpful.",
      "The pastry was fresh; I will visit again.",
      "انتظرت الطلب مدة طويلة، لكن القهوة كانت جيدة.",
      "Quiet tables and reliable Wi-Fi made it a good place to study.",
    ],
  },
  {
    key: "studio",
    name: "Clearline Design Studio (Demo)",
    businessType: "PROFESSIONAL_SERVICES" as const,
    location: "Riyadh, Saudi Arabia — fictional demonstration",
    days: 21,
    products: [
      {
        name: "Design consultation",
        type: "SERVICE" as const,
        category: "Consulting",
        sellingPrice: "180",
        costPrice: null,
      },
      {
        name: "Social media design pack",
        type: "SERVICE" as const,
        category: "Design",
        sellingPrice: "450",
        costPrice: "160",
      },
      {
        name: "Brand identity workshop",
        type: "SERVICE" as const,
        category: "Branding",
        sellingPrice: "750",
        costPrice: "280",
      },
    ],
    feedback: [
      "The design brief was understood immediately.",
      "I would appreciate more progress updates.",
      "The final assets were clear and easy to use.",
      "Delivery took a day longer than expected.",
    ],
  },
] as const;

// Fixed arithmetic and calendar patterns: identical end dates give identical data.
export function buildDemoData(endDate: string) {
  dateSchema.parse(endDate);
  return recipes.map((recipe) => {
    const sales: {
      saleDate: Date;
      productIndex: number;
      quantity: string;
      unitPrice: string;
      unitCost: string | null;
      totalAmount: string;
      note: string;
    }[] = [];
    const expenses: {
      expenseDate: Date;
      categoryName: string;
      amount: string;
      description: string;
    }[] = [];
    const customers: { metricDate: Date; customerCount: number }[] = [];
    const feedback: { feedbackDate: Date; feedbackText: string }[] = [];
    const start = addDays(endDate, 1 - recipe.days);
    for (let day = 0; day < recipe.days; day++) {
      const date = parseDate(addDays(start, day));
      const weekday = date.getUTCDay();
      const recent = day >= recipe.days - 30;
      const cafe = recipe.key === "cafe";
      const count = cafe
        ? Math.floor(
            (34 +
              Math.floor(day / 60) +
              (weekday === 5 || weekday === 6 ? 10 : 0) +
              (day % 5)) *
              (recent ? 0.58 : 1),
          )
        : weekday === 0
          ? 0
          : 2 + (day % 3);
      for (let index = 0; index < count; index++) {
        const productIndex = (day * 7 + index * 5) % recipe.products.length;
        const product = recipe.products[productIndex]!;
        const quantity = String(cafe && index % 6 === 0 ? 2 : 1);
        sales.push({
          saleDate: date,
          productIndex,
          quantity,
          unitPrice: product.sellingPrice,
          unitCost: cafe && (day + index) % 23 === 0 ? null : product.costPrice,
          totalAmount: calculateSaleTotal(
            quantity,
            product.sellingPrice,
            "SAR",
          ).toFixed(),
          note: "Synthetic demo: one complete transaction for one item.",
        });
      }
      customers.push({
        metricDate: date,
        customerCount: count + (count > 0 ? day % 7 : 0),
      });
      const spend = (categoryName: string, amount: string, detail: string) =>
        expenses.push({
          expenseDate: date,
          categoryName,
          amount,
          description: `Synthetic demo: ${detail}`,
        });
      if (cafe) {
        spend("Salaries", "120", "daily casual staff payment");
        spend(
          "Supplies",
          String(18 + (day % 6)),
          "cleaning and serving supplies",
        );
        if (weekday === 1)
          spend(
            "Inventory",
            "620",
            "coffee and food stock purchase; excluded from operating profit",
          );
        if (weekday === 3)
          spend("Marketing", recent ? "480" : "120", "weekly local promotion");
        if (date.getUTCDate() === 1)
          spend("Rent", "3200", "monthly premises rent");
        if (date.getUTCDate() === 15)
          spend("Utilities", recent ? "620" : "340", "monthly utility bill");
      } else if (count > 0) {
        spend("Supplies", "45", "project software and materials");
        if (weekday === 2)
          spend("Marketing", "180", "client acquisition campaign");
      }
      if (day % 30 === 0)
        spend("Other", "85", "miscellaneous spending, separately disclosed");
      if (day % (cafe ? 4 : 3) === 0)
        feedback.push({
          feedbackDate: date,
          feedbackText: `[Synthetic demo] ${recipe.feedback[Math.floor(day / (cafe ? 4 : 3)) % recipe.feedback.length]}`,
        });
    }
    return {
      ...recipe,
      start,
      end: endDate,
      sales,
      expenses,
      customers,
      feedback,
    };
  });
}
