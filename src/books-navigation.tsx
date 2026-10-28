import { createContext, useContext, useState } from 'react';
export type BooksPage = 'home' | 'company' | 'settings' | 'overview' | 'bills' | 'ledger' | 'all-ledgers' | 'stock' | 'parties' | 'items' | 'expenses';
export const BooksNavigation = createContext<{
    page: BooksPage;
    open: (page: BooksPage) => void;
} | null>(null);
export function useBooksNavigation() {
    const context = useContext(BooksNavigation);
    const [page, setPage] = useState<BooksPage>('ledger');
    return context ?? { page, open: setPage };
}
export const booksLabels = {
    bn: { company: 'কোম্পানি', settings: 'সেটিংস', home: 'হোম', overview: 'বিস্তারিত', bills: 'বিল', ledger: 'জমা / পেমেন্ট', 'all-ledgers': 'লেজার', stock: 'বিল ও স্টক', parties: 'পার্টি', items: 'আইটেম', expenses: 'খরচ', back: 'হিসাবে ফিরুন', expense: 'খরচ / Expense' },
    en: { company: 'Company', settings: 'Settings', home: 'Home', overview: 'Details', bills: 'Bills', ledger: 'Accounts', 'all-ledgers': 'Ledger', stock: 'Bills & stock', parties: 'Parties', items: 'Items', expenses: 'Expenses', back: 'Back to accounts', expense: 'Expense' },
    hi: { company: 'कंपनी', settings: 'सेटिंग्स', home: 'होम', overview: 'विवरण', bills: 'बिल', ledger: 'हिसाब', 'all-ledgers': 'लेजर', stock: 'बिल और स्टॉक', parties: 'पार्टी', items: 'आइटम', expenses: 'खर्च', back: 'हिसाब पर लौटें', expense: 'खर्च / Expense' },
};
