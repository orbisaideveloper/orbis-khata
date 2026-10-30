export type LotteryDashboardPeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "custom";
function shift(day: string, days: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function lotteryDashboardBounds(
  period: LotteryDashboardPeriod,
  today: string,
  from: string,
  to: string,
) {
  if (period === "today") return { from: today, to: today };
  if (period === "yesterday") {
    const date = shift(today, -1);
    return { from: date, to: date };
  }
  if (period === "week") {
    const monday = shift(
      today,
      -((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7),
    );
    return { from: monday, to: shift(monday, 6) };
  }
  if (period === "month") return { from: today.slice(0, 7) + "-01", to: today };
  const start = from || today;
  return { from: start, to: to >= start ? to : start };
}
