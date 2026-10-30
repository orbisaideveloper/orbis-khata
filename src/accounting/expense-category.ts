const separator = " › ";
export function expenseCategoryParts(value: string) {
  const [category, ...rest] = value.split(separator);
  return { category, subcategory: rest.join(separator) };
}
export function expenseCategoryName(category: string, subcategory: string) {
  const parts = [category.trim(), subcategory.trim()];
  if (!parts[0] || parts.some((p) => p.includes(separator)))
    throw new Error("INVALID_EXPENSE_CATEGORY");
  const result = parts.filter(Boolean).join(separator);
  if (result.length > 80) throw new Error("INVALID_EXPENSE_CATEGORY");
  return result;
}
export function isExpenseCategory(value: string, category: string) {
  return value === category || value.startsWith(category + separator);
}
