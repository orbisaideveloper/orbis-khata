const bn = {
 title:'ব্যবসার খরচ', hint:'খরচ হওয়ার তারিখে খরচ লিখুন। বাকি খরচ পরে মেটালে নতুন খরচ হবে না।',
 add:'খরচ লিখুন', category:'খরচের খাতা', payee:'কাকে দেওয়া / কার কাছে বাকি', amount:'টাকা', date:'তারিখ',
 method:'পরিশোধ', cash:'নগদ', bank:'ব্যাংক', due:'বাকি', reference:'রেফারেন্স (ঐচ্ছিক)', note:'বিবরণ / সংশোধনের কারণ',
 review:'যাচাই ও সেভ', confirm:'সেভ করুন', cancel:'বাতিল', payment:'বাকি মেটান', reversal:'ভুল এন্ট্রি উল্টে সংশোধন',
 confirmHint:'কোম্পানি, তারিখ, খাতা ও টাকা মিলিয়ে নিশ্চিত করুন।', retry:'আবার চেষ্টা', loading:'খরচ লোড হচ্ছে…',
 failed:'খরচ লোড হয়নি। আবার চেষ্টা করুন।', uncertain:'ফল নিশ্চিত হয়নি। একই এন্ট্রি দিয়ে আবার চেষ্টা করুন; নতুন এন্ট্রি করবেন না।',
 rejected:'এন্ট্রি গ্রহণ হয়নি। টাকা, তারিখ ও বাকি যাচাই করুন। খরচ উল্টানোর আগে সংশ্লিষ্ট পরিশোধ উল্টাতে হবে।',
 invalid:'টাকা, তারিখ ও বিবরণ যাচাই করুন।', saved:'খরচের হিসাব সংরক্ষিত।', period:'নির্বাচিত সময়ের খরচ', paid:'এই সময়ে খরচে দেওয়া টাকা',
 outstanding:'শেষ তারিখে বাকি খরচ', categories:'খরচের খাতা অনুযায়ী মোট', bills:'বাকি খরচ', entries:'খরচ ও পরিশোধের খতিয়ান',
 previous:'আগের', next:'পরের', empty:'এই সময়ে কোনো এন্ট্রি নেই।', charge:'খরচ', reversed:'উল্টে সংশোধিত',
 corrected:'উল্টো এন্ট্রি', storage:'নিরাপদ retry এন্ট্রি রাখা যায়নি। এখন সংরক্ষণ করা যাবে না।',
 reverseConfirm:'এই এন্ট্রির সমান বিপরীত এন্ট্রি হবে; মূল রেকর্ড থাকবে। চালিয়ে যাবেন?',
 suggestions:['দোকান ভাড়া','বিদ্যুৎ','বেতন','যাতায়াত','পরিবহণ','মেরামত','অফিস খরচ','অন্যান্য']
}
const en: typeof bn = {
 title:'Business expenses',hint:'Record expenses when incurred. Settling an unpaid expense does not create a second expense.',
 add:'Add expense',category:'Expense account',payee:'Paid to / owed to',amount:'Amount',date:'Date',method:'Settlement',cash:'Cash',bank:'Bank',due:'Unpaid',reference:'Reference (optional)',note:'Description / correction reason',
 review:'Review & save',confirm:'Save',cancel:'Cancel',payment:'Pay outstanding',reversal:'Reverse incorrect entry',confirmHint:'Check company, date, account and amount before confirming.',retry:'Retry',loading:'Loading expenses…',failed:'Expenses could not load. Retry.',uncertain:'Outcome unknown. Retry this exact entry; do not create another.',rejected:'Entry rejected. Check amount, date and outstanding balance. Reverse linked payments before reversing an unpaid expense.',invalid:'Check amount, date and description.',saved:'Expense records saved.',period:'Expenses in selected period',paid:'Expense money paid in this period',outstanding:'Unpaid expenses at end date',categories:'Expense totals by account',bills:'Unpaid expenses',entries:'Expense and payment ledger',previous:'Previous',next:'Next',empty:'No entries in this period.',charge:'Expense',reversed:'Reversed',corrected:'Reversal',storage:'Cannot preserve a safe retry entry. Saving is blocked.',reverseConfirm:'An equal opposite entry will be recorded; the original stays. Continue?',suggestions:['Rent','Electricity','Salaries','Travel','Transport','Repairs','Office expenses','Other']
}
const hi: typeof bn = {
 title:'व्यवसाय के खर्च',hint:'खर्च होने की तारीख पर दर्ज करें। बकाया चुकाने पर खर्च दोबारा नहीं जुड़ता।',add:'खर्च दर्ज करें',category:'खर्च का खाता',payee:'किसे दिया / किसे देना है',amount:'राशि',date:'तारीख',method:'भुगतान',cash:'नकद',bank:'बैंक',due:'बकाया',reference:'संदर्भ (वैकल्पिक)',note:'विवरण / सुधार का कारण',review:'जाँचें और सहेजें',confirm:'सहेजें',cancel:'रद्द करें',payment:'बकाया चुकाएँ',reversal:'गलत एंट्री उलटकर सुधारें',confirmHint:'कंपनी, तारीख, खाता और राशि जाँचकर पुष्टि करें।',retry:'फिर कोशिश',loading:'खर्च लोड हो रहे हैं…',failed:'खर्च लोड नहीं हुए। फिर कोशिश करें।',uncertain:'परिणाम अज्ञात है। इसी एंट्री से फिर कोशिश करें; नई एंट्री न बनाएँ।',rejected:'एंट्री अस्वीकृत। राशि, तारीख और बकाया जाँचें। खर्च उलटने से पहले जुड़े भुगतान उलटें।',invalid:'राशि, तारीख और विवरण जाँचें।',saved:'खर्च का हिसाब सुरक्षित हुआ।',period:'चुनी अवधि के खर्च',paid:'इस अवधि में खर्च का भुगतान',outstanding:'अंतिम तारीख पर बकाया खर्च',categories:'खाते के अनुसार कुल खर्च',bills:'बकाया खर्च',entries:'खर्च और भुगतान का खाता',previous:'पिछला',next:'अगला',empty:'इस अवधि में कोई एंट्री नहीं।',charge:'खर्च',reversed:'उलटकर सुधारा गया',corrected:'उलटी एंट्री',storage:'सुरक्षित retry एंट्री नहीं रख सके। अभी सहेजना बंद है।',reverseConfirm:'बराबर उलटी एंट्री होगी; मूल रिकॉर्ड रहेगा। जारी रखें?',suggestions:['किराया','बिजली','वेतन','यात्रा','परिवहन','मरम्मत','कार्यालय खर्च','अन्य']
}
export const expenseCopy = {bn,en,hi}
