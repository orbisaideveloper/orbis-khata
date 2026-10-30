export type ExpenseCatalog = {
  categories: string[];
  subcategories: Record<string, string[]>;
  payees: string[];
};
export const emptyCatalog = (): ExpenseCatalog => ({
  categories: [],
  subcategories: {},
  payees: [],
});
const key = (owner: string, company: string) =>
  `khata-expense-names-v1:${owner}:${company}`;
export function readExpenseCatalog(
  owner: string,
  company: string,
): ExpenseCatalog {
  try {
    const raw = JSON.parse(localStorage.getItem(key(owner, company)) ?? "null");
    const names=(value:unknown):value is string[]=>Array.isArray(value)&&value.length<=1000&&value.every(name=>typeof name==='string'&&name.length<=120);
    if(raw && names(raw.categories) && names(raw.payees) && raw.subcategories && !Array.isArray(raw.subcategories) && typeof raw.subcategories==='object' && Object.values(raw.subcategories).every(names))return raw;
  } catch {
    /* Stored suggestions are optional; financial data lives in the journal. */
  }
  return emptyCatalog();
}
export function writeExpenseCatalog(
  owner: string,
  company: string,
  catalog: ExpenseCatalog,
) {
  try {
    localStorage.setItem(key(owner, company), JSON.stringify(catalog));
  } catch {
    /* The expense save remains available when suggestion storage is full. */
  }
}
