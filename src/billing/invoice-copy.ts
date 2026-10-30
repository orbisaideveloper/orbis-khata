import type { Language } from "../i18n";
// One field definition holds Bengali, English and Hindi text in that order.
const labels = {
  memo: ["মেমো / বিল", "Memo / Bill", "मेमो / बिल"],
  subtotal: ["সাবটোটাল", "Subtotal", "उप-योग"],
  previous: [
    "আগের ব্যালেন্স (B/F)",
    "Previous balance (B/F)",
    "पुराना बैलेंस (B/F)",
  ],
  totalQuantity: ["মোট পরিমাণ", "Total quantity", "कुल मात्रा"],
  partySignature: [
    "পার্টির স্বাক্ষর",
    "Party signature",
    "पार्टी के हस्ताक्षर",
  ],
  authorizedSignature: [
    "অনুমোদিত স্বাক্ষর",
    "Authorized signature",
    "अधिकृत हस्ताक्षर",
  ],
  thanks: ["ধন্যবাদ", "Thank you", "धन्यवाद"],
  creditBalance: ["অবশিষ্ট অ্যাডভান্স", "Advance remaining", "शेष एडवांस"],
  sale: ["বিক্রয় বিল", "Sales invoice", "बिक्री बिल"],
  purchase: ["ক্রয় বিল", "Purchase invoice", "खरीद बिल"],
  expense: ["খরচের বিল", "Expense bill", "खर्च बिल"],
  number: ["বিল নম্বর", "Bill number", "बिल नंबर"],
  date: ["তারিখ", "Date", "तारीख"],
  party: ["পার্টি", "Party", "पार्टी"],
  choose: ["বেছে নিন", "Choose", "चुनें"],
  serial: ["নং", "No.", "क्रम"],
  item: ["আইটেমের নাম", "Item name", "आइटम नाम"],
  description: ["বিবরণ", "Description", "विवरण"],
  quantity: ["পরিমাণ", "Quantity", "मात्रा"],
  unit: ["ইউনিট", "Unit", "यूनिट"],
  rate: ["দর", "Rate", "दर"],
  amount: ["টাকা", "Amount", "रकम"],
  total: ["সর্বমোট", "Grand total", "कुल योग"],
  add: ["রো যোগ করুন", "Add row", "पंक्ति जोड़ें"],
  remove: ["সরান", "Remove", "हटाएँ"],
  review: ["বিল যাচাই", "Review bill", "बिल जाँचें"],
  confirm: ["নিশ্চিত করে সংরক্ষণ", "Confirm & save", "पुष्टि और सहेजें"],
  edit: ["বিলে ফিরুন", "Back to bill", "बिल पर लौटें"],
  cancel: ["ফিরে যান", "Back", "वापस"],
  notes: ["নোট", "Notes", "नोट"],
  warehouse: ["গোডাউন", "Godown", "गोदाम"],
  saved: ["বিল সংরক্ষণ হয়েছে।", "Bill saved.", "बिल सहेजा गया।"],
  invalid: [
    "পার্টি, আইটেম, পরিমাণ ও দর পরীক্ষা করুন।",
    "Check party, items, quantities and rates.",
    "पार्टी, आइटम, मात्रा और दर जाँचें।",
  ],
  stock: [
    "এই গোডাউনে পর্যাপ্ত স্টক নেই।",
    "Insufficient stock in this godown.",
    "इस गोदाम में पर्याप्त स्टॉक नहीं है।",
  ],
  due: [
    "এই বিলের টাকা বাকি হিসাবে থাকবে।",
    "This bill remains due until a separate payment is recorded.",
    "अलग भुगतान दर्ज करने तक यह बिल बकाया रहेगा।",
  ],
  method: ["পরিশোধ", "Payment", "भुगतान"],
  unpaid: ["বাকি", "Unpaid", "बकाया"],
  cash: ["নগদ", "Cash", "नकद"],
  bank: ["ব্যাংক", "Bank", "बैंक"],
  print: ["বিল প্রিন্ট", "Print bill", "बिल प्रिंट"],
  newBill: ["নতুন বিল", "New bill", "नया बिल"],
  noParty: [
    "আগে এই ধরনের পার্টি যোগ করুন।",
    "Add a party of this category first.",
    "पहले इस श्रेणी की पार्टी जोड़ें।",
  ],
  category: ["খরচের খাতা", "Expense account", "खर्च खाता"],
} as const;
export function invoiceCopy(
  language: Language,
): Record<keyof typeof labels, string> {
  const index = { bn: 0, en: 1, hi: 2 }[language];
  return Object.fromEntries(
    Object.entries(labels).map(([key, values]) => [key, values[index]]),
  ) as Record<keyof typeof labels, string>;
}
