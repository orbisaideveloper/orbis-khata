import type { Language } from '../i18n';
export const businessReasons = ['PRODUCTION_DISABLED','INVALID_PRODUCTION','INSUFFICIENT_PRODUCTION_STOCK','ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED','PRODUCTION_OUTPUT_CANNOT_BE_INPUT','STOCK_DATE_BEFORE_ACTIVITY', 'INSUFFICIENT_STOCK', 'INVALID_RATE', 'INVALID_AMOUNT', 'INVALID_TOTAL', 'IDEMPOTENCY_CONFLICT', 'PARTY_NOT_ACCESSIBLE', 'STOCK_MASTER_NOT_ACCESSIBLE', 'WRITES_DISABLED', 'FUTURE_DATE', 'COMPANY_NOT_ACCESSIBLE', 'RECORD_ALREADY_CORRECTED', 'PAYMENT_ACCOUNT_REQUIRED', 'SETTLEMENT_EXCEEDS_BILL', 'INVALID_DISCOUNT', 'BILL_NUMBER_REQUIRED', 'INVALID_INVOICE'] as const;
export function safeBusinessReason(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }
    const value = error as {
        message?: unknown;
        reason?: unknown;
    };
    const reason = value.reason ?? value.message;
    return businessReasons.find(item => item === reason);
}
export function billError(error: unknown, language: Language, fallback: string) {
    const reason = safeBusinessReason(error);
    const messages: Record<string, [
        string,
        string,
        string
    ]> = {
        PRODUCTION_DISABLED:['প্রোডাকশন মোড বন্ধ আছে। সেটিংসে চালু করুন।','Production mode is off. Enable it in Settings.','उत्पादन मोड बंद है। सेटिंग्स में चालू करें।'],
        INVALID_PRODUCTION:['প্রোডাকশনের তারিখ ও তথ্য পরীক্ষা করুন।','Check the production date and fields.','उत्पादन की तारीख और विवरण जाँचें।'],
        INSUFFICIENT_PRODUCTION_STOCK:['এই তারিখে গোডাউনে যথেষ্ট কাঁচামাল নেই।','Insufficient raw material in this godown on this date.','इस तारीख को गोदाम में पर्याप्त कच्चा माल नहीं है।'],
        ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED:['একটানা প্রোডাকশনের একই উৎপাদিত আইটেম বেছে নিন।','Choose the same output item for this continuous production account.','लगातार उत्पादन खाते का वही आउटपुट आइटम चुनें।'],
        PRODUCTION_OUTPUT_CANNOT_BE_INPUT:['উৎপাদিত আইটেম কাঁচামাল হিসেবে পাঠানো যাবে না।','The output item cannot be sent as raw material.','उत्पादित आइटम कच्चे माल के रूप में नहीं भेज सकते।'],
        INVALID_RATE:['সঠিক দর দিন।','Enter a valid rate.','सही दर भरें।'],
        INVALID_AMOUNT:['সঠিক টাকা বা পরিমাণ দিন।','Enter a valid amount or quantity.','सही रकम या मात्रा भरें।'],
        INVALID_TOTAL:['বিলের মোট টাকা সঠিক নয়।','The bill total is invalid.','बिल का कुल सही नहीं है।'],
        INVALID_DISCOUNT:['ডিসকাউন্ট বিলের মোটের চেয়ে কম রাখুন।','Discount must be less than the bill subtotal.','छूट बिल के कुल से कम रखें।'],
        BILL_NUMBER_REQUIRED:['বিল নম্বর দিন।','Enter a bill number.','बिल नंबर भरें।'],
        INVALID_INVOICE:['বিলের কোম্পানি, ধরন বা তারিখ সঠিক নয়।','The bill company, type or date is invalid.','बिल की कंपनी, प्रकार या तारीख सही नहीं है।'],
        PARTY_NOT_ACCESSIBLE:['এই পার্টি পাওয়া যায়নি। আবার বেছে নিন।','This party is unavailable. Select it again.','पार्टी उपलब्ध नहीं है। फिर चुनें।'],
        STOCK_MASTER_NOT_ACCESSIBLE:['আইটেম বা গোডাউন পাওয়া যায়নি। আবার বেছে নিন।','The item or godown is unavailable. Select it again.','आइटम या गोदाम उपलब्ध नहीं है। फिर चुनें।'],
        COMPANY_NOT_ACCESSIBLE:['এই কোম্পানির অ্যাক্সেস নেই। আবার লগইন করুন।','This company is unavailable. Sign in again.','कंपनी उपलब्ध नहीं है। फिर लॉगिन करें।'],
        FUTURE_DATE:['আজ বা তার আগের তারিখ দিন।','Choose today or an earlier date.','आज या पहले की तारीख भरें।'],
        STOCK_DATE_BEFORE_ACTIVITY: ['এই তারিখে স্টক এন্ট্রি সার্ভার আটকে দিয়েছে। সার্ভারের আপডেট প্রয়োজন।', 'Server blocked this historical stock date. A server update is required.', 'सर्वर ने पुरानी स्टॉक तारीख रोकी है। सर्वर अपडेट चाहिए।'],
        INSUFFICIENT_STOCK: ['স্টক কম থাকায় সার্ভার আটকে দিয়েছে। সার্ভারের আপডেট প্রয়োজন।', 'Server blocked negative stock. A server update is required.', 'सर्वर ने ऋणात्मक स्टॉक रोका है। अपडेट चाहिए।'],
        IDEMPOTENCY_CONFLICT: ['এই এন্ট্রির আগের অনুরোধের সঙ্গে তথ্য মিলছে না। আগে সংরক্ষিত বিল যাচাই করুন।', 'This entry conflicts with an earlier save. Check the saved bill first.', 'यह एंट्री पिछले सेव से मेल नहीं खाती। सहेजा बिल जाँचें।'],
        PAYMENT_ACCOUNT_REQUIRED: ['নগদ বা ব্যাংক অ্যাকাউন্ট বেছে নিন।', 'Choose an active cash or bank account.', 'सक्रिय नकद या बैंक खाता चुनें।'],
        SETTLEMENT_EXCEEDS_BILL: ['সার্ভার অ্যাডভান্স পেমেন্ট আটকে দিয়েছে। সার্ভারের আপডেট প্রয়োজন।', 'The server rejected the advance payment. A server update is required.', 'सर्वर ने एडवांस रोका है। सर्वर अपडेट चाहिए।'],
        WRITES_DISABLED: ['সাময়িকভাবে নতুন এন্ট্রি বন্ধ আছে।', 'New entries are temporarily disabled.', 'नई एंट्री अस्थायी रूप से बंद हैं।'],
        RECORD_ALREADY_CORRECTED: ['এন্ট্রিটি ইতিমধ্যে সংশোধিত বা মুছে দেওয়া হয়েছে। রিফ্রেশ করুন।', 'This entry was already corrected or deleted. Refresh the ledger.', 'यह एंट्री पहले ही बदली या हटाई गई है। रिफ्रेश करें।'],
    };
    const translated = reason && messages[reason];
    const indexes = { bn: 0, en: 1, hi: 2 };
    if (translated) {
        return translated[indexes[language]];
    }
    return fallback;
}
