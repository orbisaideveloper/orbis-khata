import type { Language } from '../i18n';
export const businessReasons = ['STOCK_DATE_BEFORE_ACTIVITY', 'INSUFFICIENT_STOCK', 'INVALID_RATE', 'INVALID_AMOUNT', 'INVALID_TOTAL', 'IDEMPOTENCY_CONFLICT', 'PARTY_NOT_ACCESSIBLE', 'STOCK_MASTER_NOT_ACCESSIBLE', 'WRITES_DISABLED', 'FUTURE_DATE', 'COMPANY_NOT_ACCESSIBLE', 'RECORD_ALREADY_CORRECTED', 'PAYMENT_ACCOUNT_REQUIRED', 'SETTLEMENT_EXCEEDS_BILL'] as const;
export function safeBusinessReason(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const value = error as { message?: unknown; reason?: unknown };
    const reason = value.reason ?? value.message;
    return businessReasons.find(item => item === reason);
}
export function billError(error: unknown, language: Language, fallback: string) {
    const reason = safeBusinessReason(error);
    const messages: Record<string, [string, string, string]> = {
        STOCK_DATE_BEFORE_ACTIVITY: ['এই তারিখে স্টক এন্ট্রি সার্ভার আটকে দিয়েছে। সার্ভারের আপডেট প্রয়োজন।', 'Server blocked this historical stock date. A server update is required.', 'सर्वर ने पुरानी स्टॉक तारीख रोकी है। सर्वर अपडेट चाहिए।'],
        INSUFFICIENT_STOCK: ['স্টক কম থাকায় সার্ভার আটকে দিয়েছে। সার্ভারের আপডেট প্রয়োজন।', 'Server blocked negative stock. A server update is required.', 'सर्वर ने ऋणात्मक स्टॉक रोका है। अपडेट चाहिए।'],
        IDEMPOTENCY_CONFLICT: ['এই এন্ট্রির আগের অনুরোধের সঙ্গে তথ্য মিলছে না। আগে সংরক্ষিত বিল যাচাই করুন।', 'This entry conflicts with an earlier save. Check the saved bill first.', 'यह एंट्री पिछले सेव से मेल नहीं खाती। सहेजा बिल जाँचें।'],
        PAYMENT_ACCOUNT_REQUIRED: ['নগদ বা ব্যাংক অ্যাকাউন্ট বেছে নিন।', 'Choose an active cash or bank account.', 'सक्रिय नकद या बैंक खाता चुनें।'],
        SETTLEMENT_EXCEEDS_BILL: ['জমা/পরিশোধ বিলের মোটের বেশি। অ্যাডভান্স আলাদা জমা করুন।', 'Payment exceeds this bill. Record any advance separately.', 'भुगतान बिल से अधिक है। एडवांस अलग दर्ज करें।'],
        WRITES_DISABLED: ['সাময়িকভাবে নতুন এন্ট্রি বন্ধ আছে।', 'New entries are temporarily disabled.', 'नई एंट्री अस्थायी रूप से बंद हैं।'],
        RECORD_ALREADY_CORRECTED: ['এন্ট্রিটি ইতিমধ্যে সংশোধিত বা মুছে দেওয়া হয়েছে। রিফ্রেশ করুন।', 'This entry was already corrected or deleted. Refresh the ledger.', 'यह एंट्री पहले ही बदली या हटाई गई है। रिफ्रेश करें।'],
    };
    const translated = reason && messages[reason];
    const indexes = { bn: 0, en: 1, hi: 2 };
    if (translated) return translated[indexes[language]];
    return fallback;
}
