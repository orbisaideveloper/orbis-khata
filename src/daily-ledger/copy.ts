import type { Language } from '../i18n'

const labels = {
  title: ['দৈনিক হিসাব', 'दैनिक हिसाब', 'Daily Ledger'],
  income: ['টাকা পেলাম', 'पैसे मिले', 'Money received'],
  expense: ['টাকা দিলাম', 'पैसे दिए', 'Money paid'],
  transfer: ['নিজের হিসাবে স্থানান্তর', 'अपने खातों में ट्रांसफ़र', 'Transfer between my accounts'],
  reversal: ['উল্টো এন্ট্রি দিন', 'उलटी प्रविष्टि करें', 'Reverse entry'],
  reversed: ['উল্টো এন্ট্রি', 'उलटी प्रविष्टि', 'Reversal'],
  balance: ['নগদ ও ব্যাংকে মোট', 'नकद और बैंक में कुल', 'Total cash and bank'],
  todayIn: ['আজকের আয়', 'आज की आय', 'Income today'],
  todayOut: ['আজকের খরচ', 'आज का खर्च', 'Expenses today'],
  monthIn: ['মাসের আয়', 'महीने की आय', 'Income this month'],
  monthOut: ['মাসের খরচ', 'महीने का खर्च', 'Expenses this month'],
  cash: ['নগদ', 'नकद', 'Cash'],
  bank: ['ব্যাংক', 'बैंक', 'Bank'],
  amount: ['টাকার পরিমাণ', 'राशि', 'Amount'],
  account: ['হিসাব', 'खाता', 'Account'],
  date: ['তারিখ', 'तारीख़', 'Date'],
  note: ['বিবরণ (ঐচ্ছিক)', 'विवरण (वैकल्पिक)', 'Note (optional)'],
  save: ['সেভ করুন', 'सहेजें', 'Save'],
  cancel: ['বাতিল', 'रद्द करें', 'Cancel'],
  saved: ['এই ফোনে সেভ হয়েছে', 'इस फ़ोन पर सहेजा गया', 'Saved on this phone'],
  loading: ['হিসাব খুলছে…', 'हिसाब खुल रहा है…', 'Opening ledger…'],
  retry: ['আবার চেষ্টা করুন', 'फिर कोशिश करें', 'Try again'],
  failed: ['হিসাব খোলা যায়নি।', 'हिसाब नहीं खुला।', 'Could not open the ledger.'],
  saveFailed: ['সেভ নিশ্চিত করা যায়নি। একই এন্ট্রি আবার চেষ্টা করুন।', 'सहेजने की पुष्टि नहीं हुई। इसी प्रविष्टि को फिर आज़माएँ।', 'Save could not be confirmed. Retry this entry.'],
  invalid: ['টাকার পরিমাণ ও তারিখ পরীক্ষা করুন।', 'राशि और तारीख़ जाँचें।', 'Check the amount and date.'],
  history: ['লেনদেনের ইতিহাস', 'लेन-देन का इतिहास', 'Transaction history'],
  search: ['বিবরণ বা তারিখ খুঁজুন', 'विवरण या तारीख़ खोजें', 'Search notes or dates'],
  empty: ['কোনো লেনদেন পাওয়া যায়নি।', 'कोई लेन-देन नहीं मिला।', 'No transactions found.'],
  more: ['আরও দেখুন', 'और देखें', 'Show more'],
  from: ['যে হিসাব থেকে', 'जिस खाते से', 'From account'],
  to: ['যে হিসাবে যাবে', 'जिस खाते में', 'To account'],
  confirm: ['উল্টো এন্ট্রি হলে টাকা ফেরত হিসাবে ধরা হবে। মূল এন্ট্রি থাকবে।', 'विपरीत राशि दर्ज होगी। मूल प्रविष्टि बनी रहेगी।', 'A compensating entry will be recorded. The original stays in history.'],
  backup: ['দৈনিক হিসাব শুধু এই ফোনে আছে। বর্তমান Drive ব্যাকআপে এটি যাবে না।', 'दैनिक हिसाब इस फ़ोन पर है। यह मौजूदा Drive बैकअप में शामिल नहीं है।', 'Daily Ledger is stored on this phone. It is excluded from the current Drive backup.'],
  back: ['খাতায় ফিরুন', 'खाता में लौटें', 'Back to Khata'],
  budget: ['মাসের বাজেট', 'महीने का बजट', 'Monthly budget'],
  plan: ['বাজেট ঠিক করুন', 'बजट तय करें', 'Set budget'],
  category: ['খরচের ধরন', 'खर्च की श्रेणी', 'Expense category'],
  food: ['খাবার', 'खाना', 'Food'],
  home: ['বাড়ি', 'घर', 'Home'],
  travel: ['যাতায়াত', 'आना-जाना', 'Travel'],
  other: ['অন্যান্য', 'अन्य', 'Other'],
  spent: ['খরচ হয়েছে', 'खर्च हुआ', 'Spent'],
  planned: ['বরাদ্দ', 'आवंटन', 'Planned'],
  remaining: ['বাকি বাজেট', 'बचा बजट', 'Budget remaining'],
  over: ['বাজেট ছাড়িয়েছে', 'बजट से अधिक', 'Over budget'],
  previous: ['গত মাসের খরচ', 'पिछले महीने का खर्च', 'Spent last month'],
} as const

export type LedgerKey = keyof typeof labels
export const locale = { bn: 'bn-IN', hi: 'hi-IN', en: 'en-IN' }
export const label = (language: Language, key: LedgerKey) => labels[key][language === 'bn' ? 0 : language === 'hi' ? 1 : 2]

export function displayAmount(amount: bigint, language: Language) {
  const absolute = amount < 0n ? -amount : amount
  const numberingSystem = language === 'hi' ? 'deva' : undefined
  const format = new Intl.NumberFormat(locale[language], { style: 'currency', currency: 'INR', numberingSystem })
  const decimal = new Intl.NumberFormat(locale[language], { minimumIntegerDigits: 2, useGrouping: false, numberingSystem })
  return (amount < 0n ? '−' : '') + format.formatToParts(absolute / 100n)
    .map(part => part.type === 'fraction' ? decimal.format(absolute % 100n) : part.value).join('')
}
